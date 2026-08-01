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
  createNodeGitHubHttpTransport,
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
import { createGitHubRuntimeRequest } from "./request.js";
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
  | "github_output_invalid";

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
   * Resolves provider configuration. Returns a null config with a sanitized
   * message when a present configuration is invalid. Injected so the core
   * surface stays Node-free; `@oh-my-pm/application/node` supplies the real
   * read-only loader.
   */
  resolveProviderConfig: () => { config: ResolvedProviderConfig | null; message?: string };
  /** Injected transport; when omitted a real Node HTTPS transport is built. */
  transport?: GitHubHttpTransport;
  /** Optional token used only to build the transport. Never returned. */
  token?: string;
  /**
   * Resolves the invocation timestamp exactly once, at the caller's explicit
   * boundary. Overdue classification uses this value.
   */
  now: () => string;
  /** Runtime identity reported in responses. */
  version: string;
  /** Runtime factory override for offline tests. */
  createRuntime?: (transport: GitHubHttpTransport, now: string) => Runtime;
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

  // Only now: build the transport (optionally with a token) and read the clock.
  const transport =
    deps.transport ??
    createNodeGitHubHttpTransport({
      ...(deps.token !== undefined ? { token: deps.token } : {}),
      productVersion: deps.version,
    });
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
    createGitHubRuntimeRequest({ operation, repository, selection, caller: "mcp" }),
  );

  if (!response.ok) {
    const code =
      isRecord(response.data) && typeof response.data["providerCode"] === "string"
        ? response.data["providerCode"]
        : (response.error?.code ?? "github_runtime_failed");
    return {
      ok: false,
      operation,
      repository,
      code,
      message: response.error?.message ?? "runtime execution failed",
    };
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
