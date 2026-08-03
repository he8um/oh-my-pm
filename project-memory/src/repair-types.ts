// The repair model: finding classifications, proposed actions, plans, and
// receipts. Pure type declarations and stable string constants only — no I/O, no
// clock, no filesystem.
//
// Why the vocabulary is closed and machine-readable
// ------------------------------------------------
// A repair decision is a safety decision, so it must not be inferred from prose.
// Every classification below names one distinguishable on-disk condition, and
// every action names one bounded mutation. A caller (CLI, test, or future
// tooling) branches on these codes, never on a message.
//
// The authority classes are the load-bearing part. What may be done to a damaged
// file depends entirely on who owns the bytes:
//
//   authoritative -- the user's own memory records and the manifest. Content
//     that no program can reconstruct. May be ISOLATED (quarantined) but never
//     rewritten from a guess and never deleted.
//   derived -- the manifest's inventory/chronology projection and any index
//     built from records. Rebuildable, but ONLY from fully verified
//     authoritative records; a rebuild from damaged input would launder
//     corruption into apparently-valid state.
//   coordination -- lock files. Reclaimable under the existing age AND
//     dead-owner rule, never on age alone.
//   residue -- temp files and abandoned staging. No authority at all, removable
//     only when this store's ownership of the file is proven.
//   recoveryEvidence -- quarantine. Never live, never pruned, never rebuilt.

/**
 * What a scan found, as a stable machine-readable code.
 *
 * Deliberately finer-grained than the store's inspection issue kinds: `inspect()`
 * reports "integrityFailure" for conditions that require opposite responses. A
 * checksum mismatch on an authoritative record can only be isolated, while a
 * broken derived manifest can be rebuilt — collapsing both into one kind would
 * make a safe repair plan impossible to compute.
 */
export type RepairFindingCode =
  /** Authoritative JSON that does not parse. Not semantically reconstructable. */
  | "malformed_json"
  /** Parsed, but its recorded digest does not match its bytes. */
  | "checksum_mismatch"
  /** A store format newer than this build supports. Never downgraded. */
  | "unsupported_schema"
  /** Parsed, but a structurally required field is absent. */
  | "missing_required_field"
  /** The same record id appears more than once in the manifest inventory. */
  | "duplicate_record_id"
  /** The manifest itself is unreadable or fails its own verification. */
  | "broken_manifest"
  /** The manifest's derived projection disagrees with verified records. */
  | "broken_derived_index"
  /** A record file on disk that the manifest does not reference. */
  | "orphaned_record"
  /** A manifest referencing a record whose file is absent. */
  | "missing_referenced_record"
  /** Migration evidence shows a version advance that did not complete. */
  | "partial_migration"
  /** A lock whose age exceeds the threshold AND whose owner is dead. */
  | "stale_lock"
  /** A temp file or abandoned staging entry this store owns. */
  | "temporary_file_residue";

/** Every finding code in deterministic scan order. */
export const REPAIR_FINDING_CODES: readonly RepairFindingCode[] = [
  "broken_manifest",
  "unsupported_schema",
  "malformed_json",
  "checksum_mismatch",
  "missing_required_field",
  "duplicate_record_id",
  "missing_referenced_record",
  "orphaned_record",
  "broken_derived_index",
  "partial_migration",
  "stale_lock",
  "temporary_file_residue",
] as const;

/** Who owns the bytes a finding refers to. Determines what may be done. */
export type RepairAuthorityClass =
  "authoritative" | "derived" | "coordination" | "residue" | "recoveryEvidence";

/**
 * The bounded set of mutations a repair may perform.
 *
 * `quarantine_authoritative_file` is deliberately NOT called "repair": it
 * isolates bytes and restores readability of the REST of the store. The damaged
 * record's own meaning is not recovered by it, and the outcome vocabulary keeps
 * that distinction visible.
 */
export type RepairActionCode =
  | "quarantine_authoritative_file"
  | "rebuild_derived_manifest"
  | "rebuild_derived_index"
  | "reindex_verified_orphan"
  | "remove_owned_temporary_residue"
  | "reclaim_dead_stale_lock"
  | "report_unsupported_schema"
  | "report_unrepairable";

/** Whether, and how, a finding can be acted on. */
export type RepairRepairability =
  /** A bounded action exists and is safe to perform. */
  | "repairable"
  /** Nothing can be done safely; the finding is reported only. */
  | "unrepairable"
  /** An action exists in principle but a stated precondition blocks it. */
  | "blocked";

/**
 * One scanner finding.
 *
 * Every field is safe to print. There is no absolute path, no environment value,
 * no command line, no token, and no raw record content: a corrupt record's bytes
 * are exactly what must not be echoed, since the reason it is corrupt may be that
 * it contains something unexpected.
 */
