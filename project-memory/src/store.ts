// The dependency-injected project memory store. It implements ProjectMemoryStore
// against the abstract FileSystem port and contains NO direct node:fs import —
// every byte of real I/O flows through the injected adapter. It owns the atomic
// commit protocol, safe reads, verification/inspection, export, delete, single-
// writer locking, and the migration runner. It never analyzes, normalizes,
// fingerprints semantically, or diffs the finalized records.

import {
  atomicCommitFailure,
  corruption,
  deleteConfirmationMismatch,
  invalidInput,
  limitExceeded,
  migrationRequired,
  missingReferencedRecord,
  recordConflict,
  unsupportedStoreVersion,
} from "./errors.js";
import type { CommitFailurePoint, FileSystem } from "./filesystem.js";
import {
  computeIntegrity,
  deriveProjectKey,
  deriveRecordKey,
  DOMAIN_EXPORT_INVENTORY_INTEGRITY,
} from "./integrity.js";
import { acquireLock } from "./lock.js";
import {
  buildEnvelope,
  buildManifest,
  parseAndVerifyEnvelope,
  parseAndVerifyManifest,
  serializeEnvelope,
  serializeManifest,
} from "./manifest.js";
import { planMigration } from "./migrations.js";
import type { MigrationRegistry } from "./migrations.js";
import {
  MAX_EVIDENCE_PER_COMMIT,
  MAX_EVIDENCE_PER_PROJECT,
  MAX_MANIFEST_BYTES,
  MAX_OPERATION_ID_BYTES,
  MAX_RECORD_BYTES,
  MAX_SNAPSHOTS_PER_PROJECT,
  utf8ByteLength,
} from "./limits.js";
import {
  assertExportDestinationSafe,
  assertProjectDataSeparation,
  BACKUPS_DIRNAME,
  EVIDENCE_DIRNAME,
  MANIFEST_FILENAME,
  manifestPathFor,
  lockPathFor,
  projectDirFor,
  recordPathFor,
  resolveStoreLayout,
  SNAPSHOTS_DIRNAME,
  STAGING_DIRNAME,
} from "./path-safety.js";
import type { StoreLayout } from "./path-safety.js";
import { assertNoForbiddenKeys } from "./privacy.js";
import { CURRENT_STORE_FORMAT_VERSION, SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION } from "./types.js";
import type {
  CommitResult,
  CommitSnapshotBundleInput,
  DeleteProjectMemoryInput,
  DeleteResult,
  ExportInventoryEntry,
  ExportProjectMemoryInput,
  ExportResult,
  FinalizedEvidenceRecord,
  FinalizedProjectSnapshot,
  JsonObject,
  ProjectMemoryStore,
  ProjectStoreManifest,
  RecordEnvelope,
  StoreInspection,
  StoreInspectionIssue,
  StoredSnapshotSummary,
  StoreVerification,
  StoreVersionState,
} from "./types.js";

/** Options for constructing the store. */
export interface StoreOptions {
  readonly fs: FileSystem;
  readonly dataRoot: string;
  /** Optional migration registry; empty by default (no production migrations). */
  readonly migrations?: MigrationRegistry;
}

/** A validated, non-empty opaque id (project id, record id, operation id). */
function assertNonEmptyId(value: unknown, what: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidInput(`${what} must be a non-empty string`);
  }
}

/** Validate an operation id: non-empty, bounded, and filename-safe for temps. */
function assertOperationId(value: unknown): asserts value is string {
  assertNonEmptyId(value, "operationId");
  if (utf8ByteLength(value as string) > MAX_OPERATION_ID_BYTES) {
    throw limitExceeded("operationId exceeds the maximum length");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(value as string)) {
    throw invalidInput("operationId must contain only [A-Za-z0-9._-]");
  }
  // Reject the traversal tokens: operationId is used as a bare path segment in
  // temp/backup/tombstone names, so `.`/`..` must never slip through.
  if (value === "." || value === "..") {
    throw invalidInput("operationId must not be a path traversal token");
  }
}

/** A deterministic temp name derived from a validated operation id and pid. */
function tempName(operationId: string, pid: number, label: string): string {
  return `.tmp-${operationId}-${pid}-${label}`;
}

export class DependencyInjectedStore implements ProjectMemoryStore {
  private readonly fs: FileSystem;
  private readonly layout: StoreLayout;
  private readonly migrations: MigrationRegistry | undefined;

  constructor(options: StoreOptions) {
    this.fs = options.fs;
    this.layout = resolveStoreLayout(options.dataRoot);
    this.migrations = options.migrations;
  }

  // ---- Read paths (never write, never lock) --------------------------------

  async readManifest(projectId: string): Promise<ProjectStoreManifest | null> {
    assertNonEmptyId(projectId, "projectId");
    const projectKey = deriveProjectKey(projectId);
    const raw = await this.fs.readFileIfExists(manifestPathFor(this.layout, projectKey));
    if (raw === null) return null;
    this.assertManifestSize(raw);
    const manifest = parseAndVerifyManifest(raw);
    this.assertManifestOwnership(manifest, projectId, projectKey);
    this.assertReadableVersion(manifest);
    return manifest;
  }

  async listSnapshots(projectId: string): Promise<StoredSnapshotSummary[]> {
    const manifest = await this.readManifest(projectId);
    if (manifest === null) return [];
    // Chronology is the ONLY source of order: oldest capture first. A readable
    // (current-format) manifest always carries a verified snapshotHistory;
    // parseAndVerifyManifest already rejected any that violated the invariants.
    const history = manifest.snapshotHistory;
    if (history === undefined) {
      // Unreachable for a current-format store (readManifest gates the version
      // and parse verifies chronology); treat a missing chronology defensively
      // as controlled corruption rather than silently falling back to lexical.
      throw corruption("a readable store is missing its chronology", "the store may be corrupt");
    }
    const latest = manifest.latestSnapshotId;
    return history.map((entry) => ({
      snapshotId: entry.snapshotId,
      capturedAt: entry.capturedAt,
      sequence: entry.sequence,
      isLatest: latest === entry.snapshotId,
    }));
  }

