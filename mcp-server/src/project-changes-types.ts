// v0.3 Phase 5 — types for the read-only `project_changes` MCP tool.
//
// This is the ONLY Project Brain read-only MCP projection. It reads
// already-captured local Project Brain memory and compares committed snapshots
// in authoritative capture order (Phase 4.1). It never captures, migrates,
// exports, deletes, repairs, writes, locks, or calls a provider or the network.
// The public projection is a strict allowlist: no raw ProjectState/Snapshot,
// no EvidenceRecord, no evidence ids, no previous/current structured values.

/** The twelve public change categories (the Kernel ChangeCategory set). */
export type McpChangeCategory =
  | "added"
  | "removed"
  | "modified"
  | "resolved"
  | "reopened"
  | "becameOverdue"
  | "noLongerOverdue"
  | "severityIncreased"
  | "severityDecreased"
  | "fresh"
  | "stale"
  | "evidenceChanged";

/** The six public item kinds (the Kernel StateItemKind set). */
export type McpChangeItemKind =
  "milestone" | "task" | "risk" | "decision" | "dependency" | "blocker";

/** Strict input to the `project_changes` tool. No path, token, or capture field. */
export type McpProjectChangesInput = {
  readonly projectId: string;
  readonly previousSnapshotId?: string;
  readonly currentSnapshotId?: string;
  readonly staleAfterSeconds?: number;
  readonly limit?: number;
};

/**
 * One bounded, sanitized projected change. Only allowlisted scalar fields are
 * ever populated; the Kernel's previousValue/currentValue are inspected only to
 * extract these scalars and are never exposed. Evidence is reported as a count
 * only — never an id.
 */
export type McpProjectedChange = {
  readonly category: McpChangeCategory;
  readonly itemKind: McpChangeItemKind;
  readonly itemId: string;
  readonly title?: string;
  readonly previousStatus?: string;
  readonly currentStatus?: string;
  readonly previousSeverity?: string;
  readonly currentSeverity?: string;
  readonly previousDueDate?: string;
  readonly currentDueDate?: string;
  readonly evidenceCount: number;
};

/** Complete counts for every category (always present, stable key order). */
export type McpChangeCounts = Record<McpChangeCategory, number>;

/** The bounded summary block. */
export type McpProjectChangesSummary = {
  readonly totalChanges: number;
  readonly returnedChanges: number;
  readonly truncated: boolean;
  readonly countsByCategory: McpChangeCounts;
};

/** The strict, versioned public result. */
export type McpProjectChangesResult = {
  readonly schemaVersion: 1;
  readonly status: "compared" | "noPriorMemory" | "insufficientHistory";
  readonly projectId: string;
  readonly previousSnapshotId?: string;
  readonly currentSnapshotId?: string;
  readonly chronology: "capture-order";
  readonly summary: McpProjectChangesSummary;
  readonly changes: readonly McpProjectedChange[];
};

/** Stable, sanitized failure codes for the runner. */
export type McpProjectChangesFailureCode =
  | "project_changes_invalid_input"
  | "project_changes_memory_unavailable"
  | "project_changes_store_locked"
  | "project_changes_store_corrupt"
  | "project_changes_migration_required"
  | "project_changes_unsupported_store"
  | "project_changes_incompatible_schema"
  | "project_changes_kernel_unavailable"
  | "project_changes_compare_failed"
  | "project_changes_read_failed";

/** A sanitized runner success: only the strict public result is carried. */
export type McpProjectChangesSuccess = {
  readonly ok: true;
  readonly result: McpProjectChangesResult;
};

/** A sanitized runner failure: no exception, path, payload, trace, or cause. */
export type McpProjectChangesFailure = {
  readonly ok: false;
  readonly code: McpProjectChangesFailureCode;
  readonly message: string;
};

export type McpProjectChangesExecution = McpProjectChangesSuccess | McpProjectChangesFailure;

/** The read-only executor the server calls to run one `project_changes` request. */
export type McpProjectChangesExecutor = (
  input: McpProjectChangesInput,
) => Promise<McpProjectChangesExecution>;
