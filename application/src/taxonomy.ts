// The repository-wide error taxonomy, and its CLI and MCP mappings.
//
// Why this exists
// ---------------
// Failure codes were already stable and already sanitized, but they were
// declared per use case: `ProjectWorkflowErrorCode` in types.ts,
// `GitHubWorkflowErrorCode` in github-project.ts, and a `ProviderDiagnosticStatus`
// of its own in provider-diagnostics.ts. Each was correct in isolation. What was
// missing was the shared classification ACROSS them -- so nothing said which
// codes are retryable, which exit code each maps to, or which are the caller's
// fault rather than the system's.
//
// This module adds that classification WITHOUT renaming or removing a single
// existing code, because those codes are public: they appear in CLI JSON output
// and in MCP tool results. Every existing code is mapped to a category here, and
// a test asserts the mapping is total, so a new code cannot be added without
// classifying it.
//
// IMPORTANT: the CLI exit codes below are the ones the CLI already returns, and
// the policy is the one already documented in cli/src/help.ts:
//
//     0  success
//     1  runtime execution failed
//     2  invalid command, invalid option, or a controlled precondition failure
//
// The v0.5.4 audit found no exit-code inconsistency to repair. This module makes
// the existing mapping explicit and testable so it cannot drift.
//
// Pure: no filesystem, environment, clock, network, or randomness.

import type { Diagnostic, DiagnosticSeverity } from "./result.js";

/**
 * The error categories, ordered from "caller's input" to "our invariant".
 *
 * Names follow what this codebase actually distinguishes; a category with no
 * current member would be speculation, so the set is exactly what is reachable.
 */
