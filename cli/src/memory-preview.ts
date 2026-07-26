// v0.3 Phase 4 — the CLI-owned preview memory port.
//
// A `ProjectMemoryPort` implementation whose read methods delegate to the real
// Phase 2 store but whose `commitSnapshotBundle` performs ZERO writes: it reads
// the existing manifest as needed, detects same-id/different-payload conflicts
// and idempotent (identical-payload) captures, computes projected snapshot and
// evidence counts, and returns a `MemoryCommitResult`-compatible value entirely
// in memory. It creates no data directory, acquires no lock, and writes no
// staging/manifest/record/lock file. Preview is never implemented by writing and
// rolling back.

import type { EvidenceRecord, ProjectSnapshot } from "@oh-my-pm/contracts";
import type {
  MemoryCommitInput,
  MemoryCommitResult,
  MemoryManifest,
  MemorySnapshotSummary,
  ProjectMemoryPort,
} from "@oh-my-pm/runtime";

/**
 * A stored snapshot summary as the real Phase 2 store returns it — the runtime
 * port's `MemorySnapshotSummary` plus the v2 chronology fields (`capturedAt`,
 * `sequence`). Structurally assignable to the narrower runtime summary, so it
 * flows through the preview port unchanged.
 */
export interface StoredSnapshotSummaryLike extends MemorySnapshotSummary {
  readonly capturedAt: string;
  readonly sequence: number;
}

/** The read subset of the real store this preview port delegates to. */
export interface PreviewMemoryStoreReads {
  readManifest(projectId: string): Promise<MemoryManifest | null>;
  listSnapshots(projectId: string): Promise<StoredSnapshotSummaryLike[]>;
  readSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot>;
  readEvidence(projectId: string, evidenceId: string): Promise<EvidenceRecord>;
}

/**
 * A captured preview projection, populated by the single `commitSnapshotBundle`
 * call the Runtime makes. `wouldWrite` is always false — the preview never
 * touches the filesystem.
 */
export interface PreviewCommitProjection {
  readonly projectId: string;
  readonly snapshotId: string;
  /** True when the projected commit would create a new snapshot record. */
  readonly wouldCreateSnapshot: boolean;
  /** True when an existing identical snapshot makes this capture a no-op. */
  readonly wouldBeIdempotent: boolean;
  /** Projected total snapshot count after the (non-)write. */
  readonly projectedSnapshotCount: number;
  /** Projected total evidence count after the (non-)write. */
  readonly projectedEvidenceCount: number;
  /** The finalized snapshot's evidence reference ids (order preserved). */
  readonly evidenceRefCount: number;
}

/** Deterministic JSON serialization for payload equality (stable key order). */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      result[key] = sortValue(entryValue);
    }
    return result;
  }
  return value;
}

/**
 * Build a preview memory port over the real store's reads. The returned port
 * captures a single projection when the Runtime calls `commitSnapshotBundle`.
 * Read `projection` after a preview capture to render the preview output.
 */
export function createPreviewMemoryPort(store: PreviewMemoryStoreReads): {
  port: ProjectMemoryPort;
  projection: () => PreviewCommitProjection | null;
} {
  let captured: PreviewCommitProjection | null = null;

  const port: ProjectMemoryPort = {
    readManifest: (projectId) => store.readManifest(projectId),
    listSnapshots: (projectId) => store.listSnapshots(projectId),
    readSnapshot: (projectId, snapshotId) => store.readSnapshot(projectId, snapshotId),
    readEvidence: (projectId, evidenceId) => store.readEvidence(projectId, evidenceId),
    async commitSnapshotBundle(input: MemoryCommitInput): Promise<MemoryCommitResult> {
      captured = await projectCommit(store, input);
      // Return a MemoryCommitResult shaped exactly like the real adapter would,
      // computed from the in-memory projection. No write, no lock, no directory
      // is created.
      return {
        projectId: captured.projectId,
        snapshotId: captured.snapshotId,
        idempotent: captured.wouldBeIdempotent,
        latestSnapshotId: captured.snapshotId,
        snapshotCount: captured.projectedSnapshotCount,
        evidenceCount: captured.projectedEvidenceCount,
      };
    },
  };

  return { port, projection: () => captured };
}

/** Compute the projected commit outcome without writing anything. */
async function projectCommit(
  store: PreviewMemoryStoreReads,
  input: MemoryCommitInput,
): Promise<PreviewCommitProjection> {
  const manifest = await store.readManifest(input.projectId);
  const existingSnapshotIds = manifest?.snapshotIds ?? [];
  const existingEvidenceIds = new Set(manifest?.evidenceIds ?? []);

  const snapshotExists = existingSnapshotIds.includes(input.snapshot.snapshotId);

  // Idempotency: an existing snapshot with a byte-identical payload makes this a
  // verified no-op. Read the stored snapshot only when the id already exists.
  let wouldBeIdempotent = false;
  if (snapshotExists) {
    try {
      const stored = await store.readSnapshot(input.projectId, input.snapshot.snapshotId);
      wouldBeIdempotent = stableStringify(stored) === stableStringify(input.snapshot);
    } catch {
      // A read failure means the stored record is not confidently identical; the
      // preview conservatively reports a would-be conflicting (non-idempotent)
      // capture rather than claiming idempotency.
      wouldBeIdempotent = false;
    }
  }

  const wouldCreateSnapshot = !snapshotExists;

  // Projected counts: an idempotent or existing snapshot does not grow the set;
  // new evidence ids add to the existing evidence count.
  const projectedSnapshotCount = wouldCreateSnapshot
    ? existingSnapshotIds.length + 1
    : existingSnapshotIds.length;

  let newEvidence = 0;
  for (const record of input.evidence) {
    const evidenceId = (record as { evidenceId?: string }).evidenceId;
    if (typeof evidenceId === "string" && !existingEvidenceIds.has(evidenceId)) {
      newEvidence += 1;
    }
  }
  const projectedEvidenceCount = existingEvidenceIds.size + (wouldBeIdempotent ? 0 : newEvidence);

  const evidenceRefCount = readEvidenceRefCount(input.snapshot);

  return {
    projectId: input.projectId,
    snapshotId: input.snapshot.snapshotId,
    wouldCreateSnapshot,
    wouldBeIdempotent,
    projectedSnapshotCount,
    projectedEvidenceCount,
    evidenceRefCount,
  };
}

/** Number of evidence references carried by the finalized snapshot payload. */
function readEvidenceRefCount(snapshot: ProjectSnapshot): number {
  const list = (snapshot as { evidenceRefs?: readonly unknown[] }).evidenceRefs;
  return Array.isArray(list) ? list.length : 0;
}