  async readSnapshot(projectId: string, snapshotId: string): Promise<FinalizedProjectSnapshot> {
    assertNonEmptyId(snapshotId, "snapshotId");
    const manifest = await this.requireManifest(projectId);
    if (!manifest.snapshotIds.includes(snapshotId)) {
      throw missingReferencedRecord("snapshot is not referenced by the manifest");
    }
    const envelope = await this.readEnvelope(projectId, "snapshot", snapshotId);
    return envelope.payload as FinalizedProjectSnapshot;
  }

  async readEvidence(projectId: string, evidenceId: string): Promise<FinalizedEvidenceRecord> {
    assertNonEmptyId(evidenceId, "evidenceId");
    const manifest = await this.requireManifest(projectId);
    if (!manifest.evidenceIds.includes(evidenceId)) {
      throw missingReferencedRecord("evidence is not referenced by the manifest");
    }
    const envelope = await this.readEnvelope(projectId, "evidence", evidenceId);
    return envelope.payload as FinalizedEvidenceRecord;
  }

  async verify(projectId: string): Promise<StoreVerification> {
    assertNonEmptyId(projectId, "projectId");
    const projectKey = deriveProjectKey(projectId);
    const manifestPath = manifestPathFor(this.layout, projectKey);
    const raw = await this.fs.readFileIfExists(manifestPath);
    const issues: StoreInspectionIssue[] = [];
    if (raw === null) {
      return {
        projectId,
        ok: true,
        manifestVerified: false,
        verifiedSnapshotIds: [],
        verifiedEvidenceIds: [],
        issues: [],
      };
    }
    let manifest: ProjectStoreManifest;
    try {
      this.assertManifestSize(raw);
      manifest = parseAndVerifyManifest(raw);
      this.assertManifestOwnership(manifest, projectId, projectKey);
      this.assertReadableVersion(manifest);
    } catch (err) {
      return {
        projectId,
        ok: false,
        manifestVerified: false,
        verifiedSnapshotIds: [],
        verifiedEvidenceIds: [],
        issues: [{ kind: "integrityFailure", detail: describeError(err) }],
      };
    }
    const verifiedSnapshotIds: string[] = [];
    const verifiedEvidenceIds: string[] = [];
    // Map each snapshot to its chronology capturedAt so the record's own
    // capturedAt can be cross-checked against the authoritative capture time.
    const capturedAtByHistory = new Map<string, string>();
    for (const entry of manifest.snapshotHistory ?? []) {
      capturedAtByHistory.set(entry.snapshotId, entry.capturedAt);
    }
    for (const snapshotId of manifest.snapshotIds) {
      try {
        const envelope = await this.readEnvelope(projectId, "snapshot", snapshotId);
        // A v2 store's chronology capturedAt must equal the persisted payload's.
        const expectedCapturedAt = capturedAtByHistory.get(snapshotId);
        if (expectedCapturedAt !== undefined) {
          const payloadCapturedAt = (envelope.payload as { capturedAt?: unknown }).capturedAt;
          if (payloadCapturedAt !== expectedCapturedAt) {
            issues.push({
              kind: "integrityFailure",
              detail: "snapshot: chronology capturedAt does not match the record",
            });
            continue;
          }
        }
        verifiedSnapshotIds.push(snapshotId);
      } catch (err) {
        issues.push({ kind: classifyIssue(err), detail: `snapshot: ${describeError(err)}` });
      }
    }
    for (const evidenceId of manifest.evidenceIds) {
      try {
        await this.readEnvelope(projectId, "evidence", evidenceId);
        verifiedEvidenceIds.push(evidenceId);
      } catch (err) {
        issues.push({ kind: classifyIssue(err), detail: `evidence: ${describeError(err)}` });
      }
    }
    return {
      projectId,
      ok: issues.length === 0,
      manifestVerified: true,
      verifiedSnapshotIds,
      verifiedEvidenceIds,
      issues,
    };
  }

  async inspect(projectId: string): Promise<StoreInspection> {
    assertNonEmptyId(projectId, "projectId");
    const projectKey = deriveProjectKey(projectId);
    const projectDir = projectDirFor(this.layout, projectKey);
    const manifestPath = manifestPathFor(this.layout, projectKey);
    const raw = await this.fs.readFileIfExists(manifestPath);
    const issues: StoreInspectionIssue[] = [];

    if (raw === null) {
      const dirExists = await this.fs.exists(projectDir);
      return {
        projectId,
        exists: dirExists,
        versionState: "noPriorMemory",
        storeFormatVersion: null,
        projectBrainSchemaVersion: null,
        snapshotCount: 0,
        evidenceCount: 0,
        latestSnapshotId: null,
        issues: dirExists
          ? [{ kind: "abandonedStaging", detail: "project directory exists without a manifest" }]
          : [],
      };
    }

    let manifest: ProjectStoreManifest | null = null;
    let versionState: StoreVersionState = "supported";
    try {
      this.assertManifestSize(raw);
      manifest = parseAndVerifyManifest(raw);
      this.assertManifestOwnership(manifest, projectId, projectKey);
      versionState = this.classifyVersion(manifest);
      if (versionState === "unsupportedNewer") {
        issues.push({ kind: "unsupportedFormat", detail: "store format is newer than supported" });
      }
    } catch (err) {
      issues.push({ kind: "integrityFailure", detail: describeError(err) });
    }

    // Abandoned staging directory.
    const stagingDir = `${projectDir}/${STAGING_DIRNAME}`;
    if (await this.fs.exists(stagingDir)) {
      const stagingEntries = await this.fs.readDir(stagingDir);
      if (stagingEntries.length > 0) {
        issues.push({ kind: "abandonedStaging", detail: "non-empty staging directory present" });
      }
    }

    if (manifest !== null) {
      // Missing referenced records + unreferenced files on disk.
      const snapKeys = new Set(manifest.snapshotIds.map((id) => deriveRecordKey("snapshot", id)));
      const evKeys = new Set(manifest.evidenceIds.map((id) => deriveRecordKey("evidence", id)));
      await this.reportRecordDrift(projectDir, SNAPSHOTS_DIRNAME, snapKeys, issues);
      await this.reportRecordDrift(projectDir, EVIDENCE_DIRNAME, evKeys, issues);
    }

    return {
      projectId,
      exists: true,
      versionState,
      storeFormatVersion: manifest?.storeFormatVersion ?? null,
      projectBrainSchemaVersion: manifest?.projectBrainSchemaVersion ?? null,
      snapshotCount: manifest?.snapshotIds.length ?? 0,
      evidenceCount: manifest?.evidenceIds.length ?? 0,
      latestSnapshotId: manifest?.latestSnapshotId ?? null,
      issues,
    };
  }

