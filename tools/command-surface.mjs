// Tool-only loader and validator for the repository command-surface manifest
// (`command-surface.json`). The manifest is the single source of truth for the
// public command names: which executables are canonical and which older names
// remain as deprecated compatibility aliases.
//
// This module is pure apart from reading the manifest file itself: no network,
// no environment reads, no writes, no clock, no randomness. Every consumer
// (package manifests, installer planning, release metadata, generated MCP
// configuration, documentation validation, tests) derives its command names
// from here so no second, silently diverging list can exist.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, derived from this module's location, never from cwd. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The manifest path. Exported so validators can report it by name. */
export const COMMAND_SURFACE_PATH = join(REPO_ROOT, "command-surface.json");

/** The manifest schema version this loader understands. */
export const COMMAND_SURFACE_SCHEMA_VERSION = 1;

/** The three command roles, in a fixed order used by every renderer. */
export const COMMAND_ROLES = ["cli", "mcp", "installer"];

// The bounded command-name rule: 1..64 characters of ASCII lowercase letters,
// digits, and hyphens, starting and ending with an alphanumeric. Deliberately
// stricter than a filename rule so a command name can never introduce a path
// separator, a shell metacharacter, or a leading dash.
const COMMAND_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Whether a value is a usable command name. Pure. */
export function isValidCommandName(value) {
  return typeof value === "string" && COMMAND_NAME_RE.test(value);
}

/**
 * Validate a parsed manifest object. Returns an array of human-readable
 * problems; an empty array means the manifest is well-formed. Pure: the caller
 * supplies the object, so this is testable without touching the filesystem.
 */
