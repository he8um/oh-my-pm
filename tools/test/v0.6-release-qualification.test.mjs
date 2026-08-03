// v0.6 release qualification: the new release line, the new bundle profile, and
// the new release workflow.
//
// These are static checks on the prepared release surface. They deliberately do
// not publish anything: the workflow is manually dispatched and its publish job
// is gated behind an exact confirmation string and a protected environment.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ALL_INSTALLED_COMMANDS, BUNDLE_EXECUTABLE_NAMES } from "../command-surface.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(p, "utf8");

const RELEASE_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "release-v0.6.yml");
const wf = read(RELEASE_WORKFLOW);

// The prepared version is DERIVED from version.json, never restated here: the
// workflow must always target the version the source actually carries, and a
// bump must not require editing this test. (v0.6.0 is the prepared version;
// v0.5.4 is the immutable published base stable.)
const VERSION = JSON.parse(read(join(REPO_ROOT, "version.json"))).version;

describe("v0.6 release workflow safety", () => {
  it("is manually dispatched only", () => {
    expect(/^on:\s*\n\s+workflow_dispatch:/m.test(wf)).toBe(true);
    for (const trigger of ["\n  push:", "\n  pull_request:", "\n  schedule:", "\n  release:"]) {
      expect(wf.includes(trigger), `must not trigger on ${trigger.trim()}`).toBe(false);
    }
  });

  it("never uses pull_request_target", () => {
    // pull_request_target would run with repository write scope on untrusted
    // code; it is categorically excluded.
    expect(wf.includes("pull_request_target")).toBe(false);
  });

  it("defaults to least privilege and grants write only to the gated publish job", () => {
    expect(/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(wf)).toBe(true);
    // contents: write is declared exactly once as a job permission (in publish).
    // Matching on the indented declaration, not the substring, so the header
    // comment that explains the gate does not count.
    const writes = (wf.match(/^\s+contents: write$/gm) ?? []).length;
    expect(writes).toBe(1);
    expect(wf.includes("environment:\n      name: github-release")).toBe(true);
  });

  it("references no secrets", () => {
    expect(wf.includes("secrets.")).toBe(false);
  });

  it("gates publishing behind an exact confirmation, enforced twice", () => {
    const gates = (wf.match(new RegExp(`RELEASE v${VERSION.replace(/\./g, "\\.")}`, "g")) ?? [])
      .length;
    expect(gates).toBeGreaterThanOrEqual(2);
    expect(wf.includes("inputs.publish == true")).toBe(true);
  });

  it("pins the version and refuses any other", () => {
    expect(wf.includes(`!= "${VERSION}"`)).toBe(true);
  });

  it("refuses to overwrite an existing tag or release", () => {
    expect(wf.includes("refusing to overwrite")).toBe(true);
  });

  it("verifies the v0.6.1 base stable lineage without modifying it", () => {
    // The base advances with each published stable in the line: v0.6.0 built on
    // v0.5.4, v0.6.1 built on v0.6.0, and v0.6.2 builds on v0.6.1. The workflow
    // must prove the base release still exists and still resolves to the same
    // commit before publishing on top of it, so a rewritten or deleted
    // predecessor stops the release rather than being silently republished over.
    //
    // The SHA is the DEREFERENCED tag commit, which is what
    // `git ls-remote --tags` returns and what the workflow compares against.
    expect(wf.includes("BASE_TAG=v0.6.1")).toBe(true);
    expect(wf.includes("b5a43d1230d8af116f12848ba7cdfe6006a353ec")).toBe(true);
    // Every superseded base must be gone: leaving one would let the workflow
    // qualify against a release further back in the chain.
    expect(wf.includes("34642c4fe121c34c65f80a08b3e75560099676ff")).toBe(false);
    expect(wf.includes("288337a9514150b7a5973d9d9410f7186567520f")).toBe(false);
  });

  it("publishes to no package registry", () => {
    for (const verb of ["npm publish", "pnpm publish", "cargo publish", "yarn publish"]) {
      expect(wf.includes(verb), `must not run ${verb}`).toBe(false);
    }
  });
});

