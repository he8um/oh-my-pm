// The CLI GitHub adapter: the presentation boundary for `ohmypm github …`.
//
// This module owns only CLI concerns — turning parsed CLI options into shared
// application input, choosing the output mode, routing stdout/stderr, and mapping
// outcomes to exit codes. The GitHub workflow itself (provider-configuration
// resolution, repository/limit/source validation, fail-closed ordering, transport
// construction, Runtime composition, and execution) belongs to the shared
// `@oh-my-pm/application` GitHub use case, composed here through the application
// Node boundary.
//
// It therefore composes no Kernel, Runtime, providers, skills, or Node transport
// of its own, and it never reads the token, the environment, or the clock
// directly: those live behind the injected Node dependency closures (see
// validate-boundaries).

import { formatCliError, formatRuntimeResponse } from "@oh-my-pm/application";
import { runGitHubProjectWorkflow } from "@oh-my-pm/application";
import type { GitHubWorkflowInput } from "@oh-my-pm/application";
import { createNodeGitHubProjectDeps } from "@oh-my-pm/application/node";
import type { NodeGitHubProjectDepsOptions } from "@oh-my-pm/application/node";
import type { CliOutputMode } from "@oh-my-pm/contracts";
import type {
  GitHubHttpTransport,
  GitHubSourceSelectionErrorCode,
  ResolvedProviderConfig,
} from "@oh-my-pm/providers";
import type { CliParseResult } from "./types.js";

/** The parsed `github` command variant, narrowed from the parser union. */
export type ParsedGitHubCommand = Extract<CliParseResult, { ok: true; command: "github" }>;

/** The generic CLI runtime-failure code, shared with runCli. */
export const OMP_C_RUNTIME_FAILED = "OMP-C-3003";

/**
 * Failure codes the shared use case resolves BEFORE any transport exists. These
 * are the CLI's "controlled" failures: they keep the historical plain-text
 * stderr prefixes and never render through formatCliError, so the operator sees
 * the same message v0.4/v0.5.1 produced.
 */
const CONFIG_FAILURE_CODE = "github_invalid_config";
const PROVIDER_FAILURE_CODES: ReadonlySet<string> = new Set([
  "github_provider_disabled",
  "github_invalid_repository",
  "github_invalid_limit",
]);
/**
 * The exhaustive set of source-selection rejection codes. Keyed by the provider
 * union type, so adding a selection code upstream fails this file at compile
 * time rather than silently downgrading a selection error to a runtime error.
 * Matching a bare `github_` prefix would be wrong: provider *execution* failures
 * can also carry github-prefixed codes and must render as runtime errors.
 */
const SELECTION_FAILURE_CODE_MAP: Readonly<Record<GitHubSourceSelectionErrorCode, true>> = {
  github_source_invalid: true,
  github_state_invalid: true,
  github_number_required: true,
  github_number_invalid: true,
  github_query_required: true,
  github_query_invalid: true,
  github_kind_invalid: true,
  github_option_not_applicable: true,
  github_comments_not_applicable: true,
  github_comment_limit_not_applicable: true,
  github_comment_limit_invalid: true,
  github_reviews_not_applicable: true,
  github_review_limit_not_applicable: true,
  github_review_limit_invalid: true,
  github_review_comments_not_applicable: true,
  github_review_comment_limit_not_applicable: true,
  github_review_comment_limit_invalid: true,
};
const SELECTION_FAILURE_CODES: ReadonlySet<string> = new Set(
  Object.keys(SELECTION_FAILURE_CODE_MAP),
);

/** Injected boundaries; every one of them defaults to the real process. */
export type GitHubCliProcessOptions = {
  version: string;
  /** Explicit invocation timestamp (tests). Takes precedence over `clock`. */
  now?: string;
  /** Real-clock accessor, read at most once and only after validation. */
  clock?: () => string;
  githubToken?: string;
  githubTransport?: GitHubHttpTransport;
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  cwd?: string;
  providerConfig?: ResolvedProviderConfig;
};

