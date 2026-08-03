// `memory` command parse-result types.
//
// A dedicated discriminated-union model for the eight `memory` subcommands. Kept
// separate from the flat CLI parser's types so the eight grammars never overload
// one loop. Pure type declarations only: no filesystem, environment, or clock.

import type {
  ChangeCategory,
  CliOutputMode,
  StateItemKind,
  TimelineEvent,
} from "@oh-my-pm/contracts";

/** The eight approved `memory` subcommands — an exact, closed allowlist. */
export type MemorySubcommand =
  "capture" | "changes" | "status" | "history" | "export" | "delete" | "timeline" | "repair";

/** The exact set of allowed subcommands, in canonical order. */
export const MEMORY_SUBCOMMANDS: readonly MemorySubcommand[] = [
  "capture",
  "changes",
  "status",
  "history",
  "export",
  "delete",
  // v0.4: the read-only Project Timeline query. Appended last so the six
  // historical subcommands keep their exact order.
  "timeline",
  // v0.6.2: the preview-first Project Memory recovery path (G5). Appended last
  // so every historical subcommand keeps its exact position.
  "repair",
];

/** Supported capture/derivation locales (mirrors the contracts Locale union). */
export type MemoryLocale = "en" | "fa";

/** Options every `memory` command shares (identity + data location + output). */
export type MemoryCommonOptions = {
  /** Explicit project id override; wins over project config. Undefined = unset. */
  projectId?: string;
  /** Explicit application-data root override. Undefined = platform default. */
  dataDir?: string;
  outputMode: CliOutputMode;
};

/** `memory capture [root] [--locale] [--apply] [--migrate-store]`. */
export type MemoryCaptureCommand = MemoryCommonOptions & {
  subcommand: "capture";
  projectRoot: string;
  locale: MemoryLocale;
  apply: boolean;
  /**
   * Opt in to the explicit store-format `1 -> 2` migration (Phase 4.1). Preview
   * (`--migrate-store` without `--apply`) reports that a v1 store would migrate
   * and writes nothing. Apply (`--apply --migrate-store`) migrates a v1 store
   * once and then performs the requested capture once. Valid only for capture.
   */
  migrateStore: boolean;
};

/** `memory changes [root] [--previous --current] [--stale-after]`. Read-only. */
export type MemoryChangesCommand = MemoryCommonOptions & {
  subcommand: "changes";
  projectRoot: string;
  previousSnapshotId?: string;
  currentSnapshotId?: string;
  staleAfterSeconds: number;
};

/** `memory status [root]`. Read-only. */
export type MemoryStatusCommand = MemoryCommonOptions & {
  subcommand: "status";
  projectRoot: string;
};

/** `memory history [root] [--limit]`. Read-only. */
export type MemoryHistoryCommand = MemoryCommonOptions & {
  subcommand: "history";
  projectRoot: string;
  limit: number;
};

/** `memory export [root] --destination <path> [--apply]`. */
export type MemoryExportCommand = MemoryCommonOptions & {
  subcommand: "export";
  projectRoot: string;
  destination: string;
  apply: boolean;
};

/** `memory delete [root] [--apply --confirm <id>] [--force-corrupt-delete]`. */
export type MemoryDeleteCommand = MemoryCommonOptions & {
  subcommand: "delete";
  projectRoot: string;
  apply: boolean;
  confirm?: string;
  forceCorruptDelete: boolean;
};

/**
 * `memory timeline --project-id <id> [--limit] [--before-sequence] [--category]
 * [--kind]`. Read-only: there is no --apply, no root requirement, and no
 * mutating option.
 */
export type MemoryTimelineCommand = MemoryCommonOptions & {
  subcommand: "timeline";
  limit: number;
  beforeSequence?: number;
  category?: ChangeCategory;
  kind?: StateItemKind;
};

/**
 * `memory repair [root] [--apply]`.
 *
 * Preview-first like capture/export/delete: without `--apply` it scans and
 * proposes, changing no byte of the store. With `--apply` it performs the bounded
 * recovery the preview described, under the writer lock.
 */
export type MemoryRepairCommand = MemoryCommonOptions & {
  subcommand: "repair";
  projectRoot: string;
  apply: boolean;
};

/** The parsed `memory` command discriminated by subcommand. */
export type MemoryCliCommand =
  | MemoryCaptureCommand
  | MemoryChangesCommand
  | MemoryStatusCommand
  | MemoryHistoryCommand
  | MemoryExportCommand
  | MemoryDeleteCommand
  | MemoryTimelineCommand
  | MemoryRepairCommand;

/** The result of parsing a `memory` command (success or a controlled error). */
export type MemoryCliParseResult =
  { ok: true; command: MemoryCliCommand } | { ok: false; code: "OMP-C-3002"; message: string };

