import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";
import type {
  GitHubSearchKind,
  GitHubSourceMode,
  GitHubSourceState,
} from "@oh-my-pm/providers";

export type McpProjectOperation = "brief" | "risks" | "next" | "handoff";

export type McpProjectToolName =
  | "project_brief"
  | "project_risks"
  | "project_next"
  | "project_handoff";

export type McpProjectDocumentSummary = {
  filesScanned: number;
  filesMatched: number;
  filesExcluded: number;
  filesLoaded: number;
  totalBytes: number;
  configExists: boolean;
};

export type McpProjectToolSuccess = {
  ok: true;
  operation: McpProjectOperation;
  root: string;
  documents: McpProjectDocumentSummary;
  output: JsonValue;
  markdown: string;
  // Internal only: used by the runner tests and the server formatting step.
  // The MCP server layer must never expose this field to clients.
  runtimeResponse: RuntimeResponse;
};

export type McpProjectToolFailureCode =
  | "project_config_invalid"
  | "project_root_not_found"
  | "project_root_not_directory"
  | "project_documents_empty"
  | "project_runtime_failed"
  | "project_output_invalid";

export type McpProjectToolFailure = {
  ok: false;
  operation: McpProjectOperation;
  root: string;
  code: McpProjectToolFailureCode;
  message: string;
};

export type McpProjectToolExecution = McpProjectToolSuccess | McpProjectToolFailure;

// --- GitHub tool surface ---------------------------------------------------

export type McpGitHubOperation = "brief" | "risks" | "next" | "handoff";

export type McpGitHubToolName =
  | "github_project_brief"
  | "github_project_risks"
  | "github_project_next"
  | "github_project_handoff";

export type McpGitHubSourceSummary = {
  total: number;
  repositories: number;
  issues: number;
  pullRequests: number;
  comments: number;
};

/** Public comment metadata: identity and provenance only, never the body. */
export type McpGitHubComment = {
  id: string;
  author: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
};

export type McpGitHubSource = {
  type: "issue" | "pullRequest";
  number: number;
  title: string;
  state: string;
  url?: string;
  comments?: McpGitHubComment[];
};

/** Tool input carrying repository plus the source-selection fields. */
export type McpGitHubToolInput = {
  repository?: string;
  limit?: number;
  source?: GitHubSourceMode;
  state?: GitHubSourceState;
  number?: number;
  query?: string;
  kind?: GitHubSearchKind;
  includeComments?: boolean;
  commentLimit?: number;
};

/** Sanitized public projection of the resolved source selection. */
export type McpGitHubSelectionSummary = {
  mode: GitHubSourceMode;
  state?: string;
  kind?: string;
  number?: number;
  query?: string;
  limit?: number;
  includeComments?: boolean;
  commentLimit?: number;
};

export type McpGitHubToolSuccess = {
  ok: true;
  operation: McpGitHubOperation;
  repository: string;
  selection: McpGitHubSelectionSummary;
  sourceSummary: McpGitHubSourceSummary;
  sources: McpGitHubSource[];
  output: JsonValue;
  markdown: string;
};

export type McpGitHubToolFailure = {
  ok: false;
  operation: McpGitHubOperation;
  repository: string;
  code: string;
  message: string;
};

export type McpGitHubToolExecution = McpGitHubToolSuccess | McpGitHubToolFailure;

// --- Provider diagnostics tool surface -------------------------------------

export type McpDiagnosticsToolName = "provider_status" | "github_provider_diagnostics";