export type GitHubCliProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/** Map the parsed CLI command onto the shared application workflow input. */
function toWorkflowInput(parsed: ParsedGitHubCommand): GitHubWorkflowInput {
  return {
    ...(parsed.repository !== undefined ? { repository: parsed.repository } : {}),
    ...(parsed.source !== undefined ? { source: parsed.source } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed.number !== undefined ? { number: parsed.number } : {}),
    ...(parsed.query !== undefined ? { query: parsed.query } : {}),
    ...(parsed.kind !== undefined ? { kind: parsed.kind } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    ...(parsed.includeComments !== undefined ? { includeComments: parsed.includeComments } : {}),
    ...(parsed.commentLimit !== undefined ? { commentLimit: parsed.commentLimit } : {}),
    ...(parsed.includeReviews !== undefined ? { includeReviews: parsed.includeReviews } : {}),
    ...(parsed.reviewLimit !== undefined ? { reviewLimit: parsed.reviewLimit } : {}),
    ...(parsed.includeReviewComments !== undefined
      ? { includeReviewComments: parsed.includeReviewComments }
      : {}),
    ...(parsed.reviewCommentLimit !== undefined
      ? { reviewCommentLimit: parsed.reviewCommentLimit }
      : {}),
  };
}

/**
 * Execute one `github` CLI command.
 *
 * Exit codes and streams are preserved exactly:
 *   - invalid provider config → 2, `invalid provider config: <message>`
 *   - provider/repository/limit rejection → 2, `github provider: <message>`
 *   - source-selection rejection → 2, `github source: <message>`
 *   - runtime/provider failure → 2, formatCliError(code, message)
 *   - unexpected throw → 1, formatCliError(OMP_C_RUNTIME_FAILED, …)
 *   - success → 0, formatted response on stdout only
 */
export async function runGitHubCliCommand(
  parsed: ParsedGitHubCommand,
  outputMode: CliOutputMode,
  options: GitHubCliProcessOptions,
): Promise<GitHubCliProcessResult> {
  // The CLI is the only surface allowed to name an explicit provider-config path;
  // the Node boundary resolves it read-only. The token/transport/clock reads all
  // stay deferred inside these closures until validation has succeeded.
  const depsOptions: NodeGitHubProjectDepsOptions = {
    caller: "cli",
    version: options.version,
    ...(parsed.providerConfigPath !== undefined
      ? { providerConfigPath: parsed.providerConfigPath }
      : {}),
    ...(options.providerConfig !== undefined ? { providerConfig: options.providerConfig } : {}),
    ...(options.githubToken !== undefined ? { githubToken: options.githubToken } : {}),
    ...(options.githubTransport !== undefined ? { githubTransport: options.githubTransport } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.platform !== undefined ? { platform: options.platform } : {}),
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    now: nowAccessor(options),
  };

  let result;
  try {
    result = await runGitHubProjectWorkflow(
      parsed.operation,
      toWorkflowInput(parsed),
      createNodeGitHubProjectDeps(depsOptions),
    );
  } catch {
    // An unexpected throw is never a controlled failure: exit 1, sanitized.
    return {
      exitCode: 1,
      stdout: "",
      stderr: formatCliError(OMP_C_RUNTIME_FAILED, "runtime execution failed", outputMode),
    };
  }

  if (result.ok) {
    return { exitCode: 0, stdout: formatRuntimeResponse(result.response, outputMode), stderr: "" };
  }

  // Controlled, pre-transport failures keep their historical plain-text form.
  if (result.code === CONFIG_FAILURE_CODE) {
    return { exitCode: 2, stdout: "", stderr: `invalid provider config: ${result.message}\n` };
  }
  if (PROVIDER_FAILURE_CODES.has(result.code)) {
    return { exitCode: 2, stdout: "", stderr: `github provider: ${result.message}\n` };
  }
  if (SELECTION_FAILURE_CODES.has(result.code)) {
    return { exitCode: 2, stdout: "", stderr: `github source: ${result.message}\n` };
  }

  // A runtime/provider failure: sanitized code + message through the CLI error
  // formatter, on stderr only, with no partial stdout.
  return {
    exitCode: 2,
    stdout: "",
    stderr: formatCliError(result.code, result.message, outputMode),
  };
}

/**
 * The invocation-timestamp accessor. An explicit `now` wins, then the injected
 * real clock, then the deterministic fallback that keeps a missing clock from
 * silently reading wall time. Called at most once, only after validation.
 */
function nowAccessor(options: GitHubCliProcessOptions): () => string {
  if (options.now !== undefined) {
    const fixed = options.now;
    return () => fixed;
  }
  if (options.clock !== undefined) {
    const clock = options.clock;
    return () => clock();
  }
  return () => GITHUB_CLI_FALLBACK_NOW;
}

/**
 * Bug-guard fallback timestamp. The bin wrapper always injects a real clock for
 * the github command; this fixed value only prevents an unclocked call from
 * reading wall time inside the adapter.
 */
export const GITHUB_CLI_FALLBACK_NOW = "2026-01-01T00:00:00.000Z";
