import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";
import { formatRuntimeResponse, runGitHubProjectWorkflow } from "@oh-my-pm/application";
import type { GitHubWorkflowInput } from "@oh-my-pm/application";
import { createNodeGitHubProjectDeps } from "@oh-my-pm/application/node";
import type { NodeGitHubProjectDepsOptions } from "@oh-my-pm/application/node";
import type {
  GitHubHttpTransport,
  GitHubSourceSelection,
  ResolvedProviderConfig,
} from "@oh-my-pm/providers";
import type {
  McpGitHubOperation,
  McpGitHubSelectionSummary,
  McpGitHubToolExecution,
  McpGitHubToolInput,
  McpGitHubToolName,
} from "./types.js";
import { OH_MY_PM_MCP_VERSION } from "./version.js";

// Deterministic runtime identity for the GitHub MCP surface, derived from the
// package's single canonical version. The live github tools resolve the
// invocation timestamp once at the tool-call boundary; the fixed value below is
// an explicitly named test fixture only, never the production default. Overdue
// classification uses the resolved invocation time.
export const MCP_GITHUB_RUNTIME_VERSION = OH_MY_PM_MCP_VERSION;
/** Fixed timestamp for deterministic tests only; not a production default. */
export const MCP_GITHUB_TEST_NOW = "2026-01-01T00:00:00.000Z";
export const MCP_GITHUB_DEFAULT_LIMIT = 50;

const OPERATION_TO_TOOL: Readonly<Record<McpGitHubOperation, McpGitHubToolName>> = {
  brief: "github_project_brief",
  risks: "github_project_risks",
  next: "github_project_next",
  handoff: "github_project_handoff",
};

const TOOL_TO_OPERATION: Readonly<Record<McpGitHubToolName, McpGitHubOperation>> = {
  github_project_brief: "brief",
  github_project_risks: "risks",
  github_project_next: "next",
  github_project_handoff: "handoff",
};

export function toolNameForGitHubOperation(operation: McpGitHubOperation): McpGitHubToolName {
  return OPERATION_TO_TOOL[operation];
}

export function githubOperationForToolName(toolName: McpGitHubToolName): McpGitHubOperation {
  return TOOL_TO_OPERATION[toolName];
}

export type ExecuteMcpGitHubToolOptions = {
  /** Injected transport wins so tests stay offline. */
  transport?: GitHubHttpTransport;
  /** Injected token; when omitted the ambient environment is read. */
  token?: string;
  env?: Readonly<Record<string, string | undefined>>;
  /** Injected platform for provider-config resolution (defaults to process). */
  platform?: NodeJS.Platform;
  /** Injected cwd for relative provider-config paths (defaults to process). */
  cwd?: string;
  /**
   * Directly injected provider configuration. When set it takes precedence and
   * no provider-config file is read; used by offline unit tests.
   */
  providerConfig?: ResolvedProviderConfig;
  /**
   * Explicit invocation timestamp for deterministic tests. Takes precedence
   * over `clock`. When neither is set, the runner reads the real clock once at
   * the tool-call boundary.
   */
  now?: string;
  /** Injected real-clock accessor; read at most once per tool call. */
  clock?: () => string;
};

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Output extraction, the ambient environment/platform/cwd reads, and the
// transport/Runtime composition all moved behind the shared application use case
// and its Node boundary. This adapter no longer consults the ambient process.

/** Map the bounded MCP tool input onto the shared application workflow input. */
function toWorkflowInput(input: McpGitHubToolInput): GitHubWorkflowInput {
  return {
    ...(input.repository !== undefined ? { repository: input.repository } : {}),
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
  };
}

/**
 * Compose the Node dependency options for a GitHub MCP tool call.
 *
 * Deliberately never sets `providerConfigPath`: an agent must not be able to
 * point the server at an arbitrary configuration file, so the read-only loader
 * only ever resolves the environment/OS-standard location. A directly injected
 * `providerConfig` still wins for offline unit tests. The token, transport, and
 * clock reads all stay deferred inside the composed closures until the shared use
 * case has validated every controlled input.
 */
