import type { CliOutputMode } from "@oh-my-pm/contracts";
import type {
  CliCommand,
  CliParseResult,
  GitHubCliOperation,
  ProvidersSubcommand,
} from "./types.js";

export const OMP_C_INVALID_COMMAND = "OMP-C-3001";
export const OMP_C_INVALID_OPTION = "OMP-C-3002";

export const GITHUB_CLI_DEFAULT_LIMIT = 50;
const GITHUB_CLI_MIN_LIMIT = 1;
const GITHUB_CLI_MAX_LIMIT = 100;
const GITHUB_OPERATIONS: readonly GitHubCliOperation[] = ["brief", "risks", "next", "handoff"];
const PROVIDERS_SUBCOMMANDS: readonly ProvidersSubcommand[] = ["status", "doctor"];

const COMMANDS: readonly CliCommand[] = [
  "status",
  "doctor",
  "plan",
  "brief",
  "risks",
  "next",
  "handoff",
  "install-preview",
  "github",
  "providers",
];

/**
 * Consume `--provider-config <path>` at index `i`. Returns the value and the
 * new index, or a parse error. Duplicate/missing values are rejected.
 */
function takeProviderConfig(
  rest: readonly string[],
  i: number,
  current: string | null,
): { value: string; next: number } | { error: CliParseResult } {
  if (current !== null) {
    return { error: { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --provider-config" } };
  }
  const value = rest[i + 1];
  if (value === undefined || value.startsWith("--")) {
    return {
      error: { ok: false, code: OMP_C_INVALID_OPTION, message: "--provider-config requires a value" },
    };
  }
  return { value, next: i + 1 };
}

/**
 * Parse the nested `github <op> <owner/repo> [--limit N] [--json|--markdown]`
 * command. Pure: no network, environment, filesystem, or clock access. The
 * repository string is passed through exactly; strict validation happens in the
 * provider's query parser. No token or API-URL option is accepted.
 */
function parseGitHubCommand(rest: readonly string[]): CliParseResult {
  let operation: GitHubCliOperation | null = null;
  let repository: string | null = null;
  let limit: number | null = null;
  let providerConfigPath: string | null = null;
  let outputMode: CliOutputMode = "brief";

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    if (arg === "--json" || arg === "--markdown") {
      outputMode = arg === "--json" ? "json" : "markdown";
      continue;
    }
    if (arg === "--provider-config") {
      const taken = takeProviderConfig(rest, i, providerConfigPath);
      if ("error" in taken) return taken.error;
      providerConfigPath = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--limit") {
      if (limit !== null) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --limit" };
      }
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--limit requires a value" };
      }
      if (!/^[0-9]+$/.test(value)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--limit must be an integer" };
      }
      const parsed = Number(value);
      if (parsed < GITHUB_CLI_MIN_LIMIT || parsed > GITHUB_CLI_MAX_LIMIT) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--limit must be in 1..100" };
      }
      limit = parsed;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported option: ${arg}` };
    }
    if (operation === null) {
      if (!(GITHUB_OPERATIONS as readonly string[]).includes(arg)) {
        return {
          ok: false,
          code: OMP_C_INVALID_OPTION,
          message: `unsupported github operation: ${arg}`,
        };
      }
      operation = arg as GitHubCliOperation;
      continue;
    }
    if (repository === null) {
      repository = arg;
      continue;
    }
    return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported argument: ${arg}` };
  }

  if (operation === null) {
    return { ok: false, code: OMP_C_INVALID_OPTION, message: "missing github operation" };
  }
  // Repository and limit are optional at parse time; provider configuration may
  // supply defaults. Presence is preserved so the process layer knows whether a
  // value was explicit and must override configuration.
  const result: Extract<CliParseResult, { command: "github" }> = {
    ok: true,
    command: "github",
    operation,
    outputMode,
  };
  if (repository !== null) result.repository = repository;
  if (limit !== null) result.limit = limit;
  if (providerConfigPath !== null) result.providerConfigPath = providerConfigPath;
  return result;
}

/**
 * Parse `providers status|doctor [github [owner/repo]] [--provider-config
 * <path>] [--confirm-network] [--json|--markdown]`. `--confirm-network` is
 * accepted only by `providers doctor github`. Pure: no filesystem, environment,
 * network, or clock access.
 */