export function validateCommandSurface(raw) {
  const errors = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["command-surface.json must be a JSON object"];
  }

  if (raw.schemaVersion !== COMMAND_SURFACE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COMMAND_SURFACE_SCHEMA_VERSION}`);
  }
  if (raw.product !== "oh-my-pm") {
    // The product identity is deliberately NOT migrated: this repository, its
    // package scope, its data directory, and its release archives all stay
    // "oh-my-pm". Only the invoked command names change.
    errors.push('product must be "oh-my-pm"');
  }

  const canonical = raw.canonical;
  if (typeof canonical !== "object" || canonical === null || Array.isArray(canonical)) {
    errors.push("canonical must be an object");
  } else {
    const keys = Object.keys(canonical);
    if (keys.length !== COMMAND_ROLES.length || !COMMAND_ROLES.every((r) => keys.includes(r))) {
      errors.push(`canonical must declare exactly: ${COMMAND_ROLES.join(", ")}`);
    }
    for (const role of COMMAND_ROLES) {
      if (!isValidCommandName(canonical[role])) {
        errors.push(`canonical.${role} is not a valid command name`);
      }
    }
  }

  const legacy = raw.legacyAliases;
  if (typeof legacy !== "object" || legacy === null || Array.isArray(legacy)) {
    errors.push("legacyAliases must be an object");
  } else {
    const keys = Object.keys(legacy);
    if (keys.length !== COMMAND_ROLES.length || !COMMAND_ROLES.every((r) => keys.includes(r))) {
      errors.push(`legacyAliases must declare exactly: ${COMMAND_ROLES.join(", ")}`);
    }
    for (const role of COMMAND_ROLES) {
      const aliases = legacy[role];
      if (!Array.isArray(aliases)) {
        errors.push(`legacyAliases.${role} must be an array`);
        continue;
      }
      for (const alias of aliases) {
        if (!isValidCommandName(alias)) {
          errors.push(`legacyAliases.${role} contains an invalid command name`);
        }
      }
      if (new Set(aliases).size !== aliases.length) {
        errors.push(`legacyAliases.${role} contains a duplicate`);
      }
    }
  }

  // A name may never be both canonical and legacy: the deprecation warning and
  // the reference-regression check both depend on the two sets being disjoint.
  if (errors.length === 0) {
    const canonicalNames = COMMAND_ROLES.map((r) => canonical[r]);
    const legacyNames = COMMAND_ROLES.flatMap((r) => legacyAliasesOf(legacy, r));
    for (const name of legacyNames) {
      if (canonicalNames.includes(name)) {
        errors.push(`${name} is declared both canonical and legacy`);
      }
    }
    if (new Set(canonicalNames).size !== canonicalNames.length) {
      errors.push("canonical command names must be distinct");
    }
  }

  if (typeof raw.deprecatedSince !== "string" || raw.deprecatedSince === "") {
    errors.push("deprecatedSince must be a non-empty string");
  }
  if (typeof raw.removalScheduled !== "boolean") {
    errors.push("removalScheduled must be a boolean");
  }

  return errors;
}

function legacyAliasesOf(legacy, role) {
  const aliases = legacy[role];
  return Array.isArray(aliases) ? aliases : [];
}

/**
 * Read and validate the manifest. Throws on a malformed manifest so a broken
 * command surface can never silently produce a half-migrated artifact.
 */
export function loadCommandSurface() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(COMMAND_SURFACE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`command-surface.json is missing or invalid JSON: ${error.message}`);
  }
  const errors = validateCommandSurface(raw);
  if (errors.length > 0) {
    throw new Error(`command-surface.json is invalid: ${errors.join("; ")}`);
  }
  return raw;
}

/** The validated manifest, loaded once per process. */
export const COMMAND_SURFACE = loadCommandSurface();

/** The canonical CLI command name, e.g. `ohmypm`. */
export const CANONICAL_CLI = COMMAND_SURFACE.canonical.cli;
/** The canonical MCP stdio server command name, e.g. `ohmypm-mcp`. */
export const CANONICAL_MCP = COMMAND_SURFACE.canonical.mcp;
/** The canonical release-bundle installer command name, e.g. `ohmypm-install`. */
export const CANONICAL_INSTALLER = COMMAND_SURFACE.canonical.installer;

/** The deprecated CLI alias names, in manifest order. */
export const LEGACY_CLI = [...COMMAND_SURFACE.legacyAliases.cli];
/** The deprecated MCP alias names, in manifest order. */
export const LEGACY_MCP = [...COMMAND_SURFACE.legacyAliases.mcp];
/** The deprecated installer alias names, in manifest order. */
export const LEGACY_INSTALLER = [...COMMAND_SURFACE.legacyAliases.installer];

/**
 * The two canonical *installed* commands, in the order every installer, shim
 * planner, and installed-state verifier uses. The installer command itself is
 * shipped inside a release bundle rather than installed into `<prefix>/bin`.
 */
export const CANONICAL_INSTALLED_COMMANDS = [CANONICAL_CLI, CANONICAL_MCP];

/** The legacy installed compatibility commands, aligned with the canonical pair. */
export const LEGACY_INSTALLED_COMMANDS = [...LEGACY_CLI, ...LEGACY_MCP];

/**
 * Every installed command, canonical first then legacy. Installers create all
 * of these; uninstall/cleanup removes all of these.
 */
export const ALL_INSTALLED_COMMANDS = [
  ...CANONICAL_INSTALLED_COMMANDS,
  ...LEGACY_INSTALLED_COMMANDS,
];

/**
 * The launcher suffixes written for each installed command: a POSIX shim and a
 * Windows `.cmd` launcher. Both are written on every platform so an installed
 * prefix can be copied between platforms and still work.
 */
export const SHIM_LAUNCHER_SUFFIXES = ["", ".cmd"];

/**
 * Every shim file an install writes under `<prefix>/bin`, derived from the
 * command manifest rather than restated.
 *
 * This is the single source for the installed shim inventory. Documentation and
 * validators must derive the count and the names from here: a hardcoded "four
 * shims" claim in a README is exactly the drift Issue #30 recorded, and it
 * survived precisely because the number lived in prose instead of being
 * computed from the manifest.
 *
 * Ordered canonical-then-legacy, POSIX launcher before `.cmd` for each command.
 */
export const INSTALLED_SHIM_NAMES = ALL_INSTALLED_COMMANDS.flatMap((command) =>
  SHIM_LAUNCHER_SUFFIXES.map((suffix) => `${command}${suffix}`),
);

/** How many shim files an install writes. Derived, never restated. */
export const INSTALLED_SHIM_COUNT = INSTALLED_SHIM_NAMES.length;

/**
 * The canonical name a legacy alias forwards to, or null when the name is not a
 * known alias. Used by the compatibility wrappers and by the tests that assert
 * a deprecation warning names the right replacement. Pure.
 */
export function canonicalForLegacyAlias(name) {
  for (const role of COMMAND_ROLES) {
    if (legacyAliasesOf(COMMAND_SURFACE.legacyAliases, role).includes(name)) {
      return COMMAND_SURFACE.canonical[role];
    }
  }
  return null;
}

/**
 * The exact deprecation warning text for a legacy alias, without a trailing
 * newline. Shared by every compatibility wrapper so the wording cannot drift,
 * and asserted verbatim by the compatibility tests.
 *
 * This text is always written to stderr, never stdout: stdout must stay a clean
 * JSON document for `--json` commands and a clean MCP protocol stream for the
 * stdio server.
 */
export function deprecationWarning(legacyName) {
  const canonical = canonicalForLegacyAlias(legacyName);
  if (canonical === null) {
    throw new Error(`not a legacy alias: ${legacyName}`);
  }
  return `Warning: \`${legacyName}\` is a deprecated compatibility alias.\nUse \`${canonical}\` instead.`;
}
