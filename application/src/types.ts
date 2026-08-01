// Shared application-layer types.
//
// Presentation-neutral: nothing here names an executable, an MCP tool, a
// terminal output mode, or a process exit code. Pure type declarations only —
// no filesystem, environment, clock, or network access.

import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";

/**
 * The four read-only project workflows, shared by the local and GitHub-backed
 * surfaces. `brief` summarizes status, `risks` reviews risks, `next` derives
 * next tasks, and `handoff` creates a handoff.
 */
export type ProjectWorkflowOperation = "brief" | "risks" | "next" | "handoff";

/**
 * Commands dispatched directly to the Runtime. The four project workflows plus
 * the two runtime-identity commands and the free-form planning command.
 */
export type RuntimeWorkflowCommand = "status" | "doctor" | "plan" | ProjectWorkflowOperation;

/** Bounded counters describing a completed local document load. */
export type ProjectDocumentSummary = {
  readonly filesScanned: number;
  readonly filesMatched: number;
  readonly filesExcluded: number;
  readonly filesLoaded: number;
  readonly totalBytes: number;
  /** Whether `<root>/oh-my-pm.config.json` was present. */
  readonly configExists: boolean;
};

/**
 * A successful project workflow result. Carries the structured Runtime output
 * and the full response so a presentation adapter can render brief, JSON, or
 * Markdown without re-running the workflow. Never carries a resolved absolute
 * path or raw document content.
 */
export type ProjectWorkflowSuccess = {
  readonly ok: true;
  readonly operation: ProjectWorkflowOperation;
  /** The project root exactly as the caller supplied it, never resolved. */
  readonly root: string;
  readonly documents: ProjectDocumentSummary;
  readonly output: JsonValue;
  readonly response: RuntimeResponse;
};

/** Sanitized failure codes for the local project workflows. */
export type ProjectWorkflowErrorCode =
  | "project_root_not_found"
  | "project_root_not_directory"
  | "project_config_invalid"
  | "project_documents_empty"
  | "project_runtime_failed"
  | "project_output_invalid";

/**
 * A failed project workflow. The message is already sanitized: it may name the
 * caller-supplied root but never a resolved absolute path, document content,
 * configuration text, or a token.
 */
export type ProjectWorkflowFailure = {
  readonly ok: false;
  readonly operation: ProjectWorkflowOperation;
  readonly root: string;
  readonly code: ProjectWorkflowErrorCode;
  readonly message: string;
};

export type ProjectWorkflowResult = ProjectWorkflowSuccess | ProjectWorkflowFailure;
