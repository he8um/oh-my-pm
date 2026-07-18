import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const buildCli = join(repoRoot, "tools", "build-release-bundle.mjs");
const checkCli = join(repoRoot, "tools", "check-release-bundle.mjs");

// Version and bundle name derive from version.json, keeping this e2e suite
// version-independent across development cycles.
const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE = `oh-my-pm-v${CANONICAL_VERSION}`;
const roots = [];

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let output;
let movedParent;
let movedBundle;

beforeAll(() => {
  output = tempDir("oh-my-pm-rel-out-");
  // Preview must create nothing.
  const preview = run(buildCli, ["--output", output]);
  expect(preview.status, preview.stderr).toBe(0);
  expect(existsSync(join(output, BUNDLE))).toBe(false);

  // Apply builds the bundle.
  const apply = run(buildCli, ["--output", output, "--apply"]);
  expect(apply.status, apply.stderr).toBe(0);
  expect(existsSync(join(output, BUNDLE))).toBe(true);

  // Relocate outside the original output root.
  movedParent = tempDir("oh-my-pm-rel-moved-");
  movedBundle = join(movedParent, BUNDLE);
  renameSync(join(output, BUNDLE), movedBundle);
}, 180_000);

afterAll(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("portable release bundle e2e", () => {
  it("verifies the relocated bundle", () => {
    const result = run(checkCli, ["--bundle", movedBundle]);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`OH MY PM release bundle check: OK (${CANONICAL_VERSION})\n`);
  }, 120_000);

  it("has no repository path anywhere in the moved bundle text", () => {
    const releaseText = readFileSync(join(movedBundle, "RELEASE.json"), "utf8");
    expect(releaseText).not.toContain(repoRoot);
    const sums = readFileSync(join(movedBundle, "SHA256SUMS"), "utf8");
    expect(sums).not.toContain(repoRoot);
  });

  it("ships the installer surfaces and deterministic installer metadata", () => {
    for (const rel of [
      "bin/oh-my-pm-install.mjs",
      "libexec/release-install-core.mjs",
      "libexec/check-release-bundle.mjs",
    ]) {
      expect(existsSync(join(movedBundle, ...rel.split("/"))), rel).toBe(true);
    }
    const release = JSON.parse(readFileSync(join(movedBundle, "RELEASE.json"), "utf8"));
    expect(release.installer).toEqual({
      entrypoint: "bin/oh-my-pm-install.mjs",
      previewFirst: true,
      prefixRequired: true,
      applyFlag: "--apply",
      forceFlag: "--force",
      network: false,
      shellProfileWrites: false,
      clientConfigWrites: false,
      projectWrites: false,
    });
    // No installer core test leaks into the bundle.
    expect(existsSync(join(movedBundle, "libexec", "release-install-core.test.mjs"))).toBe(false);
  });

  it("declares the ten MCP tools and provider config/diagnostics metadata", () => {
    const release = JSON.parse(readFileSync(join(movedBundle, "RELEASE.json"), "utf8"));
    expect(release.mcpTools).toEqual([
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
    ]);
    expect(release.providerConfiguration).toEqual({
      schemaVersion: 1,
      fileName: "providers.json",
      pathEnv: "OH_MY_PM_PROVIDER_CONFIG",
      secretValuesAllowed: false,
      writes: false,
      github: {
        configurable: ["enabled", "defaultRepository", "defaultLimit"],
        fixed: ["origin", "apiVersion", "method", "tokenEnv"],
      },
      githubFields: ["enabled", "defaultRepository", "defaultLimit", "defaultSource", "defaultState"],
    });
    expect(release.providerDiagnostics).toEqual({
      offlineByDefault: true,
      networkConfirmationFlag: "--confirm-network",
      networkRequestCount: 1,
      networkMethod: "GET",
      tokenValuesReported: false,
    });
    // The GitHub outbound provider declares the source-selection surface.
    const gh = release.network.outboundProviders[0];
    expect(gh.sourceSelection).toEqual({
      defaultSource: "overview",
      defaultState: "open",
      modes: ["overview", "repository", "issues", "pull-requests", "item", "search"],
      states: ["open", "closed", "all"],
      searchKinds: ["all", "issues", "pull-requests"],
      singleItemAutoDetect: true,
      maxItems: 100,
      pagination: "single-page",
      comments: false,
      timelines: false,
      diffs: false,
    });
  });

  it("runs providers status and offline doctor from the moved bundle (no network, no providers.json)", () => {
    const cliBin = join(movedBundle, "bin", "oh-my-pm.mjs");
    const status = spawnSync(process.execPath, [cliBin, "providers", "status", "--json"], {
      encoding: "utf8",
    });
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout).schemaVersion).toBe(1);
    const doctor = spawnSync(process.execPath, [cliBin, "providers", "doctor", "--json"], {
      encoding: "utf8",
    });
    expect(doctor.status).toBe(0);
    expect(JSON.parse(doctor.stdout).networkAttempted).toBe(false);
    // The installer never creates a providers.json in the bundle.
    expect(existsSync(join(movedBundle, "providers.json"))).toBe(false);
  });

  it("runs every CLI workflow from the moved bundle", () => {
    const cliBin = join(movedBundle, "bin", "oh-my-pm.mjs");
    const fixture = join(movedBundle, "examples", "markdown-project");
    const status = spawnSync(process.execPath, [cliBin, "status"], { encoding: "utf8" });
    expect(status.stdout).toContain(`version: ${CANONICAL_VERSION}`);
    expect(status.stdout).toContain(`kernel: ${CANONICAL_VERSION}`);
    for (const workflow of ["brief", "risks", "next", "handoff"]) {
      const result = spawnSync(process.execPath, [cliBin, workflow, fixture, "--json"], {
        encoding: "utf8",
      });
      expect(result.status, workflow).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.ok, workflow).toBe(true);
      expect(result.stdout, workflow).not.toContain("ARCHIVED-SENTINEL");
      expect(result.stdout, workflow).not.toContain("SCRATCH-SENTINEL");
    }
  }, 60_000);

  it("blocks an existing target without force and preserves siblings with force", () => {
    // Re-apply into a fresh output, then confirm block/force semantics.
    const out = tempDir("oh-my-pm-rel-force-");
    expect(run(buildCli, ["--output", out, "--apply"]).status).toBe(0);
    const sibling = join(out, "keep-me.txt");
    writeFileSync(sibling, "sibling", "utf8");

    // Second non-force apply is blocked with exit 2.
    const blocked = run(buildCli, ["--output", out, "--apply"]);
    expect(blocked.status).toBe(2);

    // Force replaces only the target bundle; the sibling survives.
    const forced = run(buildCli, ["--output", out, "--apply", "--force"]);
    expect(forced.status, forced.stderr).toBe(0);
    expect(existsSync(sibling)).toBe(true);
    expect(readFileSync(sibling, "utf8")).toBe("sibling");
    expect(existsSync(join(out, BUNDLE))).toBe(true);
  }, 180_000);
});
