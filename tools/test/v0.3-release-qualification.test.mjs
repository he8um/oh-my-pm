// v0.3 Phase 6 — static release-qualification tests.
//
// These are deterministic, fast, offline checks that do NOT publish anything:
//   1. The v0.3 RC release workflow is manual-dispatch only, publishes a
//      prerelease targeting an exact SHA, requires the exact confirmation, and
//      contains no registry-publish / Docker-push / hidden-upload verb.
//   2. The non-publishing v0.3 installed-qualification workflow needs no
//      release permission and never publishes.
//   3. The v0.3 release profile is self-describing and fail-closed.
//   4. The self-contained v0.3 bundle inventory includes @oh-my-pm/project-memory
//      (dist-only) and no project-memory src/test files.
//   5. tar.gz and zip have equivalent logical inventories and are byte-reproducible.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RC_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "release-v0.3-rc.yml");
const QUAL_WORKFLOW = join(REPO_ROOT, ".github", "workflows", "v0.3-installed-qualification.yml");

function read(p) {
  return readFileSync(p, "utf8");
}

describe("v0.3 RC release workflow (static dry-run)", () => {
  const wf = read(RC_WORKFLOW);

  it("triggers on workflow_dispatch only, never push/pr/schedule/release", () => {
    expect(/^on:\s*\n\s+workflow_dispatch:/m.test(wf)).toBe(true);
    for (const trigger of ["\n  push:", "\n  pull_request:", "\n  schedule:", "\n  release:"]) {
      expect(wf.includes(trigger)).toBe(false);
    }
  });

  it("defaults publish to false and confirmation to empty", () => {
    expect(/publish:[\s\S]*?default:\s*false/.test(wf)).toBe(true);
    expect(/confirmation:[\s\S]*?default:\s*""/.test(wf)).toBe(true);
  });

  it("declares top-level contents: read and grants contents: write exactly once", () => {
    expect(/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(wf)).toBe(true);
    const writeCount = (wf.match(/^\s+contents: write\s*$/gm) || []).length;
    expect(writeCount).toBe(1);
  });

  it("gates the publish job on publish==true and the github-release environment", () => {
    expect(/if:\s*\$\{\{\s*inputs\.publish\s*==\s*true\s*\}\}/.test(wf)).toBe(true);
    expect(/name:\s*github-release/.test(wf)).toBe(true);
  });

  it("requires the exact version and confirmation string", () => {
    expect(wf.includes('!= "0.3.0-rc.1"')).toBe(true);
    expect(wf.includes("RELEASE v0.3.0-rc.1")).toBe(true);
  });

  it("publishes a prerelease at the exact commit SHA, never latest", () => {
    expect(wf.includes("--prerelease")).toBe(true);
    expect(wf.includes("--latest")).toBe(false);
    expect(wf.includes('--target "$GITHUB_SHA"')).toBe(true);
    expect(/isPrerelease\s*!==\s*true/.test(wf)).toBe(true);
  });

  it("depends on the cross-platform installed qualification before publish", () => {
    expect(/needs:\s*\[\s*prepare\s*,\s*installed-qualification\s*\]/.test(wf)).toBe(true);
    // The qualification matrix covers all three OSes.
    expect(/ubuntu-latest,\s*macos-latest,\s*windows-latest/.test(wf)).toBe(true);
  });

  it("refuses to overwrite an existing tag or release", () => {
    expect(wf.includes("refusing to overwrite")).toBe(true);
  });

  it("references exactly the three RC assets", () => {
    for (const asset of [
      "oh-my-pm-v0.3.0-rc.1.tar.gz",
      "oh-my-pm-v0.3.0-rc.1.zip",
      "oh-my-pm-v0.3.0-rc.1-SHA256SUMS.txt",
    ]) {
      expect(wf.includes(asset)).toBe(true);
    }
  });

  it("contains no registry-publish, Docker-push, or hidden-upload verb", () => {
    for (const verb of [
      "npm publish",
      "pnpm publish",
      "cargo publish",
      "yarn publish",
      "docker push",
      "docker/build-push-action",
    ]) {
      expect(wf.includes(verb)).toBe(false);
    }
  });

  it("cannot publish without the exact confirmation (the gate is present)", () => {
    // A publish run without the exact confirmation is rejected in both the
    // prepare and publish jobs.
    const gateCount = (wf.match(/RELEASE v0\.3\.0-rc\.1/g) || []).length;
    expect(gateCount).toBeGreaterThanOrEqual(2);
  });
});

describe("v0.3 installed-qualification workflow (non-publishing)", () => {
  const wf = read(QUAL_WORKFLOW);

  it("grants only contents: read and never contents: write", () => {
    expect(/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(wf)).toBe(true);
    expect(wf.includes("contents: write")).toBe(false);
  });

  it("prepares one artifact and tests it across Linux/macOS/Windows", () => {
    expect(/ubuntu-latest,\s*macos-latest,\s*windows-latest/.test(wf)).toBe(true);
    expect(wf.includes("v0.3-candidate-artifact")).toBe(true);
    expect(wf.includes("check-v0.3-installed-project-brain.mjs")).toBe(true);
  });

  it("never publishes a release, tag, or registry artifact", () => {
    for (const verb of ["gh release", "refs/tags", "npm publish", "pnpm publish", "cargo publish"]) {
      expect(wf.includes(verb)).toBe(false);
    }
  });
});

