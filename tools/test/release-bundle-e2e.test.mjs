import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const buildCli = join(repoRoot, "tools", "build-release-bundle.mjs");
const checkCli = join(repoRoot, "tools", "check-release-bundle.mjs");

const BUNDLE = "oh-my-pm-v0.1.0";
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
    expect(result.stdout).toBe("OH MY PM release bundle check: OK (0.1.0)\n");
  }, 120_000);

  it("has no repository path anywhere in the moved bundle text", () => {
    const releaseText = readFileSync(join(movedBundle, "RELEASE.json"), "utf8");
    expect(releaseText).not.toContain(repoRoot);
    const sums = readFileSync(join(movedBundle, "SHA256SUMS"), "utf8");
    expect(sums).not.toContain(repoRoot);
  });

  it("runs every CLI workflow from the moved bundle", () => {
    const cliBin = join(movedBundle, "bin", "oh-my-pm.mjs");
    const fixture = join(movedBundle, "examples", "markdown-project");
    const status = spawnSync(process.execPath, [cliBin, "status"], { encoding: "utf8" });
    expect(status.stdout).toContain("version: 0.1.0");
    expect(status.stdout).toContain("kernel: 0.1.0");
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
