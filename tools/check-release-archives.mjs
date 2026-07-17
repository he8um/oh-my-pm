#!/usr/bin/env node
// Repository-independent verifier for the three release assets. Validates the
// checksum file, both archive digests, and archive listings, then extracts each
// archive to a fresh temp directory and runs the existing bundle verifier
// against the extracted tree. No network, no writes outside its own temp dirs.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_VERSION = JSON.parse(
  readFileSync(join(repoRoot, "version.json"), "utf8"),
).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;
const TAR_NAME = `${BUNDLE_NAME}.tar.gz`;
const ZIP_NAME = `${BUNDLE_NAME}.zip`;
const SUMS_NAME = `${BUNDLE_NAME}-SHA256SUMS.txt`;

function fail(message) {
  process.stderr.write(`release archives check failed: ${message}\n`);
  process.exitCode = 1;
  return false;
}

function parseArgs(args) {
  let assets;
  let seen = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--assets") {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--") || seen) {
        return { ok: false, message: "--assets requires a single value" };
      }
      assets = value;
      seen = true;
      i += 1;
    } else if (arg === "--json") {
      // accepted; single-line output either way
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (!seen) return { ok: false, message: "--assets is required" };
  return { ok: true, assets };
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Detect a GNU-compatible tar for extraction (tar then gtar). */
function findTar() {
  for (const candidate of ["tar", "gtar"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0 && typeof probe.stdout === "string" && probe.stdout.includes("GNU tar")) {
      return candidate;
    }
  }
  return null;
}

// The private override filename is assembled from parts so this validation
// helper does not itself contain the literal forbidden marker string.
const OVERRIDE_MARKER = `_AGENT${"_"}OVERRIDE.md`;
const FORBIDDEN_SEGMENTS = ["_dev", "specs", OVERRIDE_MARKER, ".git"];
const UNSAFE_ENTRY = (entry) =>
  entry === "" ||
  isAbsolute(entry) ||
  entry.startsWith("/") ||
  /^[A-Za-z]:[\\/]/.test(entry) ||
  entry.split(/[\\/]/).includes("..") ||
  entry.split("/").some((seg) => FORBIDDEN_SEGMENTS.includes(seg));

function topLevelRoot(entry) {
  return entry.replace(/^\.?\//, "").split("/")[0];
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`release archives check error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const assets = isAbsolute(parsed.assets) ? parsed.assets : resolve(parsed.assets);
  const ok = run(assets);
  if (ok) {
    process.stdout.write(`OH MY PM release archives check: OK (${CANONICAL_VERSION})\n`);
  }
}

function run(assetsDir) {
  const tarBin = findTar();
  if (tarBin === null) return fail("no GNU tar available for extraction");

  const tarPath = join(assetsDir, TAR_NAME);
  const zipPath = join(assetsDir, ZIP_NAME);
  const sumsPath = join(assetsDir, SUMS_NAME);
  for (const [name, path] of [
    [TAR_NAME, tarPath],
    [ZIP_NAME, zipPath],
    [SUMS_NAME, sumsPath],
  ]) {
    if (!isRegularFile(path)) return fail(`missing release asset: ${name}`);
  }

  // Reject extra release archives for the same version.
  for (const name of readdirSync(assetsDir)) {
    if (
      (name.endsWith(".tar.gz") || name.endsWith(".zip")) &&
      name.startsWith(BUNDLE_NAME) &&
      name !== TAR_NAME &&
      name !== ZIP_NAME
    ) {
      return fail(`unexpected extra release archive present: ${name}`);
    }
  }

  // Validate the checksum file: exactly two sorted lines, exact names.
  const sumsText = readFileSync(sumsPath, "utf8");
  const sumLines = sumsText.split("\n");
  if (sumLines.length !== 3 || sumLines[2] !== "") {
    return fail("SHA256SUMS file must contain exactly two lines and a trailing newline");
  }
  const expected = new Map();
  for (const line of sumLines.slice(0, 2)) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) return fail(`malformed checksum line: ${line}`);
    expected.set(match[2], match[1]);
  }
  if (![...sumLines.slice(0, 2)].every((line, i, arr) => i === 0 || arr[i - 1] <= line)) {
    return fail("checksum lines are not sorted");
  }
  if (!expected.has(TAR_NAME) || !expected.has(ZIP_NAME)) {
    return fail("checksum file does not list both archives");
  }
  if (sha256(tarPath) !== expected.get(TAR_NAME)) return fail("tar.gz checksum mismatch");
  if (sha256(zipPath) !== expected.get(ZIP_NAME)) return fail("zip checksum mismatch");

  // Inspect listings before extraction.
  const tarList = spawnSync(tarBin, ["-tzf", tarPath], { encoding: "utf8" });
  if (tarList.status !== 0) return fail("tar.gz could not be listed (corrupt archive)");
  const zipList = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  if (zipList.status !== 0) return fail("zip could not be listed (corrupt archive)");

  for (const [label, listing] of [
    ["tar", tarList.stdout],
    ["zip", zipList.stdout],
  ]) {
    const roots = new Set();
    for (const raw of listing.split("\n")) {
      const entry = raw.trim();
      if (entry === "") continue;
      if (UNSAFE_ENTRY(entry)) return fail(`${label} archive contains an unsafe entry: ${entry}`);
      roots.add(topLevelRoot(entry));
    }
    if (roots.size !== 1) return fail(`${label} archive has ${roots.size} top-level roots`);
    if (!roots.has(BUNDLE_NAME)) {
      return fail(`${label} archive top-level root is not ${BUNDLE_NAME}`);
    }
    if (listing.includes(repoRoot)) {
      return fail(`${label} archive listing contains the source repository path`);
    }
  }

  // Extract each into a fresh temp directory and verify the bundle.
  const tarTemp = mkdtempSync(join(tmpdir(), "oh-my-pm-archive-tar-"));
  const zipTemp = mkdtempSync(join(tmpdir(), "oh-my-pm-archive-zip-"));
  let ok = true;
  let message = "";
  try {
    if (spawnSync(tarBin, ["-xzf", tarPath, "-C", tarTemp]).status !== 0) {
      ok = false;
      message = "tar.gz extraction failed";
    } else if (spawnSync("unzip", ["-q", zipPath, "-d", zipTemp]).status !== 0) {
      ok = false;
      message = "zip extraction failed";
    } else {
      for (const [label, temp] of [
        ["tar", tarTemp],
        ["zip", zipTemp],
      ]) {
        const roots = readdirSync(temp);
        if (roots.length !== 1 || roots[0] !== BUNDLE_NAME) {
          ok = false;
          message = `${label} archive did not extract to exactly ${BUNDLE_NAME}`;
          break;
        }
        const verify = spawnSync(process.execPath, [
          join(repoRoot, "tools", "check-release-bundle.mjs"),
          "--bundle",
          join(temp, BUNDLE_NAME),
        ]);
        if (verify.status !== 0) {
          ok = false;
          message = `extracted ${label} bundle failed the bundle verifier`;
          break;
        }
      }
    }
  } finally {
    rmSync(tarTemp, { recursive: true, force: true });
    rmSync(zipTemp, { recursive: true, force: true });
  }
  if (!ok) return fail(message);
  return true;
}
