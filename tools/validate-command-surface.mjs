#!/usr/bin/env node
// Read-only command-surface consistency check.
//
// `command-surface.json` is the single source of truth for the public command
// names. Several surfaces cannot import it at runtime — the CLI and MCP packages
// are deliberately pure (no filesystem access), package manifests are static
// JSON, and the release-install core must stay repository-independent — so those
// surfaces restate the names locally. This check proves every restatement still
// agrees with the manifest, which is what makes the "single source of truth"
// claim true rather than aspirational.
//
// No writes, no network, no environment reads, no clock, no randomness.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CANONICAL_CLI,
  CANONICAL_INSTALLED_COMMANDS,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
  COMMAND_SURFACE,
  COMMAND_SURFACE_PATH,
  LEGACY_CLI,
  LEGACY_INSTALLED_COMMANDS,
  LEGACY_INSTALLER,
  LEGACY_MCP,
  REPO_ROOT,
  validateCommandSurface,
} from "./command-surface.mjs";

const errors = [];
const err = (message) => errors.push(message);

function readJson(relativePath) {
  const abs = join(REPO_ROOT, relativePath);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    err(`${relativePath}: invalid JSON`);
    return null;
  }
}

function readText(relativePath) {
  const abs = join(REPO_ROOT, relativePath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

/** Extract a JS/TS array-of-string literal assigned to a name. */
function extractStringArray(source, name) {
  const re = new RegExp(`${name}\\s*(?::[^=]*)?=\\s*\\[([^\\]]*)\\]`);
  const match = re.exec(source);
  if (match === null) return null;
  const items = [];
  const itemRe = /["']([^"']*)["']/g;
  let item;
  while ((item = itemRe.exec(match[1])) !== null) items.push(item[1]);
  return items;
}

/** Extract a JS/TS string-literal constant value assigned to a name. */
function extractStringConstant(source, name) {
  const re = new RegExp(`${name}\\s*(?::[^=]*)?=\\s*["']([^"']*)["']`);
  const match = re.exec(source);
  return match === null ? null : match[1];
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// 1. The manifest itself must be well-formed.
// ---------------------------------------------------------------------------

{
  let raw;
  try {
    raw = JSON.parse(readFileSync(COMMAND_SURFACE_PATH, "utf8"));
  } catch {
    process.stderr.write("validate-command-surface: command-surface.json is missing or invalid JSON\n");
    process.stderr.write("validate-command-surface: FAILED\n");
    process.exitCode = 1;
    raw = null;
  }
  if (raw !== null) {
    for (const problem of validateCommandSurface(raw)) {
      err(`command-surface.json: ${problem}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Package `bin` maps.
// ---------------------------------------------------------------------------

// The CLI package exposes only the canonical CLI command: the compatibility
// aliases are a *distribution* concern, so a workspace consumer of
// @oh-my-pm/cli never gains a deprecated executable.
{
  const pkg = readJson("cli/package.json");
  if (pkg === null) {
    err("cli/package.json: missing");
  } else {
    const expected = { [CANONICAL_CLI]: `./bin/${CANONICAL_CLI}.mjs` };
    if (!same(pkg.bin, expected)) {
      err(`cli/package.json: bin must be ${JSON.stringify(expected)}`);
    }
  }
}

{
  const pkg = readJson("mcp-server/package.json");
  if (pkg === null) {
    err("mcp-server/package.json: missing");
  } else {
    const expected = { [CANONICAL_MCP]: `./bin/${CANONICAL_MCP}.mjs` };
    if (!same(pkg.bin, expected)) {
      err(`mcp-server/package.json: bin must be ${JSON.stringify(expected)}`);
    }
  }
}

// The distribution package is the one place that intentionally ships both
// families. Canonical entries come first so the manifest itself reads as an
// ordered statement of which names are primary.
{
  const pkg = readJson("distribution/package.json");
  if (pkg === null) {
    err("distribution/package.json: missing");
  } else {
    const expected = {};
    for (const name of [CANONICAL_CLI, CANONICAL_MCP, CANONICAL_INSTALLER]) {
      expected[name] = `./bin/${name}.mjs`;
    }
    for (const name of [...LEGACY_CLI, ...LEGACY_MCP, ...LEGACY_INSTALLER]) {
      expected[name] = `./bin/${name}.mjs`;
    }
    if (!same(pkg.bin, expected)) {
      err(`distribution/package.json: bin must be ${JSON.stringify(expected)}`);
    }
    if (!same(Object.keys(pkg.bin ?? {}), Object.keys(expected))) {
      err("distribution/package.json: bin must list canonical commands before legacy aliases");
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Executable entrypoint files exist for every declared command.
// ---------------------------------------------------------------------------

const REQUIRED_ENTRYPOINTS = [
  `cli/bin/${CANONICAL_CLI}.mjs`,
  ...LEGACY_CLI.map((n) => `cli/bin/${n}.mjs`),
  `mcp-server/bin/${CANONICAL_MCP}.mjs`,
  ...LEGACY_MCP.map((n) => `mcp-server/bin/${n}.mjs`),
  `distribution/bin/${CANONICAL_CLI}.mjs`,
  `distribution/bin/${CANONICAL_MCP}.mjs`,
  `distribution/bin/${CANONICAL_INSTALLER}.mjs`,
  ...LEGACY_CLI.map((n) => `distribution/bin/${n}.mjs`),
  ...LEGACY_MCP.map((n) => `distribution/bin/${n}.mjs`),
  ...LEGACY_INSTALLER.map((n) => `distribution/bin/${n}.mjs`),
];
for (const rel of REQUIRED_ENTRYPOINTS) {
  if (!existsSync(join(REPO_ROOT, rel))) err(`entrypoint missing: ${rel}`);
}

// ---------------------------------------------------------------------------
// 4. The CLI's pure command-surface constants module.
// ---------------------------------------------------------------------------

{
  const rel = "cli/src/command-surface.ts";
  const source = readText(rel);
  if (source === null) {
    err(`${rel}: missing`);
  } else {
    const checks = [
      ["CANONICAL_CLI_COMMAND", CANONICAL_CLI],
      ["CANONICAL_MCP_COMMAND", CANONICAL_MCP],
      ["CANONICAL_INSTALLER_COMMAND", CANONICAL_INSTALLER],
    ];
    for (const [name, expected] of checks) {
      const actual = extractStringConstant(source, name);
      if (actual === null) err(`${rel}: constant ${name} not found`);
      else if (actual !== expected) err(`${rel}: ${name} "${actual}" != "${expected}"`);
    }
    const legacyCli = extractStringArray(source, "LEGACY_CLI_COMMANDS");
    if (legacyCli === null) err(`${rel}: LEGACY_CLI_COMMANDS not found`);
    else if (!same(legacyCli, LEGACY_CLI)) {
      err(`${rel}: LEGACY_CLI_COMMANDS ${JSON.stringify(legacyCli)} != ${JSON.stringify(LEGACY_CLI)}`);
    }
    const legacyMcp = extractStringArray(source, "LEGACY_MCP_COMMANDS");
    if (legacyMcp === null) err(`${rel}: LEGACY_MCP_COMMANDS not found`);
    else if (!same(legacyMcp, LEGACY_MCP)) {
      err(`${rel}: LEGACY_MCP_COMMANDS ${JSON.stringify(legacyMcp)} != ${JSON.stringify(LEGACY_MCP)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Generated MCP client configuration must invoke the canonical MCP command.
// ---------------------------------------------------------------------------

{
  const rel = "cli/src/mcp-config.ts";
  const source = readText(rel);
  if (source === null) {
    err(`${rel}: missing`);
  } else {
    // The default server *key* is a product identity and deliberately stays
    // "oh-my-pm"; only the invoked command migrates.
    const key = extractStringConstant(source, "MCP_CONFIG_DEFAULT_SERVER_NAME");
    if (key !== COMMAND_SURFACE.product) {
      err(`${rel}: MCP_CONFIG_DEFAULT_SERVER_NAME must remain "${COMMAND_SURFACE.product}"`);
    }
    // The command name must come from the CLI's command-surface module rather
    // than a second literal, so there is exactly one place to change. Checking
    // for the import (not a literal) is what enforces that.
    if (!/from\s+"\.\/command-surface\.js"/.test(source)) {
      err(`${rel}: must import the command names from ./command-surface.js`);
    }
    if (!/MCP_CONFIG_COMMAND_NAME\s*=\s*CANONICAL_MCP_COMMAND/.test(source)) {
      err(`${rel}: MCP_CONFIG_COMMAND_NAME must be CANONICAL_MCP_COMMAND`);
    }
    if (!/MCP_CONFIG_LEGACY_COMMAND_NAMES[^=]*=\s*LEGACY_MCP_COMMANDS/.test(source)) {
      err(`${rel}: MCP_CONFIG_LEGACY_COMMAND_NAMES must be LEGACY_MCP_COMMANDS`);
    }
    // A generated configuration must never hard-code a deprecated executable.
    for (const legacyName of LEGACY_MCP) {
      const literal = new RegExp(`=\\s*"${legacyName}"`);
      if (literal.test(source)) {
        err(`${rel}: must not assign the deprecated command name "${legacyName}" as a literal`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Local (repository) installer command arrays.
// ---------------------------------------------------------------------------

{
  const rel = "tools/local-install-utils.mjs";
  const source = readText(rel);
  if (source === null) {
    err(`${rel}: missing`);
  } else {
    const canonical = extractStringArray(source, "LOCAL_CANONICAL_COMMAND_NAMES");
    if (canonical === null) err(`${rel}: LOCAL_CANONICAL_COMMAND_NAMES not found`);
    else if (!same(canonical, CANONICAL_INSTALLED_COMMANDS)) {
      err(`${rel}: LOCAL_CANONICAL_COMMAND_NAMES != ${JSON.stringify(CANONICAL_INSTALLED_COMMANDS)}`);
    }
    const legacy = extractStringArray(source, "LOCAL_LEGACY_COMMAND_NAMES");
    if (legacy === null) err(`${rel}: LOCAL_LEGACY_COMMAND_NAMES not found`);
    else if (!same(legacy, LEGACY_INSTALLED_COMMANDS)) {
      err(`${rel}: LOCAL_LEGACY_COMMAND_NAMES != ${JSON.stringify(LEGACY_INSTALLED_COMMANDS)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Release-install core command arrays (repository-independent by design).
// ---------------------------------------------------------------------------

{
  const rel = "distribution/libexec/release-install-core.mjs";
  const source = readText(rel);
  if (source === null) {
    err(`${rel}: missing`);
  } else {
    const canonical = extractStringArray(source, "RELEASE_INSTALL_CANONICAL_COMMANDS");
    if (canonical === null) err(`${rel}: RELEASE_INSTALL_CANONICAL_COMMANDS not found`);
    else if (!same(canonical, CANONICAL_INSTALLED_COMMANDS)) {
      err(`${rel}: RELEASE_INSTALL_CANONICAL_COMMANDS != ${JSON.stringify(CANONICAL_INSTALLED_COMMANDS)}`);
    }
    const legacy = extractStringArray(source, "RELEASE_INSTALL_LEGACY_COMMANDS");
    if (legacy === null) err(`${rel}: RELEASE_INSTALL_LEGACY_COMMANDS not found`);
    else if (!same(legacy, LEGACY_INSTALLED_COMMANDS)) {
      err(`${rel}: RELEASE_INSTALL_LEGACY_COMMANDS != ${JSON.stringify(LEGACY_INSTALLED_COMMANDS)}`);
    }
    const installerEntry = extractStringConstant(source, "RELEASE_INSTALLER_ENTRYPOINT");
    if (installerEntry !== `bin/${CANONICAL_INSTALLER}.mjs`) {
      err(`${rel}: RELEASE_INSTALLER_ENTRYPOINT must be "bin/${CANONICAL_INSTALLER}.mjs"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Release bundle metadata generation.
// ---------------------------------------------------------------------------

{
  const rel = "tools/release-bundle-utils.mjs";
  const source = readText(rel);
  if (source === null) {
    err(`${rel}: missing`);
  } else {
    // The bundle must declare canonical and legacy commands as *distinct*
    // fields; a single flat list would present the aliases as equals.
    if (!/canonicalCommands/.test(source)) {
      err(`${rel}: release metadata must declare canonicalCommands`);
    }
    if (!/legacyAliases/.test(source)) {
      err(`${rel}: release metadata must declare legacyAliases`);
    }
    // The archive/bundle name stays product-based: oh-my-pm-vX.Y.Z.
    if (!/oh-my-pm-v\$\{/.test(source)) {
      err(`${rel}: release bundle name must remain product-based (oh-my-pm-v...)`);
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Installed-state verifier command expectations.
// ---------------------------------------------------------------------------

{
  const rel = "tools/check-release-install.mjs";
  const source = readText(rel);
  if (source === null) {
    err(`${rel}: missing`);
  } else {
    // The verifier must derive the command set from the shipped install core
    // rather than restating it, so it can never check a stale list. It then
    // additionally exercises the deprecated CLI alias by name.
    if (!/from\s+"\.\.\/distribution\/libexec\/release-install-core\.mjs"/.test(source)) {
      err(`${rel}: must import the command set from the shipped release-install core`);
    }
    for (const constant of [
      "RELEASE_INSTALL_CANONICAL_COMMANDS",
      "RELEASE_INSTALL_LEGACY_COMMANDS",
      "RELEASE_INSTALL_COMMANDS",
    ]) {
      if (!source.includes(constant)) {
        err(`${rel}: installed-state verifier does not use ${constant}`);
      }
    }
    // The deprecated CLI alias is checked explicitly, because its stderr-only
    // warning is behavior no loop over the command list would catch.
    if (!source.includes("deprecated CLI alias wrote its warning to stdout")) {
      err(`${rel}: must verify the deprecated CLI alias keeps its warning off stdout`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  for (const message of errors) {
    process.stderr.write(`validate-command-surface: ${message}\n`);
  }
  process.stderr.write("validate-command-surface: FAILED\n");
  process.exitCode = 1;
} else {
  process.stdout.write(
    `validate-command-surface: OK (canonical: ${CANONICAL_CLI}, ${CANONICAL_MCP}, ${CANONICAL_INSTALLER})\n`,
  );
}
