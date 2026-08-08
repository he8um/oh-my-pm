#!/usr/bin/env node
// Release build-provenance boundary validator (audit finding F-02).
//
// The v0.6 release workflow attests the three published artifacts with
// actions/attest, binding each artifact's digest to the workflow identity that
// produced it. That gives consumers evidence about where an archive came from
// -- but only while three properties hold, and each of them is the kind of
// property that decays silently under ordinary editing:
//
//   1. The signing permissions stay in ONE job. `id-token: write` mints an OIDC
//      token that Sigstore will exchange for a signing certificate carrying
//      this repository's identity. A second job holding that permission is a
//      second place able to speak as this repository's release process. Hoisting
//      it to workflow level would hand it to every job at once -- the single
//      most likely and most damaging edit anyone could make here.
//
//   2. The attested set stays EXACTLY the published set. A glob that widens the
//      subject list, or a dropped subject, produces a release where "verified"
//      no longer means what a consumer reasonably reads it to mean: that the
//      file they downloaded is covered.
//
//   3. Attestation stays ordered before publication, and after verification.
//      Attesting bytes that were not checksum-verified attests unverified
//      input; attesting after the release-creation step makes provenance a
//      best-effort afterthought rather than a gate, so a signing failure would
//      leave an unattested release already published and immutable.
//
// A pinned action alone proves none of that, so this validator holds it.
//
// Structure over grep: the file is parsed into jobs and steps by YAML block
// indentation, so a permission or a step is ATTRIBUTED to the job that actually
// contains it. A line-oriented grep cannot distinguish `id-token: write` in the
// publish job from the same text in another job, or from a workflow-level
// block, and would report all three identically -- exactly the misclassification
// this check exists to prevent. No YAML dependency is introduced: the
// repository has none, and the invariants here are positional (which block owns
// a line, in what order), which is what the indentation scan already answers.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_DIR = join(".github", "workflows");

/** The release workflow that carries provenance. */
export const PROVENANCE_WORKFLOW = join(WORKFLOW_DIR, "release-v0.6.yml");

/** The one job permitted to sign. */
export const PUBLISH_JOB = "publish";

/** The only attestation action accepted. Official GitHub, first-party. */
export const APPROVED_ACTION = "actions/attest";

/**
 * actions/attest-build-provenance is official too, but as of its v4 it is a
 * wrapper over actions/attest and upstream directs new implementations to the
 * latter. Naming it explicitly turns a silent swap into a specific message.
 */
export const WRAPPER_ACTION = "actions/attest-build-provenance";

/** A full commit SHA: exactly 40 lowercase hex characters. */
const FULL_SHA = /^[0-9a-f]{40}$/;

/** Permissions that must exist in the publish job and nowhere else. */
export const SIGNING_PERMISSIONS = Object.freeze(["id-token", "attestations"]);

/** The exact published asset set. Attested subjects must equal this, in order. */
export const EXPECTED_SUBJECTS = Object.freeze([
  "release-assets/oh-my-pm-v0.6.2.tar.gz",
  "release-assets/oh-my-pm-v0.6.2.zip",
  "release-assets/oh-my-pm-v0.6.2-SHA256SUMS.txt",
]);

/** Ordering anchors, matched against step `name:` values. */
const CHECKSUM_STEP = /re-verify archive checksums/i;
const PREFLIGHT_STEPS = [
  /ensure release notes exist/i,
  /ensure tag and release do not already exist/i,
  /ensure the base stable release still exists/i,
];
const RELEASE_CREATE_STEP = /create stable github release/i;

/** Indentation width of a line, ignoring blank and comment-only lines. */
function indentOf(line) {
  const match = /^(\s*)\S/.exec(line);
  return match ? match[1].length : null;
}

function isSkippable(line) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

/**
 * Parse a workflow into the structure these invariants are stated over.
 *
 * Returns `{ jobs, workflowPermissions }` where each job records its line
 * range, its own `permissions:` block, and its steps (name + line + `uses:`).
 * Everything is line-based and positional, which is what the ordering checks
 * need; no value interpolation is attempted.
 */
