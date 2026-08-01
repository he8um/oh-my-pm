// Shared fixtures for Project Brain Runtime tests (v0.3 Phase 3). Provides a
// deterministic in-memory memory port, a scriptable observation port, the real
// pure Skills deriver, and the real WASM Kernel binding. Test-only; never shipped.

import type { EvidenceRecord, NormalizedProviderItem, ProjectSnapshot } from "@oh-my-pm/contracts";
import { createNodeWasmProjectBrainKernelApi } from "@oh-my-pm/kernel";
import { deriveProjectBrainState } from "@oh-my-pm/skills";
import type {
  MemoryCommitInput,
  MemoryCommitResult,
  MemoryManifest,
  MemorySnapshotSummary,
  ProjectBrainKernelPort,
  ProjectMemoryPort,
  ProjectObservationPort,
  ProjectObservationRequest,
  ProjectObservationResult,
  ProjectStateDeriver,
} from "../src/projectbrain/index.js";

/** The real WASM Project Brain Kernel binding. */
export function realKernel(): ProjectBrainKernelPort {
  return createNodeWasmProjectBrainKernelApi();
}

/** The real pure Skills deriver. */
export const realDeriver: ProjectStateDeriver = { derive: deriveProjectBrainState };

/** A deterministic in-memory memory port that records every write. */
export interface RecordingMemoryPort extends ProjectMemoryPort {
  readonly commits: MemoryCommitInput[];
  readonly snapshotStore: Map<string, ProjectSnapshot>;
  readonly evidenceStore: Map<string, EvidenceRecord>;
  failNextCommit(message?: string): void;
}

export function inMemoryMemoryPort(): RecordingMemoryPort {
  const snapshotStore = new Map<string, ProjectSnapshot>();
  const evidenceStore = new Map<string, EvidenceRecord>();
  const commits: MemoryCommitInput[] = [];
  const orderedSnapshotIds: string[] = [];
  const evidenceIds: string[] = [];
  let latest: string | null = null;
  let failMessage: string | null = null;

  return {
    commits,
    snapshotStore,
    evidenceStore,
    failNextCommit(message = "injected commit failure"): void {
      failMessage = message;
    },
    async readManifest(projectId: string): Promise<MemoryManifest | null> {
      if (orderedSnapshotIds.length === 0) return null;
      return {
        projectId,
        latestSnapshotId: latest,
        snapshotIds: [...orderedSnapshotIds],
        evidenceIds: [...evidenceIds],
      };
    },
    async listSnapshots(_projectId: string): Promise<MemorySnapshotSummary[]> {
      // Mirrors the real store: authoritative capture chronology, oldest first,
      // with a contiguous 1-based sequence and the snapshot's own capturedAt.
      return orderedSnapshotIds.map((id, index) => ({
        snapshotId: id,
        isLatest: id === latest,
        capturedAt: snapshotStore.get(id)?.capturedAt ?? "",
        sequence: index + 1,
      }));
    },
    async readSnapshot(_projectId: string, snapshotId: string): Promise<ProjectSnapshot> {
      const snapshot = snapshotStore.get(snapshotId);
      if (snapshot === undefined) throw new Error("snapshot not found");
      return snapshot;
    },
    async readEvidence(_projectId: string, evidenceId: string): Promise<EvidenceRecord> {
      const record = evidenceStore.get(evidenceId);
      if (record === undefined) throw new Error("evidence not found");
      return record;
    },
    async commitSnapshotBundle(input: MemoryCommitInput): Promise<MemoryCommitResult> {
      if (failMessage !== null) {
        const message = failMessage;
        failMessage = null;
        throw new Error(message);
      }
      commits.push(input);
      const existing = orderedSnapshotIds.includes(input.snapshot.snapshotId);
      snapshotStore.set(input.snapshot.snapshotId, input.snapshot);
      for (const record of input.evidence) {
        evidenceStore.set(record.evidenceId, record);
        if (!evidenceIds.includes(record.evidenceId)) evidenceIds.push(record.evidenceId);
      }
      if (!existing) orderedSnapshotIds.push(input.snapshot.snapshotId);
      latest = input.snapshot.snapshotId;
      return {
        projectId: input.projectId,
        snapshotId: input.snapshot.snapshotId,
        idempotent: existing,
        latestSnapshotId: latest,
        snapshotCount: orderedSnapshotIds.length,
        evidenceCount: evidenceIds.length,
      };
    },
  };
}

/** A single scripted observation outcome. */
export interface ScriptedObservation {
  readonly ok: boolean;
  readonly items?: readonly NormalizedProviderItem[];
  readonly hasWarnings?: boolean;
  readonly failureCode?: string;
}

/**
 * An observation port that returns scripted outcomes keyed by observationId,
 * and records the order in which observations were executed.
 */
export interface ScriptedObservationPort extends ProjectObservationPort {
  readonly executionOrder: string[];
}

export function scriptedObservationPort(
  script: ReadonlyMap<string, ScriptedObservation>,
): ScriptedObservationPort {
  const executionOrder: string[] = [];
  return {
    executionOrder,
    async observe(request: ProjectObservationRequest): Promise<ProjectObservationResult> {
      executionOrder.push(request.observationId);
      const scripted = script.get(request.observationId);
      if (scripted === undefined || !scripted.ok) {
        return {
          observationId: request.observationId,
          ok: false,
          hasWarnings: false,
          ...(scripted?.failureCode !== undefined ? { failureCode: scripted.failureCode } : {}),
        };
      }
      return {
        observationId: request.observationId,
        ok: true,
        hasWarnings: scripted.hasWarnings ?? false,
        response: {
          providerId: "local",
          items: [...(scripted.items ?? [])],
        },
      };
    },
  };
}

/** A normalized Markdown document item. */
export function markdownItem(id: string, body: string): NormalizedProviderItem {
  return { id, type: "document", title: id, source: "local", data: { content: body } };
}

/** A normalized GitHub issue item. */
export function githubIssueItem(
  id: string,
  title: string,
  data: Record<string, unknown> = {},
): NormalizedProviderItem {
  return {
    id,
    type: "issue",
    title,
    source: "github",
    data: { status: "open", ...data } as NormalizedProviderItem["data"],
  };
}

/** A standard capture input builder. */
export function captureInput(
  observations: readonly ProjectObservationRequest[],
  overrides: Record<string, unknown> = {},
) {
  return {
    requestId: "req-1",
    projectRootBoundary: "/work/project",
    operationId: "op-1",
    observedAt: "2026-01-10T00:00:00Z",
    capturedAt: "2026-01-11T00:00:00Z",
    identitySeed: { explicitId: "proj-1" },
    locale: "en" as const,
    observations,
    freshnessPolicy: { maxFutureSkewSeconds: 86_400 },
    ...overrides,
  };
}

/** A single required Markdown observation request. */
export function markdownObservation(
  observationId: string,
  sourceIdentity: string,
  required = true,
): ProjectObservationRequest {
  return {
    observationId,
    request: { providerId: "local", action: "read", query: "." },
    sourceIdentity,
    includedScope: "full",
    required,
  };
}