function nodeDepsOptions(
  options: ExecuteMcpGitHubToolOptions | undefined,
): NodeGitHubProjectDepsOptions {
  return {
    caller: "mcp",
    version: MCP_GITHUB_RUNTIME_VERSION,
    ...(options?.providerConfig !== undefined ? { providerConfig: options.providerConfig } : {}),
    ...(options?.transport !== undefined ? { githubTransport: options.transport } : {}),
    ...(options?.token !== undefined ? { githubToken: options.token } : {}),
    ...(options?.env !== undefined ? { env: options.env } : {}),
    ...(options?.platform !== undefined ? { platform: options.platform } : {}),
    ...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
    now: mcpNowAccessor(options),
  };
}

/**
 * The invocation-timestamp accessor: an explicit `now`, then an injected
 * `clock`, then the real clock — read at most once per tool call, and only after
 * validation succeeds. Overdue classification uses this value.
 */
function mcpNowAccessor(options: ExecuteMcpGitHubToolOptions | undefined): () => string {
  const fixed = options?.now;
  if (fixed !== undefined) return () => fixed;
  const clock = options?.clock;
  if (clock !== undefined) return () => clock();
  return () => new Date().toISOString();
}

/** Public comment metadata: identity and provenance only, never the body. */
export type McpGitHubComment = {
  id: string;
  author: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
};

/** Public review metadata: identity/state/provenance only, never the body. */
export type McpGitHubReview = {
  id: string;
  author: string;
  state: "approved" | "changesRequested" | "commented" | "dismissed" | "pending" | "unknown";
  submittedAt?: string;
  url?: string;
};

/** Public review-comment metadata: identity/provenance only, never the body. */
export type McpGitHubReviewComment = {
  id: string;
  author: string;
  filePath?: string;
  line?: number;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
};

/** Sanitized public source list from the normalized provider responses. */
export type McpGitHubSource = {
  type: "issue" | "pullRequest";
  number: number;
  title: string;
  state: string;
  url?: string;
  comments?: McpGitHubComment[];
  reviews?: McpGitHubReview[];
  reviewComments?: McpGitHubReviewComment[];
};

export type McpGitHubSourceSummary = {
  total: number;
  repositories: number;
  issues: number;
  pullRequests: number;
  comments: number;
  reviews: number;
  reviewComments: number;
};

const REVIEW_STATES = new Set([
  "approved",
  "changesRequested",
  "commented",
  "dismissed",
  "pending",
  "unknown",
]);

function reviewStateOf(value: unknown): McpGitHubReview["state"] {
  return typeof value === "string" && REVIEW_STATES.has(value)
    ? (value as McpGitHubReview["state"])
    : "unknown";
}