describe("v0.6 release workflow validates the command surface", () => {
  it("runs the command-surface and reference-regression gates", () => {
    expect(wf.includes("pnpm validate:commands")).toBe(true);
    expect(wf.includes("pnpm validate:references")).toBe(true);
    expect(wf.includes("pnpm version:check")).toBe(true);
  });

  it("pins the new bundle profile so no matrix job can qualify the wrong surface", () => {
    expect(wf.includes("--profile omp-cli-namespace")).toBe(true);
    expect(wf.includes('r.bundleProfile !== "omp-cli-namespace"')).toBe(true);
    expect(wf.includes('r.releaseLine !== "v0.6"')).toBe(true);
  });

  it("asserts canonical commands and BOTH alias classes are declared separately", () => {
    expect(wf.includes("canonicalCommands")).toBe(true);
    expect(wf.includes("compatibilityAliases")).toBe(true);
    expect(wf.includes("deprecatedAliases")).toBe(true);
    expect(wf.includes("legacyAliases")).toBe(true);
    expect(wf.includes("commandRemovalScheduled")).toBe(true);
    expect(wf.includes("commandsCanonicalSince")).toBe(true);
  });

  it("requires the bundle to ship all three command families as entrypoints", () => {
    for (const bin of BUNDLE_EXECUTABLE_NAMES.map((n) => `${n}.mjs`)) {
      expect(wf.includes(bin), `bundle must ship ${bin}`).toBe(true);
    }
  });

  it("qualifies every installed shim, not just the canonical pair", () => {
    for (const command of ALL_INSTALLED_COMMANDS) {
      expect(wf.includes(command), `must qualify ${command}`).toBe(true);
    }
    // The count is asserted in the workflow itself so a dropped shim fails.
    expect(wf.includes("expected 12 shims")).toBe(true);
  });

  it("asserts per-class warning wording and stderr-only delivery", () => {
    expect(wf.includes("is a compatibility alias")).toBe(true);
    expect(wf.includes("is deprecated")).toBe(true);
    expect(wf.includes("wrote its notice to stdout")).toBe(true);
    expect(wf.includes("warnings, expected exactly 1")).toBe(true);
    // A compatibility alias must never report itself as deprecated.
    expect(wf.includes("compatibility alias reported itself as deprecated")).toBe(true);
  });

  it("asserts the MCP stdout stream stays protocol-clean through every alias", () => {
    expect(wf.includes("non-JSON on stdout")).toBe(true);
    expect(wf.includes("is not JSON-RPC 2.0")).toBe(true);
    for (const mcp of ["omp-mcp", "ohmypm-mcp", "oh-my-pm-mcp"]) {
      expect(wf.includes(mcp), `must smoke ${mcp}`).toBe(true);
    }
  });

  it("asserts the product identity is not renamed by the migration", () => {
    expect(wf.includes("bundle name must stay product-based")).toBe(true);
    expect(wf.includes("product name must stay OH MY PM")).toBe(true);
    // Archives keep the product prefix, never a command prefix.
    expect(wf.includes("oh-my-pm-v$VERSION.tar.gz")).toBe(true);
    expect(wf.includes("omp-v$VERSION")).toBe(false);
  });

  it("keeps the runtime surface identical to v0.4 (no data migration)", () => {
    expect(wf.includes("expectedMcpToolCount !== 12")).toBe(true);
    expect(wf.includes("storeMigrationRequired !== false")).toBe(true);
    expect(wf.includes("schemaVersion !== 1")).toBe(true);
    expect(wf.includes("storeFormatVersion !== 2")).toBe(true);
  });

  it("smoke-tests the canonical command and every alias separately", () => {
    expect(wf.includes("Canonical and alias installed smoke")).toBe(true);
    // The canonical command must be silent on stderr.
    expect(wf.includes("canonical command wrote to stderr")).toBe(true);
    // Each alias must keep stdout byte-identical and JSON parseable.
    expect(wf.includes("check_alias ohmypm")).toBe(true);
    expect(wf.includes("check_alias oh-my-pm")).toBe(true);
    expect(wf.includes("$ALIAS.json")).toBe(true);
  });

  it("asserts the installed manifest separates canonical from alias commands", () => {
    expect(wf.includes("legacyCommands must be both alias classes")).toBe(true);
    expect(wf.includes("commands must be canonical")).toBe(true);
  });
});

describe("v0.6 preserves product identity in release artifacts", () => {
  it("keeps archive names product-based, not command-based", () => {
    expect(wf.includes(`oh-my-pm-v${VERSION}.tar.gz`)).toBe(true);
    expect(wf.includes(`oh-my-pm-v${VERSION}.zip`)).toBe(true);
    expect(wf.includes(`oh-my-pm-v${VERSION}-SHA256SUMS.txt`)).toBe(true);
    // The migration must never rename release artifacts.
    expect(wf.includes(`ohmypm-v${VERSION}`)).toBe(false);
  });

  it("asserts the bundle name stays product-based", () => {
    expect(wf.includes('r.bundle !== "oh-my-pm-v"')).toBe(true);
  });

  it("installs under the unchanged product directory", () => {
    expect(wf.includes("lib/oh-my-pm/install.json")).toBe(true);
  });
});

describe("v0.5 does not rewrite published history", () => {
  it("leaves every historical release workflow in place", () => {
    // The migration adds a workflow; it never edits a published one.
    for (const line of ["v0.1", "v0.2", "v0.3", "v0.4"]) {
      const historical = join(REPO_ROOT, ".github", "workflows", `release-${line}.yml`);
      expect(() => read(historical)).not.toThrow();
    }
  });

  it("keeps the v0.4 release workflow pinned to its own version and profile", () => {
    const v04 = read(join(REPO_ROOT, ".github", "workflows", "release-v0.4.yml"));
    expect(v04.includes('!= "0.4.0"')).toBe(true);
    expect(v04.includes("project-brain-timeline")).toBe(true);
    // It must not have been dragged forward to the new profile.
    expect(v04.includes("ohmypm-cli-namespace")).toBe(false);
  });
});
