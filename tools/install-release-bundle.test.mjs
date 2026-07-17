import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const wrapper = join(repoRoot, "tools", "install-release-bundle.mjs");

const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;

const roots = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
function run(args) {
  const r = spawnSync(process.execPath, [wrapper, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let bundle;
beforeAll(() => {
  const out = tempDir("omp-wrap-build-");
  const build = spawnSync(process.execPath, [buildBundle, "--output", out, "--apply"], {
    encoding: "utf8",
  });
  expect(build.status, build.stderr).toBe(0);
  bundle = join(out, BUNDLE_NAME);
}, 240_000);

afterAll(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("install-release-bundle wrapper argument handling", () => {
  it("requires --bundle", () => {
    const r = run(["--prefix", "/nope"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--bundle is required");
  });
  it("requires --prefix", () => {
    const r = run(["--bundle", bundle]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--prefix is required");
  });
  it("rejects unknown and positional arguments", () => {
    expect(run(["--bundle", bundle, "--prefix", "/p", "--nope"]).status).toBe(2);
    expect(run(["--bundle", bundle, "--prefix", "/p", "extra"]).status).toBe(2);
  });
  it("requires --apply for --force", () => {
    expect(run(["--bundle", bundle, "--prefix", "/p", "--force"]).status).toBe(2);
  });
});

describe("install-release-bundle wrapper behavior", () => {
  it("previews without writing", () => {
    const prefix = join(tempDir("omp-wrap-prev-"), "prefix");
    const r = run(["--bundle", bundle, "--prefix", prefix]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("action: create");
    expect(existsSync(prefix)).toBe(false);
  }, 60_000);

  it("emits JSON with a single trailing newline in --json mode", () => {
    const prefix = join(tempDir("omp-wrap-json-"), "prefix");
    const r = run(["--bundle", bundle, "--prefix", prefix, "--json"]);
    expect(r.status, r.stderr).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.action).toBe("create");
    expect(r.stdout.endsWith("}\n")).toBe(true);
    expect(r.stdout.endsWith("}\n\n")).toBe(false);
    expect(existsSync(prefix)).toBe(false);
  }, 60_000);

  it("applies a real bundle into a fresh prefix", () => {
    const prefix = join(tempDir("omp-wrap-apply-"), "prefix");
    const r = run(["--bundle", bundle, "--prefix", prefix, "--apply"]);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(prefix, "lib", "oh-my-pm", "install.json"))).toBe(true);
  }, 120_000);
});