  // ---- Commit (atomic write protocol) --------------------------------------

  async commitSnapshotBundle(input: CommitSnapshotBundleInput): Promise<CommitResult> {
    this.validateCommitInput(input);
    const { projectId, operationId } = input;
    const projectKey = deriveProjectKey(projectId);
    assertProjectDataSeparation(this.layout.dataRoot, input.projectRootBoundary);

    const lockPath = lockPathFor(this.layout, projectKey);
    await this.fs.mkdirp(this.layout.locksDir);
    const lock = await acquireLock(this.fs, lockPath, projectKey, operationId);
    const pid = this.fs.currentPid();
    const projectDir = projectDirFor(this.layout, projectKey);
    const stagingDir = `${projectDir}/${STAGING_DIRNAME}`;
    try {
      await this.failPoint("afterLock");

      // 3. Read and verify existing manifest.
      const existingManifest = await this.readManifest(projectId);

      // Idempotency + conflict detection against already-committed records.
      const idempotent = await this.reconcileExisting(input, existingManifest);
      if (idempotent) {
        // Clean staging here too, not only on the write path below.
        //
        // A crash AFTER the manifest rename leaves the store committed and a
        // staging directory behind. Re-running the same commit then takes this
        // early return, which used to skip step 13 entirely, so the residue
        // survived every subsequent identical commit and `inspect()` reported
        // abandonedStaging forever. Removing it is safe precisely because
        // reconcileExisting has already proved the records are committed with
        // identical verified payloads -- there is nothing in staging that is not
        // already authoritative.
        await this.fs.removeDir(stagingDir);
        return this.commitResultFrom(existingManifest as ProjectStoreManifest, input, true);
      }

      // 4. Create staging directory under the project store.
      await this.fs.mkdirp(`${projectDir}/${SNAPSHOTS_DIRNAME}`);
      await this.fs.mkdirp(`${projectDir}/${EVIDENCE_DIRNAME}`);
      await this.fs.mkdirp(stagingDir);
      await this.failPoint("afterStagingCreated");

      // 5. Write record envelopes to staging.
      const snapshotEnvelope = buildEnvelope(
        "snapshot",
        projectId,
        input.snapshot.snapshotId,
        input.snapshot,
      );
      const evidenceEnvelopes = input.evidence.map((record) =>
        buildEnvelope("evidence", projectId, record.evidenceId, record),
      );

      const staged: { readonly finalPath: string; readonly stagedPath: string }[] = [];
      const snapStagedName = `snapshot-${deriveRecordKey("snapshot", input.snapshot.snapshotId)}.json`;
      const snapStagedPath = `${stagingDir}/${snapStagedName}`;
      await this.writeStaged(snapStagedPath, serializeEnvelope(snapshotEnvelope), operationId, pid);
      staged.push({
        finalPath: recordPathFor(
          this.layout,
          projectKey,
          SNAPSHOTS_DIRNAME,
          deriveRecordKey("snapshot", input.snapshot.snapshotId),
        ),
        stagedPath: snapStagedPath,
      });
      await this.failPoint("afterFirstRecordWritten");

      for (const envelope of evidenceEnvelopes) {
        const key = deriveRecordKey("evidence", envelope.recordId);
        const stagedPath = `${stagingDir}/evidence-${key}.json`;
        await this.writeStaged(stagedPath, serializeEnvelope(envelope), operationId, pid);
        staged.push({
          finalPath: recordPathFor(this.layout, projectKey, EVIDENCE_DIRNAME, key),
          stagedPath,
        });
      }

      // 7. Move new immutable records to final paths (skip any already present).
      for (const item of staged) {
        if (await this.fs.exists(item.finalPath)) {
          // Idempotent record already committed with identical verified payload;
          // reconcileExisting proved equality, so leave the committed copy.
          continue;
        }
        await this.fs.moveFile(item.stagedPath, item.finalPath);
      }
      await this.failPoint("afterRecordsMoved");

      // 8. Build next manifest in memory.
      const nextManifest = this.buildNextManifest(input, existingManifest, projectKey);
      const manifestJson = serializeManifest(nextManifest);
      this.assertManifestSize(manifestJson);

      // 9-11. Write manifest.json.tmp, fsync, atomically rename (the commit point).
      await this.failPoint("beforeManifestRename");
      await this.fs.writeFileAtomic(
        manifestPathFor(this.layout, projectKey),
        manifestJson,
        tempName(operationId, pid, "manifest"),
      );
      await this.failPoint("afterManifestRename");

      // 12. fsync the project directory where supported.
      await this.fs.syncDir(projectDir);

      // 13. Remove staging.
      await this.failPoint("beforeCleanup");
      await this.fs.removeDir(stagingDir);

      return this.commitResultFrom(nextManifest, input, false);
    } catch (err) {
      // Failure before the manifest rename leaves the old store authoritative;
      // failure after it leaves the new store authoritative. We never adopt
      // abandoned staging silently — inspect() reports it. Surface a controlled
      // error rather than leaking the raw cause.
      if (isProjectMemoryError(err)) throw err;
      throw atomicCommitFailure("the commit failed before completion", "the prior store is intact");
    } finally {
      // 14. Release lock in finally.
      await lock.release();
    }
  }