export interface RepairFinding {
  readonly code: RepairFindingCode;
  readonly authority: RepairAuthorityClass;
  /**
   * A store-relative path (POSIX separators) or a record id. Never absolute:
   * `projects/<key>/snapshots/<key>.json`, not the user's home directory.
   */
  readonly target: string;
  readonly repairability: RepairRepairability;
  /** The action proposed for this finding. */
  readonly action: RepairActionCode;
  /** Why a `blocked` or `unrepairable` finding cannot be acted on. */
  readonly blockingReason?: string;
  /** The digest the store expected, when one is recorded and safe to show. */
  readonly expectedDigest?: string;
  /** The digest recomputed from the bytes on disk, when safely computable. */
  readonly actualDigest?: string;
}

/** Counts summarizing a scan or a plan. */
export interface RepairSummary {
  readonly findingCount: number;
  readonly repairableCount: number;
  readonly blockedCount: number;
  readonly unrepairableCount: number;
}

/** The result of one scan. Deterministic for identical store bytes. */
export interface RepairScanResult {
  readonly projectId: string;
  /** True when the project store directory exists at all. */
  readonly storeExists: boolean;
  /**
   * A digest over the scanned store's observable state. Content-derived, never a
   * modification time: mtime has coarse and platform-dependent granularity, can
   * be set backwards, and is unchanged by a same-size in-place edit — so a plan
   * keyed on it would be accepted against a store that had since changed.
   */
  readonly storeFingerprint: string;
  readonly findings: readonly RepairFinding[];
  readonly summary: RepairSummary;
}

/** The repair-plan format version. Bumped when the plan shape changes. */
export const REPAIR_PLAN_VERSION = 1 as const;

/** One ordered action in a plan, bound to the finding that justified it. */
export interface RepairPlannedAction {
  readonly action: RepairActionCode;
  readonly code: RepairFindingCode;
  readonly authority: RepairAuthorityClass;
  readonly target: string;
  /**
   * The quarantine entry key for an isolating action: a derived digest, used as
   * the operation-scoped payload slot. Absent for non-quarantining actions.
   */
  readonly entryKey?: string;
}

/**
 * An explicit repair plan, separate from its execution.
 *
 * The separation is the safety property: a plan can be printed, reviewed, and
 * diffed without any possibility of mutation, and apply executes only what a plan
 * approved rather than re-deciding at write time.
 */
export interface RepairPlan {
  readonly planVersion: typeof REPAIR_PLAN_VERSION;
  readonly operationId: string;
  readonly projectId: string;
  /**
   * The precondition. Apply re-scans under the writer lock and refuses when the
   * store's fingerprint no longer matches this value, so a plan computed against
   * different bytes can never be executed.
   */
  readonly storeFingerprint: string;
  /** From the injected clock; never a direct system-clock read. */
  readonly generatedAt: string;
  readonly findings: readonly RepairFinding[];
  readonly actions: readonly RepairPlannedAction[];
  /** Actions that a precondition prevents, kept visible rather than dropped. */
  readonly blocked: readonly RepairPlannedAction[];
  readonly summary: RepairSummary;
}

/**
 * What actually happened to one planned action.
 *
 * `isolated` is distinct from `repaired` on purpose. Quarantining a corrupt
 * record makes the store readable again but does not recover that record's
 * meaning, and a receipt that called it "repaired" would overstate the outcome to
 * the one person who most needs the truth.
 */
export type RepairOutcomeStatus =
  /** Derived state was reconstructed from verified authoritative records. */
  | "reconstructed"
  /** Authoritative bytes were preserved in quarantine and removed from live. */
  | "isolated"
  /** Non-authoritative residue was removed. */
  | "removed"
  /** Coordination state was reclaimed. */
  | "reclaimed"
  /** Already in the desired state; a retry performed no new mutation. */
  | "skipped"
  /** A precondition prevented the action. */
  | "blocked";

/** One executed action's recorded outcome. */
export interface RepairActionOutcome {
  readonly action: RepairActionCode;
  readonly code: RepairFindingCode;
  readonly target: string;
  readonly status: RepairOutcomeStatus;
  /** For an isolating action: the digest of the exact bytes preserved. */
  readonly quarantinedDigest?: string;
  readonly blockingReason?: string;
}

/** The deterministic record of one apply. */
export interface RepairReceipt {
  readonly planVersion: typeof REPAIR_PLAN_VERSION;
  readonly operationId: string;
  readonly projectId: string;
  /** The fingerprint the plan was validated against before mutating. */
  readonly storeFingerprint: string;
  readonly appliedAt: string;
  readonly outcomes: readonly RepairActionOutcome[];
  /**
   * Outcome tallies, kept as distinct counters rather than one "repaired" total
   * so isolation is never presented as semantic recovery.
   */
  readonly reconstructedCount: number;
  readonly isolatedCount: number;
  readonly removedCount: number;
  readonly reclaimedCount: number;
  readonly skippedCount: number;
  readonly blockedCount: number;
}

/** Sanitized metadata persisted beside one quarantined payload. */
export interface QuarantineMetadata {
  readonly code: RepairFindingCode;
  readonly authority: RepairAuthorityClass;
  /** Store-relative original location. Never absolute. */
  readonly originalPath: string;
  /** Digest of the exact original bytes as preserved. */
  readonly originalDigest: string;
  readonly operationId: string;
  readonly quarantinedAt: string;
  readonly outcome: RepairOutcomeStatus;
}
