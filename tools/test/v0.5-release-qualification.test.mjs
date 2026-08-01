// v0.5 release qualification: the new release line, the new bundle profile, and
// the new release workflow.
//
// These are static checks on the prepared release surface. They deliberately do
// not publish anything: the workflow is manually dispatched and its publish job
// is gated behind an exact confirmation string and a protected environment.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_CLI,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
} from "../command-surface.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(p, "utf8");

const RELEASE_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "release-v0.5.yml");
const wf = read(RELEASE_WORKFLOW);

describe("v0.5 release workflow safety", () => {
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
    const gates = (wf.match(/RELEASE v0\.5\.0/g) ?? []).length;
    expect(gates).toBeGreaterThanOrEqual(2);
    expect(wf.includes("inputs.publish == true")).toBe(true);
  });

  it("pins the version and refuses any other", () => {
    expect(wf.includes('!= "0.5.0"')).toBe(true);
  });

  it("refuses to overwrite an existing tag or release", () => {
    expect(wf.includes("refusing to overwrite")).toBe(true);
  });

  it("verifies the v0.4.0 base stable lineage without modifying it", () => {
    expect(wf.includes("BASE_TAG=v0.4.0")).toBe(true);
    expect(wf.includes("0540a78576222227f276c627c518095ef43f2b50")).toBe(true);
  });

  it("publishes to no package registry", () => {
    for (const verb of ["npm publish", "pnpm publish", "cargo publish", "yarn publish"]) {
      expect(wf.includes(verb), `must not run ${verb}`).toBe(false);
    }
  });
});

describe("v0.5 release workflow validates the command surface", () => {
  it("runs the command-surface and reference-regression gates", () => {
    expect(wf.includes("pnpm validate:commands")).toBe(true);
    expect(wf.includes("pnpm validate:references")).toBe(true);
    expect(wf.includes("pnpm version:check")).toBe(true);
  });

  it("pins the new bundle profile so no matrix job can qualify the wrong surface", () => {
    expect(wf.includes("--profile ohmypm-cli-namespace")).toBe(true);
    expect(wf.includes('r.bundleProfile !== "ohmypm-cli-namespace"')).toBe(true);
    expect(wf.includes('r.releaseLine !== "v0.5"')).toBe(true);
  });

  it("asserts canonical commands and legacy aliases are declared separately", () => {
    expect(wf.includes("canonicalCommands")).toBe(true);
    expect(wf.includes("legacyAliases")).toBe(true);
    expect(wf.includes("commandRemovalScheduled")).toBe(true);
  });

  it("requires the bundle to ship both command families as entrypoints", () => {
    for (const bin of [
      `${CANONICAL_CLI}.mjs`,
      `${CANONICAL_MCP}.mjs`,
      `${CANONICAL_INSTALLER}.mjs`,
      "oh-my-pm.mjs",
      "oh-my-pm-mcp.mjs",
      "oh-my-pm-install.mjs",
    ]) {
      expect(wf.includes(bin), `bundle must ship ${bin}`).toBe(true);
    }
  });

  it("keeps the runtime surface identical to v0.4 (no data migration)", () => {
    expect(wf.includes("expectedMcpToolCount !== 12")).toBe(true);
    expect(wf.includes("storeMigrationRequired !== false")).toBe(true);
    expect(wf.includes("schemaVersion !== 1")).toBe(true);
    expect(wf.includes("storeFormatVersion !== 2")).toBe(true);
  });

  it("smoke-tests canonical commands and compatibility aliases separately", () => {
    expect(wf.includes("Canonical and compatibility-alias installed smoke")).toBe(true);
    // The alias must warn on stderr and keep stdout clean; both are asserted.
    expect(wf.includes("deprecated compatibility alias")).toBe(true);
    expect(wf.includes("alias wrote its deprecation warning to stdout")).toBe(true);
    // JSON through the alias must stay parseable.
    expect(wf.includes("alias.json")).toBe(true);
  });

  it("asserts the installed manifest separates canonical from legacy commands", () => {
    expect(wf.includes("legacyCommands must be the aliases")).toBe(true);
    expect(wf.includes("commands must be canonical")).toBe(true);
  });
});

describe("v0.5 preserves product identity in release artifacts", () => {
  it("keeps archive names product-based, not command-based", () => {
    expect(wf.includes("oh-my-pm-v0.5.0.tar.gz")).toBe(true);
    expect(wf.includes("oh-my-pm-v0.5.0.zip")).toBe(true);
    expect(wf.includes("oh-my-pm-v0.5.0-SHA256SUMS.txt")).toBe(true);
    // The migration must never rename release artifacts.
    expect(wf.includes("ohmypm-v0.5.0")).toBe(false);
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