  // ---- Export --------------------------------------------------------------

  async exportProject(input: ExportProjectMemoryInput): Promise<ExportResult> {
    assertNonEmptyId(input.projectId, "projectId");
    assertOperationId(input.operationId);
    assertProjectDataSeparation(this.layout.dataRoot, input.projectRootBoundary);
    assertExportDestinationSafe(this.layout.dataRoot, input.projectRootBoundary, input.destination);

    // Verify source store before copying anything.
    const verification = await this.verify(input.projectId);
    if (!verification.manifestVerified) {
      throw missingReferencedRecord("no store exists to export", "capture a snapshot first");
    }
    if (!verification.ok) {
      throw corruption("the source store failed verification", "run inspect for details");
    }
    const manifest = await this.requireManifest(input.projectId);
    const projectKey = deriveProjectKey(input.projectId);
    const projectDir = projectDirFor(this.layout, projectKey);

    if (await this.fs.exists(input.destination)) {
      throw invalidInput("the export destination already exists", "choose a fresh directory");
    }

    // Write to a temporary sibling destination, then atomically rename.
    const tmpDestination = `${input.destination}.tmp-${input.operationId}-${this.fs.currentPid()}`;
    await this.fs.removeDir(tmpDestination);
    await this.fs.mkdirp(`${tmpDestination}/${SNAPSHOTS_DIRNAME}`);
    await this.fs.mkdirp(`${tmpDestination}/${EVIDENCE_DIRNAME}`);

    const inventory: ExportInventoryEntry[] = [];
    const copyRecord = async (
      recordType: "snapshot" | "evidence",
      recordId: string,
      dir: typeof SNAPSHOTS_DIRNAME | typeof EVIDENCE_DIRNAME,
    ): Promise<void> => {
      const key = deriveRecordKey(recordType, recordId);
      const from = recordPathFor(this.layout, projectKey, dir, key);
      const relativePath = `${dir}/${key}.json`;
      const envelope = await this.readEnvelope(input.projectId, recordType, recordId);
      await this.fs.copyFileTo(from, `${tmpDestination}/${relativePath}`);
      inventory.push({ recordType, recordId, relativePath, integrity: envelope.integrity });
    };

    for (const snapshotId of manifest.snapshotIds)
      await copyRecord("snapshot", snapshotId, SNAPSHOTS_DIRNAME);
    for (const evidenceId of manifest.evidenceIds)
      await copyRecord("evidence", evidenceId, EVIDENCE_DIRNAME);

    // Copy the verified manifest verbatim (excludes locks/staging/backups).
    await this.fs.copyFileTo(
      `${projectDir}/${MANIFEST_FILENAME}`,
      `${tmpDestination}/${MANIFEST_FILENAME}`,
    );

    const sortedInventory = [...inventory].sort((a, b) =>
      a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
    );
    const inventoryIntegrity = computeIntegrity(
      DOMAIN_EXPORT_INVENTORY_INTEGRITY,
      sortedInventory.map((e) => ({
        recordType: e.recordType,
        recordId: e.recordId,
        relativePath: e.relativePath,
        integrity: e.integrity,
      })),
    );
    const exportManifest = {
      projectId: input.projectId,
      storeFormatVersion: manifest.storeFormatVersion,
      projectBrainSchemaVersion: manifest.projectBrainSchemaVersion,
      snapshotCount: manifest.snapshotIds.length,
      evidenceCount: manifest.evidenceIds.length,
      inventory: sortedInventory,
      inventoryIntegrity,
    };
    await this.fs.writeFileAtomic(
      `${tmpDestination}/export-manifest.json`,
      `${JSON.stringify(exportManifest, null, 2)}\n`,
      tempName(input.operationId, this.fs.currentPid(), "export-manifest"),
    );
    await this.fs.syncDir(tmpDestination);

    // Atomically rename the temporary export to the final destination.
    await this.fs.moveDir(tmpDestination, input.destination);

    // Verify the exported copy: manifest present and integrity holds.
    const exportedManifestRaw = await this.fs.readFileIfExists(
      `${input.destination}/${MANIFEST_FILENAME}`,
    );
    if (exportedManifestRaw === null) {
      throw corruption("the exported manifest is missing after export");
    }
    parseAndVerifyManifest(exportedManifestRaw);

    return {
      projectId: input.projectId,
      snapshotCount: manifest.snapshotIds.length,
      evidenceCount: manifest.evidenceIds.length,
      inventory: sortedInventory,
      inventoryIntegrity,
    };
  }

  // ---- Delete --------------------------------------------------------------

  async deleteProject(input: DeleteProjectMemoryInput): Promise<DeleteResult> {
    assertNonEmptyId(input.projectId, "projectId");
    assertOperationId(input.operationId);
    assertProjectDataSeparation(this.layout.dataRoot, input.projectRootBoundary);
    if (input.confirmation !== input.projectId) {
      throw deleteConfirmationMismatch("delete confirmation does not match the project id");
    }
    const projectKey = deriveProjectKey(input.projectId);
    const projectDir = projectDirFor(this.layout, projectKey);

    if (!(await this.fs.exists(projectDir))) {
      return { projectId: input.projectId, deleted: false };
    }

    const lockPath = lockPathFor(this.layout, projectKey);
    await this.fs.mkdirp(this.layout.locksDir);
    const lock = await acquireLock(this.fs, lockPath, projectKey, input.operationId);
    try {
      if (input.forceCorruptDelete !== true) {
        const verification = await this.verify(input.projectId);
        if (!verification.ok) {
          throw corruption(
            "the store failed verification; refusing to delete",
            "pass forceCorruptDelete to delete a corrupt store",
          );
        }
      }
      // Rename the project directory to a sibling tombstone, then remove it.
      const tombstone = `${projectDir}.tombstone-${input.operationId}-${this.fs.currentPid()}`;
      await this.fs.moveDir(projectDir, tombstone);
      await this.fs.removeDir(tombstone);
      return { projectId: input.projectId, deleted: true };
    } finally {
      await lock.release();
    }
  }

