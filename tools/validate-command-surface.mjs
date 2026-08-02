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
  BUNDLE_EXECUTABLE_NAMES,
  CANONICAL_CLI,
  CANONICAL_INSTALLED_COMMANDS,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
  COMPAT_CLI,
  COMPAT_INSTALLED_COMMANDS,
  COMPAT_INSTALLER,
  COMPAT_MCP,
  COMMAND_SURFACE_PATH,
  DEPRECATED_CLI,
  DEPRECATED_INSTALLED_COMMANDS,
  DEPRECATED_INSTALLER,
  DEPRECATED_MCP,
  MCP_SERVER_KEY,
  PRODUCT,
  REPO_ROOT,
  validateCommandSurface,
} from "./command-surface.mjs";

const PRODUCT_SLUG = PRODUCT.slug;
const PACKAGE_SCOPE = PRODUCT.packageScope;
const ARCHIVE_PREFIX = PRODUCT.archivePrefix;

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
    process.stderr.write(
      "validate-command-surface: command-surface.json is missing or invalid JSON\n",
    );
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
    for (const name of BUNDLE_EXECUTABLE_NAMES) {
      expected[name] = `./bin/${name}.mjs`;
    }
    if (!same(pkg.bin, expected)) {
      err(`distribution/package.json: bin must be ${JSON.stringify(expected)}`);
    }
    if (!same(Object.keys(pkg.bin ?? {}), Object.keys(expected))) {
      err(
        "distribution/package.json: bin must list canonical commands, then compatibility aliases, then deprecated aliases",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Executable entrypoint files exist for every declared command.
// ---------------------------------------------------------------------------

const REQUIRED_ENTRYPOINTS = [
  `cli/bin/${CANONICAL_CLI}.mjs`,
  ...COMPAT_CLI.map((n) => `cli/bin/${n}.mjs`),
  ...DEPRECATED_CLI.map((n) => `cli/bin/${n}.mjs`),
  `mcp-server/bin/${CANONICAL_MCP}.mjs`,
  ...COMPAT_MCP.map((n) => `mcp-server/bin/${n}.mjs`),
  ...DEPRECATED_MCP.map((n) => `mcp-server/bin/${n}.mjs`),
  ...BUNDLE_EXECUTABLE_NAMES.map((n) => `distribution/bin/${n}.mjs`),
];
for (const rel of REQUIRED_ENTRYPOINTS) {
  if (!existsSync(join(REPO_ROOT, rel))) err(`entrypoint missing: ${rel}`);
}

// ---------------------------------------------------------------------------
// 4. The pure command-surface constants module.
//
// v0.5.1: moved from cli/src to the application package. The invoked executable
// names are a shared vocabulary -- the MCP alias wrapper needs the same
// deprecation warning -- so they must not live behind a presentation package.
// ---------------------------------------------------------------------------

{
  const rel = "application/src/command-surface.ts";
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
    // Both alias classes are pinned per role. A class collapsed into the other
    // would silently change the promise a name carries.
    const aliasArrays = [
      ["COMPATIBILITY_CLI_COMMANDS", COMPAT_CLI],
      ["COMPATIBILITY_MCP_COMMANDS", COMPAT_MCP],
      ["COMPATIBILITY_INSTALLER_COMMANDS", COMPAT_INSTALLER],
      ["DEPRECATED_CLI_COMMANDS", DEPRECATED_CLI],
      ["DEPRECATED_MCP_COMMANDS", DEPRECATED_MCP],
      ["DEPRECATED_INSTALLER_COMMANDS", DEPRECATED_INSTALLER],
    ];
    for (const [name, expected] of aliasArrays) {
      const actual = extractStringArray(source, name);
      if (actual === null) err(`${rel}: ${name} not found`);
      else if (!same(actual, expected)) {
        err(`${rel}: ${name} ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      }
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
    if (key !== MCP_SERVER_KEY) {
      err(`${rel}: MCP_CONFIG_DEFAULT_SERVER_NAME must remain "${MCP_SERVER_KEY}"`);
    }
    // The command name must come from the shared command-surface module rather
    // than a second literal, so there is exactly one place to change. Checking
    // for the import (not a literal) is what enforces that.
    if (!/from\s+"@oh-my-pm\/application"/.test(source)) {
      err(`${rel}: must import the command names from @oh-my-pm/application`);
    }
    if (!/MCP_CONFIG_COMMAND_NAME\s*=\s*CANONICAL_MCP_COMMAND/.test(source)) {
      err(`${rel}: MCP_CONFIG_COMMAND_NAME must be CANONICAL_MCP_COMMAND`);
    }
    if (!/MCP_CONFIG_COMPATIBILITY_COMMAND_NAMES[^=]*=\s*COMPATIBILITY_MCP_COMMANDS/.test(source)) {
      err(`${rel}: MCP_CONFIG_COMPATIBILITY_COMMAND_NAMES must be COMPATIBILITY_MCP_COMMANDS`);
    }
    if (!/MCP_CONFIG_DEPRECATED_COMMAND_NAMES[^=]*=\s*DEPRECATED_MCP_COMMANDS/.test(source)) {
      err(`${rel}: MCP_CONFIG_DEPRECATED_COMMAND_NAMES must be DEPRECATED_MCP_COMMANDS`);
    }
    // A generated configuration must never hard-code a non-canonical executable.
    for (const aliasName of [...COMPAT_MCP, ...DEPRECATED_MCP]) {
      const literal = new RegExp(`=\\s*"${aliasName}"`);
      if (literal.test(source)) {
        err(`${rel}: must not assign the alias command name "${aliasName}" as a literal`);
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
      err(
        `${rel}: LOCAL_CANONICAL_COMMAND_NAMES != ${JSON.stringify(CANONICAL_INSTALLED_COMMANDS)}`,
      );
    }
    const localAliasArrays = [
      ["LOCAL_COMPATIBILITY_COMMAND_NAMES", COMPAT_INSTALLED_COMMANDS],
      ["LOCAL_DEPRECATED_COMMAND_NAMES", DEPRECATED_INSTALLED_COMMANDS],
    ];
    for (const [name, expected] of localAliasArrays) {
      const actual = extractStringArray(source, name);
      if (actual === null) err(`${rel}: ${name} not found`);
      else if (!same(actual, expected)) {
        err(`${rel}: ${name} ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      }
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
      err(
        `${rel}: RELEASE_INSTALL_CANONICAL_COMMANDS != ${JSON.stringify(CANONICAL_INSTALLED_COMMANDS)}`,
      );
    }
    const coreAliasArrays = [
      ["RELEASE_INSTALL_COMPATIBILITY_COMMANDS", COMPAT_INSTALLED_COMMANDS],
      ["RELEASE_INSTALL_DEPRECATED_COMMANDS", DEPRECATED_INSTALLED_COMMANDS],
      ["RELEASE_INSTALLER_COMPATIBILITY_COMMANDS", COMPAT_INSTALLER],
      ["RELEASE_INSTALLER_DEPRECATED_COMMANDS", DEPRECATED_INSTALLER],
    ];
    for (const [name, expected] of coreAliasArrays) {
      const actual = extractStringArray(source, name);
      if (actual === null) err(`${rel}: ${name} not found`);
      else if (!same(actual, expected)) {
        err(`${rel}: ${name} ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      }
    }
    const installerEntry = extractStringConstant(source, "RELEASE_INSTALLER_ENTRYPOINT");
    if (installerEntry !== `bin/${CANONICAL_INSTALLER}.mjs`) {
      err(`${rel}: RELEASE_INSTALLER_ENTRYPOINT must be "bin/${CANONICAL_INSTALLER}.mjs"`);
    }
    const installerCommand = extractStringConstant(source, "RELEASE_INSTALLER_CANONICAL_COMMAND");
    if (installerCommand !== CANONICAL_INSTALLER) {
      err(`${rel}: RELEASE_INSTALLER_CANONICAL_COMMAND must be "${CANONICAL_INSTALLER}"`);
    }
    // Every bundle executable must be listed as a required bundle file, so a
    // shipped alias can never be dropped from the install-time gate.
    for (const name of BUNDLE_EXECUTABLE_NAMES) {
      if (!source.includes(`"bin/${name}.mjs"`)) {
        err(`${rel}: REQUIRED_BUNDLE_FILES must include bin/${name}.mjs`);
      }
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
    // Every CLI alias is checked explicitly, because the stderr-only notice and
    // the byte-identical stdout are behavior no loop over the command list would
    // catch on its own. The verifier must assert all four properties.
    const aliasChecks = [
      ["wrote its warning to stdout", "keeps every alias warning off stdout"],
      ["stdout differs from canonical", "compares alias stdout against canonical"],
      ["did not warn on stderr with its class wording", "asserts the per-class warning wording"],
      ["warnings, expected exactly 1", "asserts exactly one warning per alias invocation"],
    ];
    for (const [needle, description] of aliasChecks) {
      if (!source.includes(needle)) {
        err(`${rel}: must verify the alias ${description}`);
      }
    }
    // A compatibility alias must never be reported as deprecated.
    if (!source.includes("was reported as deprecated")) {
      err(`${rel}: must verify a compatibility alias is not reported as deprecated`);
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Product identity invariants.
//
// v0.6 migrates command names only. These four identities are what a reader
// would most plausibly assume also changed, so each is pinned against the place
// that actually defines it rather than merely asserted in the release notes.
// ---------------------------------------------------------------------------

{
  const rootPkg = readJson("package.json");
  if (rootPkg !== null && rootPkg.name !== PRODUCT_SLUG) {
    err(`package.json: name must remain "${PRODUCT_SLUG}"`);
  }

  // Package scope: every workspace package stays under @oh-my-pm/*.
  for (const rel of [
    "cli/package.json",
    "mcp-server/package.json",
    "distribution/package.json",
    "application/package.json",
  ]) {
    const pkg = readJson(rel);
    if (pkg === null) continue;
    if (typeof pkg.name !== "string" || !pkg.name.startsWith(`${PACKAGE_SCOPE}/`)) {
      err(`${rel}: name must stay under the ${PACKAGE_SCOPE}/ scope`);
    }
    if (pkg.private !== true) {
      err(`${rel}: must remain private (this release publishes no registry package)`);
    }
  }

  // Archive prefix: the release bundle name stays product-based.
  const bundleUtils = readText("tools/release-bundle-utils.mjs");
  if (bundleUtils !== null && !bundleUtils.includes(`${ARCHIVE_PREFIX}-v\${`)) {
    err(`tools/release-bundle-utils.mjs: archive prefix must remain "${ARCHIVE_PREFIX}-v"`);
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