/** Default snapshot staleness window: seven days, in seconds. */
export const MEMORY_DEFAULT_STALE_AFTER_SECONDS = 604_800;
/** Inclusive bounds for `--stale-after` (0 .. one year, in seconds). */
export const MEMORY_MIN_STALE_AFTER_SECONDS = 0;
export const MEMORY_MAX_STALE_AFTER_SECONDS = 31_536_000;

/** Default/min/max for `memory history --limit`. */
export const MEMORY_DEFAULT_HISTORY_LIMIT = 20;
export const MEMORY_MIN_HISTORY_LIMIT = 1;
export const MEMORY_MAX_HISTORY_LIMIT = 100;

/**
 * Default/min/max for `memory timeline --limit`. Mirrors the Kernel derivation's
 * own bounds exactly; the CLI never accepts a page size the derivation rejects.
 */
export const MEMORY_DEFAULT_TIMELINE_LIMIT = 20;
export const MEMORY_MIN_TIMELINE_LIMIT = 1;
export const MEMORY_MAX_TIMELINE_LIMIT = 100;

/** The exact ChangeSet taxonomy accepted by --category. No second taxonomy. */
export const MEMORY_TIMELINE_CATEGORIES: readonly ChangeCategory[] = [
  "added",
  "removed",
  "modified",
  "resolved",
  "reopened",
  "becameOverdue",
  "noLongerOverdue",
  "severityIncreased",
  "severityDecreased",
  "fresh",
  "stale",
  "evidenceChanged",
];

/** The exact StateItemKind taxonomy accepted by --kind. */
export const MEMORY_TIMELINE_KINDS: readonly StateItemKind[] = [
  "milestone",
  "task",
  "risk",
  "decision",
  "dependency",
  "blocker",
];

/** Default capture locale. */
export const MEMORY_DEFAULT_LOCALE: MemoryLocale = "en";

/**
 * The documented safe future-skew default (one day, in seconds) used by capture
 * freshness derivation and compare staleness. A source-reported time beyond this
 * skew is treated conservatively rather than as fresh.
 */
export const MEMORY_MAX_FUTURE_SKEW_SECONDS = 86_400;

// --- Command outcome model -------------------------------------------------
//
// Every memory command produces one of these structured outcomes. The process
// boundary computes it; the formatters render it to brief/json/markdown. The
// data carries no raw content, token, or absolute path.

/** A sanitized per-source coverage entry echoed to output. */
export type MemoryCoverageEntry = {
  sourceIdentity: string;
  coverageState: "complete" | "partial" | "skipped";
  gapReason?: string;
};

/** Successful capture outcome (preview or applied). */
export type MemoryCaptureOutcome = {
  command: "memory.capture";
  ok: true;
  mode: "preview" | "applied";
  wouldWrite?: boolean;
  written?: boolean;
  wouldCreateSnapshot?: boolean;
  wouldBeIdempotent?: boolean;
  idempotent?: boolean;
  /** Preview-only: a v1 store would be migrated to v2 before this capture. */
  wouldMigrateStore?: boolean;
  /**
   * Apply-only: the store-format `1 -> 2` migration actually completed as part
   * of this invocation. Reported independently of capture success.
   */
  storeMigrated?: boolean;
  projectId: string;
  snapshotId: string;
  stateFingerprint: string;
  snapshotFingerprint: string;
  itemCount: number;
  evidenceCount: number;
  snapshotCount: number;
  coverageComplete: boolean;
  coverage: MemoryCoverageEntry[];
};

/** Changes (compare) outcome. Read-only. */
export type MemoryChangesOutcome = {
  command: "memory.changes";
  ok: true;
  status: "compared" | "noPriorMemory" | "insufficientHistory";
  projectId: string;
  previousSnapshotId?: string;
  currentSnapshotId?: string;
  /** The full bounded ChangeSet, present only when status is "compared". */
  changeSet?: unknown;
  changeCount?: number;
};

/** The status value surfaced by `memory status`. */
export type MemoryStoreStatus =
  | "noPriorMemory"
  | "healthy"
  | "corrupt"
  | "unsupportedNewer"
  | "migrationRequired"
  | "incompatibleSchema";

/** Status outcome. Read-only. */
export type MemoryStatusOutcome = {
  command: "memory.status";
  ok: true;
  projectId: string;
  status: MemoryStoreStatus;
  storeFormatVersion: number | null;
  projectBrainSchemaVersion: number | null;
  snapshotCount: number;
  evidenceCount: number;
  latestSnapshotId: string | null;
  issues: string[];
};