  // ---- Migration runner ----------------------------------------------------

  /**
   * Run the registered migration path for a project up to the current store
   * format version. Requires the project lock; verifies source, backs up, commits
   * the target atomically, verifies the target, and records history. Never runs
   * automatically from a read.
   */
  async migrateProject(projectId: string, operationId: string, occurredAt: string): Promise<void> {
    assertNonEmptyId(projectId, "projectId");
    assertOperationId(operationId);
    const source = await this.loadMigrationSource(projectId);

    const projectKey = deriveProjectKey(projectId);
    const manifestPath = manifestPathFor(this.layout, projectKey);
    const projectDir = projectDirFor(this.layout, projectKey);
    const lockPath = lockPathFor(this.layout, projectKey);
    await this.fs.mkdirp(this.layout.locksDir);
    const lock = await acquireLock(this.fs, lockPath, projectKey, operationId);
    try {
      // Backup before mutation (never auto-deleted).
      const backupDir = `${projectDir}/${BACKUPS_DIRNAME}/${operationId}`;
      await this.fs.mkdirp(backupDir);
      await this.fs.copyFileTo(manifestPath, `${backupDir}/${MANIFEST_FILENAME}`);

      // Pure, deterministic transform + rebuild. buildManifest re-validates every
      // chronology invariant, so a transform that produced an inconsistent
      // chronology fails closed here BEFORE the atomic commit, leaving the backup
      // and original intact.
      const rebuilt = this.applyMigrationPlan(
        source,
        projectId,
        projectKey,
        operationId,
        occurredAt,
      );

      await this.fs.writeFileAtomic(
        manifestPath,
        serializeManifest(rebuilt),
        tempName(operationId, this.fs.currentPid(), "migrate-manifest"),
      );
      await this.fs.syncDir(projectDir);

      // Verify the target after migration; failure preserves the original via the
      // untouched backup and surfaces a controlled error.
      const verification = await this.verify(projectId);
      if (!verification.ok) {
        throw corruption(
          "post-migration verification failed",
          "the pre-migration backup is intact",
        );
      }
    } finally {
      await lock.release();
    }
  }

  /**
   * Project the migrated (target-format) manifest WITHOUT writing anything: no
   * lock, no backup, no manifest/record write. This is the read-only preview
   * counterpart of `migrateProject`, used by the CLI capture preview so a v1
   * store's `--migrate-store` preview can show the exact recovered chronology.
   * Throws the same controlled errors as `migrateProject` when no store exists,
   * no migration path is registered, or the source is already current.
   */
  async previewMigratedManifest(
    projectId: string,
    occurredAt: string,
  ): Promise<ProjectStoreManifest> {
    return (await this.previewMigration(projectId, occurredAt)).manifest;
  }

  /**
   * Project the migrated store view WITHOUT writing anything: the target-format
   * manifest plus the immutable snapshot and evidence payloads keyed by id (read
   * verbatim from disk). No lock, no backup, no write. This backs the CLI
   * capture preview over a v1 store so `--migrate-store` preview shows the exact
   * recovered chronology and projects the new capture with parity.
   */
  async previewMigration(
    projectId: string,
    occurredAt: string,
  ): Promise<{
    readonly manifest: ProjectStoreManifest;
    readonly snapshots: ReadonlyMap<string, JsonObject>;
    readonly evidence: ReadonlyMap<string, JsonObject>;
  }> {
    assertNonEmptyId(projectId, "projectId");
    const source = await this.loadMigrationSource(projectId);
    const projectKey = deriveProjectKey(projectId);
    // A stable, safe operation id for the projected migration-history entry; the
    // preview never writes it anywhere.
    const manifest = this.applyMigrationPlan(source, projectId, projectKey, "preview", occurredAt);
    const snapshots = new Map<string, JsonObject>();
    for (const payload of source.snapshots) {
      const id = (payload as { snapshotId?: unknown }).snapshotId;
      if (typeof id === "string") snapshots.set(id, payload);
    }
    const evidence = new Map<string, JsonObject>();
    for (const payload of source.evidence) {
      const id = (payload as { evidenceId?: unknown }).evidenceId;
      if (typeof id === "string") evidence.set(id, payload);
    }
    return { manifest, snapshots, evidence };
  }

  /**
   * Read and validate the migration source material (manifest + raw payloads)
   * WITHOUT the readable-version gate (older is allowed precisely because it is
   * being migrated). Performs no write and holds no lock.
   */
  private async loadMigrationSource(projectId: string): Promise<{
    readonly sourceManifest: ProjectStoreManifest;
    readonly sourceVersion: number;
    readonly manifest: JsonObject;
    readonly snapshots: readonly JsonObject[];
    readonly evidence: readonly JsonObject[];
  }> {
    if (this.migrations === undefined) {
      throw migrationRequired("no migration registry is configured");
    }
    const projectKey = deriveProjectKey(projectId);
    const manifestPath = manifestPathFor(this.layout, projectKey);
    const raw = await this.fs.readFileIfExists(manifestPath);
    if (raw === null) throw migrationRequired("no store exists to migrate");
    const sourceManifest = parseAndVerifyManifest(raw);
    this.assertManifestOwnership(sourceManifest, projectId, projectKey);
    const sourceVersion = sourceManifest.storeFormatVersion;
    if (sourceVersion >= CURRENT_STORE_FORMAT_VERSION) {
      throw invalidInput("the store is already at or above the current format");
    }
    const projectDir = projectDirFor(this.layout, projectKey);
    return {
      sourceManifest,
      sourceVersion,
      manifest: JSON.parse(raw) as JsonObject,
      snapshots: await this.loadRawPayloads(projectDir, SNAPSHOTS_DIRNAME),
      evidence: await this.loadRawPayloads(projectDir, EVIDENCE_DIRNAME),
    };
  }