function parseProvidersCommand(rest: readonly string[]): CliParseResult {
  let subcommand: ProvidersSubcommand | null = null;
  let provider: "github" | null = null;
  let repository: string | null = null;
  let providerConfigPath: string | null = null;
  let confirmNetwork = false;
  let outputMode: CliOutputMode = "brief";

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    if (arg === "--json" || arg === "--markdown") {
      outputMode = arg === "--json" ? "json" : "markdown";
      continue;
    }
    if (arg === "--provider-config") {
      const taken = takeProviderConfig(rest, i, providerConfigPath);
      if ("error" in taken) return taken.error;
      providerConfigPath = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--confirm-network") {
      if (confirmNetwork) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --confirm-network" };
      }
      confirmNetwork = true;
      continue;
    }
    if (arg.startsWith("--")) {
      return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported option: ${arg}` };
    }
    if (subcommand === null) {
      if (!(PROVIDERS_SUBCOMMANDS as readonly string[]).includes(arg)) {
        return {
          ok: false,
          code: OMP_C_INVALID_OPTION,
          message: `unsupported providers subcommand: ${arg}`,
        };
      }
      subcommand = arg as ProvidersSubcommand;
      continue;
    }
    // Only `providers doctor` accepts a provider target and repository.
    if (subcommand === "doctor" && provider === null) {
      if (arg !== "github") {
        return {
          ok: false,
          code: OMP_C_INVALID_OPTION,
          message: `unsupported providers doctor target: ${arg}`,
        };
      }
      provider = "github";
      continue;
    }
    if (subcommand === "doctor" && provider === "github" && repository === null) {
      repository = arg;
      continue;
    }
    return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported argument: ${arg}` };
  }

  if (subcommand === null) {
    return { ok: false, code: OMP_C_INVALID_OPTION, message: "missing providers subcommand" };
  }

  // --confirm-network is valid only for `providers doctor github`.
  if (confirmNetwork && !(subcommand === "doctor" && provider === "github")) {
    return {
      ok: false,
      code: OMP_C_INVALID_OPTION,
      message: "--confirm-network is only valid for `providers doctor github`",
    };
  }

  if (subcommand === "status") {
    const result: Extract<CliParseResult, { command: "providers"; subcommand: "status" }> = {
      ok: true,
      command: "providers",
      subcommand: "status",
      outputMode,
    };
    if (providerConfigPath !== null) result.providerConfigPath = providerConfigPath;
    return result;
  }

  const result: Extract<CliParseResult, { command: "providers"; subcommand: "doctor" }> = {
    ok: true,
    command: "providers",
    subcommand: "doctor",
    confirmNetwork,
    outputMode,
  };
  if (provider !== null) result.provider = provider;
  if (repository !== null) result.repository = repository;
  if (providerConfigPath !== null) result.providerConfigPath = providerConfigPath;
  return result;
}

/** Commands whose single optional positional is a local project root. */
function isProjectRootCommand(
  command: CliCommand,
): command is "brief" | "risks" | "next" | "handoff" {
  return (
    command === "brief" ||
    command === "risks" ||
    command === "next" ||
    command === "handoff"
  );
}

const OUTPUT_OPTIONS: Readonly<Record<string, CliOutputMode>> = {
  "--json": "json",
  "--markdown": "markdown",
};

function isCliCommand(value: string): value is CliCommand {
  return (COMMANDS as readonly string[]).includes(value);
}

export function parseCliArgs(args: readonly string[]): CliParseResult {
  // The github command has its own nested grammar (operation + repository +
  // --limit); delegate as soon as it is recognized as the first token.
  if (args.length > 0 && args[0] === "github") {
    return parseGitHubCommand(args.slice(1));
  }
  // The providers command has its own nested grammar (status/doctor + optional
  // github target + --provider-config + --confirm-network).
  if (args.length > 0 && args[0] === "providers") {
    return parseProvidersCommand(args.slice(1));
  }

  let command: Exclude<CliCommand, "github" | "providers"> | null = null;
  let outputMode: CliOutputMode = "brief";
  const planTokens: string[] = [];
  let projectRoot: string | null = null;
  let installPreviewRoot: string | null = null;

  for (const arg of args) {
    const optionMode = OUTPUT_OPTIONS[arg];
    if (optionMode !== undefined) {
      // The last output mode supplied wins; options may appear anywhere.
      outputMode = optionMode;
      continue;
    }
    if (arg.startsWith("--")) {
      return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported option: ${arg}` };
    }
    if (command === null) {
      if (!isCliCommand(arg) || arg === "github" || arg === "providers") {
        // github and providers are handled by their nested parsers before this
        // loop; if they appear anywhere but first they are unsupported here.
        return { ok: false, code: OMP_C_INVALID_COMMAND, message: `unsupported command: ${arg}` };
      }
      command = arg;
      continue;
    }
    if (command === "plan") {
      planTokens.push(arg);
      continue;
    }
    if (isProjectRootCommand(command) && projectRoot === null) {
      projectRoot = arg;
      continue;
    }
    if (command === "install-preview" && installPreviewRoot === null) {
      installPreviewRoot = arg;
      continue;
    }
    return { ok: false, code: OMP_C_INVALID_OPTION, message: `unsupported argument: ${arg}` };
  }

  if (command === null) {
    return { ok: false, code: OMP_C_INVALID_COMMAND, message: "missing command" };
  }

  if (command === "plan") {
    const input = planTokens.join(" ").trim();
    if (input === "") {
      return { ok: false, code: OMP_C_INVALID_OPTION, message: "missing plan request" };
    }
    return { ok: true, command, outputMode, input };
  }

  if (isProjectRootCommand(command)) {
    // The project root stays exactly as the user typed it; the parser never
    // touches the filesystem and never normalizes to an absolute path.
    return { ok: true, command, outputMode, input: projectRoot ?? "." };
  }

  if (command === "install-preview") {
    if (installPreviewRoot === null) {
      return { ok: false, code: OMP_C_INVALID_OPTION, message: "missing install-preview root" };
    }
    return { ok: true, command, outputMode, input: installPreviewRoot };
  }

  return { ok: true, command, outputMode };
}