function projectSources(response: RuntimeResponse): {
  summary: McpGitHubSourceSummary;
  sources: McpGitHubSource[];
} {
  const summary: McpGitHubSourceSummary = {
    total: 0,
    repositories: 0,
    issues: 0,
    pullRequests: 0,
    comments: 0,
    reviews: 0,
    reviewComments: 0,
  };
  const sources: McpGitHubSource[] = [];
  // Discussion metadata is attached to its parent issue/PR source, matched by the
  // parent number. Only identity/provenance is projected — never the body.
  const commentsByParent = new Map<number, McpGitHubComment[]>();
  const reviewsByParent = new Map<number, McpGitHubReview[]>();
  const reviewCommentsByParent = new Map<number, McpGitHubReviewComment[]>();
  if (!isRecord(response.data)) return { summary, sources };
  const providerResponses = response.data["providerResponses"];
  if (!Array.isArray(providerResponses)) return { summary, sources };
  for (const providerResponse of providerResponses) {
    if (!isRecord(providerResponse) || !Array.isArray(providerResponse["items"])) continue;
    for (const item of providerResponse["items"]) {
      if (!isRecord(item)) continue;
      const type = item["type"];
      const data = isRecord(item["data"]) ? item["data"] : {};
      // Item conversation comment: counted separately and attached to a parent;
      // never counted as a top-level source and never exposing its body.
      if (type === "note" && data["kind"] === "issueComment") {
        summary.comments += 1;
        const parentNumber = data["parentNumber"];
        if (typeof parentNumber !== "number") continue;
        const idValue = item["id"];
        const authorValue = data["author"];
        const comment: McpGitHubComment = {
          id: typeof idValue === "string" ? idValue : "",
          author: typeof authorValue === "string" ? authorValue : "",
        };
        const createdAt = data["createdAt"];
        if (typeof createdAt === "string") comment.createdAt = createdAt;
        const updatedAt = data["updatedAt"];
        if (typeof updatedAt === "string") comment.updatedAt = updatedAt;
        const urlValue = item["url"];
        if (typeof urlValue === "string") comment.url = urlValue;
        const bucket = commentsByParent.get(parentNumber) ?? [];
        bucket.push(comment);
        commentsByParent.set(parentNumber, bucket);
        continue;
      }
      // Pull-request review submission: counted separately and attached to a
      // parent; never a top-level source and never exposing its body.
      if (type === "note" && data["kind"] === "pullRequestReview") {
        summary.reviews += 1;
        const parentNumber = data["parentNumber"];
        if (typeof parentNumber !== "number") continue;
        const idValue = item["id"];
        const authorValue = data["author"];
        const review: McpGitHubReview = {
          id: typeof idValue === "string" ? idValue : "",
          author: typeof authorValue === "string" ? authorValue : "",
          state: reviewStateOf(data["reviewState"]),
        };
        const submittedAt = data["submittedAt"];
        if (typeof submittedAt === "string") review.submittedAt = submittedAt;
        const urlValue = item["url"];
        if (typeof urlValue === "string") review.url = urlValue;
        const bucket = reviewsByParent.get(parentNumber) ?? [];
        bucket.push(review);
        reviewsByParent.set(parentNumber, bucket);
        continue;
      }
      // Inline pull-request review comment: counted separately and attached to a
      // parent; never a top-level source and never exposing its body/diff hunk.
      if (type === "note" && data["kind"] === "pullRequestReviewComment") {
        summary.reviewComments += 1;
        const parentNumber = data["parentNumber"];
        if (typeof parentNumber !== "number") continue;
        const idValue = item["id"];
        const authorValue = data["author"];
        const reviewComment: McpGitHubReviewComment = {
          id: typeof idValue === "string" ? idValue : "",
          author: typeof authorValue === "string" ? authorValue : "",
        };
        const filePath = data["filePath"];
        if (typeof filePath === "string") reviewComment.filePath = filePath;
        const line = data["line"];
        if (typeof line === "number") reviewComment.line = line;
        const createdAt = data["createdAt"];
        if (typeof createdAt === "string") reviewComment.createdAt = createdAt;
        const updatedAt = data["updatedAt"];
        if (typeof updatedAt === "string") reviewComment.updatedAt = updatedAt;
        const urlValue = item["url"];
        if (typeof urlValue === "string") reviewComment.url = urlValue;
        const bucket = reviewCommentsByParent.get(parentNumber) ?? [];
        bucket.push(reviewComment);
        reviewCommentsByParent.set(parentNumber, bucket);
        continue;
      }
      summary.total += 1;
      if (type === "record") {
        summary.repositories += 1;
        continue;
      }
      if (type !== "issue" && type !== "pullRequest") continue;
      if (type === "issue") summary.issues += 1;
      else summary.pullRequests += 1;
      const number = data["number"];
      const status = data["status"];
      const titleValue = item["title"];
      const urlValue = item["url"];
      const source: McpGitHubSource = {
        type,
        number: typeof number === "number" ? number : 0,
        title: typeof titleValue === "string" ? titleValue : "",
        state: typeof status === "string" ? status : "",
      };
      if (typeof urlValue === "string") source.url = urlValue;
      sources.push(source);
    }
  }
  // Attach bounded discussion metadata to matching parent sources: comments
  // (max 50), reviews (max 20), review comments (max 20).
  for (const source of sources) {
    const comments = commentsByParent.get(source.number);
    if (comments !== undefined && comments.length > 0) {
      source.comments = comments.slice(0, 50);
    }
    const reviews = reviewsByParent.get(source.number);
    if (reviews !== undefined && reviews.length > 0) {
      source.reviews = reviews.slice(0, 20);
    }
    const reviewComments = reviewCommentsByParent.get(source.number);
    if (reviewComments !== undefined && reviewComments.length > 0) {
      source.reviewComments = reviewComments.slice(0, 20);
    }
  }
  return { summary, sources };
}