export function parseWorkflow(text) {
  const lines = text.split("\n");
  const jobs = [];
  const workflowPermissions = [];

  let inJobs = false;
  let jobsIndent = null;
  let current = null;
  // Tracks a `permissions:` block while its indented body is being consumed.
  let permBlock = null;

  const closeJob = (endLine) => {
    if (current) {
      current.endLine = endLine;
      jobs.push(current);
      current = null;
    }
  };

  for (const [index, line] of lines.entries()) {
    const lineNo = index + 1;
    if (isSkippable(line)) continue;
    const indent = indentOf(line);
    const trimmed = line.trim();

    // Collect the body of an open permissions block.
    if (permBlock !== null) {
      if (indent > permBlock.indent) {
        const entry = /^-?\s*([A-Za-z][\w-]*)\s*:\s*(\S+)/.exec(trimmed);
        if (entry) permBlock.target.push({ name: entry[1], value: entry[2], line: lineNo });
        continue;
      }
      permBlock = null;
    }

    // Top-level `jobs:` opens the job region.
    if (indent === 0) {
      if (/^jobs\s*:/.test(trimmed)) {
        inJobs = true;
        closeJob(lineNo - 1);
        continue;
      }
      // Any other top-level key ends the job region.
      if (inJobs) {
        closeJob(lineNo - 1);
        inJobs = false;
      }
      if (/^permissions\s*:/.test(trimmed)) {
        permBlock = { indent, target: workflowPermissions };
      }
      continue;
    }

    if (!inJobs) continue;

    // The first indented key under `jobs:` fixes the job-name indent level.
    if (jobsIndent === null) jobsIndent = indent;

    // A job header: `  <name>:` at the job indent level.
    if (indent === jobsIndent) {
      const header = /^([A-Za-z_][\w-]*)\s*:\s*$/.exec(trimmed);
      if (header) {
        closeJob(lineNo - 1);
        current = {
          name: header[1],
          startLine: lineNo,
          endLine: lines.length,
          permissions: [],
          steps: [],
        };
        continue;
      }
    }

    if (!current) continue;

    // A job-owned `permissions:` block.
    if (/^permissions\s*:/.test(trimmed)) {
      permBlock = { indent, target: current.permissions };
      continue;
    }

    // A step boundary: `- name:` or `- uses:`; continuation lines attach to it.
    const stepName = /^-\s*name\s*:\s*(.+?)\s*$/.exec(trimmed);
    if (stepName) {
      current.steps.push({ name: stepName[1], line: lineNo, uses: null, usesLine: null, with: [] });
      continue;
    }

    const step = current.steps[current.steps.length - 1];
    const usesMatch = /^-?\s*uses\s*:\s*(?:["']([^"']+)["']|([^\s#]+))/.exec(trimmed);
    if (usesMatch) {
      const value = usesMatch[1] ?? usesMatch[2];
      if (trimmed.startsWith("-") || !step) {
        current.steps.push({ name: null, line: lineNo, uses: value, usesLine: lineNo, with: [] });
      } else {
        step.uses = value;
        step.usesLine = lineNo;
      }
      continue;
    }

    // Body lines of the step currently being read, used to recover subjects.
    if (step) step.with.push({ text: trimmed, line: lineNo });
  }

  closeJob(lines.length);
  return { jobs, workflowPermissions };
}

/**
 * Recover the `subject-path:` values of an attestation step.
 *
 * Handles the block-scalar form the workflow uses (`subject-path: |`) and the
 * single-line form, so a rewrite into either shape is still checked rather than
 * silently reported as "no subjects".
 */
export function subjectsOf(step) {
  const subjects = [];
  const body = step.with;
  const start = body.findIndex((entry) => /^subject-path\s*:/.test(entry.text));
  if (start === -1) return { subjects, wildcard: false, present: false };

  const inline = /^subject-path\s*:\s*(.+)$/.exec(body[start].text);
  const scalar = inline ? inline[1].trim() : "";

  if (scalar && scalar !== "|" && scalar !== ">" && scalar !== "|-" && scalar !== ">-") {
    subjects.push(scalar.replace(/^["']|["']$/g, ""));
  } else {
    // Block scalar: consume following lines until the next `key:` at this level.
    for (const entry of body.slice(start + 1)) {
      if (/^[A-Za-z][\w-]*\s*:/.test(entry.text)) break;
      const value = entry.text.replace(/^-\s*/, "").trim();
      if (value === "") continue;
      subjects.push(value.replace(/^["']|["']$/g, ""));
    }
  }

  return {
    subjects,
    wildcard: subjects.some((s) => s.includes("*") || s.includes("?")),
    present: true,
  };
}

/** Every workflow file GitHub would load. */
export function workflowFiles(dir = WORKFLOW_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => join(dir, name));
}

/** True when a `uses:` value names the given action, ignoring its @ref. */
function actionOf(uses) {
  const at = uses.indexOf("@");
  return at === -1 ? uses : uses.slice(0, at);
}

function refOf(uses) {
  const at = uses.indexOf("@");
  return at === -1 ? null : uses.slice(at + 1);
}

/** Any attestation-shaped action, so a wrong one is caught rather than missed. */
function isAttestationAction(uses) {
  const action = actionOf(uses);
  return action === APPROVED_ACTION || /attest/i.test(action);
}

/**
 * Validate the provenance boundary across the whole workflow directory.
 *
 * Returns `{ failures, summary }`. State is per-call, never module-level: the
 * mutation suite runs this many times in one process and a shared flag would
 * leak a verdict between fixtures.
 */
export function validate(dir = WORKFLOW_DIR, provenanceFile = null) {
  const failures = [];
  const err = (msg) => failures.push(msg);

  const files = workflowFiles(dir);
  const target = provenanceFile ?? join(dir, "release-v0.6.yml");

  const summary = {
    attestationSteps: 0,
    subjects: [],
    signingJobs: [],
    pinnedSha: null,
    action: null,
  };

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const { jobs, workflowPermissions } = parseWorkflow(text);
    const isTarget = file === target;

    // (9)(10) Signing permission must never be workflow-level: that grants it
    // to every job in the file at once.
    for (const perm of workflowPermissions) {
      if (SIGNING_PERMISSIONS.includes(perm.name) && perm.value === "write") {
        err(
          `${file}:${perm.line} declares workflow-level "${perm.name}: write"; ` +
            `signing permissions must be scoped to the ${PUBLISH_JOB} job only`,
        );
      }
    }

    for (const job of jobs) {
      // (5)(6)(7)(8) Signing permissions belong to publish, in the target file.
      for (const perm of job.permissions) {
        if (!SIGNING_PERMISSIONS.includes(perm.name) || perm.value !== "write") continue;
        summary.signingJobs.push(`${file}:${job.name}:${perm.name}`);
        if (!isTarget || job.name !== PUBLISH_JOB) {
          err(
            `${file}:${perm.line} job "${job.name}" declares "${perm.name}: write"; ` +
              `only the ${PUBLISH_JOB} job of ${target} may hold signing permissions`,
          );
        }
      }

      // (16) No workflow other than the target may attest at all.
      for (const step of job.steps) {
        if (!step.uses || !isAttestationAction(step.uses)) continue;
        if (!isTarget) {
          err(
            `${file}:${step.usesLine} job "${job.name}" runs attestation action ` +
              `"${step.uses}"; provenance belongs only to ${target}`,
          );
          continue;
        }
        summary.attestationSteps += 1;

        // (4) The step must live in publish.
        if (job.name !== PUBLISH_JOB) {
          err(
            `${file}:${step.usesLine} attestation step is in job "${job.name}"; ` +
              `it must be in the ${PUBLISH_JOB} job`,
          );
        }

        // (3) It must be the approved official action.
        const action = actionOf(step.uses);
        summary.action = action;
        if (action !== APPROVED_ACTION) {
          const hint =
            action === WRAPPER_ACTION
              ? ` -- ${WRAPPER_ACTION} is a wrapper over ${APPROVED_ACTION}; use ${APPROVED_ACTION} directly`
              : "";
          err(
            `${file}:${step.usesLine} attestation action is "${action}"; ` +
              `expected the official "${APPROVED_ACTION}"${hint}`,
          );
        }

        // (2) It must be pinned to a full immutable SHA.
        const ref = refOf(step.uses);
        summary.pinnedSha = ref;
        if (ref === null || !FULL_SHA.test(ref)) {
          err(
            `${file}:${step.usesLine} attestation action "${step.uses}" is not pinned to a ` +
              `full 40-character lowercase commit SHA`,
          );
        }

        // (11)(12) Subjects must be exactly the published set, no wildcards.
        const { subjects, wildcard, present } = subjectsOf(step);
        summary.subjects = subjects;
        if (!present) {
          err(`${file}:${step.line} attestation step declares no subject-path`);
        } else if (wildcard) {
          err(
            `${file}:${step.line} attestation subject-path uses a wildcard ` +
              `(${subjects.filter((s) => s.includes("*") || s.includes("?")).join(", ")}); ` +
              `list the ${EXPECTED_SUBJECTS.length} published assets explicitly`,
          );
        } else if (JSON.stringify(subjects) !== JSON.stringify([...EXPECTED_SUBJECTS])) {
          const missing = EXPECTED_SUBJECTS.filter((s) => !subjects.includes(s));
          const extra = subjects.filter((s) => !EXPECTED_SUBJECTS.includes(s));
          const detail = [
            missing.length ? `missing: ${missing.join(", ")}` : null,
            extra.length ? `unexpected: ${extra.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("; ");
          err(
            `${file}:${step.line} attestation subjects do not equal the published asset set` +
              (detail ? ` (${detail})` : " (order must match)"),
          );
        }
      }
    }

    if (!isTarget) continue;

    // (1) Exactly one attestation step: a duplicate is two signing operations
    // where the reviewed design has one.
    if (summary.attestationSteps === 0) {
      err(`${file} contains no build-provenance attestation step`);
    } else if (summary.attestationSteps > 1) {
      err(`${file} contains ${summary.attestationSteps} attestation steps; exactly one is allowed`);
    }

    // (13)(14)(15) Ordering, stated over the publish job's step sequence.
    const publish = jobs.find((job) => job.name === PUBLISH_JOB);
    if (!publish) {
      err(`${file} has no "${PUBLISH_JOB}" job`);
    } else {
      // (5)(6) The signing permissions must actually BE there. Scoping alone is
      // only half the invariant: a publish job that lost `id-token: write`
      // violates no scope rule, and the failure would surface as a mid-release
      // 'missing "id-token" permission' abort instead of a failed check here.
      const held = new Set(
        publish.permissions.filter((p) => p.value === "write").map((p) => p.name),
      );
      for (const required of SIGNING_PERMISSIONS) {
        if (!held.has(required)) {
          err(
            `${file} job "${PUBLISH_JOB}" is missing "${required}: write"; ` +
              `build provenance cannot be generated without it`,
          );
        }
      }
      if (!held.has("contents")) {
        err(`${file} job "${PUBLISH_JOB}" is missing "contents: write"`);
      }

      const named = publish.steps.filter((s) => s.name);
      const attest = publish.steps.find((s) => s.uses && isAttestationAction(s.uses));
      const lineOf = (re) => named.find((s) => re.test(s.name))?.line ?? null;

      if (attest) {
        const checksum = lineOf(CHECKSUM_STEP);
        if (checksum === null) {
          err(`${file} publish job has no checksum re-verification step to order against`);
        } else if (attest.line < checksum) {
          err(
            `${file}:${attest.line} attestation runs BEFORE checksum re-verification ` +
              `(line ${checksum}); provenance must never cover unverified bytes`,
          );
        }

        for (const re of PREFLIGHT_STEPS) {
          const preflight = lineOf(re);
          if (preflight === null) {
            err(`${file} publish job is missing a required preflight step (${re.source})`);
          } else if (attest.line < preflight) {
            err(
              `${file}:${attest.line} attestation runs BEFORE release preflight step at ` +
                `line ${preflight}; all publication gates must pass first`,
            );
          }
        }

        const create = lineOf(RELEASE_CREATE_STEP);
        if (create === null) {
          err(`${file} publish job has no release-creation step to order against`);
        } else if (attest.line > create) {
          err(
            `${file}:${attest.line} attestation runs AFTER release creation (line ${create}); ` +
              `it must gate publication so a signing failure blocks the release`,
          );
        }
      }
    }
  }

  return { failures, summary };
}

// Entry point, guarded so the test suite can import the helpers above without
// the process exiting underneath it.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? WORKFLOW_DIR;
  const { failures, summary } = validate(dir);

  if (failures.length > 0) {
    for (const message of failures) console.error(`FAIL: ${message}`);
    console.error(`Release provenance validation FAILED: ${failures.length} boundary violation(s)`);
    process.exit(1);
  }

  console.log(
    `Release provenance OK: ${summary.action}@${summary.pinnedSha} in ${PUBLISH_JOB}, ` +
      `${summary.subjects.length} explicit subjects, ` +
      `signing permissions scoped to 1 job (${SIGNING_PERMISSIONS.map((p) => `${p}: write`).join(", ")})`,
  );
}