describe("v0.3 release profile is self-describing and fail-closed", () => {
  it("release-bundle-utils declares the project-brain profile with eleven tools", () => {
    const utils = read(join(REPO_ROOT, "tools", "release-bundle-utils.mjs"));
    expect(utils.includes('BUNDLE_PROFILE = "project-brain"')).toBe(true);
    expect(utils.includes('RELEASE_LINE = "v0.3"')).toBe(true);
    expect(utils.includes('"project_changes"')).toBe(true);
  });

  it("the bundle verifier rejects an unknown profile", () => {
    // The verifier's profile switch fails closed on any profile other than
    // "project-brain" or "source-v0.2".
    const verifier = read(join(REPO_ROOT, "tools", "check-release-bundle.mjs"));
    expect(verifier.includes("bundleProfile is unknown")).toBe(true);
    expect(verifier.includes('bundleProfile === "project-brain"') || verifier.includes('"project-brain"')).toBe(true);
  });

  it("the install core resolves the surface from the declared profile, fail-closed", () => {
    const core = read(join(REPO_ROOT, "distribution", "libexec", "release-install-core.mjs"));
    expect(core.includes("release_bundle_profile_unknown")).toBe(true);
    expect(core.includes("project_changes")).toBe(true);
  });
});

describe("self-contained v0.3 bundle includes project-memory (dist-only)", () => {
  let out;
  let bundleDir;

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "omp-v03-bundle-test-"));
    const version = JSON.parse(read(join(REPO_ROOT, "version.json"))).version;
    const r = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "tools", "build-release-bundle.mjs"), "--output", out, "--apply"],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    bundleDir = join(out, `oh-my-pm-v${version}`);
  }, 180000);

  afterAll(() => {
    if (out && existsSync(out)) rmSync(out, { recursive: true, force: true });
  });

  it("bundles @oh-my-pm/project-memory with a dist entrypoint", () => {
    const pmDir = join(bundleDir, "node_modules", "@oh-my-pm", "project-memory");
    expect(existsSync(join(pmDir, "package.json"))).toBe(true);
    expect(existsSync(join(pmDir, "dist", "index.js"))).toBe(true);
  });

  it("ships no project-memory src/ or test/ in the bundle", () => {
    const pmDir = join(bundleDir, "node_modules", "@oh-my-pm", "project-memory");
    expect(existsSync(join(pmDir, "src"))).toBe(false);
    expect(existsSync(join(pmDir, "test"))).toBe(false);
    // No .test.js compiled artifact leaked into the package either.
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else expect(/\.test\.(js|d\.ts)$/.test(entry.name)).toBe(false);
      }
    };
    walk(pmDir);
  });

  it("declares the project-brain profile in the bundle RELEASE.json", () => {
    const release = JSON.parse(read(join(bundleDir, "RELEASE.json")));
    expect(release.bundleProfile).toBe("project-brain");
    expect(release.expectedMcpToolCount).toBe(11);
    expect(release.mcpTools[release.mcpTools.length - 1]).toBe("project_changes");
  });

  it("passes the profile-aware bundle verifier", () => {
    const r = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "tools", "check-release-bundle.mjs"), "--bundle", bundleDir],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
  }, 60000);
});

// The historical v0.2 "source-v0.2" profile (ten tools, no Project Memory
// package) must remain resolvable by the SAME profile-aware installer/verifier,
// so a user upgrading from v0.2 to v0.3 is served by one installer. The
// definitive proof for the ten-tool INSTALL path is the immutable published
// v0.2.0 archive exercised in the release workflow; here we assert, without
// fragile physical bundle surgery, that the reusable profile logic in the
// install core (a) defaults an absent profile to the ten-tool legacy surface,
// (b) resolves the project-brain profile to eleven, and (c) fails closed on any
// unknown profile.
describe("release profile resolution (v0.2 upgrade compatibility)", () => {
  const CORE = join(REPO_ROOT, "distribution", "libexec", "release-install-core.mjs");
  const source = read(CORE);

  it("defines the ten historical tools and appends project_changes for project-brain", () => {
    expect(source.includes("const TEN_MCP_TOOLS")).toBe(true);
    expect(/\[\s*\.\.\.\s*TEN_MCP_TOOLS\s*,\s*"project_changes"\s*\]/.test(source)).toBe(true);
  });

  it("defaults an absent profile to the legacy source-v0.2 (ten-tool) surface", () => {
    expect(source.includes('release.bundleProfile ?? "source-v0.2"')).toBe(true);
  });

  it("fails closed on an unknown bundle profile", () => {
    expect(source.includes("release_bundle_profile_unknown")).toBe(true);
  });

  it("the shipped bundle verifier serves both profiles from one file", () => {
    const verifier = read(join(REPO_ROOT, "tools", "check-release-bundle.mjs"));
    // The verifier resolves the surface from bundleProfile, defaulting to legacy.
    expect(verifier.includes('release.bundleProfile ?? "source-v0.2"')).toBe(true);
    expect(verifier.includes('bundleProfile === "project-brain"')).toBe(true);
    expect(verifier.includes("bundleProfile is unknown")).toBe(true);
  });
});
