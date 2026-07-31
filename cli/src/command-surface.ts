// The public command names, as the CLI package sees them.
//
// This module is pure: no filesystem, environment, network, clock, or randomness
// access. That purity is why the names are restated here rather than read from
// the repository's `command-surface.json` at runtime — the CLI core must remain
// loadable without touching disk. `tools/validate-command-surface.mjs` compares
// these constants against the manifest on every validation run, so the two can
// never silently diverge.
//
// Only the *invoked command names* migrate in v0.5. The product identity is
// unchanged: the package scope stays `@oh-my-pm/*`, the environment prefix stays
// `OH_MY_PM_*`, the installation directory stays `lib/oh-my-pm/`, release
// archives stay `oh-my-pm-vX.Y.Z`, and the default MCP server key stays
// `oh-my-pm`.

/** The canonical CLI command. Every active help line and example uses this. */
export const CANONICAL_CLI_COMMAND = "ohmypm";

/** The canonical MCP stdio server command. Generated configuration invokes this. */
export const CANONICAL_MCP_COMMAND = "ohmypm-mcp";

/** The canonical release-bundle installer command. */
export const CANONICAL_INSTALLER_COMMAND = "ohmypm-install";

/**
 * Deprecated CLI executable names. These still work, forwarding to the same
 * implementation after a stderr-only deprecation warning, but they are never
 * presented as an equal alternative in help output or examples.
 */
export const LEGACY_CLI_COMMANDS: readonly string[] = ["oh-my-pm"];

/** Deprecated MCP stdio server executable names. */
export const LEGACY_MCP_COMMANDS: readonly string[] = ["oh-my-pm-mcp"];

/** Deprecated release-bundle installer executable names. */
export const LEGACY_INSTALLER_COMMANDS: readonly string[] = ["oh-my-pm-install"];

/** The release in which the compatibility aliases were deprecated. */
export const COMMAND_DEPRECATED_SINCE = "0.5.0";

/**
 * The canonical replacement for a deprecated executable name, or null when the
 * name is not a known alias. Pure and total.
 */
export function canonicalCommandForAlias(name: string): string | null {
  if (LEGACY_CLI_COMMANDS.includes(name)) return CANONICAL_CLI_COMMAND;
  if (LEGACY_MCP_COMMANDS.includes(name)) return CANONICAL_MCP_COMMAND;
  if (LEGACY_INSTALLER_COMMANDS.includes(name)) return CANONICAL_INSTALLER_COMMAND;
  return null;
}

/**
 * The exact deprecation warning for an alias, without a trailing newline.
 *
 * This text is always written to stderr. Never stdout: stdout must stay a clean
 * JSON document for `--json` commands and a clean MCP protocol stream for the
 * stdio server, so a warning there would corrupt a machine-readable contract.
 *
 * Throws for a name that is not a legacy alias, so a wrapper can never warn
 * about the command it is forwarding to.
 */
export function commandDeprecationWarning(aliasName: string): string {
  const canonical = canonicalCommandForAlias(aliasName);
  if (canonical === null) {
    throw new Error(`not a legacy alias: ${aliasName}`);
  }
  return `Warning: \`${aliasName}\` is a deprecated compatibility alias.\nUse \`${canonical}\` instead.`;
}
