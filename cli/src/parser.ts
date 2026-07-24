import type { CliOutputMode } from "@oh-my-pm/contracts";
import {
  GITHUB_DEFAULT_LIMIT,
  GITHUB_MAX_LIMIT,
  GITHUB_MIN_LIMIT,
  GITHUB_SEARCH_KINDS,
  GITHUB_SOURCE_MODES,
  GITHUB_SOURCE_QUERY_MAX,
  GITHUB_SOURCE_STATES,
  MAX_GITHUB_COMMENT_LIMIT,
  MAX_GITHUB_REVIEW_COMMENT_LIMIT,
  MAX_GITHUB_REVIEW_LIMIT,
  MIN_GITHUB_COMMENT_LIMIT,
  MIN_GITHUB_REVIEW_COMMENT_LIMIT,
  MIN_GITHUB_REVIEW_LIMIT,
} from "@oh-my-pm/providers";
import type {
  GitHubSearchKind,
  GitHubSourceMode,
  GitHubSourceState,
} from "@oh-my-pm/providers";
import type {
  CliCommand,
  CliParseResult,
  GitHubCliOperation,
  ProvidersSubcommand,
} from "./types.js";

export const OMP_C_INVALID_COMMAND = "OMP-C-3001";
export const OMP_C_INVALID_OPTION = "OMP-C-3002";

// Public compatibility alias — the CLI's default GitHub list limit. Resolves to
// the canonical list default (50). The list/comment/review bounds are imported
// from the provider package's canonical constants rather than re-declared here.
export const GITHUB_CLI_DEFAULT_LIMIT = GITHUB_DEFAULT_LIMIT;
const GITHUB_OPERATIONS: readonly GitHubCliOperation[] = ["brief", "risks", "next", "handoff"];
const PROVIDERS_SUBCOMMANDS: readonly ProvidersSubcommand[] = ["status", "doctor"];

/**
 * Take a single string value for the option at index `i`. Rejects a duplicate
 * (when `current` is already set) and a missing value. The value may not start
 * with `--`. Returns the value and the advanced index, or a parse error.
 */
