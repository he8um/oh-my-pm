import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const repro = join(repoRoot, "tools", "check-release-archive-reproducibility.mjs");
const BUNDLE_NAME = "oh-my-pm-v0.1.0";
const roots = [];
let bundle;

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

beforeAll(() => {
  const root = tempDir("oh-my-pm-arch-repro-bundle-");
  expect(run(buildBundle, ["--output", root, "--apply"]).status).toBe(0);
  bundle = join(root, BUNDLE_NAME);
}, 180_000);

afterAll(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("check-release-archive-reproducibility command", () => {
  it("confirms two independent builds are byte-identical", () => {
    const result = run(repro, ["--bundle", bundle]);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("OH MY PM release archive reproducibility: OK (0.1.0)\n");
  }, 180_000);

  it("requires --bundle", () => {
    expect(run(repro, []).status).toBe(2);
  });
});
