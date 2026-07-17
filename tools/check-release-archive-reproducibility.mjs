#!/usr/bin/env node
// Determinism checker: builds the release archives twice into independent temp
// roots and asserts the tar.gz, zip, and checksum outputs are byte-identical.
// No network. Cleans only its own temporary roots.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_VERSION = JSON.parse(
  readFileSync(join(repoRoot, "version.json"), "utf8"),
).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;
const ASSETS = [`${BUNDLE_NAME}.tar.gz`, `${BUNDLE_NAME}.zip`, `${BUNDLE_NAME}-SHA256SUMS.txt`];

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
  const ok = run(bundle);
  if (ok) {
    process.stdout.write(`OH MY PM release archive reproducibility: OK (${CANONICAL_VERSION})\n`);
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
  const rootA = mkdtempSync(join(tmpdir(), "oh-my-pm-repro-a-"));
  const rootB = mkdtempSync(join(tmpdir(), "oh-my-pm-repro-b-"));
  try {
    if (!buildInto(bundle, rootA)) return fail("first archive build/verify failed");
    if (!buildInto(bundle, rootB)) return fail("second archive build/verify failed");
    for (const asset of ASSETS) {
      const a = readFileSync(join(rootA, asset));
      const b = readFileSync(join(rootB, asset));
      if (!a.equals(b)) return fail(`asset differs between builds: ${asset}`);
    }
  } finally {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
  return true;
}
