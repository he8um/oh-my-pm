#!/usr/bin/env node
// Read-only version consistency check. Verifies version.json, every workspace
// package manifest, and the known public runtime version constants all agree on
// the canonical release version. No writes, no network, no environment reads.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Strict, dependency-free canonical SemVer check. Accepts `major.minor.patch`
 * with an optional dot-separated prerelease, e.g. `1.2.3`, `1.0.0`,
 * `0.2.0-alpha.0`. Rejects whitespace, a `v` prefix, missing core components,
 * leading zeroes in numeric core components, empty prerelease identifiers, and
 * invalid characters. Build metadata (`+...`) is not accepted for this project.
 */
export function isValidCanonicalSemver(value) {
  if (typeof value !== "string" || value !== value.trim() || value === "") {
    return false;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (match === null) {
    return false;
  }
  const [, major, minor, patch, prerelease] = match;
  // No leading zeroes in numeric core components.
  for (const part of [major, minor, patch]) {
    if (part.length > 1 && part.startsWith("0")) {
      return false;
    }
  }
  if (prerelease !== undefined) {
    const ids = prerelease.split(".");
    for (const id of ids) {
      if (id === "") {
        return false; // empty prerelease identifier
      }
      // A purely numeric prerelease identifier must not have leading zeroes.
      if (/^\d+$/.test(id) && id.length > 1 && id.startsWith("0")) {
        return false;
      }
    }
  }
  return true;
}

/** Validate version.json shape (exactly one key `version`, valid SemVer). */
export function validateVersionFile(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return "version.json must be a JSON object";
  }
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "version") {
    return "version.json must contain exactly one key: version";
  }
  if (typeof raw.version !== "string") {
    return "version.json version must be a string";
  }
  if (!isValidCanonicalSemver(raw.version)) {
    return `version.json version is not valid canonical SemVer: ${raw.version}`;
  }
  return null;
}

/** Extract the first constant assignment value for a name, or null. */
export function extractConstantValue(source, constantName) {
  const re = new RegExp(`${constantName}\\s*=\\s*"([^"]*)"`);
  const match = re.exec(source);
  return match ? match[1] : null;
}

/** Workspace package directories parsed from pnpm-workspace.yaml, in order. */
function workspacePackageDirs() {
  const text = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const dirs = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*-\s*"([^"]+)"\s*$/.exec(line);
    if (match) dirs.push(match[1]);
  }
  return dirs;
}

function main() {
  const errors = [];

  // 1. version.json
  let versionFile;
  try {
    versionFile = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8"));
  } catch {
    process.stderr.write("check-version-consistency: version.json is missing or invalid JSON\n");
    process.exitCode = 1;
    return;
  }
  const versionError = validateVersionFile(versionFile);
  if (versionError) {
    // version.json itself is the single source of truth; if it is malformed we
    // cannot meaningfully compare anything else.
    process.stderr.write(`check-version-consistency: ${versionError}\n`);
    process.stderr.write("check-version-consistency: FAILED\n");
    process.exitCode = 1;
    return;
  }
  // The canonical version is whatever version.json declares — never hard-coded.
  const CANONICAL_VERSION = versionFile.version;

  // 2. Root + every workspace package manifest.
  const manifests = ["package.json", ...workspacePackageDirs().map((d) => join(d, "package.json"))];
  for (const rel of manifests) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    const pkg = JSON.parse(readFileSync(abs, "utf8"));
    if (pkg.version !== CANONICAL_VERSION) {
      errors.push(`${rel}: version ${pkg.version} != ${CANONICAL_VERSION}`);
    }
  }

  // 3. Known public runtime version constants (JS) and the Rust Kernel version.
  const constantChecks = [
    { file: "mcp-server/src/server.ts", constant: "OH_MY_PM_MCP_SERVER_VERSION" },
    { file: "mcp-server/src/project-tool-runner.ts", constant: "MCP_PROJECT_RUNTIME_VERSION" },
    { file: "cli/src/local-process.ts", constant: "DEFAULT_VERSION" },
  ];
  for (const { file, constant } of constantChecks) {
    const abs = join(repoRoot, file);
    if (!existsSync(abs)) {
      errors.push(`${file}: missing (expected constant ${constant})`);
      continue;
    }
    const value = extractConstantValue(readFileSync(abs, "utf8"), constant);
    if (value === null) {
      errors.push(`${file}: constant ${constant} not found`);
    } else if (value !== CANONICAL_VERSION) {
      errors.push(`${file}: ${constant} ${value} != ${CANONICAL_VERSION}`);
    }
  }

  // 4. Rust Kernel version function literal.
  const kernelLib = join(repoRoot, "kernel/crate/src/lib.rs");
  if (existsSync(kernelLib)) {
    const source = readFileSync(kernelLib, "utf8");
    const match = /fn kernel_version\(\)\s*->\s*&'static str\s*\{\s*"([^"]*)"/.exec(source);
    if (!match) {
      errors.push("kernel/crate/src/lib.rs: kernel_version literal not found");
    } else if (match[1] !== CANONICAL_VERSION) {
      errors.push(`kernel/crate/src/lib.rs: kernel_version ${match[1]} != ${CANONICAL_VERSION}`);
    }
  }

  // 5. Rust Kernel crate manifest version.
  const kernelCargo = join(repoRoot, "kernel/crate/Cargo.toml");
  if (existsSync(kernelCargo)) {
    const source = readFileSync(kernelCargo, "utf8");
    const match = /^version = "([^"]*)"/m.exec(source);
    if (!match) {
      errors.push("kernel/crate/Cargo.toml: version field not found");
    } else if (match[1] !== CANONICAL_VERSION) {
      errors.push(`kernel/crate/Cargo.toml: version ${match[1]} != ${CANONICAL_VERSION}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      process.stderr.write(`check-version-consistency: ${error}\n`);
    }
    process.stderr.write("check-version-consistency: FAILED\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`check-version-consistency: OK (${CANONICAL_VERSION})\n`);
}

// Only run the repository check when invoked directly, not when imported.
if (process.argv[1] && process.argv[1].endsWith("check-version-consistency.mjs")) {
  main();
}
