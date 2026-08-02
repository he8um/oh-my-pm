// Installed MCP client configuration generation. Pure: this module performs no
// filesystem, environment, network, clock, or randomness access. The one fact it
// cannot compute — whether the installed sibling executable exists — is supplied
// by an injected predicate at the process boundary, so the whole surface stays
// testable and deterministic.
//
// The generated configuration is a generic stdio MCP server entry pointing at
// the installed `ohmypm-mcp` command by absolute path with an empty argument
// vector. It never contains a token, credential, environment value, project
// root, provider response, or hidden state, and it is never written anywhere:
// the caller prints it and the user pastes it into their own client. Nothing
// here rewrites a configuration file the user owns.

import {
  CANONICAL_MCP_COMMAND,
  COMPATIBILITY_MCP_COMMANDS,
  DEPRECATED_MCP_COMMANDS,
} from "@oh-my-pm/application";

/**
 * The default MCP server key. This is a *product identity*, not a command, so
 * v0.5 deliberately leaves it as `oh-my-pm`: an existing client configuration
 * keeps the same server key and only its `command` value needs regenerating.
 */
export const MCP_CONFIG_DEFAULT_SERVER_NAME = "oh-my-pm";

/** The installed sibling MCP command, without a platform extension. */
export const MCP_CONFIG_COMMAND_NAME = CANONICAL_MCP_COMMAND;

/**
 * Supported compatibility MCP executable names. `ohmypm-mcp` was canonical in
 * v0.5, so a configuration naming it is current-but-not-preferred, not stale.
 */
export const MCP_CONFIG_COMPATIBILITY_COMMAND_NAMES: readonly string[] = COMPATIBILITY_MCP_COMMANDS;

/**
 * Deprecated MCP executable names. A configuration that still invokes one of
 * these keeps working through the compatibility alias, so it is recognized as
 * legacy-but-functional rather than reported as broken.
 */
export const MCP_CONFIG_DEPRECATED_COMMAND_NAMES: readonly string[] = DEPRECATED_MCP_COMMANDS;

/**
 * Every non-canonical MCP executable name that still resolves to this server,
 * compatibility class first. Retained under the original exported name so an
 * existing workspace consumer keeps compiling across the v0.6 migration.
 */
export const MCP_CONFIG_LEGACY_COMMAND_NAMES: readonly string[] = [
  ...COMPATIBILITY_MCP_COMMANDS,
  ...DEPRECATED_MCP_COMMANDS,
];

/**
 * The bounded server-name rule. Identical to the repository helper's existing
 * rule so the installed CLI and the repository tool never diverge: 1..64
 * characters of ASCII letters, digits, dot, underscore, or hyphen.
 */
const SERVER_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** Whether a server key is acceptable. Pure. */
export function isValidMcpServerName(name: string): boolean {
  return SERVER_NAME_RE.test(name);
}

export type McpConfigOutputMode = "json" | "markdown";

export type McpConfigParseResult =
  { ok: true; name: string; outputMode: McpConfigOutputMode } | { ok: false; message: string };

/**
 * Parse `mcp-config [--json|--markdown] [--name <name>]`. JSON is the default.
 * Rejects a duplicate --name, a missing --name value, a value that looks like
 * another option, an out-of-rule name, and any unexpected argument. Pure.
 */
export function parseMcpConfigArgs(args: readonly string[]): McpConfigParseResult {
  let name: string | null = null;
  let outputMode: McpConfigOutputMode = "json";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === "--json") {
      outputMode = "json";
      continue;
    }
    if (arg === "--markdown") {
      outputMode = "markdown";
      continue;
    }
    if (arg === "--name") {
      if (name !== null) {
        return { ok: false, message: "duplicate --name" };
      }
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, message: "--name requires a value" };
      }
      name = value;
      i += 1;
      continue;
    }
    return { ok: false, message: `unexpected argument: ${arg}` };
  }

  const resolved = name ?? MCP_CONFIG_DEFAULT_SERVER_NAME;
  if (!isValidMcpServerName(resolved)) {
    return { ok: false, message: `invalid --name: ${resolved}` };
  }
  return { ok: true, name: resolved, outputMode };
}

// ---------------------------------------------------------------------------
// Installed-prefix inference.
// ---------------------------------------------------------------------------

/** Split a path into segments on either separator. Pure string handling. */
function segmentsOf(path: string): string[] {
  return path.split(/[/\\]/);
}

/** Join segments with the separator that the original path used. Pure. */
function joinWith(separator: string, segments: readonly string[]): string {
  return segments.join(separator);
}

/** The separator a path uses; backslash only when there is no forward slash. */
function separatorOf(path: string): string {
  return path.includes("/") || !path.includes("\\") ? "/" : "\\";
}

