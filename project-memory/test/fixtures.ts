// Shared test fixtures: minimal finalized snapshot/evidence builders and a
// store factory over the in-memory filesystem. The finalized records mimic the
// Phase 1 Kernel output shape without importing the generated contracts (the
// store treats them as opaque, already-minimized payloads).

import { DependencyInjectedStore } from "../src/store.js";
import type {
  FinalizedEvidenceRecord,
  FinalizedProjectSnapshot,
} from "../src/types.js";
import { MemoryFileSystem } from "./memory-filesystem.js";
import type { MemoryFsOptions } from "./memory-filesystem.js";

/** A data root that is safely separated from any project root used in tests. */
export const DATA_ROOT = "/data/oh-my-pm";
/** A project root boundary distinct from and non-nested with the data root. */
export const PROJECT_ROOT = "/work/my-project";

export function makeEvidence(
  projectId: string,
  evidenceId: string,
  overrides: Record<string, unknown> = {},
): FinalizedEvidenceRecord {
  return {
    evidenceId,
    projectId,
    schemaVersion: 1,
    sourceKind: "markdown",
    sourceIdentity: "docs/status.md#L1",
    observedAt: "2026-01-01T00:00:00.000Z",
    provenance: { line: "1" },
    rawContentPolicy: "minimized",
    retentionState: "active",
    contentFingerprint: "sha256:" + "a".repeat(64),
    ...overrides,
  } as FinalizedEvidenceRecord;
}

export function makeSnapshot(
  projectId: string,
  snapshotId: string,
  evidenceRefs: readonly string[] = [],
  overrides: Record<string, unknown> = {},
): FinalizedProjectSnapshot {
  return {
    snapshotId,
    projectId,
    schemaVersion: 1,
    capturedAt: "2026-01-01T00:00:00.000Z",
    sourceBoundaries: [],
    evidenceRefs: [...evidenceRefs],
    fingerprint: "sha256:" + "b".repeat(64),
    state: {
      identity: { id: projectId, kind: "derived", schemaVersion: 1 },
      observedAt: "2026-01-01T00:00:00.000Z",
      sources: [],
      statusSummary: {},
      evidenceRefs: [...evidenceRefs],
      schemaVersion: 1,
      stateFingerprint: "sha256:" + "c".repeat(64),
      freshness: {
        observationFreshness: { status: "known", ageSeconds: 0 },
        sourceFreshness: { status: "unknown" },
        evidenceFreshness: { status: "unknown" },
        derivedStateFreshness: { status: "unknown" },
        coverageComplete: true,
        coverageGaps: [],
        schemaVersion: 1,
      },
    },
    ...overrides,
  } as FinalizedProjectSnapshot;
}

export function makeStore(
  options: MemoryFsOptions = {},
): { store: DependencyInjectedStore; fs: MemoryFileSystem } {
  const fs = new MemoryFileSystem(options);
  const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
  return { store, fs };
}
