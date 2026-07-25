// Persistence-internal types for the local project memory adapter. These are
// intentionally NOT the generated Project Brain contracts: the store treats the
// finalized snapshot and evidence records as opaque, already-minimized JSON
// payloads produced by the Phase 1 Kernel. The adapter never analyzes,
// normalizes, fingerprints semantically, or diffs them.

/** A JSON value the store may persist inside a record payload. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A JSON object the store may persist. */
export type JsonObject = { readonly [key: string]: JsonValue };

/** Current on-disk store format version. Distinct from the Project Brain schema. */
export const CURRENT_STORE_FORMAT_VERSION = 1 as const;

/** The only supported Project Brain schema version in this store format. */
export const SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION = 1 as const;

/**
 * A finalized ProjectSnapshot as accepted by the store: an opaque JSON object
 * that carries at least its own id, owning project id, and schema version. All
 * other fields are preserved verbatim without inspection. It is a JsonObject at
 * the value level (see the intersection below), so it can be stored directly.
 */
export type FinalizedProjectSnapshot = JsonObject & {
  readonly snapshotId: string;
  readonly projectId: string;
  readonly schemaVersion: number;
  /** Evidence record ids this snapshot froze; ids only. */
  readonly evidenceRefs: readonly string[];
};

/**
 * A minimized EvidenceRecord as accepted by the store: an opaque JSON object
 * that carries at least its own id, owning project id, and schema version.
 */
export type FinalizedEvidenceRecord = JsonObject & {
  readonly evidenceId: string;
  readonly projectId: string;
  readonly schemaVersion: number;
};

/** The kind of an immutable record envelope. */
export type RecordType = "snapshot" | "evidence";

/** An integrity descriptor: `sha256:<64 lowercase hex>`. */
export type IntegrityDigest = string;

/** One recorded migration step in a project's history. */
export interface MigrationHistoryEntry {
  readonly fromStoreFormatVersion: number;
  readonly toStoreFormatVersion: number;
  /** Caller-injected RFC3339 timestamp of when the migration completed. */
  readonly migratedAt: string;
  /** The operation id under which the migration ran. */
  readonly operationId: string;
  /** Sanitized, relative backup key for the pre-migration snapshot of the store. */
  readonly backupKey: string;
}

/**
 * The internal manifest for one project's store. Contains no project path, no
 * secret, and no raw content. Timestamps and ids are caller-provided.
 */
export interface ProjectStoreManifest {
  readonly storeFormatVersion: number;
  readonly projectBrainSchemaVersion: number;
  readonly projectId: string;
  /** Lowercase SHA-256 project key used for on-disk directory naming. */
  readonly projectKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Latest snapshot id; must appear in snapshotIds. Null before any commit. */
  readonly latestSnapshotId: string | null;
  readonly snapshotIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly migrationHistory: readonly MigrationHistoryEntry[];
  /** Integrity over the canonicalized manifest body (all fields except this). */
  readonly integrity: IntegrityDigest;
}

/** An immutable record envelope stored on disk under snapshots/ or evidence/. */
export interface RecordEnvelope {
  readonly recordType: RecordType;
  readonly storeFormatVersion: number;
  readonly projectBrainSchemaVersion: number;
  readonly projectId: string;
  /** The record's own id (snapshotId or evidenceId). */
  readonly recordId: string;
  /** The finalized, opaque payload. */
  readonly payload: JsonObject;
  /** Integrity over the canonicalized envelope body (all fields except this). */
  readonly integrity: IntegrityDigest;
}

/** Summary of a stored snapshot, returned by listSnapshots. */
export interface StoredSnapshotSummary {
  readonly snapshotId: string;
  readonly isLatest: boolean;
}

/** Store-format version classification for a project. */
export type StoreVersionState =
  | "noPriorMemory"
  | "supported"
  | "unsupportedNewer"
  | "migrationRequired"
  | "incompatibleSchema";

/** A reported store health issue found during inspection. */
export interface StoreInspectionIssue {
  readonly kind:
    | "abandonedStaging"
    | "unreferencedRecord"
    | "missingRecord"
    | "integrityFailure"
    | "unsupportedFormat";
  /** Sanitized, relative descriptor of the affected entry. Never an absolute path. */
  readonly detail: string;
}

