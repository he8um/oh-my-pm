// The documentation-truth validator must derive its expectations, and it must
// actually fail on drift.
//
// A validator that cannot fail is worse than none: it certifies whatever it is
// shown. These tests prove the derivation matches the real product surface and
// that each class of stale claim is caught.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { INSTALLED_SHIM_COUNT, INSTALLED_SHIM_NAMES } from "../command-surface.mjs";
import { LOCAL_COMMAND_NAMES } from "../local-install-utils.mjs";
import { loadReleaseState } from "../release-state.mjs";
import { historicalDocPaths, loadDocsManifest } from "../docs-manifest.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const validator = join(repoRoot, "tools", "validate-doc-truth.mjs");

function runValidator() {
  return spawnSync(process.execPath, [validator], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

// Backups live OUTSIDE the repository. Writing them alongside the original
// would leave an untracked stray file in the working tree if a run is
// interrupted, which validate-structure would then reject.
const backupDir = mkdtempSync(join(tmpdir(), "omp-doc-truth-"));
afterAll(() => {
  rmSync(backupDir, { recursive: true, force: true });
});

/** Restore any file this suite temporarily edits, even when a test fails. */
const restores = [];
afterEach(() => {
  for (const { path, backup } of restores.splice(0)) {
    copyFileSync(backup, path);
  }
});

let backupSeq = 0;
function withTemporaryEdit(relPath, edit) {
  const path = join(repoRoot, relPath);
  const backup = join(backupDir, `${backupSeq++}-${basename(relPath)}`);
  copyFileSync(path, backup);
  restores.push({ path, backup });
  writeFileSync(path, edit(readFileSync(path, "utf8")));
}

/**
 * Rewrite release-state.json into an explicit lifecycle shape.
 *
 * The earlier version of this suite string-replaced the current literals, so
 * every release bump silently broke each flip test and its assertions. Building
 * the contract from the fields under test instead keeps these regression tests
 * pinned to the BEHAVIOUR (prepared vs published invariants) rather than to
 * whichever version happens to be current.
 */
function withReleaseState(overrides) {
  const { state } = loadReleaseState(repoRoot);
  withTemporaryEdit(
    "release-state.json",
    () => `${JSON.stringify({ ...state, ...overrides }, null, 2)}\n`,
  );
}

describe("validate-doc-truth passes on the current tree", () => {
  it("exits zero and reports the derived facts", () => {
    const result = runValidator();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate-doc-truth: OK");
  });

  it("derives the version from version.json, not a restated literal", () => {
    const version = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
    expect(runValidator().stdout).toContain(`v${version}`);
    const source = readFileSync(validator, "utf8");
    // The validator must not hard-code the current version as an expectation.
    expect(source).not.toMatch(new RegExp(`["'\`]${version.replace(/\./g, "\\.")}["'\`]`));
  });

  it("derives the MCP tool count from the server registration source", () => {
    const server = readFileSync(join(repoRoot, "mcp-server", "src", "server.ts"), "utf8");
    // Every registered tool name must appear in the server source.
    for (const tool of [
      "project_brief",
      "project_risks",
      "project_next",
      "project_handoff",
      "github_project_brief",
      "github_project_risks",
      "github_project_next",
      "github_project_handoff",
      "provider_status",
      "github_provider_diagnostics",
      "project_changes",
      "project_timeline",
    ]) {
      expect(server).toContain(tool);
    }
    expect(runValidator().stdout).toContain("12 MCP tools");
  });

  it("derives the memory subcommand count from the closed allowlist", () => {
    expect(runValidator().stdout).toContain("7 memory subcommands");
  });
});

describe("validate-doc-truth fails on real drift", () => {
  it("catches a stale MCP tool count", () => {
    withTemporaryEdit("mcp-server/README.md", (text) =>
      text.replace(/All twelve tools/, "All eleven tools"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/eleven/);
  });

  it("catches a stale source version claim", () => {
    withTemporaryEdit("README.md", (text) => `${text}\n\nThe current source version is 0.3.1.\n`);
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/claims source version 0\.3\.1/);
  });

  it("catches a dropped project_timeline in the MCP reference", () => {
    withTemporaryEdit("mcp-server/README.md", (text) =>
      text.replaceAll("project_timeline", "project_removed"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/project_timeline/);
  });

  it("catches a reintroduced 'nothing invokes it' comment", () => {
    withTemporaryEdit("project-memory/README.md", (text) => `${text}\n\nNothing invokes it yet.\n`);
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Nothing invokes it yet/i);
  });

  it("catches an architecture document that loses the application layer", () => {
    withTemporaryEdit("docs/architecture.md", (text) =>
      text.replaceAll("Application", "Xpplication").replaceAll("@oh-my-pm/application", "removed"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Application/);
  });

  it("catches a shell example that demonstrates a deprecated alias", () => {
    withTemporaryEdit("README.md", (text) => `${text}\n\n\`\`\`bash\noh-my-pm status\n\`\`\`\n`);
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/deprecated alias/);
  });
});

describe("historical documents are exempt", () => {
  it("does not flag an old release note for naming its own old version", () => {
    // docs/releases/v0.2.0.md legitimately says 0.2.0 everywhere. The validator
    // must leave it alone; only active documents are checked.
    const result = runValidator();
    expect(result.status).toBe(0);
    const note = readFileSync(join(repoRoot, "docs", "releases", "v0.2.0.md"), "utf8");
    expect(note).toContain("0.2.0");
  });

  it("keeps historical release notes out of the active document list", () => {
    // v0.5.3: the active/historical split moved out of validator constants and
    // into docs/manifest.json. Assert the CLASSIFICATION rather than the source
    // text of the validator, so the guarantee survives further refactoring:
    // every release note must be classified as a point-in-time record, and none
    // may be active.
    const { manifest, errors } = loadDocsManifest(repoRoot);
    expect(errors).toEqual([]);

    const releaseNotes = manifest.documents.filter((d) => d.path.startsWith("docs/releases/"));
    expect(releaseNotes.length).toBeGreaterThan(0);
    for (const doc of releaseNotes) {
      expect(["release-record", "historical"]).toContain(doc.status);
      expect(doc.authority).toBe("informative");
    }

    // And the derived historical set the validator consumes must contain them.
    const historical = new Set(historicalDocPaths(manifest));
    for (const doc of releaseNotes) {
      expect(historical.has(doc.path)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Release-state contract (Issue #30).
// ---------------------------------------------------------------------------

describe("the release-state contract is validated", () => {
  it("is structurally valid on the current tree", () => {
    const { state, errors } = loadReleaseState(repoRoot);
    expect(errors).toEqual([]);
    expect(state).not.toBeNull();
  });

  it("agrees with version.json", () => {
    const version = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
    const { state } = loadReleaseState(repoRoot);
    expect(state.sourceVersion).toBe(version);
  });

  it("records a full, real commit for the published stable", () => {
    // Before publication this asserted the contract equalled the release
    // workflow's pinned BASE_TAG/BASE_SHA. After publication the contract has
    // moved on to v0.5.2 while the workflow still pins v0.5.1 as the immutable
    // base it was released FROM -- so the two are now deliberately different,
    // and the base lineage is asserted separately below.
    const { state } = loadReleaseState(repoRoot);
    expect(state.latestStableCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(state.latestStableTag).toBe(`v${state.latestStableVersion}`);
  });

  it("keeps the release workflow's immutable base lineage intact", () => {
    const workflow = readFileSync(
      join(repoRoot, ".github", "workflows", "release-v0.5.yml"),
      "utf8",
    );
    // The immutable base lineage is the stable this release is published FROM,
    // which is the contract's current latestStable. v0.5.3 is released on top of
    // the published v0.5.2.
    const { state } = loadReleaseState(repoRoot);
    expect(workflow).toContain(`BASE_TAG=${state.latestStableTag}`);
    expect(workflow).toContain(`BASE_SHA=${state.latestStableCommit}`);
  });

  it("catches a stale latest stable version", () => {
    const { state } = loadReleaseState(repoRoot);
    withTemporaryEdit("release-state.json", (text) =>
      text.replace(
        `"latestStableVersion": "${state.latestStableVersion}"`,
        '"latestStableVersion": "0.4.0"',
      ),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/latestStableTag .* does not match latestStableVersion/);
  });

  it("catches a wrong stable tag", () => {
    const { state } = loadReleaseState(repoRoot);
    withTemporaryEdit("release-state.json", (text) =>
      text.replace(`"latestStableTag": "${state.latestStableTag}"`, '"latestStableTag": "v0.4.0"'),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/latestStableTag/);
  });

  it("catches a wrong stable commit", () => {
    withTemporaryEdit("release-state.json", (text) =>
      text.replace(/"latestStableCommit": "[0-9a-f]{40}"/, '"latestStableCommit": "deadbeef"'),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/latestStableCommit must be a full 40-character/);
  });

  it("catches a prepared source that claims to be the latest stable", () => {
    // "prepared" and "latestStableVersion == sourceVersion" are contradictory:
    // a prepared version is by definition not published.
    const { state } = loadReleaseState(repoRoot);
    withReleaseState({
      sourceState: "prepared",
      latestStableVersion: state.sourceVersion,
      latestStableTag: `v${state.sourceVersion}`,
      publicationTarget: `v${state.sourceVersion}`,
    });
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/prepared.*but latestStableVersion equals sourceVersion/s);
  });

  it("catches a published source that still names a publication target", () => {
    const { state } = loadReleaseState(repoRoot);
    withReleaseState({
      sourceState: "published",
      latestStableVersion: state.sourceVersion,
      latestStableTag: `v${state.sourceVersion}`,
      publicationTarget: `v${state.sourceVersion}`,
    });
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `publicationTarget is "v${state.sourceVersion}"; it must be null`,
    );
  });

  it("catches a published source whose latest stable is an older release", () => {
    const { state } = loadReleaseState(repoRoot);
    withReleaseState({
      sourceState: "published",
      latestStableVersion: state.latestStableVersion,
      latestStableTag: state.latestStableTag,
      publicationTarget: null,
    });
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `latestStableVersion (${state.latestStableVersion}) is not sourceVersion`,
    );
  });

  it("catches a contract that disagrees with version.json", () => {
    withReleaseState({ sourceVersion: "0.9.9" });
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/sourceVersion 0\.9\.9 != version\.json/);
  });
});

describe("active documentation must agree with the release state", () => {
  it("catches a published release described as unpublished", () => {
    // Declare the source PUBLISHED, then leave a document saying it is not yet
    // published: exactly the drift that outlived v0.5.1.
    const { state } = loadReleaseState(repoRoot);
    const v = state.sourceVersion;
    withReleaseState({
      sourceState: "published",
      latestStableVersion: v,
      latestStableTag: `v${v}`,
      publicationTarget: null,
    });
    withTemporaryEdit(
      "README.md",
      (text) => `${text}\n\nv${v} is prepared but not yet published.\n`,
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`describes v${v} as unpublished`);
  });

  it("catches an unpublished source described as the current stable", () => {
    // The claim is only wrong while the source is unpublished, which is exactly
    // the state this guards.
    const { state } = loadReleaseState(repoRoot);
    const v = state.sourceVersion;
    withReleaseState({
      sourceState: "prepared",
      latestStableVersion: state.latestStableVersion === v ? "0.5.2" : state.latestStableVersion,
      latestStableTag: state.latestStableVersion === v ? "v0.5.2" : state.latestStableTag,
      publicationTarget: `v${v}`,
    });
    withTemporaryEdit("README.md", (text) => `${text}\n\nv${v} is the latest stable release.\n`);
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`describes v${v} as a published stable release`);
  });

  it("catches active documentation naming a superseded latest stable", () => {
    withTemporaryEdit(
      "README.md",
      (text) => `${text}\n\nStable v0.4.0 is published and remains the latest stable release.\n`,
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/names v0\.4\.0 as the current latest stable/);
  });

  it("does not flag a historical changelog entry that was true when written", () => {
    // docs/roadmap.md records "v0.2.0 is now the latest stable" as a dated
    // event. Rewriting that would destroy the release history, so the check is
    // present-tense only and this must stay green.
    expect(runValidator().status).toBe(0);
    const roadmap = readFileSync(join(repoRoot, "docs", "roadmap.md"), "utf8");
    expect(roadmap).toMatch(/`v0\.2\.0` is now the latest stable/);
  });

  it("catches a missing release note for the publication target", () => {
    withReleaseState({ sourceState: "prepared", publicationTarget: "v0.5.9" });
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /publicationTarget must be the source version|v0\.5\.9\.md is missing/,
    );
  });
});

// ---------------------------------------------------------------------------
// Installed shim inventory (Issue #30).
// ---------------------------------------------------------------------------

describe("the installed shim inventory is derived, not restated", () => {
  it("derives eight shims from the command manifest", () => {
    expect(INSTALLED_SHIM_COUNT).toBe(8);
    expect(INSTALLED_SHIM_NAMES).toEqual([
      "ohmypm",
      "ohmypm.cmd",
      "ohmypm-mcp",
      "ohmypm-mcp.cmd",
      "oh-my-pm",
      "oh-my-pm.cmd",
      "oh-my-pm-mcp",
      "oh-my-pm-mcp.cmd",
    ]);
  });

  it("matches what the local installer actually writes", () => {
    // Two independent derivations of the same inventory must agree, so neither
    // can drift without the other noticing.
    const fromInstaller = LOCAL_COMMAND_NAMES.flatMap((c) => [c, `${c}.cmd`]);
    expect([...INSTALLED_SHIM_NAMES].sort()).toEqual([...fromInstaller].sort());
  });

  it("catches a stale four-shim claim in a README", () => {
    withTemporaryEdit("README.md", (text) =>
      text.replace("writes eight shims under", "writes four shims under"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/claims "four shims", but an install writes eight/);
  });

  it("catches a stale shim count in an active workflow comment", () => {
    withTemporaryEdit(".github/workflows/ci.yml", (text) =>
      text.replace("# Apply and verify the eight shims", "# Apply and verify the four shims"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/ci\.yml: claims "four shims"/);
  });

  it("catches a canonical/deprecated split that does not add up", () => {
    withTemporaryEdit("docs/getting-started.md", (text) =>
      text.replace(
        "two canonical commands and two deprecated aliases",
        "four canonical and four deprecated aliases",
      ),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /describes 4 canonical and 4 deprecated, but an install writes 2 canonical/,
    );
  });
});

// ---------------------------------------------------------------------------
// Security and support policy (Issue #30).
// ---------------------------------------------------------------------------

describe("the security policy is checked", () => {
  it("catches SECURITY.md claiming no stable release is supported", () => {
    withTemporaryEdit("SECURITY.md", (text) =>
      text.replace(
        /## Supported versions\n/,
        "## Supported versions\n\nOH MY PM is in early development. No stable release is supported yet.\n",
      ),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no stable release is supported|in early development/i);
  });

  it("catches SECURITY.md that stops naming the supported stable", () => {
    withTemporaryEdit("SECURITY.md", (text) => text.replaceAll("0.5.2", "0.0.0"));
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/must name the supported stable release v0\.5\.2/);
  });

  it("catches an invented security email address", () => {
    // The repository has no security mailbox. An address in SECURITY.md would
    // route reports into a black hole.
    withTemporaryEdit("SECURITY.md", (text) =>
      text.replace(
        "There is no security mailing address",
        "Email security@oh-my-pm.example instead",
      ),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/names an email address/);
  });

  it("catches a security policy that drops the private reporting route", () => {
    withTemporaryEdit("SECURITY.md", (text) =>
      text
        .replaceAll("private vulnerability reporting", "the usual channel")
        .replaceAll("Private vulnerability reporting", "The usual channel")
        .replace(/https:\/\/github\.com\/he8um\/oh-my-pm\/security\/advisories\/new/g, "elsewhere"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/must describe how to report a vulnerability privately/);
  });

  it("catches a security policy that stops discouraging public disclosure", () => {
    withTemporaryEdit("SECURITY.md", (text) =>
      text.replace(/\*\*Report privately\. Do not open a public issue[^*]*\*\*/, "**Report it.**"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/must discourage public disclosure/);
  });
});

describe("the support policy is checked", () => {
  it("catches scaffold-era support language", () => {
    withTemporaryEdit(
      "SUPPORT.md",
      (text) =>
        `${text}\n\nImplementation support will expand after the repository scaffold is in place.\n`,
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/scaffold/i);
  });

  it("catches SUPPORT.md describing the project as early-stage", () => {
    withTemporaryEdit("SUPPORT.md", (text) =>
      text.replace("# Support\n", "# Support\n\nOH MY PM is early-stage.\n"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/is early-stage/i);
  });

  it("catches SUPPORT.md pointing at a channel that does not exist", () => {
    // GitHub Discussions is disabled for this repository; naming it would send
    // users to a 404.
    withTemporaryEdit("SUPPORT.md", (text) =>
      text.replace(
        "GitHub Discussions is not enabled for this repository.",
        "Ask in GitHub Discussions.",
      ),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/GitHub Discussions, which is not enabled/);
  });

  it("catches SUPPORT.md that stops routing security reports away from issues", () => {
    withTemporaryEdit("SUPPORT.md", (text) =>
      text
        .replaceAll("SECURITY.md", "elsewhere.md")
        .replaceAll("security vulnerability", "problem")
        .replaceAll("vulnerability reporting", "reporting"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/must route security reports away from public issues/);
  });
});

// ---------------------------------------------------------------------------
// Release lifecycle truth (Issue #30, extended for the v0.5.2 publication).
//
// This block asserts the lifecycle INVARIANTS against whatever the contract
// currently declares, plus the immutable historical facts about v0.5.2's
// publication. The earlier version pinned every assertion to "v0.5.2 is the
// published source", which stopped being the live state the moment the source
// was promoted to the next patch -- so the invariants it meant to protect had to
// be rewritten on each release instead of holding across them.
// ---------------------------------------------------------------------------

describe("the published state is recorded and enforced", () => {
  it("records a coherent lifecycle state", () => {
    const { state, errors } = loadReleaseState(repoRoot);
    expect(errors).toEqual([]);
    expect(["prepared", "published"]).toContain(state.sourceState);
    if (state.sourceState === "published") {
      // Published: the source IS the latest stable and nothing is pending.
      expect(state.latestStableVersion).toBe(state.sourceVersion);
      expect(state.latestStableTag).toBe(`v${state.sourceVersion}`);
      expect(state.publicationTarget).toBeNull();
    } else {
      // Prepared: the source is NOT yet the latest stable, and it is the target.
      expect(state.latestStableVersion).not.toBe(state.sourceVersion);
      expect(state.publicationTarget).toBe(`v${state.sourceVersion}`);
    }
  });

  it("keeps the v0.5.2 publication as an immutable historical fact", () => {
    // v0.5.2 was published at this exact dereferenced tag commit -- not the tag
    // object and not a guess, but the commit the tag resolves to, which is also
    // the release targetCommitish and the commit the workflow ran on. That fact
    // never changes, whatever the current source version is.
    const V052_COMMIT = "6c915e0ebea8fa6cb4c6f791c1b0dc621e745361";
    const notes = join(repoRoot, "docs", "releases", "v0.5.2-post-publication-validation.md");
    expect(readFileSync(notes, "utf8")).toContain(V052_COMMIT);

    // While v0.5.2 remains the latest stable, the live contract must agree.
    const { state } = loadReleaseState(repoRoot);
    if (state.latestStableVersion === "0.5.2") {
      expect(state.latestStableCommit).toBe(V052_COMMIT);
    }
  });

  it("records a full, dereferenced commit for the latest stable", () => {
    const { state } = loadReleaseState(repoRoot);
    expect(state.latestStableCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("catches the published source described as unpublished", () => {
    const { state } = loadReleaseState(repoRoot);
    const v = state.sourceVersion;
    withReleaseState({
      sourceState: "published",
      latestStableVersion: v,
      latestStableTag: `v${v}`,
      publicationTarget: null,
    });
    withTemporaryEdit(
      "README.md",
      (text) => `${text}\n\nv${v} is prepared but not yet published.\n`,
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`describes v${v} as unpublished`);
  });

  it("catches the latest stable regressing to v0.5.1", () => {
    withTemporaryEdit("README.md", (text) => `${text}\n\nThe latest stable release is v0.5.1.\n`);
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/names v0\.5\.1 as the current latest stable/);
  });

  it("requires publicationTarget to be null while published", () => {
    const { state } = loadReleaseState(repoRoot);
    const v = state.sourceVersion;
    withReleaseState({
      sourceState: "published",
      latestStableVersion: v,
      latestStableTag: `v${v}`,
      publicationTarget: `v${v}`,
    });
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`publicationTarget is "v${v}"; it must be null`);
  });

  it("requires the security policy's supported stable to equal the latest stable", () => {
    withTemporaryEdit("SECURITY.md", (text) => text.replaceAll("0.5.2", "0.5.1"));
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/must name the supported stable release v0\.5\.2/);
  });

  it("points installation guidance at the published release", () => {
    // A getting-started guide that still offers the previous archive sends new
    // users to a superseded artifact.
    const guide = readFileSync(join(repoRoot, "docs", "getting-started.md"), "utf8");
    expect(guide).toContain("releases/tag/v0.5.2");
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toContain("releases/tag/v0.5.2");
  });

  it("keeps the post-publication validation record", () => {
    const record = readFileSync(
      join(repoRoot, "docs", "releases", "v0.5.2-post-publication-validation.md"),
      "utf8",
    );
    // The evidence that matters: tag commit, latest status, and checksums.
    expect(record).toContain("6c915e0ebea8fa6cb4c6f791c1b0dc621e745361");
    expect(record).toContain("v0.5.2");
    expect(record).toMatch(/[0-9a-f]{64}\s+oh-my-pm-v0\.5\.2\.tar\.gz/);
  });

  it("leaves the v0.5.1 release documentation unchanged", () => {
    // v0.5.1 is now superseded but remains published and immutable; its release
    // note must keep describing its own release.
    const note = readFileSync(join(repoRoot, "docs", "releases", "v0.5.1.md"), "utf8");
    expect(note).toContain("0.5.1");
  });
});
