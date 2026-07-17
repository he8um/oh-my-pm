import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const buildArchives = join(repoRoot, "tools", "build-release-archives.mjs");
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
  const root = tempDir("oh-my-pm-arch-build-bundle-");
  expect(run(buildBundle, ["--output", root, "--apply"]).status).toBe(0);
  bundle = join(root, BUNDLE_NAME);
}, 180_000);

afterAll(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("build-release-archives command", () => {
  it("previews without writing and exits 0", () => {
    const out = tempDir("oh-my-pm-arch-preview-");
    const result = run(buildArchives, ["--bundle", bundle, "--output", out]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OH MY PM release archives: preview");
    expect(existsSync(join(out, `${BUNDLE_NAME}.tar.gz`))).toBe(false);
    expect(existsSync(join(out, `${BUNDLE_NAME}.zip`))).toBe(false);
  });

  it("applies to create exactly three assets", () => {
    const out = tempDir("oh-my-pm-arch-apply-cli-");
    const result = run(buildArchives, ["--bundle", bundle, "--output", out, "--apply"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("OH MY PM release archives: applied");
    expect(readdirSync(out).sort()).toEqual([
      `${BUNDLE_NAME}-SHA256SUMS.txt`,
      `${BUNDLE_NAME}.tar.gz`,
      `${BUNDLE_NAME}.zip`,
    ]);
  }, 120_000);

  it("exits 2 for invalid args with concise stderr and no stack trace", () => {
    const result = run(buildArchives, ["--bundle", bundle]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("release archives error:");
    expect(result.stderr).not.toContain("\n    at ");
  });

  it("blocks an existing asset set without force and preserves unrelated files with force", () => {
    const out = tempDir("oh-my-pm-arch-force-cli-");
    expect(run(buildArchives, ["--bundle", bundle, "--output", out, "--apply"]).status).toBe(0);
    writeFileSync(join(out, "keep.txt"), "keep", "utf8");
    expect(run(buildArchives, ["--bundle", bundle, "--output", out, "--apply"]).status).toBe(2);
    const forced = run(buildArchives, ["--bundle", bundle, "--output", out, "--apply", "--force"]);
    expect(forced.status, forced.stderr).toBe(0);
    expect(existsSync(join(out, "keep.txt"))).toBe(true);
  }, 180_000);

  it("emits valid JSON in --json mode", () => {
    const out = tempDir("oh-my-pm-arch-json-");
    const result = run(buildArchives, ["--bundle", bundle, "--output", out, "--json"]);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
});