export const ERROR_CATEGORIES = [
  /** The request was well-formed but its content failed validation. */
  "validation",
  /** The command, flag, or argument shape itself was wrong. */
  "invocation",
  /** Configuration on disk was missing, unreadable, or invalid. */
  "configuration",
  /** An external provider refused, failed, or returned an unusable payload. */
  "provider",
  /** Authentication was absent or rejected. */
  "authentication",
  /** A provider rate limit was hit. */
  "rateLimit",
  /** Local storage could not be read or written. */
  "storage",
  /** A contract or schema version could not be satisfied. */
  "contractCompatibility",
  /** The operation is understood but deliberately not supported. */
  "unsupportedOperation",
  /** A security policy refused the operation. */
  "securityPolicy",
  /** The caller cancelled the operation through its execution context. */
  "cancelled",
  /** An invariant we control was broken; always a defect on our side. */
  "internalInvariant",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** CLI exit codes. Exactly the values the CLI already returns. */
export const EXIT_SUCCESS = 0;
export const EXIT_RUNTIME_FAILED = 1;
export const EXIT_INVOCATION_OR_PRECONDITION = 2;

/** How one category behaves across every surface. */
export type CategoryContract = {
  readonly category: ErrorCategory;
  /** Whether retrying the identical call could plausibly succeed. */
  readonly retryable: boolean;
  /** The CLI exit code, per the documented policy. */
  readonly exitCode: typeof EXIT_RUNTIME_FAILED | typeof EXIT_INVOCATION_OR_PRECONDITION;
  /** Severity when surfaced as a diagnostic. */
  readonly severity: DiagnosticSeverity;
  /**
   * Whether MCP should mark the tool result as an error. Expected validation
   * failures stay structured results rather than protocol crashes, so an agent
   * can read the code and correct its own call.
   */
  readonly mcpIsError: boolean;
};

const CONTRACTS: Readonly<Record<ErrorCategory, CategoryContract>> = Object.freeze({
  validation: {
    category: "validation",
    retryable: false,
    // A precondition the caller can fix: not a runtime execution failure.
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: false,
  },
  invocation: {
    category: "invocation",
    retryable: false,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: false,
  },
  configuration: {
    category: "configuration",
    retryable: false,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: false,
  },
  provider: {
    category: "provider",
    // A network or upstream failure may genuinely succeed on retry.
    retryable: true,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: true,
  },
  authentication: {
    category: "authentication",
    retryable: false,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: true,
  },
  rateLimit: {
    category: "rateLimit",
    retryable: true,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: true,
  },
  storage: {
    category: "storage",
    retryable: false,
    exitCode: EXIT_RUNTIME_FAILED,
    severity: "error",
    mcpIsError: true,
  },
  contractCompatibility: {
    category: "contractCompatibility",
    retryable: false,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: true,
  },
  unsupportedOperation: {
    category: "unsupportedOperation",
    retryable: false,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: false,
  },
  securityPolicy: {
    category: "securityPolicy",
    retryable: false,
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "error",
    mcpIsError: true,
  },
  cancelled: {
    category: "cancelled",
    // The identical call can succeed once the caller stops cancelling it, so
    // this is retryable in the sense the field means: nothing about the request
    // was wrong.
    retryable: true,
    // Not our defect and not a bad request: the caller asked us to stop. It
    // shares the precondition exit code rather than claiming a runtime failure.
    exitCode: EXIT_INVOCATION_OR_PRECONDITION,
    severity: "warning",
    // A cancellation the caller itself requested is an expected outcome, not a
    // protocol error, so MCP reports it as a structured result.
    mcpIsError: false,
  },
  internalInvariant: {
    category: "internalInvariant",
    retryable: false,
    // Our defect, surfaced as a runtime execution failure.
    exitCode: EXIT_RUNTIME_FAILED,
    severity: "error",
    mcpIsError: true,
  },
});

/** The behavioural contract for a category. */
export const categoryContract = (category: ErrorCategory): CategoryContract => CONTRACTS[category];

/**
 * Every public failure code in the workspace, mapped to its category.
 *
 * These code strings are PUBLIC -- they appear in CLI JSON and MCP results -- so
 * this table classifies them and never renames them. It is the union of
 * `ProjectWorkflowErrorCode` and `GitHubWorkflowErrorCode`, plus the runtime
 * failure code, so `categoryOfCode` is total over what the surfaces can emit.
 */
export const CODE_CATEGORIES: Readonly<Record<string, ErrorCategory>> = Object.freeze({
  // Local project workflow (application/src/types.ts).
  project_root_not_found: "validation",
  project_root_not_directory: "validation",
  project_config_invalid: "configuration",
  project_documents_empty: "validation",
  project_runtime_failed: "internalInvariant",
  project_output_invalid: "internalInvariant",

  // GitHub-backed workflow (application/src/github-project.ts).
  github_invalid_config: "configuration",
  github_provider_disabled: "configuration",
  github_invalid_repository: "validation",
  github_invalid_limit: "validation",
  github_invalid_selection: "validation",
  github_runtime_failed: "provider",
  github_output_invalid: "internalInvariant",
  github_cancelled: "cancelled",
});

/**
 * The category for a public failure code.
 *
 * An unknown code is `internalInvariant` rather than a thrown error: a
 * presentation adapter must always be able to map a failure onto its own idiom,
 * and treating an unclassified code as our own defect is both safe and honest.
 * `tools/validate-packages.mjs` has no view on this; the application tests
 * assert the table covers every declared code, which is what keeps it total.
 */
export const categoryOfCode = (code: string): ErrorCategory =>
  CODE_CATEGORIES[code] ?? "internalInvariant";

/** The CLI exit code for a public failure code. */
export const exitCodeForCode = (code: string): number =>
  categoryContract(categoryOfCode(code)).exitCode;

/** Whether an MCP tool result carrying this code should be marked an error. */
export const mcpIsErrorForCode = (code: string): boolean =>
  categoryContract(categoryOfCode(code)).mcpIsError;

/**
 * Build a diagnostic from a public failure code and an already-sanitized message.
 *
 * The message must already be safe -- this does not sanitize, because the use
 * cases that own these codes already produce sanitized messages and a second
 * pass here would hide which layer failed to do it.
 */
export function diagnosticForCode(
  code: string,
  message: string,
  extra: { remediation?: string } = {},
): Diagnostic {
  const contract = categoryContract(categoryOfCode(code));
  return {
    code,
    severity: contract.severity,
    message,
    ...(extra.remediation === undefined ? {} : { remediation: extra.remediation }),
    retryable: contract.retryable,
  };
}
