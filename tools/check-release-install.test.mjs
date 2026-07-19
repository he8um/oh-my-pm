import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const wrapper = join(repoRoot, "tools", "install-release-bundle.mjs");
const checker = join(repoRoot, "tools", "check-release-install.mjs");

const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;

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

let prefix;

beforeAll(() => {
  const out = tempDir("omp-chk-build-");
  expect(run(buildBundle, ["--output", out, "--apply"]).status).toBe(0);
  const bundle = join(out, BUNDLE_NAME);
  prefix = join(tempDir("omp-chk-prefix-"), "prefix");
  expect(run(wrapper, ["--bundle", bundle, "--prefix", prefix, "--apply"]).status).toBe(0);
}, 240_000);

afterAll(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("check-release-install argument handling", () => {
  it("requires --prefix", () => {
    const r = run(checker, []);
    expect(r.status).toBe(2);
  });
  it("rejects unknown arguments", () => {
    const r = run(checker, ["--prefix", prefix, "--nope"]);
    expect(r.status).toBe(2);
  });
});

describe("check-release-install behavior", () => {
  it("passes for a good installation", () => {
    const r = run(checker, ["--prefix", prefix]);
    expect(r.stderr, r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`OH MY PM release installation check: OK (${CANONICAL_VERSION})\n`);
  }, 60_000);

  it("honors --expected-version", () => {
    expect(run(checker, ["--prefix", prefix, "--expected-version", CANONICAL_VERSION]).status).toBe(0);
    const wrong = run(checker, ["--prefix", prefix, "--expected-version", "9.9.9"]);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain("expected 9.9.9");
  }, 60_000);

  it("fails when the manifest is missing", () => {
    const empty = join(tempDir("omp-chk-empty-"), "prefix");
    const r = run(checker, ["--prefix", empty]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("failed");
  });

  it("fails when a managed shim drifts", () => {
    // Copy the good prefix, corrupt a shim, and confirm the checker rejects it.
    const copyParent = tempDir("omp-chk-drift-");
    const copy = join(copyParent, "prefix");
    cpSync(prefix, copy, { recursive: true, verbatimSymlinks: true });
    writeFileSync(join(copy, "bin", "oh-my-pm"), "corrupt\n");
    const r = run(checker, ["--prefix", copy]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("shim content mismatch");
  }, 60_000);
});

// The installed CLI is invoked through the platform shim. On Windows that shim
// is a .cmd, which Node refuses to launch via execFile/spawn without a shell
// (CVE-2024-27980), so the verifier must pass `shell: isWindows`. This defect
// only manifests on Windows (where the smoke job runs), so a cross-platform
// structural assertion guards against a regression to a bare execFileSync.
describe("check-release-install spawns the .cmd shim correctly on Windows", () => {
  const source = readFileSync(checker, "utf8");
  it("targets the .cmd shim on Windows and the bare shim on POSIX", () => {
    expect(source).toContain('isWindows ? "oh-my-pm.cmd" : "oh-my-pm"');
  });
  it("passes shell: isWindows when launching the installed CLI shim", () => {
    expect(source).toMatch(/execFileSync\(\s*cliCommand[\s\S]*?shell:\s*isWindows/);
  });
  it("never launches the .cmd shim through execFileSync without a shell", () => {
    // A bare execFileSync(cliCommand, args, { encoding }) with no shell option
    // would throw EINVAL on Windows for the .cmd shim.
    expect(source).not.toMatch(/execFileSync\(\s*cliCommand,[^)]*\{\s*encoding:\s*["']utf8["']\s*\}\s*\)/);
  });
});
