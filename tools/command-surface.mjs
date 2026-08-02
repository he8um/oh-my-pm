// Tool-only loader and validator for the repository command-surface manifest
// (`command-surface.json`). The manifest is the single source of truth for the
// public command names: which executables are canonical, which older names
// remain as supported compatibility aliases, and which are deprecated.
//
// This module is pure apart from reading the manifest file itself: no network,
// no environment reads, no writes, no clock, no randomness. Every consumer
// (package manifests, installer planning, release metadata, generated MCP
// configuration, documentation validation, tests) derives its command names
// from here so no second, silently diverging list can exist.
//
// v0.6 (schemaVersion 2) splits the single "legacy" bucket into two distinct
// classes, because they carry different promises:
//
//   - compatibilityAliases (`ohmypm*`): fully supported, no removal scheduled.
//     These were canonical in v0.5, so demoting them to "deprecated" would
//     retroactively break a promise made one minor version ago.
//   - deprecatedAliases (`oh-my-pm*`): still work, still no removal scheduled,
//     but they are documented as deprecated and say so on stderr.
//
// The product identity block is also lifted into the manifest so the invariants
// that must NOT change (package scope, environment prefix, archive prefix, MCP
// server key) are machine-checked rather than merely asserted in prose.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, derived from this module's location, never from cwd. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The manifest path. Exported so validators can report it by name. */
export const COMMAND_SURFACE_PATH = join(REPO_ROOT, "command-surface.json");

/** The manifest schema version this loader understands. */
export const COMMAND_SURFACE_SCHEMA_VERSION = 2;

/** The three command roles, in a fixed order used by every renderer. */
export const COMMAND_ROLES = ["cli", "mcp", "installer"];

/** The two alias classes, in the order they are always rendered. */
export const ALIAS_CLASSES = ["compatibilityAliases", "deprecatedAliases"];

/**
 * The product identity fields that this migration must NOT change, with their
 * required values. A command-namespace migration that quietly renamed the
 * package scope or the MCP server key would be a different, much larger change;
 * pinning them here turns "unchanged" into an enforced invariant.
 */
export const REQUIRED_PRODUCT_IDENTITY = Object.freeze({
  name: "OH MY PM",
  slug: "oh-my-pm",
  packageScope: "@oh-my-pm",
  environmentPrefix: "OH_MY_PM_",
  archivePrefix: "oh-my-pm",
  mcpServerKey: "oh-my-pm",
});

// The bounded command-name rule: 1..64 characters of ASCII lowercase letters,
// digits, and hyphens, starting and ending with an alphanumeric. Deliberately
// stricter than a filename rule so a command name can never introduce a path
// separator, a shell metacharacter, or a leading dash.
const COMMAND_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Whether a value is a usable command name. Pure. */
export function isValidCommandName(value) {
  return typeof value === "string" && COMMAND_NAME_RE.test(value);
}