  /**
   * Run the registered migration plan over the source material and rebuild the
   * target manifest with a recorded history entry and fresh integrity. Pure:
   * performs no I/O. The chronology invariants are re-validated by buildManifest.
   */
  private applyMigrationPlan(
    source: {
      readonly sourceManifest: ProjectStoreManifest;
      readonly sourceVersion: number;
      readonly manifest: JsonObject;
      readonly snapshots: readonly JsonObject[];
      readonly evidence: readonly JsonObject[];
    },
    projectId: string,
    projectKey: string,
    operationId: string,
    occurredAt: string,
  ): ProjectStoreManifest {
    const plan = planMigration(this.migrations as MigrationRegistry, source.sourceVersion);
    let manifest: JsonObject = source.manifest;
    let snapshots = [...source.snapshots];
    let evidence = [...source.evidence];
    let current = source.sourceVersion;
    for (const step of plan.steps) {
      const target = step.migrate({ storeFormatVersion: current, manifest, snapshots, evidence });
      manifest = target.manifest;
      snapshots = [...target.snapshots];
      evidence = [...target.evidence];
      current = step.toStoreFormatVersion;
    }

    const migrationEntry = {
      fromStoreFormatVersion: source.sourceVersion,
      toStoreFormatVersion: current,
      migratedAt: occurredAt,
      operationId,
      backupKey: `${BACKUPS_DIRNAME}/${operationId}`,
    };
    const migrated = manifest as Record<string, unknown>;
    const migratedHistory = migrated["snapshotHistory"];
    const migratedOrigin = migrated["snapshotChronologyOrigin"];
    return buildManifest({
      storeFormatVersion: current,
      projectBrainSchemaVersion: SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION,
      projectId,
      projectKey,
      // A migration step returns an untyped JsonObject, so createdAt is
      // `unknown` here. Only a string is a usable timestamp: String() on an
      // object would persist the literal "[object Object]" into the manifest,
      // so anything non-string falls back to the operation time instead.
      createdAt: typeof migrated["createdAt"] === "string" ? migrated["createdAt"] : occurredAt,
      updatedAt: occurredAt,
      latestSnapshotId: migrated["latestSnapshotId"] as string | null,
      snapshotIds: (migrated["snapshotIds"] as string[]) ?? [],
      evidenceIds: (migrated["evidenceIds"] as string[]) ?? [],
      ...(migratedHistory !== undefined ? { snapshotHistory: migratedHistory as never } : {}),
      ...(migratedOrigin !== undefined
        ? { snapshotChronologyOrigin: migratedOrigin as never }
        : {}),
      migrationHistory: [
        ...(((source.sourceManifest.migrationHistory as unknown[]) ?? []) as never[]),
        migrationEntry,
      ],
    });
  }

  // ---- Internal helpers ----------------------------------------------------

  private async requireManifest(projectId: string): Promise<ProjectStoreManifest> {
    const manifest = await this.readManifest(projectId);
    if (manifest === null) {
      throw missingReferencedRecord("no store exists for this project");
    }
    return manifest;
  }

  private async readEnvelope(
    projectId: string,
    recordType: "snapshot" | "evidence",
    recordId: string,
  ): Promise<RecordEnvelope> {
    const projectKey = deriveProjectKey(projectId);
    const dir = recordType === "snapshot" ? SNAPSHOTS_DIRNAME : EVIDENCE_DIRNAME;
    const key = deriveRecordKey(recordType, recordId);
    const path = recordPathFor(this.layout, projectKey, dir, key);
    const raw = await this.fs.readFileIfExists(path);
    if (raw === null) {
      throw missingReferencedRecord(`${recordType} record is missing on disk`);
    }
    if (utf8ByteLength(raw) > MAX_RECORD_BYTES) {
      throw limitExceeded(`${recordType} record exceeds the maximum size`);
    }
    return parseAndVerifyEnvelope(raw, { recordType, projectId, recordId });
  }

  private assertManifestSize(raw: string): void {
    if (utf8ByteLength(raw) > MAX_MANIFEST_BYTES) {
      throw limitExceeded("manifest exceeds the maximum size");
    }
  }

  private assertManifestOwnership(
    manifest: ProjectStoreManifest,
    projectId: string,
    projectKey: string,
  ): void {
    if (manifest.projectId !== projectId || manifest.projectKey !== projectKey) {
      throw corruption("manifest project ownership mismatch", "the store may be corrupt");
    }
  }

  private classifyVersion(manifest: ProjectStoreManifest): StoreVersionState {
    if (manifest.projectBrainSchemaVersion !== SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION) {
      return "incompatibleSchema";
    }
    if (manifest.storeFormatVersion > CURRENT_STORE_FORMAT_VERSION) return "unsupportedNewer";
    if (manifest.storeFormatVersion < CURRENT_STORE_FORMAT_VERSION) return "migrationRequired";
    return "supported";
  }

  private assertReadableVersion(manifest: ProjectStoreManifest): void {
    const state = this.classifyVersion(manifest);
    if (state === "unsupportedNewer") {
      throw unsupportedStoreVersion(
        "the store format is newer than this build supports",
        "upgrade OH MY PM to read this store",
      );
    }
    if (state === "migrationRequired") {
      throw migrationRequired(
        "the store format is older and requires migration",
        "run an explicit migration",
      );
    }
    if (state === "incompatibleSchema") {
      throw unsupportedStoreVersion(
        "the Project Brain schema version is incompatible",
        "this store was written by a different schema",
      );
    }
  }

