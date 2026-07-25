// @oh-my-pm/project-memory — the private local project memory persistence
// adapter (v0.3 Phase 2). This package is the explicit application-state I/O
// boundary: it writes minimized, immutable Project Brain snapshot and evidence
// records to a local application-data location that is never inside the analyzed
// project. It performs no network, telemetry, or project-file writes, and no
// public CLI command, MCP tool, or Runtime path invokes it yet.

export type {
  CommitResult,
  CommitSnapshotBundleInput,
  DeleteProjectMemoryInput,
  DeleteResult,
  ExportInventoryEntry,
  ExportProjectMemoryInput,
  ExportResult,
  FinalizedEvidenceRecord,
  FinalizedProjectSnapshot,
  IntegrityDigest,
  JsonObject,
  JsonValue,
  MigrationHistoryEntry,
  ProjectMemoryStore,
  ProjectStoreManifest,
  RecordEnvelope,
  RecordType,
  StoreInspection,
  StoreInspectionIssue,
  StoredSnapshotSummary,
  StoreVerification,
  StoreVersionState,
} from "./types.js";
export {
  CURRENT_STORE_FORMAT_VERSION,
  SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION,
} from "./types.js";

export {
  PROJECT_MEMORY_ERROR_CODES,
  ProjectMemoryError,
} from "./errors.js";
export type { ProjectMemoryErrorCode } from "./errors.js";

export {
  MAX_EVIDENCE_PER_COMMIT,
  MAX_EVIDENCE_PER_PROJECT,
  MAX_EXPORT_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_OPERATION_ID_BYTES,
  MAX_RECORD_BYTES,
  MAX_SNAPSHOTS_PER_PROJECT,
} from "./limits.js";

export { canonicalStringify } from "./canonical-json.js";
export {
  computeIntegrity,
  deriveProjectKey,
  deriveRecordKey,
  isIntegrityDigest,
  DOMAIN_MANIFEST_INTEGRITY,
  DOMAIN_RECORD_INTEGRITY,
  DOMAIN_EXPORT_INVENTORY_INTEGRITY,
  DOMAIN_PROJECT_KEY,
  DOMAIN_RECORD_KEY,
} from "./integrity.js";

export { APP_DATA_DIRNAME, resolveDataRoot } from "./data-location.js";
export type { DataLocationInputs } from "./data-location.js";

export {
  assertProjectDataSeparation,
  assertExportDestinationSafe,
  resolveStoreLayout,
} from "./path-safety.js";
export type { StoreLayout } from "./path-safety.js";

export { assertNoForbiddenKeys, FORBIDDEN_KEY_NORMALIZED, normalizeKey } from "./privacy.js";

export {
  buildEnvelope,
  buildManifest,
  parseAndVerifyEnvelope,
  parseAndVerifyManifest,
} from "./manifest.js";

export {
  MigrationRegistry,
  planMigration,
} from "./migrations.js";
export type {
  MigrationDefinition,
  MigrationPlan,
  MigrationResult,
  MigrationSource,
  MigrationTarget,
} from "./migrations.js";

export {
  acquireLock,
  LOCK_VERSION,
  STALE_LOCK_THRESHOLD_MS,
} from "./lock.js";
export type { LockHandle, LockRecord } from "./lock.js";

export type {
  CommitFailurePoint,
  DirEntry,
  FileSystem,
  LockCreateResult,
} from "./filesystem.js";

export { DependencyInjectedStore } from "./store.js";
export type { StoreOptions } from "./store.js";

export {
  createNodeProjectMemoryStore,
  NodeFileSystem,
  resolveNodeDataRoot,
} from "./node-adapter.js";
export type {
  NodeFileSystemOptions,
  NodeProjectMemoryStoreOptions,
} from "./node-adapter.js";