/**
 * Execute one read-only GitHub workflow through the shared pipeline: strict
 * repository validation, the shared CLI GitHub request factory, and the real
 * WASM Kernel. The transport is injected (offline tests) or constructed for the
 * live call with an optional token read only here, at the tool-call boundary.
 * Returns a sanitized public projection: never a token, header, raw body, raw
 * provider response, planner input, task graph, or Runtime trace.
 */
export async function executeMcpGitHubTool(
  operation: McpGitHubOperation,
  input: McpGitHubToolInput,
  options?: ExecuteMcpGitHubToolOptions,
): Promise<McpGitHubToolExecution> {
  // The whole GitHub pipeline — provider-configuration resolution, repository and
  // limit validation, source selection, fail-closed ordering, transport creation,
  // Runtime composition, and execution — is the shared application use case. This
  // adapter contributes only the MCP-specific parts: the agent-safe dependency
  // options (no arbitrary config path), and the sanitized public projection below.
  const result = await runGitHubProjectWorkflow(
    operation,
    toWorkflowInput(input),
    createNodeGitHubProjectDeps(nodeDepsOptions(options)),
  );

  if (!result.ok) {
    return {
      ok: false,
      operation,
      repository: result.repository,
      code: result.code,
      message: result.message,
    };
  }

  const { response, selection, repository: resolvedRepository, output } = result;
  const { summary, sources } = projectSources(response);
  const markdown = formatRuntimeResponse(response, "markdown");
  // Bound the public source list by the selection's effective limit (item and
  // repository selections are single-item; overview/issues/PR/search use limit).
  const sourceCap =
    selection.mode === "item" || selection.mode === "repository" ? 1 : selection.limit;

  return {
    ok: true,
    operation,
    repository: resolvedRepository,
    selection: publicSelection(selection),
    sourceSummary: summary,
    sources: sources.slice(0, sourceCap),
    output,
    markdown,
  };
}

/** Project a resolved selection to the sanitized public summary. */
export function publicSelection(selection: GitHubSourceSelection): McpGitHubSelectionSummary {
  switch (selection.mode) {
    case "overview":
    case "issues":
    case "pull-requests":
      return { mode: selection.mode, state: selection.state, limit: selection.limit };
    case "repository":
      return { mode: "repository" };
    case "item": {
      const summary: McpGitHubSelectionSummary = {
        mode: "item",
        number: selection.number,
        includeComments: selection.includeComments,
        includeReviews: selection.includeReviews,
        includeReviewComments: selection.includeReviewComments,
      };
      if (selection.includeComments) summary.commentLimit = selection.commentLimit;
      if (selection.includeReviews) summary.reviewLimit = selection.reviewLimit;
      if (selection.includeReviewComments)
        summary.reviewCommentLimit = selection.reviewCommentLimit;
      return summary;
    }
    case "search":
      return {
        mode: "search",
        state: selection.state,
        kind: selection.kind,
        query: selection.query,
        limit: selection.limit,
      };
  }
}