  private validateCommitInput(input: CommitSnapshotBundleInput): void {
    assertNonEmptyId(input.projectId, "projectId");
    assertOperationId(input.operationId);
    assertNonEmptyId(input.occurredAt, "occurredAt");
    if (typeof input.projectRootBoundary !== "string" || input.projectRootBoundary.length === 0) {
      throw invalidInput("projectRootBoundary must be a non-empty string");
    }
    const snapshot = input.snapshot;
    if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw invalidInput("snapshot must be an object");
    }
    assertNonEmptyId(snapshot.snapshotId, "snapshot.snapshotId");
    if (snapshot.projectId !== input.projectId) {
      throw invalidInput("snapshot.projectId must match the commit projectId");
    }
    if (snapshot.schemaVersion !== SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION) {
      throw invalidInput("snapshot.schemaVersion is not supported");
    }
    if (!Array.isArray(input.evidence)) {
      throw invalidInput("evidence must be an array");
    }
    if (input.evidence.length > MAX_EVIDENCE_PER_COMMIT) {
      throw limitExceeded("evidence per commit exceeds the maximum");
    }
    const evidenceIds = new Set<string>();
    for (const record of input.evidence) {
      if (record === null || typeof record !== "object" || Array.isArray(record)) {
        throw invalidInput("each evidence record must be an object");
      }
      assertNonEmptyId(record.evidenceId, "evidence.evidenceId");
      if (record.projectId !== input.projectId) {
        throw invalidInput("evidence.projectId must match the commit projectId");
      }
      if (record.schemaVersion !== SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION) {
        throw invalidInput("evidence.schemaVersion is not supported");
      }
      if (evidenceIds.has(record.evidenceId)) {
        throw invalidInput("duplicate evidenceId in commit");
      }
      evidenceIds.add(record.evidenceId);
      assertNoForbiddenKeys(record, "evidence record");
    }
    assertNoForbiddenKeys(snapshot, "snapshot");