/** The result of inspecting a project's store without mutating it. */
export interface StoreInspection {
  readonly projectId: string;
  readonly exists: boolean;
  readonly versionState: StoreVersionState;
  readonly storeFormatVersion: number | null;
  readonly projectBrainSchemaVersion: number | null;
  readonly snapshotCount: number;
  readonly evidenceCount: number;
  readonly latestSnapshotId: string | null;
  readonly issues: readonly StoreInspectionIssue[];
}

/** The result of verifying a project's store integrity. */
export interface StoreVerification {
  readonly projectId: string;
  readonly ok: boolean;
  readonly manifestVerified: boolean;
  readonly verifiedSnapshotIds: readonly string[];
  readonly verifiedEvidenceIds: readonly string[];
  readonly issues: readonly StoreInspectionIssue[];
}

/** Input for committing one finalized snapshot bundle. */
export interface CommitSnapshotBundleInput {
  readonly projectId: string;
  /** Write-safety boundary only; never persisted. */
  readonly projectRootBoundary: string;
  readonly operationId: string;
  /** Caller-injected RFC3339 timestamp. */
  readonly occurredAt: string;
  readonly snapshot: FinalizedProjectSnapshot;
  readonly evidence: readonly FinalizedEvidenceRecord[];
}

/** The result of a commit. */
export interface CommitResult {
  readonly projectId: string;
  readonly snapshotId: string;
  readonly committedEvidenceIds: readonly string[];
  /** True when the commit was a verified idempotent no-op (identical payloads). */
  readonly idempotent: boolean;
  readonly latestSnapshotId: string;
  readonly snapshotCount: number;
  readonly evidenceCount: number;
}

/** Input for exporting a project's memory to a directory. */
export interface ExportProjectMemoryInput {
  readonly projectId: string;
  /** Write-safety boundary only; never persisted. */
  readonly projectRootBoundary: string;
  readonly operationId: string;
  /** Absolute destination directory for the export (must not exist yet). */
  readonly destination: string;
}

/** One exported record in the export inventory. */
export interface ExportInventoryEntry {
  readonly recordType: RecordType;
  readonly recordId: string;
  /** Store-relative path of the exported record inside the export directory. */
  readonly relativePath: string;
  readonly integrity: IntegrityDigest;
}

/** The result of an export. */
export interface ExportResult {
  readonly projectId: string;
  readonly snapshotCount: number;
  readonly evidenceCount: number;
  readonly inventory: readonly ExportInventoryEntry[];
  /** Integrity over the canonicalized export inventory. */
  readonly inventoryIntegrity: IntegrityDigest;
}

/** Input for deleting a project's memory. */
export interface DeleteProjectMemoryInput {
  readonly projectId: string;
  /** Write-safety boundary only; never persisted. */
  readonly projectRootBoundary: string;
  readonly operationId: string;
  /** Must equal projectId exactly. */
  readonly confirmation: string;
  /** Delete even when the store fails verification. Defaults to false. */
  readonly forceCorruptDelete?: boolean;
}

/** The result of a delete. */
export interface DeleteResult {
  readonly projectId: string;
  /** True when a store existed and was removed; false for a no-op. */
  readonly deleted: boolean;
}

/** The public persistence interface implemented by the Node adapter. */
export interface ProjectMemoryStore {
  inspect(projectId: string): Promise<StoreInspection>;
  verify(projectId: string): Promise<StoreVerification>;
  readManifest(projectId: string): Promise<ProjectStoreManifest | null>;
  listSnapshots(projectId: string): Promise<StoredSnapshotSummary[]>;
  readSnapshot(projectId: string, snapshotId: string): Promise<FinalizedProjectSnapshot>;
  readEvidence(projectId: string, evidenceId: string): Promise<FinalizedEvidenceRecord>;
  commitSnapshotBundle(input: CommitSnapshotBundleInput): Promise<CommitResult>;
  exportProject(input: ExportProjectMemoryInput): Promise<ExportResult>;
  deleteProject(input: DeleteProjectMemoryInput): Promise<DeleteResult>;
}
