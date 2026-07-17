import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const wrapper = join(repoRoot, "tools", "install-release-bundle.mjs");
const installedCheck = join(repoRoot, "tools", "check-release-install.mjs");

const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;
const isWindows = process.platform === "win32";

const roots = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
function installBundle(bundle) {
  // Build a fresh bundle outside the repository so tests exercise source
  // independence, then relocate it to a location the source repo does not own.
  const out = tempDir("omp-e2e-build-");
  expect(run(buildBundle, ["--output", out, "--apply"]).status, "bundle build").toBe(0);
  const moved = tempDir("omp-e2e-bundle-");
  const bundleDir = join(moved, BUNDLE_NAME);
  renameSync(join(out, BUNDLE_NAME), bundleDir);
  return bundleDir;
}

let bundle;

beforeAll(() => {
  bundle = installBundle();
}, 240_000);

afterAll(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("release install e2e", () => {
  it("preview creates no prefix", () => {
    const prefix = join(tempDir("omp-e2e-prev-"), "prefix");
    const preview = run(wrapper, ["--bundle", bundle, "--prefix", prefix]);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain("action: create");
    expect(existsSync(prefix)).toBe(false);
  }, 60_000);

  it("apply creates the canonical layout and installs from a source that can be removed", () => {
    const parent = tempDir("omp-e2e-apply-");
    const prefix = join(parent, "prefix");

    const apply = run(wrapper, ["--bundle", bundle, "--prefix", prefix, "--apply"]);
    expect(apply.status, apply.stderr).toBe(0);

    // Canonical layout.
    const versionDir = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    expect(existsSync(versionDir)).toBe(true);
    for (const shim of ["oh-my-pm", "oh-my-pm.cmd", "oh-my-pm-mcp", "oh-my-pm-mcp.cmd"]) {
      expect(existsSync(join(prefix, "bin", shim)), shim).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8"));
    expect(manifest.version).toBe(CANONICAL_VERSION);
    expect(manifest.activeVersion).toBe(CANONICAL_VERSION);

    // POSIX shims executable.
    if (!isWindows) {
      for (const shim of ["oh-my-pm", "oh-my-pm-mcp"]) {
        expect((lstatSync(join(prefix, "bin", shim)).mode & 0o111) !== 0, shim).toBe(true);
      }
    }

    // Installed-state verifier passes.
    const check = run(installedCheck, ["--prefix", prefix]);
    expect(check.stderr, check.stderr).toBe("");
    expect(check.status).toBe(0);
    expect(check.stdout).toBe(`OH MY PM release installation check: OK (${CANONICAL_VERSION})\n`);

    // Manifest embeds no absolute path.
    const manifestText = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");
    expect(manifestText).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
  }, 120_000);

  it("keeps the source bundle unchanged after apply", () => {
    const prefix = join(tempDir("omp-e2e-srcstable-"), "prefix");
    // The shared bundle is only read here, never removed.
    const before = readFileSync(join(bundle, "SHA256SUMS"), "utf8");
    expect(run(wrapper, ["--bundle", bundle, "--prefix", prefix, "--apply"]).status).toBe(0);
    const after = readFileSync(join(bundle, "SHA256SUMS"), "utf8");
    expect(after).toBe(before);
  }, 120_000);

  it("installed commands survive source removal and full prefix relocation", () => {
    const localBundle = installBundle();
    const parent = tempDir("omp-e2e-reloc-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply"]).status).toBe(0);

    // Remove the source bundle entirely.
    rmSync(dirname(localBundle), { recursive: true, force: true });

    const cliCmd = join(prefix, "bin", isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
    const status = spawnSync(cliCmd, ["status"], { encoding: "utf8" });
    expect(status.stdout).toContain(`version: ${CANONICAL_VERSION}`);
    expect(status.stdout).toContain(`kernel: ${CANONICAL_VERSION}`);

    // Relocate the entire prefix and re-run through the relative shims.
    const movedParent = tempDir("omp-e2e-reloc-moved-");
    const movedPrefix = join(movedParent, "prefix");
    renameSync(prefix, movedPrefix);
    const movedCli = join(movedPrefix, "bin", isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
    const movedStatus = spawnSync(movedCli, ["status"], { encoding: "utf8" });
    expect(movedStatus.stdout).toContain(`version: ${CANONICAL_VERSION}`);

    // Installed-state verifier passes from the moved prefix.
    expect(run(installedCheck, ["--prefix", movedPrefix]).status).toBe(0);
  }, 180_000);

  it("is idempotent: a second apply from the same bundle is already-installed and writes nothing new", () => {
    const parent = tempDir("omp-e2e-idem-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", bundle, "--prefix", prefix, "--apply"]).status).toBe(0);
    const manifestBefore = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");

    const second = run(wrapper, ["--bundle", bundle, "--prefix", prefix, "--apply"]);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("already installed");
    const manifestAfter = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");
    expect(manifestAfter).toBe(manifestBefore);
  }, 120_000);

  it("blocks drift without --force and preserves unrelated prefix files under --force", () => {
    const parent = tempDir("omp-e2e-force-");
    const prefix = join(parent, "prefix");
    const localBundle = bundle;
    expect(run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply"]).status).toBe(0);

    // Unrelated files that force must preserve.
    writeFileSync(join(prefix, "bin", "unrelated-tool"), "keepme\n");
    mkdirSync(join(prefix, "lib", "other"), { recursive: true });
    writeFileSync(join(prefix, "lib", "other", "note.txt"), "unrelated\n");

    // Introduce drift in a managed shim.
    writeFileSync(join(prefix, "bin", "oh-my-pm"), "corrupted\n");

    // Blocked without force. A plan that fails to resolve is rendered to stdout
    // (action: blocked) and exits 2; the stderr "blocked" line is reserved for a
    // block detected inside apply-time revalidation.
    const blocked = run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply"]);
    expect(blocked.status).toBe(2);
    expect(`${blocked.stdout}${blocked.stderr}`).toContain("blocked");

    // Force replaces exact managed targets only.
    const forced = run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply", "--force"]);
    expect(forced.status, forced.stderr).toBe(0);

    // Unrelated files preserved.
    expect(readFileSync(join(prefix, "bin", "unrelated-tool"), "utf8")).toBe("keepme\n");
    expect(readFileSync(join(prefix, "lib", "other", "note.txt"), "utf8")).toBe("unrelated\n");

    // Managed shim repaired and install verifies.
    expect(readFileSync(join(prefix, "bin", "oh-my-pm"), "utf8").startsWith("#!/bin/sh")).toBe(true);
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 240_000);

  it("does not create shell profiles, MCP client config, or project files", () => {
    const parent = tempDir("omp-e2e-noextra-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", bundle, "--prefix", prefix, "--apply"]).status).toBe(0);
    // Only bin/ and lib/ appear directly under the prefix.
    const top = readdirSync(prefix).sort();
    expect(top).toEqual(["bin", "lib"]);
  }, 120_000);
});
