// GitHub-backed project workflow use cases.
//
// The shared read-only GitHub pipeline: provider-configuration resolution,
// strict repository/limit resolution, source-selection resolution, transport
// construction, and Runtime composition. Every failure is a structured value
// resolved BEFORE any transport is built, so a misconfigured call never reaches
// the network.
//
// The provider is read-only by construction: GET requests to a fixed origin.
// This module never mutates a GitHub resource, never logs, and never returns a
// token, header, or raw response body.

import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import {
  createGitHubProvider,
  createProviderRegistry,
  resolveGitHubProviderSettings,
  resolveGitHubSourceSelection,
} from "@oh-my-pm/providers";
import type {
  GitHubHttpTransport,
  GitHubSearchKind,
  GitHubSourceMode,
  GitHubSourceSelection,
  GitHubSourceState,
  ResolvedProviderConfig,
} from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import type { Runtime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { isCancelled } from "./execution-context.js";
import type { ExecutionContext } from "./execution-context.js";
import { createGitHubRuntimeRequest } from "./request.js";
import { applicationResult } from "./result.js";
import type { ApplicationResult, SourceDescriptor } from "./result.js";
import { diagnosticForCode } from "./taxonomy.js";
import type { ProjectWorkflowOperation } from "./types.js";

/** Bounded source/selection options a caller may supply. */
export type GitHubWorkflowInput = {
  repository?: string;
  source?: GitHubSourceMode;
  state?: GitHubSourceState;
  number?: number;
  query?: string;
  kind?: GitHubSearchKind;
  limit?: number;
  includeComments?: boolean;
  commentLimit?: number;
  includeReviews?: boolean;
  reviewLimit?: number;
  includeReviewComments?: boolean;
  reviewCommentLimit?: number;
};

/** Sanitized failure codes for the GitHub workflows. */
export type GitHubWorkflowErrorCode =
  | "github_invalid_config"
  | "github_provider_disabled"
  | "github_invalid_repository"
  | "github_invalid_limit"
  | "github_invalid_selection"
  | "github_runtime_failed"
  | "github_output_invalid"
  /**
   * The caller cancelled through the execution context signal. Only the GitHub
   * family can emit this: it is the one workflow with remote, potentially
   * long-running work. A cancelled run is always a controlled failure and never
   * a partial result reported as success.
   */
  | "github_cancelled";

export type GitHubWorkflowFailure = {
  readonly ok: false;
  readonly operation: ProjectWorkflowOperation;
  /** The resolved repository when known, else the caller-supplied value. */
  readonly repository: string;
  readonly code: string;
  readonly message: string;
};

export type GitHubWorkflowSuccess = {
  readonly ok: true;
  readonly operation: ProjectWorkflowOperation;
  readonly repository: string;
  readonly selection: GitHubSourceSelection;
  readonly output: JsonValue;
  readonly response: RuntimeResponse;
  /** The invocation timestamp actually used for overdue classification. */
  readonly now: string;
};

export type GitHubWorkflowResult = GitHubWorkflowSuccess | GitHubWorkflowFailure;

export type GitHubProjectDeps = {
  /**
   * Which presentation adapter is calling. Preserved into the Runtime request
   * identity (`<caller>-github-<operation>`) and the payload source, so the CLI
   * and MCP surfaces stay observably distinct. Never defaulted here: a hardcoded
   * caller would silently mislabel one of the two surfaces.
   */
  caller: "cli" | "mcp";
  /**
   * Resolves provider configuration. Returns a null config with a sanitized
   * message when a present configuration is invalid. Injected so the core
   * surface stays Node-free; `@oh-my-pm/application/node` supplies the real
   * read-only loader.
   */
  resolveProviderConfig: () => { config: ResolvedProviderConfig | null; message?: string };
  /**
   * Builds the GitHub transport. Called at most once, and only after provider
   * configuration, repository, limit, and source selection have all validated,
   * so a controlled failure never reads a token nor opens a transport. The Node
   * boundary (`@oh-my-pm/application/node`) supplies the real factory, which is
   * also where the optional token environment read happens — lazily, inside this
   * closure. This core module never constructs a Node transport itself.
   */
  createTransport: () => GitHubHttpTransport;
  /**
   * Resolves the invocation timestamp exactly once, at the caller's explicit
   * boundary, and only after validation succeeds. Overdue classification uses
   * this value.
   */
  now: () => string;
  /** Runtime identity reported in responses. */
  version: string;
  /** Runtime factory override for offline tests. */
  createRuntime?: (transport: GitHubHttpTransport, now: string) => Runtime;
  /**
   * Optional execution context, carrying the correlation id and the
   * cancellation signal.
   *
   * Optional rather than required: every existing caller predates it, and
   * making it mandatory would be a breaking change to the use case signature
   * for no behavioural gain. Absent means "no cancellation", which is exactly
   * the current behaviour.
   *
   * The clock stays in `now` above rather than moving to `context.now`. The
   * GitHub family resolves its timestamp once, at a specific point after
   * validation, and that ordering is a safety property; folding it into the
   * context would invite a caller to read the clock somewhere else.
   */
  context?: ExecutionContext;
};

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractOutput(response: RuntimeResponse): JsonValue | undefined {
  if (!isRecord(response.data)) return undefined;
  const output = response.data["output"];
  return output === undefined ? undefined : output;
}

/**
 * Execute one read-only GitHub project workflow.
 *
 * Ordering is a safety property, not an implementation detail: configuration,
 * repository, and selection all resolve before a token is read or a transport
 * is constructed, so every controlled failure is offline.
 */
export async function runGitHubProjectWorkflow(
  operation: ProjectWorkflowOperation,
  input: GitHubWorkflowInput,
  deps: GitHubProjectDeps,
): Promise<GitHubWorkflowResult> {
  const requestedRepository = input.repository ?? "";

  // 1. Provider configuration. An invalid present config fails closed here.
  const resolved = deps.resolveProviderConfig();
  if (resolved.config === null) {
    return {
      ok: false,
      operation,
      repository: requestedRepository,
      code: "github_invalid_config",
      message: resolved.message ?? "provider configuration is invalid",
    };
  }

  // 2. Effective repository and limit. A disabled provider or unresolved
  // repository fails here, still before any transport exists.
  const settings = resolveGitHubProviderSettings({
    config: resolved.config,
    overrides: {
      ...(input.repository !== undefined ? { repository: input.repository } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    },
  });
  if (!settings.ok) {
    const code =
      settings.code === "github_provider_disabled"
        ? "github_provider_disabled"
        : settings.code === "github_limit_invalid"
          ? "github_invalid_limit"
          : "github_invalid_repository";
    return {
      ok: false,
      operation,
      repository: requestedRepository,
      code,
      message: settings.message,
    };
  }
  const repository = settings.repository;

  // 3. Source selection from configured defaults plus explicit overrides.
  const selectionResult = resolveGitHubSourceSelection({
    defaults: {
      source: settings.defaultSource,
      state: settings.defaultState,
      limit: settings.limit,
    },
    overrides: {
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.query !== undefined ? { query: input.query } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.includeComments !== undefined ? { includeComments: input.includeComments } : {}),
      ...(input.commentLimit !== undefined ? { commentLimit: input.commentLimit } : {}),
      ...(input.includeReviews !== undefined ? { includeReviews: input.includeReviews } : {}),
      ...(input.reviewLimit !== undefined ? { reviewLimit: input.reviewLimit } : {}),
      ...(input.includeReviewComments !== undefined
        ? { includeReviewComments: input.includeReviewComments }
        : {}),
      ...(input.reviewCommentLimit !== undefined
        ? { reviewCommentLimit: input.reviewCommentLimit }
        : {}),
    },
  });
  if (!selectionResult.ok) {
    return {
      ok: false,
      operation,
      repository,
      code: selectionResult.code,
      message: selectionResult.message,
    };
  }
  const selection = selectionResult.selection;

  // Cancellation is checked here, at the last offline point: every controlled
  // input is validated but no transport exists and no request has been sent.
  // Cancelling before this line costs nothing; cancelling after it is checked
  // again below, once the remote work has completed.
  if (isCancelled(deps.context)) {
    return {
      ok: false,
      operation,
      repository,
      code: "github_cancelled",
      message: "operation was cancelled before the GitHub request was sent",
    };
  }

  // Only now, with every controlled input validated: build the transport (the
  // token read happens lazily inside this factory) and read the clock exactly
  // once. Everything above this line is offline by construction.
  const transport = deps.createTransport();
  const now = deps.now();

  const runtime =
    deps.createRuntime?.(transport, now) ??
    createRuntime({
      kernel: createNodeWasmKernelApi(),
      providers: createProviderRegistry([
        createGitHubProvider({ transport, productVersion: deps.version }),
      ]),
      skills: createDefaultSkillRegistry(),
      version: deps.version,
      now,
    });

  const response = await runtime.handle(
    createGitHubRuntimeRequest({ operation, repository, selection, caller: deps.caller }),
  );

  if (!response.ok) {
    const code =
      isRecord(response.data) && typeof response.data["providerCode"] === "string"
        ? response.data["providerCode"]
        : (response.error?.code ?? "github_runtime_failed");
    // The sanitized provider message, when present, is more specific than the
    // generic runtime error; both adapters surface it in preference.
    const message =
      isRecord(response.data) && typeof response.data["message"] === "string"
        ? response.data["message"]
        : (response.error?.message ?? "runtime execution failed");
    return { ok: false, operation, repository, code, message };
  }

  const output = extractOutput(response);
  if (output === undefined) {
    return {
      ok: false,
      operation,
      repository,
      code: "github_output_invalid",
      message: "runtime response did not include a tool output",
    };
  }

  // Checked again after the remote work: a caller that cancelled while the
  // request was in flight must not receive data it asked us to stop fetching.
  // Reporting the already-fetched payload as a success would make cancellation
  // silently meaningless, so a late cancellation is still a controlled failure.
  //
  // Read through `isCancelled` rather than inline: `AbortSignal.aborted` is a
  // readonly boolean, so narrowing from the pre-flight check above would
  // otherwise carry across the await and type this as an impossible
  // comparison -- when a flip DURING the await is exactly what it guards.
  if (isCancelled(deps.context)) {
    return {
      ok: false,
      operation,
      repository,
      code: "github_cancelled",
      message: "operation was cancelled while the GitHub request was in flight",
    };
  }

  return { ok: true, operation, repository, selection, output, response, now };
}

/** Read-only status brief for a GitHub repository. */
export function getGitHubProjectBrief(
  input: GitHubWorkflowInput,
  deps: GitHubProjectDeps,
): Promise<GitHubWorkflowResult> {
  return runGitHubProjectWorkflow("brief", input, deps);
}

/** Read-only risk review for a GitHub repository. */
export function getGitHubProjectRisks(
  input: GitHubWorkflowInput,
  deps: GitHubProjectDeps,
): Promise<GitHubWorkflowResult> {
  return runGitHubProjectWorkflow("risks", input, deps);
}

/** Read-only derived next actions for a GitHub repository. */
export function getGitHubProjectNextActions(
  input: GitHubWorkflowInput,
  deps: GitHubProjectDeps,
): Promise<GitHubWorkflowResult> {
  return runGitHubProjectWorkflow("next", input, deps);
}

/** Read-only handoff for a GitHub repository. */
export function getGitHubProjectHandoff(
  input: GitHubWorkflowInput,
  deps: GitHubProjectDeps,
): Promise<GitHubWorkflowResult> {
  return runGitHubProjectWorkflow("handoff", input, deps);
}

// ---------------------------------------------------------------------------
// The application-boundary envelope.
// ---------------------------------------------------------------------------

/**
 * The semantic payload of a successful GitHub workflow.
 *
 * Deliberately NOT the whole `GitHubWorkflowSuccess`. The raw `RuntimeResponse`
 * stays out of the envelope: it is a transport-shaped object owned by the
 * runtime, and putting it in a result that both surfaces serialize would make
 * an internal shape part of the public contract. Adapters that still need it
 * keep calling `runGitHubProjectWorkflow` directly.
 */
export type GitHubWorkflowData = {
  readonly operation: ProjectWorkflowOperation;
  readonly repository: string;
  readonly selection: GitHubSourceSelection;
  readonly output: JsonValue;
};

/**
 * The source kind implied by a resolved selection mode.
 *
 * Exhaustive over `GitHubSourceSelection`: the compiler rejects a new mode that
 * is not classified here, so adding one cannot silently fall back to
 * `github-repository` and mislabel the source.
 */
function githubSourceKind(selection: GitHubSourceSelection): SourceDescriptor["kind"] {
  switch (selection.mode) {
    case "issues":
      return "github-issues";
    case "pull-requests":
      return "github-pull-requests";
    case "item":
      return "github-item";
    case "search":
      return "github-search";
    case "overview":
    case "repository":
      return "github-repository";
  }
}

/**
 * Bounded, JSON-safe selection metadata for the source descriptor.
 *
 * Only scalars a reader needs to understand WHAT was selected. The free-text
 * search `query` is deliberately omitted: it is caller-supplied text of up to
 * GITHUB_SOURCE_QUERY_MAX characters, and echoing it into a descriptor that
 * both surfaces serialize would widen what a result can carry for no
 * identification benefit -- `kind` and `limit` already describe the search.
 *
 * Written per-variant rather than with optional property reads, because the
 * selection is a discriminated union: `state` and `limit` genuinely do not
 * exist on the `repository` and `item` variants.
 */
function githubSelectionMetadata(
  selection: GitHubSourceSelection,
): Readonly<Record<string, string | number | boolean>> {
  switch (selection.mode) {
    case "overview":
    case "issues":
    case "pull-requests":
      return { mode: selection.mode, state: selection.state, limit: selection.limit };
    case "search":
      return {
        mode: selection.mode,
        state: selection.state,
        kind: selection.kind,
        limit: selection.limit,
      };
    case "item":
      return { mode: selection.mode, number: selection.number };
    case "repository":
      return { mode: selection.mode };
  }
}

/**
 * Execute a GitHub workflow and describe it as an `ApplicationResult`.
 *
 * This is the boundary-facing entry point. It wraps
 * `runGitHubProjectWorkflow` rather than replacing it: the discriminated result
 * is still what the CLI and MCP adapters consume today, and changing that
 * signature would be a public contract change for no gain. Both therefore
 * describe the SAME execution -- there is no second pipeline to drift.
 *
 * A failure is an envelope too, not a thrown error: `data` is null and the
 * failure is carried as a diagnostic whose code is the same stable public code
 * the discriminated result would have returned.
 */
export async function runGitHubProjectApplication(
  operation: ProjectWorkflowOperation,
  input: GitHubWorkflowInput,
  deps: GitHubProjectDeps,
  context: ExecutionContext,
): Promise<ApplicationResult<GitHubWorkflowData | null>> {
  const result = await runGitHubProjectWorkflow(operation, input, {
    ...deps,
    context,
  });

  // `generatedAt` comes from the injected context clock, never from the
  // workflow's own `now`: the two answer different questions. The workflow's
  // `now` is the instant overdue classification was computed against and is
  // part of the semantic payload; `generatedAt` is when this envelope was
  // built, and it is what determinism tests pin.
  const generated = context.now().toISOString();

  if (!result.ok) {
    const source: SourceDescriptor = {
      kind: "github-repository",
      // The repository as resolved when known, else exactly what the caller
      // supplied. Never a resolved path, never a URL.
      reference: result.repository,
    };
    return applicationResult<GitHubWorkflowData | null>({
      operation: `github.${operation}`,
      generatedAt: generated,
      source,
      data: null,
      diagnostics: [diagnosticForCode(result.code, result.message)],
    });
  }

  const source: SourceDescriptor = {
    kind: githubSourceKind(result.selection),
    reference: result.repository,
    // A single addressed item has a stable identity of its own; the descriptor
    // exposes it as `identifier` so a consumer can key on it without parsing
    // the selection metadata.
    ...(result.selection.mode === "item" ? { identifier: String(result.selection.number) } : {}),
    selection: githubSelectionMetadata(result.selection),
  };

  return applicationResult<GitHubWorkflowData>({
    operation: `github.${operation}`,
    generatedAt: generated,
    source,
    data: {
      operation: result.operation,
      repository: result.repository,
      selection: result.selection,
      output: result.output,
    },
  });
}