/**
 * Derive the candidate installed `bin` directories for a CLI entry-script path.
 *
 * Two installed shapes are supported, both derived purely from the entry path:
 *
 *  1. A released, installed artifact. The command shim at `<prefix>/bin/ohmypm`
 *     runs `<prefix>/lib/oh-my-pm/versions/<version>/bin/ohmypm.mjs`, so the
 *     entry script sits four levels below the prefix. The sibling MCP command is
 *     `<prefix>/bin/ohmypm-mcp`.
 *  2. A locally installed development shim, whose entry script is the package's
 *     own `<root>/cli/bin/ohmypm.mjs`. There is no `<prefix>/bin` above it, so
 *     this shape yields no candidate and the caller reports the installed
 *     executable as missing — a controlled exit 2 rather than a wrong path.
 *
 * The match is on the *directory* shape only, never on the entry filename, so a
 * deprecated `oh-my-pm` shim resolves the same installed prefix as the canonical
 * `ohmypm` shim. The `lib/oh-my-pm` segment is an installation path and is
 * deliberately unchanged by the v0.5 command migration.
 *
 * Returning candidates (rather than one path) keeps the resolution total: the
 * caller probes them in order and the first existing regular file wins. Pure.
 */
export function candidateInstalledBinDirectories(entryScriptPath: string): string[] {
  const separator = separatorOf(entryScriptPath);
  const segments = segmentsOf(entryScriptPath);
  // <prefix>/lib/oh-my-pm/versions/<version>/bin/<cli>.mjs
  //   -> drop: <cli>.mjs, bin, <version>, versions, oh-my-pm, lib
  const candidates: string[] = [];
  if (
    segments.length >= 7 &&
    segments[segments.length - 2] === "bin" &&
    segments[segments.length - 4] === "versions" &&
    segments[segments.length - 5] === "oh-my-pm" &&
    segments[segments.length - 6] === "lib"
  ) {
    const prefixSegments = segments.slice(0, segments.length - 6);
    candidates.push(joinWith(separator, [...prefixSegments, "bin"]));
  }
  return candidates;
}

/**
 * The platform-correct installed command filename. On Windows the installed
 * command is the `.cmd` shim; on POSIX it is the extensionless shim.
 */
export function installedMcpCommandFileName(platform: string): string {
  return platform === "win32" ? `${MCP_CONFIG_COMMAND_NAME}.cmd` : MCP_CONFIG_COMMAND_NAME;
}

export type McpCommandResolutionInput = {
  /** The CLI entry-script path, read at the process boundary. */
  entryScriptPath: string;
  /** The process platform, read at the process boundary. */
  platform: string;
  /** Existence predicate for a candidate absolute path (regular file). */
  commandExists: (path: string) => boolean;
};

export type McpCommandResolution =
  { ok: true; commandPath: string } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Legacy configuration recognition.
// ---------------------------------------------------------------------------

/**
 * How an existing MCP client configuration's `command` value relates to the
 * v0.5 command surface.
 *
 *  - `canonical`: already invokes the canonical `ohmypm-mcp`.
 *  - `legacy`: invokes a deprecated alias. It still works through the
 *    compatibility shim, so this is explicitly *not* a broken configuration —
 *    only one that should be regenerated.
 *  - `unrecognized`: names some other executable entirely; this module makes no
 *    claim about it.
 */
export type McpConfigCommandClassification = "canonical" | "legacy" | "unrecognized";

/** Strip a directory prefix and a Windows `.cmd`/`.exe` suffix. Pure. */
function commandBaseName(command: string): string {
  const segments = segmentsOf(command);
  const last = segments[segments.length - 1] ?? "";
  const lowered = last.toLowerCase();
  for (const extension of [".cmd", ".exe", ".bat", ".mjs"]) {
    if (lowered.endsWith(extension)) {
      return last.slice(0, last.length - extension.length);
    }
  }
  return last;
}

/**
 * Classify a configured MCP `command` value. Accepts a bare command name, an
 * absolute or relative path, and a Windows shim filename. Pure.
 */
export function classifyMcpConfigCommand(command: string): McpConfigCommandClassification {
  const base = commandBaseName(command);
  if (base === MCP_CONFIG_COMMAND_NAME) return "canonical";
  if (MCP_CONFIG_LEGACY_COMMAND_NAMES.includes(base)) return "legacy";
  return "unrecognized";
}

/**
 * Guidance for a configuration that invokes a non-canonical executable. The
 * wording states plainly that the configuration keeps working, so a user is
 * never told to fix something that is not broken. Returns null when the
 * configuration already uses the canonical command or is unrecognized.
 *
 * The two alias classes get different wording: `ohmypm-mcp` was the canonical
 * command in v0.5 and remains fully supported, so calling it "deprecated" would
 * misreport a configuration written one minor version ago.
 *
 * This is advice only. OH MY PM never rewrites a client configuration file the
 * user owns; regenerating one is always an explicit `mcp-config` invocation.
 */