function takeValue(
  rest: readonly string[],
  i: number,
  current: unknown,
  option: string,
): { value: string; next: number } | { error: CliParseResult } {
  if (current !== null && current !== undefined) {
    return { error: { ok: false, code: OMP_C_INVALID_OPTION, message: `duplicate ${option}` } };
  }
  const value = rest[i + 1];
  if (value === undefined || value.startsWith("--")) {
    return { error: { ok: false, code: OMP_C_INVALID_OPTION, message: `${option} requires a value` } };
  }
  return { value, next: i + 1 };
}

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
  let source: GitHubSourceMode | null = null;
  let state: GitHubSourceState | null = null;
  let kind: GitHubSearchKind | null = null;
  let itemNumber: number | null = null;
  let query: string | null = null;
  let includeComments: boolean | null = null;
  let commentLimit: number | null = null;
  let includeReviews: boolean | null = null;
  let reviewLimit: number | null = null;
  let includeReviewComments: boolean | null = null;
  let reviewCommentLimit: number | null = null;
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
    if (arg === "--source") {
      const taken = takeValue(rest, i, source, "--source");
      if ("error" in taken) return taken.error;
      if (!(GITHUB_SOURCE_MODES as readonly string[]).includes(taken.value)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--source must be a supported source mode" };
      }
      source = taken.value as GitHubSourceMode;
      i = taken.next;
      continue;
    }
    if (arg === "--state") {
      const taken = takeValue(rest, i, state, "--state");
      if ("error" in taken) return taken.error;
      if (!(GITHUB_SOURCE_STATES as readonly string[]).includes(taken.value)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--state must be open, closed, or all" };
      }
      state = taken.value as GitHubSourceState;
      i = taken.next;
      continue;
    }
    if (arg === "--kind") {
      const taken = takeValue(rest, i, kind, "--kind");
      if ("error" in taken) return taken.error;
      if (!(GITHUB_SEARCH_KINDS as readonly string[]).includes(taken.value)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--kind must be all, issues, or pull-requests" };
      }
      kind = taken.value as GitHubSearchKind;
      i = taken.next;
      continue;
    }
    if (arg === "--number") {
      const taken = takeValue(rest, i, itemNumber, "--number");
      if ("error" in taken) return taken.error;
      if (!/^[1-9][0-9]*$/.test(taken.value)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--number must be a positive integer" };
      }
      const parsed = Number(taken.value);
      if (!Number.isSafeInteger(parsed)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--number is out of range" };
      }
      itemNumber = parsed;
      i = taken.next;
      continue;
    }
    if (arg === "--query") {
      const taken = takeValue(rest, i, query, "--query");
      if ("error" in taken) return taken.error;
      // Exactly one shell argument; surrounding whitespace is rejected so the
      // encoded query is deterministic.
      if (taken.value !== taken.value.trim()) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--query must not have surrounding whitespace" };
      }
      if (taken.value === "") {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--query must not be empty" };
      }
      if (taken.value.length > GITHUB_SOURCE_QUERY_MAX) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--query is too long" };
      }
      for (let c = 0; c < taken.value.length; c += 1) {
        const code = taken.value.charCodeAt(c);
        if (code < 0x20 || code === 0x7f) {
          return { ok: false, code: OMP_C_INVALID_OPTION, message: "--query contains control characters" };
        }
      }
      query = taken.value;
      i = taken.next;
      continue;
    }
    if (arg === "--include-comments") {
      if (includeComments !== null) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --include-comments" };
      }
      includeComments = true;
      continue;
    }
    if (arg === "--comment-limit") {
      if (commentLimit !== null) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --comment-limit" };
      }
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--comment-limit requires a value" };
      }
      if (!/^[0-9]+$/.test(value)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--comment-limit must be an integer" };
      }
      const parsed = Number(value);
      if (parsed < MIN_GITHUB_COMMENT_LIMIT || parsed > MAX_GITHUB_COMMENT_LIMIT) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--comment-limit must be in 1..50" };
      }
      commentLimit = parsed;
      i += 1;
      continue;
    }
    if (arg === "--include-reviews") {
      if (includeReviews !== null) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --include-reviews" };
      }
      includeReviews = true;
      continue;
    }
    if (arg === "--review-limit") {
      if (reviewLimit !== null) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --review-limit" };
      }
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--review-limit requires a value" };
      }
      if (!/^[0-9]+$/.test(value)) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--review-limit must be an integer" };
      }
      const parsed = Number(value);
      if (parsed < MIN_GITHUB_REVIEW_LIMIT || parsed > MAX_GITHUB_REVIEW_LIMIT) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "--review-limit must be in 1..20" };
      }
      reviewLimit = parsed;
      i += 1;
      continue;
    }
    if (arg === "--include-review-comments") {
      if (includeReviewComments !== null) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --include-review-comments" };
      }
      includeReviewComments = true;
      continue;
    }
    if (arg === "--review-comment-limit") {
      if (reviewCommentLimit !== null) {
        return { ok: false, code: OMP_C_INVALID_OPTION, message: "duplicate --review-comment-limit" };
      }
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          code: OMP_C_INVALID_OPTION,
          message: "--review-comment-limit requires a value",
        };
      }
      if (!/^[0-9]+$/.test(value)) {
        return {
          ok: false,
          code: OMP_C_INVALID_OPTION,
          message: "--review-comment-limit must be an integer",
        };
      }
      const parsed = Number(value);
      if (parsed < MIN_GITHUB_REVIEW_COMMENT_LIMIT || parsed > MAX_GITHUB_REVIEW_COMMENT_LIMIT) {
        return {
          ok: false,
          code: OMP_C_INVALID_OPTION,
          message: "--review-comment-limit must be in 1..20",
        };
      }
      reviewCommentLimit = parsed;
      i += 1;
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
      if (parsed < GITHUB_MIN_LIMIT || parsed > GITHUB_MAX_LIMIT) {
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
  if (source !== null) result.source = source;
  if (state !== null) result.state = state;
  if (kind !== null) result.kind = kind;
  if (itemNumber !== null) result.number = itemNumber;
  if (query !== null) result.query = query;
  if (includeComments !== null) result.includeComments = includeComments;
  if (commentLimit !== null) result.commentLimit = commentLimit;
  if (includeReviews !== null) result.includeReviews = includeReviews;
  if (reviewLimit !== null) result.reviewLimit = reviewLimit;
  if (includeReviewComments !== null) result.includeReviewComments = includeReviewComments;
  if (reviewCommentLimit !== null) result.reviewCommentLimit = reviewCommentLimit;
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