function aliasListOf(roleEntry, aliasClass) {
  const list = roleEntry?.[aliasClass];
  return Array.isArray(list) ? list : [];
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

  // --- Product identity: every field is pinned. -----------------------------
  const product = raw.product;
  if (typeof product !== "object" || product === null || Array.isArray(product)) {
    errors.push("product must be an object");
  } else {
    for (const [field, expected] of Object.entries(REQUIRED_PRODUCT_IDENTITY)) {
      if (product[field] !== expected) {
        // The product identity is deliberately NOT migrated: this repository,
        // its package scope, its data directory, its environment variables, and
        // its release archives all stay "oh-my-pm". Only command names change.
        errors.push(`product.${field} must be "${expected}"`);
      }
    }
  }

  // --- Executables: one canonical name plus two alias classes per role. -----
  const executables = raw.executables;
  if (typeof executables !== "object" || executables === null || Array.isArray(executables)) {
    errors.push("executables must be an object");
  } else {
    const keys = Object.keys(executables);
    if (keys.length !== COMMAND_ROLES.length || !COMMAND_ROLES.every((r) => keys.includes(r))) {
      errors.push(`executables must declare exactly: ${COMMAND_ROLES.join(", ")}`);
    }
    for (const role of COMMAND_ROLES) {
      const entry = executables[role];
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        errors.push(`executables.${role} must be an object`);
        continue;
      }
      if (!isValidCommandName(entry.canonical)) {
        errors.push(`executables.${role}.canonical is not a valid command name`);
      }
      for (const aliasClass of ALIAS_CLASSES) {
        const aliases = entry[aliasClass];
        if (!Array.isArray(aliases)) {
          errors.push(`executables.${role}.${aliasClass} must be an array`);
          continue;
        }
        for (const alias of aliases) {
          if (!isValidCommandName(alias)) {
            errors.push(`executables.${role}.${aliasClass} contains an invalid command name`);
          }
        }
        if (new Set(aliases).size !== aliases.length) {
          errors.push(`executables.${role}.${aliasClass} contains a duplicate`);
        }
      }
      // The two alias classes carry different support promises, so a name that
      // appeared in both would make its own promise ambiguous.
      const compat = aliasListOf(entry, "compatibilityAliases");
      const deprecated = aliasListOf(entry, "deprecatedAliases");
      for (const name of compat) {
        if (deprecated.includes(name)) {
          errors.push(`executables.${role}: ${name} is both a compatibility and deprecated alias`);
        }
      }
      // An alias may never equal the canonical name it forwards to: the warning
      // logic and the "canonical never warns" guarantee both depend on this.
      if (compat.includes(entry.canonical) || deprecated.includes(entry.canonical)) {
        errors.push(`executables.${role}: ${entry.canonical} is declared both canonical and alias`);
      }
    }

    // --- Global uniqueness across every role. -------------------------------
    if (errors.length === 0) {
      const canonicalNames = COMMAND_ROLES.map((r) => executables[r].canonical);
      if (new Set(canonicalNames).size !== canonicalNames.length) {
        errors.push("canonical command names must be distinct");
      }
      // Every declared name, across every role and class, must be unique: one
      // executable name can only resolve to one implementation on PATH.
      const seen = new Map();
      for (const role of COMMAND_ROLES) {
        const entry = executables[role];
        const names = [
          entry.canonical,
          ...aliasListOf(entry, "compatibilityAliases"),
          ...aliasListOf(entry, "deprecatedAliases"),
        ];
        for (const name of names) {
          if (seen.has(name) && seen.get(name) !== role) {
            errors.push(`${name} is declared in more than one role`);
          } else if (seen.has(name)) {
            errors.push(`${name} is declared more than once in role ${role}`);
          }
          seen.set(name, role);
        }
      }
    }
  }

  for (const field of ["canonicalSince", "compatibilityAliasSince", "deprecatedSince"]) {
    if (typeof raw[field] !== "string" || raw[field] === "") {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof raw.removalScheduled !== "boolean") {
    errors.push("removalScheduled must be a boolean");
  }

  return errors;
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

/** The product identity block. */
export const PRODUCT = COMMAND_SURFACE.product;
/** The product slug used for the repository, data directories, and archives. */
export const PRODUCT_SLUG = PRODUCT.slug;
/** The MCP server key. Unchanged by the command migration. */
export const MCP_SERVER_KEY = PRODUCT.mcpServerKey;

/** The canonical CLI command name, e.g. `omp`. */
export const CANONICAL_CLI = COMMAND_SURFACE.executables.cli.canonical;
/** The canonical MCP stdio server command name, e.g. `omp-mcp`. */
export const CANONICAL_MCP = COMMAND_SURFACE.executables.mcp.canonical;
/** The canonical release-bundle installer command name, e.g. `omp-install`. */
export const CANONICAL_INSTALLER = COMMAND_SURFACE.executables.installer.canonical;

/** Supported compatibility aliases per role, in manifest order. */
export const COMPAT_CLI = [...COMMAND_SURFACE.executables.cli.compatibilityAliases];
export const COMPAT_MCP = [...COMMAND_SURFACE.executables.mcp.compatibilityAliases];
export const COMPAT_INSTALLER = [...COMMAND_SURFACE.executables.installer.compatibilityAliases];

/** Deprecated aliases per role, in manifest order. */
export const DEPRECATED_CLI = [...COMMAND_SURFACE.executables.cli.deprecatedAliases];
export const DEPRECATED_MCP = [...COMMAND_SURFACE.executables.mcp.deprecatedAliases];
export const DEPRECATED_INSTALLER = [...COMMAND_SURFACE.executables.installer.deprecatedAliases];

/**
 * Every alias for a role, compatibility class first then deprecated. This is the
 * order every generated inventory uses, so the ordering itself records which
 * names carry the stronger promise.
 */
export function aliasesForRole(role) {
  const entry = COMMAND_SURFACE.executables[role];
  return [...entry.compatibilityAliases, ...entry.deprecatedAliases];
}

/** Every declared name for a role, canonical first. */
export function namesForRole(role) {
  return [COMMAND_SURFACE.executables[role].canonical, ...aliasesForRole(role)];
}

/**
 * The canonical *installed* commands, in the order every installer, shim
 * planner, and installed-state verifier uses. The installer command itself is
 * shipped inside a release bundle rather than installed into `<prefix>/bin`.
 */
export const CANONICAL_INSTALLED_COMMANDS = [CANONICAL_CLI, CANONICAL_MCP];

/** The compatibility-alias installed commands, aligned with the canonical pair. */
export const COMPAT_INSTALLED_COMMANDS = [...COMPAT_CLI, ...COMPAT_MCP];

/** The deprecated-alias installed commands, aligned with the canonical pair. */
export const DEPRECATED_INSTALLED_COMMANDS = [...DEPRECATED_CLI, ...DEPRECATED_MCP];

/**
 * Every installed command: canonical, then compatibility aliases, then
 * deprecated aliases. Installers create all of these; uninstall removes all.
 */
export const ALL_INSTALLED_COMMANDS = [
  ...CANONICAL_INSTALLED_COMMANDS,
  ...COMPAT_INSTALLED_COMMANDS,
  ...DEPRECATED_INSTALLED_COMMANDS,
];

/** Every non-canonical installed command, in rendering order. */
export const ALIAS_INSTALLED_COMMANDS = [
  ...COMPAT_INSTALLED_COMMANDS,
  ...DEPRECATED_INSTALLED_COMMANDS,
];

/**
 * Every executable the release bundle ships in `bin/`, including the installer
 * family, canonical-first within each class.
 */
export const BUNDLE_EXECUTABLE_NAMES = [
  CANONICAL_CLI,
  CANONICAL_MCP,
  CANONICAL_INSTALLER,
  ...COMPAT_CLI,
  ...COMPAT_MCP,
  ...COMPAT_INSTALLER,
  ...DEPRECATED_CLI,
  ...DEPRECATED_MCP,
  ...DEPRECATED_INSTALLER,
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
 */
export const INSTALLED_SHIM_NAMES = ALL_INSTALLED_COMMANDS.flatMap((command) =>
  SHIM_LAUNCHER_SUFFIXES.map((suffix) => `${command}${suffix}`),
);

/** How many shim files an install writes. Derived, never restated. */
export const INSTALLED_SHIM_COUNT = INSTALLED_SHIM_NAMES.length;

/**
 * The alias class of a name: "canonical", "compatibility", "deprecated", or
 * null when the name is not declared at all. Pure and total.
 */
export function aliasClassOf(name) {
  for (const role of COMMAND_ROLES) {
    const entry = COMMAND_SURFACE.executables[role];
    if (entry.canonical === name) return "canonical";
    if (entry.compatibilityAliases.includes(name)) return "compatibility";
    if (entry.deprecatedAliases.includes(name)) return "deprecated";
  }
  return null;
}

/**
 * The canonical name an alias forwards to, or null when the name is not a known
 * alias. Used by the compatibility wrappers and by the tests that assert a
 * warning names the right replacement. Pure.
 */
export function canonicalForAlias(name) {
  for (const role of COMMAND_ROLES) {
    const entry = COMMAND_SURFACE.executables[role];
    if (entry.compatibilityAliases.includes(name) || entry.deprecatedAliases.includes(name)) {
      return entry.canonical;
    }
  }
  return null;
}

/**
 * The exact warning text for an alias, without a trailing newline. Shared by
 * every wrapper so the wording cannot drift, and asserted verbatim by the
 * compatibility tests.
 *
 * The two classes get deliberately different wording: a compatibility alias is
 * supported and merely non-preferred, while a deprecated alias is discouraged.
 * Flattening them into one message would either overstate the risk of `ohmypm`
 * or understate the status of `oh-my-pm`.
 *
 * This text is always written to stderr, never stdout: stdout must stay a clean
 * JSON document for `--json` commands and a clean MCP protocol stream for the
 * stdio server.
 */
export function aliasWarning(aliasName) {
  const canonical = canonicalForAlias(aliasName);
  if (canonical === null) {
    throw new Error(`not an alias: ${aliasName}`);
  }
  const aliasClass = aliasClassOf(aliasName);
  if (aliasClass === "compatibility") {
    return `Warning: \`${aliasName}\` is a compatibility alias; use \`${canonical}\`.`;
  }
  return `Warning: \`${aliasName}\` is deprecated; use \`${canonical}\`.`;
}
