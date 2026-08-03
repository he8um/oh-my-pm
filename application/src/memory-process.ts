// v0.3 Phase 4 — the Node process boundary for the `memory` commands.
//
// The memory commands are handled entirely here, like `providers`: they need
// project document reads, a real invocation timestamp, the Node Project Memory
// adapter, and application-data path resolution — none of which belong in the
// pure runCli/Runtime.handle path. Capture/changes compose the Phase 3 Project
// Brain Runtime; status/history/export/delete call the Phase 2 store directly.
//
// The Project Memory package is loaded through a dynamic import ONLY on this
// path, so legacy offline commands never resolve it. No project file is ever
// written; no absolute data-root/project-root path is ever printed.

import { createNodeWasmProjectBrainKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import type { LocalProviderItemInput } from "@oh-my-pm/providers";
import {
  createProjectBrainRuntime,
  createProviderRegistryObservationPort,
  isProjectBrainRuntimeError,
} from "@oh-my-pm/runtime";
import { deriveProjectBrainState } from "@oh-my-pm/skills";
import type { ProjectStateDeriver } from "@oh-my-pm/runtime";
import type {
  CaptureProjectResult,
  CompareProjectResult,
  MemoryCommitInput,
  MemoryManifest,
  ProjectMemoryPort,
  ProjectObservationRequest,
  TimelineProjectResult,
} from "@oh-my-pm/runtime";
import { createPreviewMemoryPort } from "./memory-preview.js";
import type { PreviewMemoryStoreReads } from "./memory-preview.js";
import {
  loadMemoryProjectDocuments,
  localMarkdownObservationRequest,
  resolveExplicitProjectId,
} from "./memory-project.js";
import type {
  MemoryCaptureCommand,
  MemoryChangesCommand,
  MemoryCliCommand,
  MemoryCommandOutcome,
  MemoryCoverageEntry,
  MemoryDeleteCommand,
  MemoryExportCommand,
  MemoryFailureOutcome,
  MemoryHistoryCommand,
  MemoryRepairCommand,
  MemoryStatusCommand,
  MemoryStoreStatus,
  MemorySubcommand,
  MemoryTimelineCommand,
} from "./memory-types.js";
import {
  MEMORY_DEFAULT_STALE_AFTER_SECONDS,
  MEMORY_MAX_FUTURE_SKEW_SECONDS,
} from "./memory-types.js";

/** Options injected at the process boundary (clock/pid deterministic in tests). */
export type MemoryProcessOptions = {
  /** Explicit invocation timestamp (RFC3339). Overrides `clock`. */
  now?: string;
  /** Real-clock accessor read once per memory invocation. */
  clock?: () => string;
  /** Process id used to derive the operation id (injected in tests). */
  processId?: number;
  /**
   * Injected memory store factory (tests). When set it takes precedence and no
   * dynamic import of the Node adapter happens. Production leaves this unset so
   * the Node adapter loads lazily on the memory path only.
   */
  storeFactory?: (dataRootOverride: string | undefined, now: string) => MemoryStore;
};

/**
 * The store surface this boundary uses — the Phase 2 `ProjectMemoryStore`
 * restricted to the methods the memory commands call. Kept structural so the
 * boundary never depends on the concrete Node class type at the type level.
 */
export type MemoryStore = PreviewMemoryStoreReads & {
  inspect(projectId: string): Promise<StoreInspection>;
  verify(projectId: string): Promise<StoreVerification>;
  commitSnapshotBundle(input: MemoryCommitInput): Promise<CommitResultLike>;
  exportProject(input: ExportInputLike): Promise<ExportResultLike>;
  deleteProject(input: DeleteInputLike): Promise<DeleteResultLike>;
  /** Explicit store-format migration to the current version (never on read). */
  migrateProject(projectId: string, operationId: string, occurredAt: string): Promise<void>;
  /**
   * Scan for corruption and propose a bounded repair plan. Strictly read-only:
   * this is the preview half of the recovery path, so it must not lock or write.
   */
  planRepair(projectId: string, operationId: string, occurredAt: string): Promise<RepairPlanLike>;
  /**
   * Execute an approved repair plan under the writer lock. Requires explicit
   * apply intent; re-scans and refuses a plan whose store fingerprint moved.
   */
  applyRepair(input: ApplyRepairLike): Promise<RepairReceiptLike>;
  /** Read-only projected migrated view (no write) backing the capture preview. */
  previewMigration(
    projectId: string,
    occurredAt: string,
  ): Promise<{
    manifest: MemoryManifest & {
      snapshotHistory?: readonly { snapshotId: string; capturedAt: string; sequence: number }[];
      snapshotChronologyOrigin?: "native" | "recoveredV1";
    };
    snapshots: ReadonlyMap<string, ProjectSnapshotLike>;
    evidence: ReadonlyMap<string, EvidenceRecordLike>;
  }>;
};

/** Structural mirrors of the opaque record payloads the preview reads. */
type ProjectSnapshotLike = { snapshotId: string; [key: string]: unknown };
type EvidenceRecordLike = { evidenceId: string; [key: string]: unknown };

// Structural mirrors of the Phase 2 result types the boundary reads (kept local
// so this module needs no type-level dependency on @oh-my-pm/project-memory).
type StoreVersionState =
  "noPriorMemory" | "supported" | "unsupportedNewer" | "migrationRequired" | "incompatibleSchema";
type StoreInspection = {
  projectId: string;
  exists: boolean;
  versionState: StoreVersionState;
  storeFormatVersion: number | null;
  projectBrainSchemaVersion: number | null;
  snapshotCount: number;
  evidenceCount: number;
  latestSnapshotId: string | null;
  issues: readonly { kind: string; detail: string }[];
};
type StoreVerification = {
  projectId: string;
  ok: boolean;
  issues: readonly { kind: string; detail: string }[];
};
type CommitResultLike = {
  projectId: string;
  snapshotId: string;
  idempotent: boolean;
  latestSnapshotId: string;
  snapshotCount: number;
  evidenceCount: number;
};
type ExportInputLike = {
  projectId: string;
  projectRootBoundary: string;
  operationId: string;
  destination: string;
};
type ExportResultLike = {
  projectId: string;
  snapshotCount: number;
  evidenceCount: number;
};
type DeleteInputLike = {
  projectId: string;
  projectRootBoundary: string;
  operationId: string;
  confirmation: string;
  forceCorruptDelete?: boolean;
};
type DeleteResultLike = { projectId: string; deleted: boolean };

// Structural mirrors of the Phase 2 repair types (G5). Kept local for the same
// reason as the types above: this boundary must not depend on the concrete
// @oh-my-pm/project-memory types at the type level.
type RepairFindingLike = {
  code: string;
  authority: string;
  target: string;
  repairability: string;
  action: string;
  blockingReason?: string;
};
type RepairPlanLike = {
  operationId: string;
  projectId: string;
  storeFingerprint: string;
  findings: readonly RepairFindingLike[];
  actions: readonly { action: string; code: string; target: string }[];
  summary: {
    findingCount: number;
    repairableCount: number;
    blockedCount: number;
    unrepairableCount: number;
  };
};
type ApplyRepairLike = {
  plan: RepairPlanLike;
  apply: boolean;
  appliedAt: string;
  projectRootBoundary: string;
};
type RepairReceiptLike = {
  operationId: string;
  projectId: string;
  outcomes: readonly {
    action: string;
    code: string;
    target: string;
    status: string;
    blockingReason?: string;
  }[];
  reconstructedCount: number;
  isolatedCount: number;
  removedCount: number;
  reclaimedCount: number;
  skippedCount: number;
  blockedCount: number;
};

const DEFAULT_NOW = "2026-01-01T00:00:00.000Z";

/**
 * The process id, used only to derive a bounded operation id for the store's
 * temporary staging names. This is the single ambient read outside the `node/`
 * boundary, and it is deliberate: the value never leaves the store's internal
 * naming, is never printed, and is never persisted in a Project Brain payload.
 * Every caller may inject `processId` instead, and the tests always do.
 */
function ambientProcessId(): number {
  const proc = (globalThis as { process?: { pid?: number } }).process;
  return typeof proc?.pid === "number" ? proc.pid : 0;
}

/**
 * Derive a bounded, deterministic operation id from the subcommand, the injected
 * timestamp, and the process id. No randomness, no project content. Never shown,
 * never persisted in Project Brain payloads (Phase 2 uses it only for temp
 * staging names).
 */
function deriveOperationId(subcommand: MemorySubcommand, now: string, pid: number): string {
  const safeTime = now.replace(/[^0-9A-Za-z]/g, "-");
  const id = `omp-${subcommand}-${safeTime}-${pid}`;
  // Bound the id defensively well under the Phase 2 MAX_OPERATION_ID_BYTES (128).
  return id.length > 120 ? id.slice(0, 120) : id;
}

/** Load the Node Project Memory adapter lazily, only on the memory path. */
async function loadStore(
  options: MemoryProcessOptions | undefined,
  dataRootOverride: string | undefined,
  now: string,
): Promise<MemoryStore> {
  if (options?.storeFactory !== undefined) {
    return options.storeFactory(dataRootOverride, now);
  }
  // Dynamic import: the Node persistence adapter is resolved ONLY here, so
  // legacy offline commands never load it.
  const memory = await import("@oh-my-pm/project-memory");
  const store = memory.createNodeProjectMemoryStore({
    ...(dataRootOverride !== undefined ? { dataRootOverride } : {}),
    filesystem: { now: () => now },
  });
  return store as unknown as MemoryStore;
}

function fail(
  subcommand: MemorySubcommand,
  code: string,
  message: string,
  exitCode: 1 | 2 | 3 | 4,
): MemoryFailureOutcome {
  return { command: `memory.${subcommand}`, ok: false, code, message, exitCode };
}

/** Map a Phase 2 store error code to a stable CLI exit code. */
function memoryErrorExitCode(code: string): 1 | 2 | 4 {
  switch (code) {
    case "OMP-MEM-1001": // invalid input
    case "OMP-MEM-1013": // delete confirmation mismatch
      return 2;
    case "OMP-MEM-1002": // path escape / collision
    case "OMP-MEM-1003": // store locked
    case "OMP-MEM-1004": // corruption
    case "OMP-MEM-1005": // integrity mismatch
    case "OMP-MEM-1006": // unsupported newer
    case "OMP-MEM-1007": // migration required
    case "OMP-MEM-1012": // export conflict
      return 4;
    default:
      return 1;
  }
}

/** Extract a stable, sanitized code from an unknown thrown value. */
function sanitizedErrorCode(err: unknown, fallback: string): string {
  if (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string"
  ) {
    return (err as { code: string }).code;
  }
  return fallback;
}

// --- Entry point -----------------------------------------------------------

/**
 * Run one parsed `memory` command at the process boundary and return a
 * structured outcome. Reads the clock at most once per invocation.
 */
export async function runMemoryProcess(
  command: MemoryCliCommand,
  options?: MemoryProcessOptions,
): Promise<MemoryCommandOutcome> {
  // The clock is consumed at most once per memory invocation, only here.
  const now = options?.now ?? options?.clock?.() ?? DEFAULT_NOW;
  const pid = options?.processId ?? ambientProcessId();

  switch (command.subcommand) {
    case "capture":
      return runCapture(command, options, now, pid);
    case "changes":
      return runChanges(command, options, now, pid);
    case "status":
      return runStatus(command, options, now);
    case "history":
      return runHistory(command, options, now);
    case "export":
      return runExport(command, options, now, pid);
    case "delete":
      return runDelete(command, options, now, pid);
    case "timeline":
      return runTimeline(command, options, now, pid);
    case "repair":
      return runRepair(command, options, now, pid);
  }
}

// --- repair (preview-first recovery) ---------------------------------------

/**
 * Run one `memory repair`.
 *
 * Preview scans and proposes without writing; `--apply` performs the bounded
 * recovery under the writer lock. The two halves are separate store calls rather
 * than one call with a flag, so the read-only path physically cannot reach the
 * writer.
 */
async function runRepair(
  command: MemoryRepairCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
  pid: number,
): Promise<MemoryCommandOutcome> {
  const identity = await resolveReadIdentity("repair", command, command.projectId);
  if (!identity.ok) return identity.failure;

  const store = await loadStore(options, command.dataDir, now);
  const operationId = deriveOperationId("repair", now, pid);

  let plan: RepairPlanLike;
  try {
    plan = await store.planRepair(identity.projectId, operationId, now);
  } catch (err) {
    const code = sanitizedErrorCode(err, "OMP-C-3003");
    return fail("repair", code, "repair scan failed", memoryErrorExitCode(code));
  }

  const inspection = await store.inspect(identity.projectId);
  const findings = plan.findings.map((finding) => ({
    code: finding.code,
    authority: finding.authority,
    target: finding.target,
    repairability: finding.repairability,
    action: finding.action,
    ...(finding.blockingReason !== undefined ? { blockingReason: finding.blockingReason } : {}),
  }));

  if (!command.apply) {
    return {
      command: "memory.repair",
      ok: true,
      mode: "preview",
      projectId: identity.projectId,
      storeExists: inspection.exists,
      findings,
      findingCount: plan.summary.findingCount,
      actionCount: plan.actions.length,
      blockedCount: plan.summary.blockedCount,
      unrepairableCount: plan.summary.unrepairableCount,
      wouldRepair: plan.actions.length > 0,
    };
  }

  try {
    const receipt = await store.applyRepair({
      plan,
      apply: true,
      appliedAt: now,
      projectRootBoundary: command.projectRoot,
    });
    return {
      command: "memory.repair",
      ok: true,
      mode: "applied",
      projectId: identity.projectId,
      storeExists: inspection.exists,
      findings,
      findingCount: plan.summary.findingCount,
      actionCount: receipt.outcomes.length,
      blockedCount: plan.summary.blockedCount,
      unrepairableCount: plan.summary.unrepairableCount,
      outcomes: receipt.outcomes.map((entry) => ({
        action: entry.action,
        code: entry.code,
        target: entry.target,
        status: entry.status,
        ...(entry.blockingReason !== undefined ? { blockingReason: entry.blockingReason } : {}),
      })),
      // Distinct tallies: isolation is never presented as semantic recovery.
      reconstructedCount: receipt.reconstructedCount,
      isolatedCount: receipt.isolatedCount,
      removedCount: receipt.removedCount,
      reclaimedCount: receipt.reclaimedCount,
      skippedCount: receipt.skippedCount,
    };
  } catch (err) {
    const code = sanitizedErrorCode(err, "OMP-C-3003");
    return fail("repair", code, "repair apply failed", memoryErrorExitCode(code));
  }
}

// --- capture ---------------------------------------------------------------

async function runCapture(
  command: MemoryCaptureCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
  pid: number,
): Promise<MemoryCommandOutcome> {
  const load = loadMemoryProjectDocuments(command.projectRoot);
  if (!load.ok) {
    return documentLoadFailure("capture", load);
  }
  const identity = resolveExplicitProjectId(command.projectId, load.configProjectId);
  if (!identity.ok) {
    return fail("capture", identity.code, identity.message, 2);
  }

  const store = await loadStore(options, command.dataDir, now);
  const observation = createProviderRegistryObservationPort(
    createProviderRegistry([createLocalProvider({ items: load.items })]),
  );
  const captureInputBase = buildCaptureInput(
    command,
    identity.projectId,
    now,
    pid,
    localMarkdownObservationRequest(),
  );

  // Classify the on-disk store format before doing anything. A store format v1
  // store must be explicitly migrated to v2 before a capture; this is the write
  // boundary where that decision is made.
  const inspection = await store.inspect(identity.projectId);
  const needsMigration = inspection.exists && inspection.versionState === "migrationRequired";

  if (!command.apply) {
    return runCapturePreview(
      command,
      store,
      identity.projectId,
      observation,
      captureInputBase,
      now,
      needsMigration,
    );
  }

  return runCaptureApply(
    command,
    store,
    identity.projectId,
    observation,
    captureInputBase,
    now,
    pid,
    needsMigration,
  );
}

/** Run a capture PREVIEW: zero writes, zero locks, no data-directory creation. */
async function runCapturePreview(
  command: MemoryCaptureCommand,
  store: MemoryStore,
  projectId: string,
  observation: ReturnType<typeof createProviderRegistryObservationPort>,
  captureInputBase: ReturnType<typeof buildCaptureInput>,
  now: string,
  needsMigration: boolean,
): Promise<MemoryCommandOutcome> {
  if (needsMigration && !command.migrateStore) {
    // A read-only capture preview over a v1 store reports migrationRequired and
    // never auto-migrates; the user must pass --migrate-store to project across
    // the migration. Exit 4 (operational, no write).
    return fail("capture", "OMP-MEM-1007", "store migration required", 4);
  }

  // Reads delegate to the real store; a migrating preview instead delegates to
  // the projected recovered v2 view (computed read-only, zero writes).
  const reads: PreviewMemoryStoreReads =
    needsMigration && command.migrateStore
      ? await migratedPreviewReads(store, projectId, now)
      : store;
  const preview = createPreviewMemoryPort(reads);
  const runtime = createProjectBrainRuntime({
    kernel: createNodeWasmProjectBrainKernelApi(),
    memory: preview.port,
    observation,
    deriver: DERIVER,
  });
  let result: CaptureProjectResult;
  try {
    result = await runtime.capture(captureInputBase);
  } catch (err) {
    return captureThrowFailure(err);
  }
  if (!result.ok) {
    return captureResultFailure(result);
  }
  const projection = preview.projection();
  return {
    command: "memory.capture",
    ok: true,
    mode: "preview",
    wouldWrite: false,
    wouldCreateSnapshot: projection?.wouldCreateSnapshot ?? true,
    wouldBeIdempotent: projection?.wouldBeIdempotent ?? false,
    ...(needsMigration && command.migrateStore ? { wouldMigrateStore: true } : {}),
    projectId,
    snapshotId: result.snapshotId ?? "",
    stateFingerprint: result.stateFingerprint ?? "",
    snapshotFingerprint: result.snapshotFingerprint ?? "",
    itemCount: result.itemCount ?? 0,
    evidenceCount: result.evidenceCount ?? 0,
    snapshotCount: projection?.projectedSnapshotCount ?? 0,
    coverageComplete: result.coverageComplete ?? false,
    coverage: mapCoverage(result),
  };
}

/** Run a capture APPLY: migrate a v1 store once (if requested), then commit once. */
async function runCaptureApply(
  command: MemoryCaptureCommand,
  store: MemoryStore,
  projectId: string,
  observation: ReturnType<typeof createProviderRegistryObservationPort>,
  captureInputBase: ReturnType<typeof buildCaptureInput>,
  now: string,
  pid: number,
  needsMigration: boolean,
): Promise<MemoryCommandOutcome> {
  let storeMigrated = false;
  if (needsMigration) {
    if (!command.migrateStore) {
      // Apply over a v1 store WITHOUT --migrate-store: exit 4, write nothing.
      return fail("capture", "OMP-MEM-1007", "store migration required", 4);
    }
    // Explicitly migrate v1 -> v2 exactly once before the capture.
    try {
      await store.migrateProject(projectId, deriveOperationId("capture", now, pid), now);
      storeMigrated = true;
    } catch (err) {
      const code = sanitizedErrorCode(err, "OMP-C-3003");
      return fail("capture", code, "store migration failed", memoryErrorExitCode(code));
    }
  }

  const runtime = createProjectBrainRuntime({
    kernel: createNodeWasmProjectBrainKernelApi(),
    memory: realMemoryPort(store),
    observation,
    deriver: DERIVER,
  });
  let result: CaptureProjectResult;
  try {
    result = await runtime.capture(captureInputBase);
  } catch (err) {
    return captureThrowFailure(err, storeMigrated);
  }
  if (!result.ok) {
    // Migration may have completed even though the subsequent capture failed;
    // never claim the capture succeeded, but surface that the store migrated.
    return captureResultFailure(result, storeMigrated);
  }
  // Read the committed snapshot count for the applied summary.
  const inspection = await store.inspect(projectId);
  return {
    command: "memory.capture",
    ok: true,
    mode: "applied",
    written: true,
    idempotent: result.idempotent ?? false,
    ...(storeMigrated ? { storeMigrated: true } : {}),
    projectId,
    snapshotId: result.snapshotId ?? "",
    stateFingerprint: result.stateFingerprint ?? "",
    snapshotFingerprint: result.snapshotFingerprint ?? "",
    itemCount: result.itemCount ?? 0,
    evidenceCount: result.evidenceCount ?? 0,
    snapshotCount: inspection.snapshotCount,
    coverageComplete: result.coverageComplete ?? false,
    coverage: mapCoverage(result),
  };
}

/**
 * Build a read-only preview view over the projected recovered v2 store. Reads
 * come from the in-memory migration projection (`previewMigration`), so the
 * capture preview projects the recovered chronology plus the new capture with
 * ZERO writes, locks, or data-directory creation.
 */
async function migratedPreviewReads(
  store: MemoryStore,
  projectId: string,
  now: string,
): Promise<PreviewMemoryStoreReads> {
  const projected = await store.previewMigration(projectId, now);
  const manifest = projected.manifest;
  return {
    async readManifest() {
      return manifest;
    },
    async listSnapshots() {
      const history: readonly { snapshotId: string; capturedAt: string; sequence: number }[] =
        manifest.snapshotHistory ?? [];
      return history.map((entry) => ({
        snapshotId: entry.snapshotId,
        capturedAt: entry.capturedAt,
        sequence: entry.sequence,
        isLatest: manifest.latestSnapshotId === entry.snapshotId,
      }));
    },
    async readSnapshot(_projectId, snapshotId) {
      const payload = projected.snapshots.get(snapshotId);
      if (payload === undefined) throw new Error("snapshot not found in projected view");
      return payload as never;
    },
    async readEvidence(_projectId, evidenceId) {
      const payload = projected.evidence.get(evidenceId);
      if (payload === undefined) throw new Error("evidence not found in projected view");
      return payload as never;
    },
  };
}

function buildCaptureInput(
  command: MemoryCaptureCommand,
  projectId: string,
  now: string,
  pid: number,
  observation: ProjectObservationRequest,
) {
  return {
    requestId: `omp-capture-${pid}`,
    projectRootBoundary: command.projectRoot,
    operationId: deriveOperationId("capture", now, pid),
    observedAt: now,
    capturedAt: now,
    identitySeed: { explicitId: projectId },
    locale: command.locale,
    observations: [observation],
    freshnessPolicy: { maxFutureSkewSeconds: MEMORY_MAX_FUTURE_SKEW_SECONDS },
  };
}

function mapCoverage(result: CaptureProjectResult): MemoryCoverageEntry[] {
  return result.coverage.map((entry) => ({
    sourceIdentity: entry.sourceIdentity,
    coverageState: entry.coverageState,
    ...(entry.gapReason !== undefined ? { gapReason: entry.gapReason } : {}),
  }));
}

function captureThrowFailure(err: unknown, storeMigrated = false): MemoryFailureOutcome {
  const base = isProjectBrainRuntimeError(err)
    ? fail("capture", err.code, "capture failed", 1)
    : fail("capture", "OMP-C-3003", "capture failed", 1);
  return storeMigrated ? { ...base, storeMigrated: true } : base;
}

function captureResultFailure(
  result: CaptureProjectResult,
  storeMigrated = false,
): MemoryFailureOutcome {
  const code = result.error?.code ?? "OMP-R-PB-6006";
  // A required-source failure is operational (exit 1).
  const base = fail("capture", code, "capture failed", 1);
  return storeMigrated ? { ...base, storeMigrated: true } : base;
}

// --- changes (compare) -----------------------------------------------------

async function runChanges(
  command: MemoryChangesCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
  pid: number,
): Promise<MemoryCommandOutcome> {
  const load = loadMemoryProjectDocuments(command.projectRoot);
  // changes is read-only over the store; it still resolves identity from config
  // when no --project-id is given, so a config read is needed. A missing/invalid
  // config or root is an input error.
  let configProjectId: string | undefined;
  if (load.ok) {
    configProjectId = load.configProjectId;
  } else if (command.projectId === undefined) {
    // Without an explicit id we depend on config; surface the input failure.
    return documentLoadFailure("changes", load);
  }
  const identity = resolveExplicitProjectId(command.projectId, configProjectId);
  if (!identity.ok) {
    return fail("changes", identity.code, identity.message, 2);
  }

  const store = await loadStore(options, command.dataDir, now);
  const runtime = createProjectBrainRuntime({
    kernel: createNodeWasmProjectBrainKernelApi(),
    memory: realMemoryPort(store),
    observation: createProviderRegistryObservationPort(createProviderRegistry([])),
    deriver: DERIVER,
  });

  let result: CompareProjectResult;
  try {
    result = await runtime.compare({
      requestId: `omp-changes-${pid}`,
      projectId: identity.projectId,
      comparedAt: now,
      ...(command.previousSnapshotId !== undefined
        ? { previousSnapshotId: command.previousSnapshotId }
        : {}),
      ...(command.currentSnapshotId !== undefined
        ? { currentSnapshotId: command.currentSnapshotId }
        : {}),
      stalenessPolicy: {
        evidenceStaleAfterSeconds: command.staleAfterSeconds,
        maxFutureSkewSeconds: MEMORY_MAX_FUTURE_SKEW_SECONDS,
      },
    });
  } catch (err) {
    return fail("changes", sanitizedErrorCode(err, "OMP-R-PB-6010"), "compare failed", 1);
  }

  if (result.status === "failed") {
    return fail("changes", result.error?.code ?? "OMP-R-PB-6010", "compare failed", 1);
  }
  if (result.status === "noPriorMemory") {
    return {
      command: "memory.changes",
      ok: true,
      status: "noPriorMemory",
      projectId: identity.projectId,
    };
  }
  if (result.status === "insufficientHistory") {
    return {
      command: "memory.changes",
      ok: true,
      status: "insufficientHistory",
      projectId: identity.projectId,
    };
  }
  const changeSet = result.changeSet;
  const changeCount = readChangeCount(changeSet);
  return {
    command: "memory.changes",
    ok: true,
    status: "compared",
    projectId: identity.projectId,
    ...(result.previousSnapshotId !== undefined
      ? { previousSnapshotId: result.previousSnapshotId }
      : {}),
    ...(result.currentSnapshotId !== undefined
      ? { currentSnapshotId: result.currentSnapshotId }
      : {}),
    changeSet,
    changeCount,
  };
}

function readChangeCount(changeSet: unknown): number {
  const changes = (changeSet as { changes?: readonly unknown[] } | undefined)?.changes;
  return Array.isArray(changes) ? changes.length : 0;
}

// --- timeline (read-only) --------------------------------------------------

/**
 * Run one read-only `memory timeline` query. It reads committed memory only:
 * no project document is read, no provider is constructed, no clock beyond the
 * single injected invocation timestamp is consumed, and nothing is written. The
 * project is identified by --project-id alone, so no project root is required
 * and no project config is read.
 */
async function runTimeline(
  command: MemoryTimelineCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
  pid: number,
): Promise<MemoryCommandOutcome> {
  // The parser guarantees an explicit project id for timeline, so identity
  // resolution needs no config read and no project root.
  const projectId = command.projectId;
  if (projectId === undefined || projectId.length === 0) {
    return fail("timeline", "memory_project_id_required", "--project-id is required", 2);
  }

  const store = await loadStore(options, command.dataDir, now);
  const runtime = createProjectBrainRuntime({
    kernel: createNodeWasmProjectBrainKernelApi(),
    memory: realMemoryPort(store),
    // The timeline never observes and never derives state; inert ports fail
    // closed if the path ever tried to.
    observation: createProviderRegistryObservationPort(createProviderRegistry([])),
    deriver: DERIVER,
  });

  let result: TimelineProjectResult;
  try {
    result = await runtime.timeline({
      requestId: `omp-timeline-${pid}`,
      projectId,
      comparedAt: now,
      limit: command.limit,
      ...(command.beforeSequence !== undefined ? { beforeSequence: command.beforeSequence } : {}),
      ...(command.category !== undefined ? { category: command.category } : {}),
      ...(command.kind !== undefined ? { kind: command.kind } : {}),
      stalenessPolicy: {
        evidenceStaleAfterSeconds: MEMORY_DEFAULT_STALE_AFTER_SECONDS,
        maxFutureSkewSeconds: MEMORY_MAX_FUTURE_SKEW_SECONDS,
      },
    });
  } catch (err) {
    return fail("timeline", sanitizedErrorCode(err, "OMP-R-PB-6012"), "timeline failed", 1);
  }

  if (result.status === "failed") {
    const code = result.error?.code ?? "OMP-R-PB-6012";
    // A validation failure is a usage error (2); every other failure is
    // operational. No partial timeline is ever emitted.
    const exitCode = code === "OMP-R-PB-6001" ? 2 : timelineErrorExitCode(code);
    return fail("timeline", code, "timeline failed", exitCode);
  }

  // noPriorMemory and derived both carry a valid (possibly empty) result.
  const timeline = result.result;
  if (timeline === undefined) {
    return fail("timeline", "OMP-R-PB-6012", "timeline failed", 1);
  }
  return {
    command: "memory.timeline",
    ok: true,
    projectId,
    limit: command.limit,
    eventCount: timeline.eventCount,
    hasMore: timeline.hasMore,
    ...(timeline.nextBeforeSequence !== undefined
      ? { nextBeforeSequence: timeline.nextBeforeSequence }
      : {}),
    ...(command.category !== undefined ? { category: command.category } : {}),
    ...(command.kind !== undefined ? { kind: command.kind } : {}),
    events: [...timeline.events],
  };
}

/** Map a timeline failure code to a stable CLI exit code. */
function timelineErrorExitCode(code: string): 1 | 2 | 4 {
  switch (code) {
    case "OMP-R-PB-6001": // invalid input
      return 2;
    case "OMP-R-PB-6009": // stored record read failed (corruption/integrity)
      return 4;
    default:
      return memoryErrorExitCode(code);
  }
}

// --- status ----------------------------------------------------------------

async function runStatus(
  command: MemoryStatusCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
): Promise<MemoryCommandOutcome> {
  const identity = await resolveReadIdentity("status", command, command.projectId);
  if (!identity.ok) return identity.failure;

  const store = await loadStore(options, command.dataDir, now);
  const inspection = await store.inspect(identity.projectId);
  let verification: StoreVerification | null = null;
  if (inspection.exists) {
    verification = await store.verify(identity.projectId);
  }
  const status = mapStoreStatus(inspection, verification);
  const issues = [
    ...inspection.issues.map((i) => i.kind),
    ...(verification !== null ? verification.issues.map((i) => i.kind) : []),
  ];
  return {
    command: "memory.status",
    ok: true,
    projectId: identity.projectId,
    status,
    storeFormatVersion: inspection.storeFormatVersion,
    projectBrainSchemaVersion: inspection.projectBrainSchemaVersion,
    snapshotCount: inspection.snapshotCount,
    evidenceCount: inspection.evidenceCount,
    latestSnapshotId: inspection.latestSnapshotId,
    issues: dedupeStrings(issues).slice(0, 20),
  };
}

/** Map the Phase 2 version state + verification into the CLI status value. */
function mapStoreStatus(
  inspection: StoreInspection,
  verification: StoreVerification | null,
): MemoryStoreStatus {
  if (!inspection.exists || inspection.versionState === "noPriorMemory") {
    return "noPriorMemory";
  }
  if (inspection.versionState === "unsupportedNewer") return "unsupportedNewer";
  if (inspection.versionState === "migrationRequired") return "migrationRequired";
  if (inspection.versionState === "incompatibleSchema") return "incompatibleSchema";
  // Supported version: health depends on integrity verification.
  if (verification !== null && !verification.ok) return "corrupt";
  if (inspection.issues.length > 0) return "corrupt";
  return "healthy";
}

// --- history ---------------------------------------------------------------

async function runHistory(
  command: MemoryHistoryCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
): Promise<MemoryCommandOutcome> {
  const identity = await resolveReadIdentity("history", command, command.projectId);
  if (!identity.ok) return identity.failure;

  const store = await loadStore(options, command.dataDir, now);
  // listSnapshots returns the authoritative capture chronology oldest-first.
  // History presents newest capture first: reverse for presentation only,
  // bounded by the requested limit. The order is real capture order (sequence),
  // never a lexical id order.
  const summaries = await store.listSnapshots(identity.projectId);
  const newestFirst = [...summaries].reverse().slice(0, command.limit);
  // Surface the chronology provenance at the command/result level.
  const manifest = await store.readManifest(identity.projectId);
  const chronologyOrigin = (
    manifest as (MemoryManifest & { snapshotChronologyOrigin?: "native" | "recoveredV1" }) | null
  )?.snapshotChronologyOrigin;
  return {
    command: "memory.history",
    ok: true,
    projectId: identity.projectId,
    limit: command.limit,
    snapshotCount: summaries.length,
    ...(chronologyOrigin !== undefined ? { chronologyOrigin } : {}),
    records: newestFirst.map((s) => ({
      snapshotId: s.snapshotId,
      capturedAt: s.capturedAt,
      sequence: s.sequence,
      isLatest: s.isLatest,
    })),
  };
}

// --- export ----------------------------------------------------------------

async function runExport(
  command: MemoryExportCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
  pid: number,
): Promise<MemoryCommandOutcome> {
  const identity = await resolveReadIdentity("export", command, command.projectId);
  if (!identity.ok) return identity.failure;

  const store = await loadStore(options, command.dataDir, now);

  if (!command.apply) {
    // Preview: verify the source and report the bounded inventory; write nothing.
    const inspection = await store.inspect(identity.projectId);
    if (!inspection.exists) {
      return fail("export", "OMP-R-PB-6007", "no prior memory to export", 3);
    }
    return {
      command: "memory.export",
      ok: true,
      mode: "preview",
      wouldExport: true,
      projectId: identity.projectId,
      destination: command.destination,
      snapshotCount: inspection.snapshotCount,
      evidenceCount: inspection.evidenceCount,
    };
  }

  try {
    const result = await store.exportProject({
      projectId: identity.projectId,
      projectRootBoundary: command.projectRoot,
      operationId: deriveOperationId("export", now, pid),
      destination: command.destination,
    });
    return {
      command: "memory.export",
      ok: true,
      mode: "applied",
      exported: true,
      projectId: identity.projectId,
      destination: command.destination,
      snapshotCount: result.snapshotCount,
      evidenceCount: result.evidenceCount,
    };
  } catch (err) {
    const code = sanitizedErrorCode(err, "OMP-C-3003");
    return fail("export", code, "export failed", memoryErrorExitCode(code));
  }
}

// --- delete ----------------------------------------------------------------

async function runDelete(
  command: MemoryDeleteCommand,
  options: MemoryProcessOptions | undefined,
  now: string,
  pid: number,
): Promise<MemoryCommandOutcome> {
  const identity = await resolveReadIdentity("delete", command, command.projectId);
  if (!identity.ok) return identity.failure;

  const store = await loadStore(options, command.dataDir, now);

  if (!command.apply) {
    const inspection = await store.inspect(identity.projectId);
    return {
      command: "memory.delete",
      ok: true,
      mode: "preview",
      projectId: identity.projectId,
      storeExists: inspection.exists,
      wouldDelete: inspection.exists,
      snapshotCount: inspection.snapshotCount,
      evidenceCount: inspection.evidenceCount,
    };
  }

  // Apply requires an exact confirmation equal to the resolved project id.
  if (command.confirm === undefined || command.confirm !== identity.projectId) {
    return fail(
      "delete",
      "OMP-MEM-1013",
      "delete confirmation must equal the project id exactly",
      2,
    );
  }
  try {
    const result = await store.deleteProject({
      projectId: identity.projectId,
      projectRootBoundary: command.projectRoot,
      operationId: deriveOperationId("delete", now, pid),
      confirmation: command.confirm,
      ...(command.forceCorruptDelete ? { forceCorruptDelete: true } : {}),
    });
    return {
      command: "memory.delete",
      ok: true,
      mode: "applied",
      projectId: identity.projectId,
      storeExists: result.deleted,
      deleted: result.deleted,
    };
  } catch (err) {
    const code = sanitizedErrorCode(err, "OMP-C-3003");
    return fail("delete", code, "delete failed", memoryErrorExitCode(code));
  }
}

// --- shared helpers --------------------------------------------------------

type ReadIdentity = { ok: true; projectId: string } | { ok: false; failure: MemoryFailureOutcome };

/**
 * Resolve identity for a read/store command. When no --project-id is given, the
 * config is consulted (a config/root failure is an input error only when the id
 * cannot be resolved otherwise).
 */
async function resolveReadIdentity(
  subcommand: MemorySubcommand,
  command: { projectRoot: string },
  flagProjectId: string | undefined,
): Promise<ReadIdentity> {
  let configProjectId: string | undefined;
  if (flagProjectId === undefined) {
    const load = loadMemoryProjectDocuments(command.projectRoot);
    if (load.ok) {
      configProjectId = load.configProjectId;
    } else if (load.code === "memory_project_config_invalid") {
      return {
        ok: false,
        failure: fail(subcommand, "memory_project_config_invalid", "invalid project config", 2),
      };
    }
    // A missing root / no-documents is not fatal for read commands as long as a
    // config projectId is present; if not, identity resolution below fails.
  }
  const identity = resolveExplicitProjectId(flagProjectId, configProjectId);
  if (!identity.ok) {
    return { ok: false, failure: fail(subcommand, identity.code, identity.message, 2) };
  }
  return { ok: true, projectId: identity.projectId };
}

function documentLoadFailure(
  subcommand: MemorySubcommand,
  load: Extract<ReturnType<typeof loadMemoryProjectDocuments>, { ok: false }>,
): MemoryFailureOutcome {
  const messages: Record<string, string> = {
    memory_project_config_invalid: `invalid project config: ${load.reference}`,
    memory_project_root_invalid: `project root not found or not a directory: ${load.reference}`,
    memory_no_documents: `no markdown project documents matched under: ${load.reference}`,
  };
  return fail(subcommand, load.code, messages[load.code] ?? "project load failed", 2);
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/**
 * Adapt the real store to the Runtime memory port (structural match). Reads pass
 * through; the commit is the real Phase 2 commit (used only on --apply).
 */
function realMemoryPort(store: MemoryStore): ProjectMemoryPort {
  return {
    readManifest: (projectId) => store.readManifest(projectId),
    listSnapshots: (projectId) => store.listSnapshots(projectId),
    readSnapshot: (projectId, snapshotId) => store.readSnapshot(projectId, snapshotId),
    readEvidence: (projectId, evidenceId) => store.readEvidence(projectId, evidenceId),
    async commitSnapshotBundle(input: MemoryCommitInput) {
      const result = await store.commitSnapshotBundle(input);
      return {
        projectId: result.projectId,
        snapshotId: result.snapshotId,
        idempotent: result.idempotent,
        latestSnapshotId: result.latestSnapshotId,
        snapshotCount: result.snapshotCount,
        evidenceCount: result.evidenceCount,
      };
    },
  };
}

/** The pure Skills state deriver (structural ProjectStateDeriver). */
const DERIVER: ProjectStateDeriver = { derive: deriveProjectBrainState };

/** Provider item type re-export kept local to avoid a wide import surface. */
export type { LocalProviderItemInput };
