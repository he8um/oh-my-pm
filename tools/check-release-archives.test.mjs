import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const buildArchives = join(repoRoot, "tools", "build-release-archives.mjs");
const checkArchives = join(repoRoot, "tools", "check-release-archives.mjs");
const installedCheck = join(repoRoot, "tools", "check-release-install.mjs");
const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;
const TAR = `${BUNDLE_NAME}.tar.gz`;
const ZIP = `${BUNDLE_NAME}.zip`;
const SUMS = `${BUNDLE_NAME}-SHA256SUMS.txt`;
const roots = [];
let goodAssets;

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Copy the known-good asset set into a fresh dir the caller may tamper with. */
function copyAssets() {
  const dir = tempDir("oh-my-pm-arch-copy-");
  for (const name of [TAR, ZIP, SUMS]) cpSync(join(goodAssets, name), join(dir, name));
  return dir;
}

beforeAll(() => {
  const bundleRoot = tempDir("oh-my-pm-arch-chk-bundle-");
  expect(run(buildBundle, ["--output", bundleRoot, "--apply"]).status).toBe(0);
  const bundle = join(bundleRoot, BUNDLE_NAME);
  goodAssets = tempDir("oh-my-pm-arch-chk-assets-");
  expect(run(buildArchives, ["--bundle", bundle, "--output", goodAssets, "--apply"]).status).toBe(0);
}, 240_000);

afterAll(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("check-release-archives command", () => {
  it("passes for a valid asset set and verifies extracted bundles", () => {
    const result = run(checkArchives, ["--assets", goodAssets]);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`OH MY PM release archives check: OK (${CANONICAL_VERSION})\n`);
  }, 120_000);

  it("requires --assets", () => {
    const result = run(checkArchives, []);
    expect(result.status).toBe(2);
  });

  it("installs from a tar.gz-extracted bundle, independent of the extraction dir", () => {
    const extractRoot = tempDir("oh-my-pm-arch-tar-extract-");
    const extract = spawnSync("tar", ["-xzf", join(goodAssets, TAR), "-C", extractRoot], {
      encoding: "utf8",
    });
    expect(extract.status, extract.stderr).toBe(0);
    const bundle = join(extractRoot, BUNDLE_NAME);
    for (const rel of ["bin/oh-my-pm-install.mjs", "libexec/release-install-core.mjs", "libexec/check-release-bundle.mjs"]) {
      expect(existsSync(join(bundle, ...rel.split("/"))), rel).toBe(true);
    }
    const installer = join(bundle, "bin", "oh-my-pm-install.mjs");
    const prefix = join(tempDir("oh-my-pm-arch-tar-prefix-"), "prefix");
    // Preview writes nothing.
    expect(run(installer, ["--prefix", prefix]).status).toBe(0);
    expect(existsSync(prefix)).toBe(false);
    // Apply then verify.
    expect(run(installer, ["--prefix", prefix, "--apply"]).status).toBe(0);
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
    // Removing the extraction dir does not break installed commands.
    rmSync(extractRoot, { recursive: true, force: true });
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 180_000);

  it("installs from a ZIP-extracted bundle", () => {
    const extractRoot = tempDir("oh-my-pm-arch-zip-extract-");
    const extract = spawnSync("unzip", ["-q", join(goodAssets, ZIP), "-d", extractRoot], {
      encoding: "utf8",
    });
    expect(extract.status, extract.stderr).toBe(0);
    const bundle = join(extractRoot, BUNDLE_NAME);
    for (const rel of ["bin/oh-my-pm-install.mjs", "libexec/release-install-core.mjs", "libexec/check-release-bundle.mjs"]) {
      expect(existsSync(join(bundle, ...rel.split("/"))), rel).toBe(true);
    }
    const installer = join(bundle, "bin", "oh-my-pm-install.mjs");
    const prefix = join(tempDir("oh-my-pm-arch-zip-prefix-"), "prefix");
    expect(run(installer, ["--prefix", prefix, "--apply"]).status).toBe(0);
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 180_000);

  it("rejects a missing asset", () => {
    const dir = copyAssets();
    rmSync(join(dir, ZIP));
    expect(run(checkArchives, ["--assets", dir]).status).toBe(1);
  });

  it("rejects a malformed checksum file", () => {
    const dir = copyAssets();
    writeFileSync(join(dir, SUMS), "not a checksum line\n", "utf8");
    expect(run(checkArchives, ["--assets", dir]).status).toBe(1);
  });

  it("rejects a checksum mismatch", () => {
    const dir = copyAssets();
    const sums = readFileSync(join(dir, SUMS), "utf8");
    // Flip the first hex character of the tar digest.
    const tampered = sums.replace(/^[0-9a-f]/, (c) => (c === "a" ? "b" : "a"));
    writeFileSync(join(dir, SUMS), tampered, "utf8");
    expect(run(checkArchives, ["--assets", dir]).status).toBe(1);
  });

  it("rejects a corrupt tar and a corrupt zip", () => {
    const tarDir = copyAssets();
    writeFileSync(join(tarDir, TAR), "corrupt", "utf8");
    // Recompute checksums so we exercise the archive listing/extraction path,
    // not only the checksum guard.
    const goodSums = readFileSync(join(goodAssets, SUMS), "utf8");
    void goodSums;
    expect(run(checkArchives, ["--assets", tarDir]).status).toBe(1);

    const zipDir = copyAssets();
    writeFileSync(join(zipDir, ZIP), "corrupt", "utf8");
    expect(run(checkArchives, ["--assets", zipDir]).status).toBe(1);
  });

  it("rejects an extra release archive for the same version", () => {
    const dir = copyAssets();
    cpSync(join(dir, TAR), join(dir, `${BUNDLE_NAME}-extra.tar.gz`));
    expect(run(checkArchives, ["--assets", dir]).status).toBe(1);
  });
});
