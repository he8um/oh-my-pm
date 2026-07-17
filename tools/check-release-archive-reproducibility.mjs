#!/usr/bin/env node
// Determinism checker: builds the release archives twice into independent temp
// roots and asserts the tar.gz, zip, and checksum outputs are byte-identical.
// No network. Cleans only its own temporary roots.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The version is derived from the supplied bundle's own RELEASE.json, never
// from the source repository's version.json, so this works for a relocated
// bundle just as well as for the current development one.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  process.stderr.write(`release archive reproducibility failed: ${message}\n`);
  process.exitCode = 1;
  return false;
}

function parseArgs(args) {
  let bundle;
  let seen = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--bundle") {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--") || seen) {
        return { ok: false, message: "--bundle requires a single value" };
      }
      bundle = value;
      seen = true;
      i += 1;
    } else if (arg === "--json") {
      // accepted; single-line output either way
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (!seen) return { ok: false, message: "--bundle is required" };
  return { ok: true, bundle };
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`release archive reproducibility error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const bundle = isAbsolute(parsed.bundle) ? parsed.bundle : resolve(parsed.bundle);
  const version = run(bundle);
  if (version !== false) {
    process.stdout.write(`OH MY PM release archive reproducibility: OK (${version})\n`);
  }
}

function buildInto(bundle, outputRoot) {
  const build = spawnSync(process.execPath, [
    join(repoRoot, "tools", "build-release-archives.mjs"),
    "--bundle",
    bundle,
    "--output",
    outputRoot,
    "--apply",
  ]);
  if (build.status !== 0) return false;
  const verify = spawnSync(process.execPath, [
    join(repoRoot, "tools", "check-release-archives.mjs"),
    "--assets",
    outputRoot,
  ]);
  return verify.status === 0;
}

function run(bundle) {
  // Derive the version (and thus asset filenames) from the bundle's own metadata.
  const releasePath = join(bundle, "RELEASE.json");
  if (!existsSync(releasePath)) return fail(`bundle RELEASE.json not found: ${releasePath}`);
  let version;
  try {
    version = JSON.parse(readFileSync(releasePath, "utf8")).version;
  } catch {
    return fail("bundle RELEASE.json is not valid JSON");
  }
  if (typeof version !== "string" || version === "") {
    return fail("bundle RELEASE.json has no version string");
  }
  const bundleName = `oh-my-pm-v${version}`;
  const assets = [`${bundleName}.tar.gz`, `${bundleName}.zip`, `${bundleName}-SHA256SUMS.txt`];

  const rootA = mkdtempSync(join(tmpdir(), "oh-my-pm-repro-a-"));
  const rootB = mkdtempSync(join(tmpdir(), "oh-my-pm-repro-b-"));
  try {
    if (!buildInto(bundle, rootA)) return fail("first archive build/verify failed");
    if (!buildInto(bundle, rootB)) return fail("second archive build/verify failed");
    for (const asset of assets) {
      const a = readFileSync(join(rootA, asset));
      const b = readFileSync(join(rootB, asset));
      if (!a.equals(b)) return fail(`asset differs between builds: ${asset}`);
    }
  } finally {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
  return version;
}
