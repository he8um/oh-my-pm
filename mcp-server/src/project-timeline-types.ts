// v0.4 — types for the read-only `project_timeline` MCP tool.
//
// The second, and last, Project Brain read-only MCP projection. It reads
// already-captured local Project Brain memory and derives a bounded timeline of
// changes from adjacent committed snapshots in authoritative capture order. It
// never captures, migrates, exports, deletes, repairs, writes, locks, or calls a
// provider or the network. The public projection is a strict allowlist: no raw
// ProjectState/Snapshot, no EvidenceRecord, no evidence ids, no previous/current
// structured values, no path.

import type { McpChangeCategory, McpChangeItemKind } from "./project-changes-types.js";

/** Strict input. No path, dataDir, token, apply, migrate, or capture field. */
export type McpProjectTimelineInput = {
  readonly projectId: string;
  readonly limit?: number;
  readonly beforeSequence?: number;
  readonly category?: McpChangeCategory;
  readonly kind?: McpChangeItemKind;
};

/**
 * One bounded, sanitized timeline event. Evidence is reported as a COUNT only —
 * never an id — and the presented title/status/severity/dueDate are the
 * allow-listed scalars extracted from the change's structured value, which is
 * itself never exposed.
 */
export type McpProjectedTimelineEvent = {
  readonly eventId: string;
  readonly snapshotId: string;
  readonly captureSequence: number;
  readonly eventSequence: number;
  readonly capturedAt: string;
  readonly category: McpChangeCategory;
  readonly kind: McpChangeItemKind;
  readonly subjectId: string;
  readonly title?: string;
  readonly status?: string;
  readonly severity?: string;
  readonly dueDate?: string;
  readonly evidenceCount: number;
};

/** The strict, versioned public result. */
export type McpProjectTimelineResult = {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly eventCount: number;
  readonly hasMore: boolean;
  readonly nextBeforeSequence?: number;
  readonly chronology: "capture-order";
  readonly events: readonly McpProjectedTimelineEvent[];
};

/** Stable, sanitized failure codes for the runner. */
export type McpProjectTimelineFailureCode =
  | "project_timeline_invalid_input"
  | "project_timeline_memory_unavailable"
  | "project_timeline_store_locked"
  | "project_timeline_store_corrupt"
  | "project_timeline_migration_required"
  | "project_timeline_unsupported_store"
  | "project_timeline_incompatible_schema"
  | "project_timeline_kernel_unavailable"
  | "project_timeline_derive_failed"
  | "project_timeline_read_failed";

/** A sanitized runner success: only the strict public result is carried. */
export type McpProjectTimelineSuccess = {
  readonly ok: true;
  readonly result: McpProjectTimelineResult;
};

/** A sanitized runner failure: no exception, path, payload, trace, or cause. */
export type McpProjectTimelineFailure = {
  readonly ok: false;
  readonly code: McpProjectTimelineFailureCode;
  readonly message: string;
};

export type McpProjectTimelineExecution =
  | McpProjectTimelineSuccess
  | McpProjectTimelineFailure;

/** The read-only executor the server calls to run one request. */
export type McpProjectTimelineExecutor = (
  input: McpProjectTimelineInput,
) => Promise<McpProjectTimelineExecution>;
