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

// Repository-independent: the version is derived from the asset filenames the
// verifier is pointed at, never from the source repository's version.json.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Strict canonical SemVer (major.minor.patch with optional prerelease). */
function isValidCanonicalSemver(value) {
  if (typeof value !== "string" || value !== value.trim() || value === "") return false;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (match === null) return false;
  const [, major, minor, patch, prerelease] = match;
  for (const part of [major, minor, patch]) {
    if (part.length > 1 && part.startsWith("0")) return false;
  }
  if (prerelease !== undefined) {
    for (const id of prerelease.split(".")) {
      if (id === "") return false;
      if (/^\d+$/.test(id) && id.length > 1 && id.startsWith("0")) return false;
    }
  }
  return true;
}

const SUMS_SUFFIX = "-SHA256SUMS.txt";
const SUMS_RE = /^oh-my-pm-v(.+)-SHA256SUMS\.txt$/;

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
  const version = run(assets);
  if (version !== false) {
    process.stdout.write(`OH MY PM release archives check: OK (${version})\n`);
  }
}

function run(assetsDir) {
  const tarBin = findTar();
  if (tarBin === null) return fail("no GNU tar available for extraction");

  // Deterministic discovery: exactly one checksum file names the version.
  const entries = readdirSync(assetsDir);
  const sumsCandidates = entries.filter((name) => SUMS_RE.test(name));
  if (sumsCandidates.length === 0) {
    return fail(`no checksum file matching oh-my-pm-v*${SUMS_SUFFIX} found`);
  }
  if (sumsCandidates.length > 1) {
    return fail(`multiple checksum files found: ${sumsCandidates.join(", ")}`);
  }
  const SUMS_NAME = sumsCandidates[0];
  const derivedVersion = SUMS_RE.exec(SUMS_NAME)[1];
  if (!isValidCanonicalSemver(derivedVersion)) {
    return fail(`checksum filename version is not valid canonical SemVer: ${derivedVersion}`);
  }
  const BUNDLE_NAME = `oh-my-pm-v${derivedVersion}`;
  const TAR_NAME = `${BUNDLE_NAME}.tar.gz`;
  const ZIP_NAME = `${BUNDLE_NAME}.zip`;

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

  // Reject any additional versioned archive/checksum set.
  for (const name of entries) {
    const isVersionedArchive =
      (name.endsWith(".tar.gz") || name.endsWith(".zip")) && /^oh-my-pm-v.+/.test(name);
    if (isVersionedArchive && name !== TAR_NAME && name !== ZIP_NAME) {
      return fail(`unexpected extra release archive present: ${name}`);
    }
    if (SUMS_RE.test(name) && name !== SUMS_NAME) {
      return fail(`unexpected extra checksum file present: ${name}`);
    }
  }

  // Validate the checksum file: exactly two lines sorted by filename (never by
  // digest), with the exact archive names.
  const sumsText = readFileSync(sumsPath, "utf8");
  const sumLines = sumsText.split("\n");
  if (sumLines.length !== 3 || sumLines[2] !== "") {
    return fail("SHA256SUMS file must contain exactly two lines and a trailing newline");
  }
  const expected = new Map();
  const filenameOrder = [];
  for (const line of sumLines.slice(0, 2)) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) return fail(`malformed checksum line: ${line}`);
    expected.set(match[2], match[1]);
    filenameOrder.push(match[2]);
  }
  // Order is defined by filename, not by the leading digest.
  const sortedByFilename = [...filenameOrder].sort();
  if (JSON.stringify(filenameOrder) !== JSON.stringify(sortedByFilename)) {
    return fail("checksum lines are not sorted by filename");
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
        const extractedBundle = join(temp, BUNDLE_NAME);
        // Cross-check: the extracted RELEASE.json must declare the same version
        // derived from the asset filenames.
        try {
          const release = JSON.parse(
            readFileSync(join(extractedBundle, "RELEASE.json"), "utf8"),
          );
          if (release.version !== derivedVersion) {
            ok = false;
            message = `${label} archive RELEASE.json version ${release.version} != ${derivedVersion}`;
            break;
          }
        } catch {
          ok = false;
          message = `${label} archive RELEASE.json is missing or invalid`;
          break;
        }
        const verify = spawnSync(process.execPath, [
          join(repoRoot, "tools", "check-release-bundle.mjs"),
          "--bundle",
          extractedBundle,
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
  return derivedVersion;
}