export function legacyMcpConfigGuidance(command: string): string | null {
  if (classifyMcpConfigCommand(command) !== "legacy") return null;
  const base = commandBaseName(command);
  const status = MCP_CONFIG_COMPATIBILITY_COMMAND_NAMES.includes(base)
    ? "a compatibility alias"
    : "a deprecated compatibility alias";
  return (
    `\`${base}\` is ${status} and still works. ` +
    `Regenerate this configuration to use \`${MCP_CONFIG_COMMAND_NAME}\`.`
  );
}

/**
 * Resolve the absolute installed canonical MCP command path from the CLI's own
 * installed location. Probes each derived candidate with the injected predicate
 * and returns the first hit. A miss is a controlled failure, never a guess.
 */
export function resolveInstalledMcpCommand(input: McpCommandResolutionInput): McpCommandResolution {
  const fileName = installedMcpCommandFileName(input.platform);
  for (const binDirectory of candidateInstalledBinDirectories(input.entryScriptPath)) {
    const separator = separatorOf(binDirectory);
    const candidate = `${binDirectory}${separator}${fileName}`;
    if (input.commandExists(candidate)) {
      return { ok: true, commandPath: candidate };
    }
  }
  return {
    ok: false,
    message: `installed command not found: ${fileName}`,
  };
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

export type McpClientConfig = {
  mcpServers: Record<string, { command: string; args: readonly string[] }>;
};

/** Build the generic stdio client configuration object. Pure. */
export function buildMcpClientConfig(name: string, commandPath: string): McpClientConfig {
  return {
    mcpServers: {
      [name]: {
        command: commandPath,
        args: [],
      },
    },
  };
}

/** The twelve read-only tools, in the server's fixed order. */
export const MCP_CONFIG_READ_ONLY_TOOLS: readonly string[] = [
  "project_brief",
  "project_risks",
  "project_next",
  "project_handoff",
  "github_project_brief",
  "github_project_risks",
  "github_project_next",
  "github_project_handoff",
  "provider_status",
  "github_provider_diagnostics",
  "project_changes",
  // v0.4: appended last so the historical tools keep their exact order.
  "project_timeline",
];

/**
 * Render the configuration. JSON is the bare config object; Markdown wraps the
 * same JSON with the read-only tool inventory and the secret-free note. Both end
 * with exactly one newline and are byte-identical for identical inputs.
 */
export function formatMcpClientConfig(config: McpClientConfig, mode: McpConfigOutputMode): string {
  const json = JSON.stringify(config, null, 2);
  if (mode === "json") {
    return `${json}\n`;
  }
  return `${[
    "# OH MY PM MCP Client Configuration",
    "",
    "Add this stdio server entry to your MCP client's configuration:",
    "",
    "```json",
    json,
    "```",
    "",
    `The server exposes ${MCP_CONFIG_READ_ONLY_TOOLS.length} read-only tools:`,
    "",
    ...MCP_CONFIG_READ_ONLY_TOOLS.map((tool) => `- \`${tool}\``),
    "",
    "There are no write tools. This configuration is secret-free by design: it",
    "contains no token, credential, environment value, or project path. If you",
    "need GitHub authentication or a non-default provider configuration file, add",
    "the process environment variables yourself in your MCP client:",
    "",
    "- `OH_MY_PM_GITHUB_TOKEN` — optional GitHub token (never required for",
    "  public repositories)",
    "- `OH_MY_PM_PROVIDER_CONFIG` — optional path to a `providers.json` file",
    "",
    "OH MY PM never writes these into your client configuration for you.",
  ].join("\n")}\n`;
}

export type McpConfigCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * Run the whole `mcp-config` command: parse, resolve the installed command, and
 * render. Returns a structured result; writes nothing itself. A parse failure or
 * a missing installed executable is a controlled exit 2 with a bounded,
 * path-safe stderr line and no stdout.
 */
export function runMcpConfigCommand(
  args: readonly string[],
  resolution: Omit<McpCommandResolutionInput, "commandExists"> & {
    commandExists: (path: string) => boolean;
  },
): McpConfigCommandResult {
  const parsed = parseMcpConfigArgs(args);
  if (!parsed.ok) {
    return { exitCode: 2, stdout: "", stderr: `mcp config error: ${parsed.message}\n` };
  }
  const resolved = resolveInstalledMcpCommand(resolution);
  if (!resolved.ok) {
    return { exitCode: 2, stdout: "", stderr: `mcp config error: ${resolved.message}\n` };
  }
  const config = buildMcpClientConfig(parsed.name, resolved.commandPath);
  return {
    exitCode: 0,
    stdout: formatMcpClientConfig(config, parsed.outputMode),
    stderr: "",
  };
}
