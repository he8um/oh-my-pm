#!/usr/bin/env node
// GitHub Action pin validator (audit finding F-03).
//
// Every third-party Action a workflow runs executes with repository
// credentials. A reference that resolves through a tag or branch -- @v5,
// @main, @stable -- is a reference whose CONTENT can change after review:
// the tag is mutable, so the code that ran yesterday is not necessarily the
// code that runs tomorrow. Pinning to a full commit SHA makes the reference
// immutable, and makes an upstream compromise a change Dependabot has to
// propose as a reviewable diff rather than something that lands silently.
//
// This validator enforces that invariant going forward. Pinning once is a
// state; keeping it pinned is a property, and only a check that runs on every
// pull request can hold it.
//
// Policy: every EXTERNAL `uses:` reference (owner/repo[/path]@ref) must carry
// exactly a 40-character lowercase hex commit SHA. Local references (./path)
// are repository-relative, versioned by the commit under review, and are
// therefore exempt -- there is no mutable third-party ref to pin.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_DIR = join(".github", "workflows");

/** A full commit SHA: exactly 40 lowercase hex characters, nothing else. */
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * A `uses:` step reference. Captures the raw value so every non-conforming
 * form -- abbreviated SHA, tag, branch, missing ref -- reaches the policy
 * check below rather than being filtered out by the parser.
 *
 * Quoting is permitted by the workflow schema, so it is stripped here.
 */
const USES_LINE = /^\s*(?:-\s*)?uses:\s*(?:["']([^"']+)["']|([^\s#]+))/;

/**
 * Classify a `uses:` value.
 *
 * - `local`  -- ./path or ../path. Repository-relative; exempt from pinning.
 * - `docker` -- docker://image. Not a Git ref; reported so it is never
 *               silently exempted.
 * - `external` -- owner/repo[/subpath]@ref. Must be SHA-pinned.
 */
export function classifyUses(value) {
  if (value.startsWith("./") || value.startsWith("../")) {
    return { kind: "local", ref: null };
  }
  if (value.startsWith("docker://")) {
    return { kind: "docker", ref: null };
  }
  const at = value.indexOf("@");
  if (at === -1) {
    return { kind: "external", ref: null };
  }
  return { kind: "external", ref: value.slice(at + 1) };
}

/** Every workflow file GitHub would actually load. */
export function workflowFiles(dir = WORKFLOW_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => join(dir, name));
}

/**
 * Scan one workflow. Returns every `uses:` occurrence with its verdict, so
 * callers can report totals rather than only failures.
 */
export function scanWorkflow(file) {
  const found = [];
  const lines = readFileSync(file, "utf8").split("\n");

  lines.forEach((line, index) => {
    const match = USES_LINE.exec(line);
    if (!match) return;

    const value = match[1] ?? match[2];
    const { kind, ref } = classifyUses(value);
    found.push({
      file,
      line: index + 1,
      value,
      kind,
      ref,
      pinned: kind === "external" && ref !== null && FULL_SHA.test(ref),
    });
  });

  return found;
}

/**
 * Validate a workflow directory. Returns every occurrence alongside the
 * failures, so a caller gets both the verdict and the inventory. State is
 * per-call rather than module-level: the mutation suite invokes this many
 * times in one process, and a shared failure flag would leak a verdict from
 * one fixture into the next.
 */
export function validate(dir = WORKFLOW_DIR) {
  const occurrences = workflowFiles(dir).flatMap((file) => scanWorkflow(file));
  const failures = [];
  const err = (msg) => failures.push(msg);

  for (const use of occurrences) {
    if (use.kind === "local") continue;

    if (use.kind === "docker") {
      err(
        `${use.file}:${use.line} uses a docker:// reference (${use.value}); ` +
          `container actions are outside the SHA-pinning policy and must be reviewed explicitly`,
      );
      continue;
    }

    if (use.ref === null) {
      err(
        `${use.file}:${use.line} external action "${use.value}" has no @ref; ` +
          `a full 40-character commit SHA is required`,
      );
      continue;
    }

    if (!use.pinned) {
      err(
        `${use.file}:${use.line} external action "${use.value}" resolves through a mutable ref "${use.ref}"; ` +
          `pin it to a full 40-character lowercase commit SHA`,
      );
    }
  }

  return { occurrences, failures };
}

// Entry point. Kept behind a guard so the test suite can import the helpers
// above without the process exiting underneath it.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? WORKFLOW_DIR;
  const { occurrences, failures } = validate(dir);

  const external = occurrences.filter((u) => u.kind === "external");
  const local = occurrences.filter((u) => u.kind === "local");
  const unique = new Set(external.map((u) => u.value));

  if (failures.length > 0) {
    for (const message of failures) console.error(`FAIL: ${message}`);
    console.error(
      `Action pin validation FAILED: ${failures.length} unpinned external action reference(s)`,
    );
    process.exit(1);
  }

  console.log(
    `Action pins OK: ${workflowFiles(dir).length} workflow files, ` +
      `${occurrences.length} uses (${external.length} external, ${local.length} local), ` +
      `${unique.size} unique external actions, 0 unpinned`,
  );
}