/** One history record (newest-first presentation). */
export type MemoryHistoryRecord = {
  snapshotId: string;
  /** The capture time from the authoritative chronology. */
  capturedAt: string;
  /** The contiguous 1-based capture ordinal (chronology, not lexical order). */
  sequence: number;
  isLatest: boolean;
};

/** History outcome. Read-only. Presents newest capture first. */
export type MemoryHistoryOutcome = {
  command: "memory.history";
  ok: true;
  projectId: string;
  limit: number;
  snapshotCount: number;
  /** The store's chronology provenance ("native" or "recoveredV1"), if known. */
  chronologyOrigin?: "native" | "recoveredV1";
  records: MemoryHistoryRecord[];
};

/** Export outcome (preview or applied). */
export type MemoryExportOutcome = {
  command: "memory.export";
  ok: true;
  mode: "preview" | "applied";
  wouldExport?: boolean;
  exported?: boolean;
  projectId: string;
  /** The destination echoed exactly as the user typed it (never resolved). */
  destination: string;
  snapshotCount: number;
  evidenceCount: number;
};

/** Delete outcome (preview or applied). */
export type MemoryDeleteOutcome = {
  command: "memory.delete";
  ok: true;
  mode: "preview" | "applied";
  projectId: string;
  storeExists: boolean;
  /** Preview-only: what would be removed. */
  wouldDelete?: boolean;
  snapshotCount?: number;
  evidenceCount?: number;
  /** Apply-only: whether a store was actually removed (false = controlled no-op). */
  deleted?: boolean;
};

/**
 * One repair finding, projected for output.
 *
 * Sanitized by construction: the store layer already guarantees a store-relative
 * target and no raw content, and this projection copies only those fields.
 */
export type MemoryRepairFinding = {
  code: string;
  authority: string;
  target: string;
  repairability: string;
  action: string;
  blockingReason?: string;
};

/** One executed repair action's outcome. */
export type MemoryRepairOutcomeEntry = {
  action: string;
  code: string;
  target: string;
  status: string;
  blockingReason?: string;
};

/**
 * Repair outcome (preview or applied).
 *
 * The counters are deliberately separate rather than one "repaired" total.
 * Quarantining a corrupt record restores the readability of the rest of the store
 * but does NOT recover that record's meaning, and a single total would let a
 * reader conclude otherwise — the one person most harmed by that misreading being
 * the user whose data is damaged.
 */
export type MemoryRepairOutcome = {
  command: "memory.repair";
  ok: true;
  mode: "preview" | "applied";
  projectId: string;
  storeExists: boolean;
  /** Findings the scan classified, in deterministic order. */
  findings: MemoryRepairFinding[];
  findingCount: number;
  /** Actions the plan would perform (preview) or did perform (applied). */
  actionCount: number;
  /** Findings a stated precondition prevents acting on. */
  blockedCount: number;
  /** Findings nothing can safely be done about. */
  unrepairableCount: number;
  /** Preview-only: true when applying would change the store. */
  wouldRepair?: boolean;
  /** Apply-only: per-action outcomes and distinct tallies. */
  outcomes?: MemoryRepairOutcomeEntry[];
  reconstructedCount?: number;
  isolatedCount?: number;
  removedCount?: number;
  reclaimedCount?: number;
  skippedCount?: number;
};

/** A controlled, sanitized failure with a stable code and exit code. */
export type MemoryFailureOutcome = {
  command: `memory.${MemorySubcommand}`;
  ok: false;
  code: string;
  message: string;
  /** The stable exit code for this failure (1/2/3/4). */
  exitCode: 1 | 2 | 3 | 4;
  /**
   * Set only when a store-format migration completed as part of this
   * invocation but the subsequent operation then failed. The failure never
   * implies the operation (capture) succeeded; this flag records the migration
   * fact so the outcome is not misread.
   */
  storeMigrated?: boolean;
};

/**
 * Timeline outcome. Read-only. Presents the newest capture first, bounded by the
 * validated limit. The events carry the public allow-listed projection only.
 */
export type MemoryTimelineOutcome = {
  command: "memory.timeline";
  ok: true;
  projectId: string;
  limit: number;
  eventCount: number;
  hasMore: boolean;
  nextBeforeSequence?: number;
  /** The applied filters, echoed so a page is self-describing. */
  category?: ChangeCategory;
  kind?: StateItemKind;
  events: TimelineEvent[];
};

/** The union of every possible memory command outcome. */
export type MemoryCommandOutcome =
  | MemoryCaptureOutcome
  | MemoryChangesOutcome
  | MemoryStatusOutcome
  | MemoryHistoryOutcome
  | MemoryExportOutcome
  | MemoryDeleteOutcome
  | MemoryTimelineOutcome
  | MemoryRepairOutcome
  | MemoryFailureOutcome;