    // Every evidence ref on the snapshot must exist in existing or submitted
    // evidence — checked against submitted here; existing checked in reconcile.
    const snapshotRefs = Array.isArray(snapshot.evidenceRefs) ? snapshot.evidenceRefs : [];
    for (const ref of snapshotRefs) {
      if (typeof ref !== "string") throw invalidInput("snapshot.evidenceRefs must be strings");
    }
  }

  /**
   * Reconcile a commit against the existing store: enforce record immutability
   * (same id + different payload = conflict), idempotency (same id + identical
   * verified payload), and cross-record reference existence. Returns true when
   * the entire bundle is a verified idempotent no-op.
   */
  private async reconcileExisting(
    input: CommitSnapshotBundleInput,
    existingManifest: ProjectStoreManifest | null,
  ): Promise<boolean> {
    const known = new Set<string>();
    if (existingManifest !== null) {
      for (const id of existingManifest.evidenceIds) known.add(id);
    }
    for (const record of input.evidence) known.add(record.evidenceId);

    // Snapshot evidence references must exist in existing or submitted evidence.
    const snapshotRefs = Array.isArray(input.snapshot.evidenceRefs)
      ? (input.snapshot.evidenceRefs as string[])
      : [];
    for (const ref of snapshotRefs) {
      if (!known.has(ref)) {
        throw missingReferencedRecord("snapshot references unknown evidence");
      }
    }

    if (existingManifest === null) return false;

    const snapshotExists = existingManifest.snapshotIds.includes(input.snapshot.snapshotId);
    let snapshotIdempotent = false;
    if (snapshotExists) {
      snapshotIdempotent = await this.payloadEquals(
        input.projectId,
        "snapshot",
        input.snapshot.snapshotId,
        input.snapshot,
      );
      if (!snapshotIdempotent) {
        throw recordConflict("snapshot id already exists with a different payload");
      }
    }

    let allEvidenceIdempotent = true;
    for (const record of input.evidence) {
      if (existingManifest.evidenceIds.includes(record.evidenceId)) {
        const same = await this.payloadEquals(
          input.projectId,
          "evidence",
          record.evidenceId,
          record,
        );
        if (!same) {
          throw recordConflict("evidence id already exists with a different payload");
        }
      } else {
        allEvidenceIdempotent = false;
      }
    }

    return snapshotExists && snapshotIdempotent && allEvidenceIdempotent;
  }

  private async payloadEquals(
    projectId: string,
    recordType: "snapshot" | "evidence",
    recordId: string,
    payload: JsonObject,
  ): Promise<boolean> {
    const existing = await this.readEnvelope(projectId, recordType, recordId);
    const rebuilt = buildEnvelope(recordType, projectId, recordId, payload);
    return existing.integrity === rebuilt.integrity;
  }

  private buildNextManifest(
    input: CommitSnapshotBundleInput,
    existing: ProjectStoreManifest | null,
    projectKey: string,
  ): ProjectStoreManifest {
    const snapshotIds = new Set<string>(existing?.snapshotIds ?? []);
    const evidenceIds = new Set<string>(existing?.evidenceIds ?? []);
    snapshotIds.add(input.snapshot.snapshotId);
    for (const record of input.evidence) evidenceIds.add(record.evidenceId);

    if (snapshotIds.size > MAX_SNAPSHOTS_PER_PROJECT) {
      throw limitExceeded("snapshots per project exceeds the maximum");
    }
    if (evidenceIds.size > MAX_EVIDENCE_PER_PROJECT) {
      throw limitExceeded("evidence per project exceeds the maximum");
    }

    // The history entry's capturedAt is the persisted Snapshot payload's own
    // capturedAt, never a fresh clock read. Validate it here so a commit can
    // never write a chronology entry that disagrees with the record.
    const capturedAt = this.requireSnapshotCapturedAt(input.snapshot);

    // Append exactly one chronology entry for a new snapshot; a pre-existing id
    // never reaches here (reconcileExisting returns idempotent before this).
    // A v1 store never reaches this path either: it must be migrated to v2
    // before a commit (readManifest gates an un-migrated store as
    // migrationRequired). So `existing` is either null or a v2 store.
    const existingHistory = existing?.snapshotHistory ?? [];
    const nextSequence =
      existingHistory.length === 0
        ? 1
        : (existingHistory[existingHistory.length - 1]?.sequence ?? existingHistory.length) + 1;
    const snapshotHistory = [
      ...existingHistory,
      { snapshotId: input.snapshot.snapshotId, capturedAt, sequence: nextSequence },
    ];
    // A new store is native; an existing store's origin is preserved verbatim
    // (a migrated `recoveredV1` store stays recoveredV1 across later commits).
    const snapshotChronologyOrigin: "native" | "recoveredV1" =
      existing?.snapshotChronologyOrigin ?? "native";

    return buildManifest({
      storeFormatVersion: CURRENT_STORE_FORMAT_VERSION,
      projectBrainSchemaVersion: SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION,
      projectId: input.projectId,
      projectKey,
      createdAt: existing?.createdAt ?? input.occurredAt,
      updatedAt: input.occurredAt,
      latestSnapshotId: input.snapshot.snapshotId,
      snapshotIds: [...snapshotIds].sort(),
      evidenceIds: [...evidenceIds].sort(),
      snapshotHistory,
      snapshotChronologyOrigin,
      migrationHistory: existing?.migrationHistory ?? [],
    });
  }

  /**
   * Read and validate the finalized snapshot's own `capturedAt`. It is the
   * source of the chronology entry's capture time; a system clock is never used.
   */
  private requireSnapshotCapturedAt(snapshot: FinalizedProjectSnapshot): string {
    const capturedAt = (snapshot as { capturedAt?: unknown }).capturedAt;
    if (typeof capturedAt !== "string" || capturedAt.length === 0) {
      throw invalidInput("snapshot.capturedAt must be a non-empty string");
    }
    return capturedAt;
  }

  private commitResultFrom(
    manifest: ProjectStoreManifest,
    input: CommitSnapshotBundleInput,
    idempotent: boolean,
  ): CommitResult {
    return {
      projectId: input.projectId,
      snapshotId: input.snapshot.snapshotId,
      committedEvidenceIds: input.evidence.map((r) => r.evidenceId),
      idempotent,
      latestSnapshotId: manifest.latestSnapshotId ?? input.snapshot.snapshotId,
      snapshotCount: manifest.snapshotIds.length,
      evidenceCount: manifest.evidenceIds.length,
    };
  }

  private async writeStaged(
    path: string,
    contents: string,
    operationId: string,
    pid: number,
  ): Promise<void> {
    if (utf8ByteLength(contents) > MAX_RECORD_BYTES) {
      throw limitExceeded("record exceeds the maximum size");
    }
    await this.fs.writeFileAtomic(path, contents, tempName(operationId, pid, "staged"));
  }

  private async reportRecordDrift(
    projectDir: string,
    dir: typeof SNAPSHOTS_DIRNAME | typeof EVIDENCE_DIRNAME,
    referencedKeys: Set<string>,
    issues: StoreInspectionIssue[],
  ): Promise<void> {
    const path = `${projectDir}/${dir}`;
    if (!(await this.fs.exists(path))) {
      if (referencedKeys.size > 0) {
        issues.push({ kind: "missingRecord", detail: `${dir} directory missing` });
      }
      return;
    }
    const entries = await this.fs.readDir(path);
    const onDisk = new Set<string>();
    for (const entry of entries) {
      if (entry.isSymbolicLink) {
        issues.push({ kind: "integrityFailure", detail: `symlink in ${dir}` });
        continue;
      }
      if (entry.isFile && entry.name.endsWith(".json")) {
        onDisk.add(entry.name.slice(0, -".json".length));
      }
    }
    for (const key of referencedKeys) {
      if (!onDisk.has(key)) issues.push({ kind: "missingRecord", detail: `${dir} record missing` });
    }
    for (const key of onDisk) {
      if (!referencedKeys.has(key)) {
        issues.push({ kind: "unreferencedRecord", detail: `${dir} record not in manifest` });
      }
    }
  }

  private async loadRawPayloads(
    projectDir: string,
    dir: typeof SNAPSHOTS_DIRNAME | typeof EVIDENCE_DIRNAME,
  ): Promise<JsonObject[]> {
    const path = `${projectDir}/${dir}`;
    if (!(await this.fs.exists(path))) return [];
    const entries = await this.fs.readDir(path);
    const payloads: JsonObject[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink) throw corruption("symlink present in a record directory");
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const raw = await this.fs.readFileIfExists(`${path}/${entry.name}`);
      if (raw === null) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      payloads.push((parsed["payload"] ?? parsed) as JsonObject);
    }
    return payloads;
  }

  private async failPoint(point: CommitFailurePoint): Promise<void> {
    if (this.fs.failAt === point) {
      throw atomicCommitFailure(`injected failure at ${point}`, "test-only failure injection");
    }
    return Promise.resolve();
  }
}

/** A short, sanitized description of an error for inspection issues. */
function describeError(err: unknown): string {
  if (isProjectMemoryError(err)) return err.code;
  return "unknown";
}

/** Classify an error into an inspection issue kind. */
function classifyIssue(err: unknown): StoreInspectionIssue["kind"] {
  if (isProjectMemoryError(err)) {
    switch (err.code) {
      case "OMP-MEM-1009":
        return "missingRecord";
      case "OMP-MEM-1005":
      case "OMP-MEM-1004":
        return "integrityFailure";
      default:
        return "integrityFailure";
    }
  }
  return "integrityFailure";
}

/** True when a value is a ProjectMemoryError (structural check, no import cycle). */
function isProjectMemoryError(
  err: unknown,
): err is { readonly code: string; readonly message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("OMP-MEM-")
  );
}
