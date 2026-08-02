// The public command names, as the CLI and MCP packages see them.
//
// This module is pure: no filesystem, environment, network, clock, or randomness
// access. That purity is why the names are restated here rather than read from
// the repository's `command-surface.json` at runtime — the CLI core must remain
// loadable without touching disk. `tools/validate-command-surface.mjs` compares
// these constants against the manifest on every validation run, so the two can
// never silently diverge.
//
// v0.6 makes `omp*` the canonical command family. The previous canonical family
// `ohmypm*` becomes a supported *compatibility* alias rather than a deprecated
// one: it was canonical as recently as v0.5, so demoting it straight to
// "deprecated" would retroactively withdraw a promise made one minor version
// ago. The oldest `oh-my-pm*` family stays deprecated. Neither is scheduled for
// removal.
//
// Only the *invoked command names* migrate. The product identity is unchanged:
// the package scope stays `@oh-my-pm/*`, the environment prefix stays
// `OH_MY_PM_*`, the installation directory stays `lib/oh-my-pm/`, release
// archives stay `oh-my-pm-vX.Y.Z`, and the default MCP server key stays
// `oh-my-pm`.

/** The canonical CLI command. Every active help line and example uses this. */
export const CANONICAL_CLI_COMMAND = "omp";

/** The canonical MCP stdio server command. Generated configuration invokes this. */
export const CANONICAL_MCP_COMMAND = "omp-mcp";

/** The canonical release-bundle installer command. */
export const CANONICAL_INSTALLER_COMMAND = "omp-install";

/**
 * Supported compatibility CLI aliases. These forward to the same implementation
 * after a stderr-only notice. They are fully supported and no removal is
 * scheduled, but help output and examples present the canonical name instead.
 */
export const COMPATIBILITY_CLI_COMMANDS: readonly string[] = ["ohmypm"];

/** Supported compatibility MCP stdio server aliases. */
export const COMPATIBILITY_MCP_COMMANDS: readonly string[] = ["ohmypm-mcp"];

/** Supported compatibility release-bundle installer aliases. */
export const COMPATIBILITY_INSTALLER_COMMANDS: readonly string[] = ["ohmypm-install"];

/**
 * Deprecated CLI executable names. These still work, forwarding to the same
 * implementation after a stderr-only deprecation warning, but they are never
 * presented as an equal alternative in help output or examples.
 */
export const DEPRECATED_CLI_COMMANDS: readonly string[] = ["oh-my-pm"];

/** Deprecated MCP stdio server executable names. */
export const DEPRECATED_MCP_COMMANDS: readonly string[] = ["oh-my-pm-mcp"];

/** Deprecated release-bundle installer executable names. */
export const DEPRECATED_INSTALLER_COMMANDS: readonly string[] = ["oh-my-pm-install"];

/** The release in which `omp*` became the canonical family. */
export const COMMAND_CANONICAL_SINCE = "0.6.0";

/** The release in which the `ohmypm*` family was introduced. */
export const COMMAND_COMPATIBILITY_SINCE = "0.5.0";

/** The release in which the `oh-my-pm*` family was deprecated. */
export const COMMAND_DEPRECATED_SINCE = "0.5.0";

/** How an executable name relates to the canonical command family. */
export type CommandAliasClass = "canonical" | "compatibility" | "deprecated";

/**
 * The class of an executable name, or null when the name is not a declared
 * command. Pure and total.
 */
export function commandAliasClass(name: string): CommandAliasClass | null {
  if (
    name === CANONICAL_CLI_COMMAND ||
    name === CANONICAL_MCP_COMMAND ||
    name === CANONICAL_INSTALLER_COMMAND
  ) {
    return "canonical";
  }
  if (
    COMPATIBILITY_CLI_COMMANDS.includes(name) ||
    COMPATIBILITY_MCP_COMMANDS.includes(name) ||
    COMPATIBILITY_INSTALLER_COMMANDS.includes(name)
  ) {
    return "compatibility";
  }
  if (
    DEPRECATED_CLI_COMMANDS.includes(name) ||
    DEPRECATED_MCP_COMMANDS.includes(name) ||
    DEPRECATED_INSTALLER_COMMANDS.includes(name)
  ) {
    return "deprecated";
  }
  return null;
}

/**
 * The canonical replacement for an alias executable name, or null when the name
 * is not a known alias. Pure and total.
 */
export function canonicalCommandForAlias(name: string): string | null {
  if (COMPATIBILITY_CLI_COMMANDS.includes(name) || DEPRECATED_CLI_COMMANDS.includes(name)) {
    return CANONICAL_CLI_COMMAND;
  }
  if (COMPATIBILITY_MCP_COMMANDS.includes(name) || DEPRECATED_MCP_COMMANDS.includes(name)) {
    return CANONICAL_MCP_COMMAND;
  }
  if (
    COMPATIBILITY_INSTALLER_COMMANDS.includes(name) ||
    DEPRECATED_INSTALLER_COMMANDS.includes(name)
  ) {
    return CANONICAL_INSTALLER_COMMAND;
  }
  return null;
}

/**
 * The exact warning for an alias, without a trailing newline.
 *
 * The two alias classes get deliberately different wording. A compatibility
 * alias is supported and merely non-preferred; a deprecated alias is
 * discouraged. Collapsing them into one sentence would either overstate the risk
 * of `ohmypm` or understate the status of `oh-my-pm`.
 *
 * This text is always written to stderr. Never stdout: stdout must stay a clean
 * JSON document for `--json` commands and a clean MCP protocol stream for the
 * stdio server, so a warning there would corrupt a machine-readable contract.
 *
 * Throws for a name that is not an alias, so a wrapper can never warn about the
 * canonical command it is forwarding to.
 */
export function commandAliasWarning(aliasName: string): string {
  const canonical = canonicalCommandForAlias(aliasName);
  if (canonical === null) {
    throw new Error(`not an alias: ${aliasName}`);
  }
  if (commandAliasClass(aliasName) === "compatibility") {
    return `Warning: \`${aliasName}\` is a compatibility alias; use \`${canonical}\`.`;
  }
  return `Warning: \`${aliasName}\` is deprecated; use \`${canonical}\`.`;
}
