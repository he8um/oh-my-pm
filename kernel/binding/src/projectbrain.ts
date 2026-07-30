// Project Brain Kernel binding surface (v0.3 Phase 3).
//
// The existing `KernelApi` (version/validateJson/checkUpdatePlan/decideTransition)
// is intentionally left byte-unchanged. This module adds a SEPARATE, minimal
// binding for the seven pure Phase 1 Project Brain operations, exposed as
// deterministic `{ ok, value }` / `{ ok: false, error }` envelopes so callers
// never see a thrown Kernel error. No persistence is exposed through this
// binding; it wraps only pure Kernel functions.

import type {
  ChangeSet,
  EvidenceRecord,
  Freshness,
  ProjectIdentity,
  ProjectSnapshot,
  ProjectState,
  TimelineQuery,
  TimelineResult,
} from "@oh-my-pm/contracts";

/** A binding-only tagged result for a fallible Project Brain Kernel operation. */
export type ProjectBrainKernelResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly path?: string;
      };
    };

/** Caller-supplied seed for resolving a ProjectIdentity (no salt is generated). */
export interface ProjectIdentitySeedInput {
  readonly explicitId?: string;
  readonly normalizedRootToken?: string;
  readonly localSalt?: string;
  readonly displayName?: string;
  readonly rootHint?: string;
}

/** Input for fingerprinting minimized content. */
export interface FingerprintContentInput {
  readonly content: string;
}

/** Input for deriving the four freshness dimensions (input + policy together). */
export interface DeriveFreshnessInput {
  readonly observationAt: string;
  readonly sourceUpdatedAts?: readonly (string | null)[];
  readonly evidenceChangedAts?: readonly (string | null)[];
  readonly referenceAt: string;
  readonly coverageGaps?: readonly string[];
  readonly maxFutureSkewSeconds: number;
}

/** Input for the deterministic snapshot diff. */
export interface DiffProjectSnapshotsInput {
  readonly previous: ProjectSnapshot;
  readonly current: ProjectSnapshot;
  readonly previousEvidence?: readonly EvidenceRecord[];
  readonly currentEvidence?: readonly EvidenceRecord[];
  readonly comparedAt: string;
  readonly stalenessPolicy: {
    readonly evidenceStaleAfterSeconds: number;
    readonly maxFutureSkewSeconds: number;
  };
}

/**
 * One adjacent committed-snapshot comparison, attributed to the capture that
 * produced it (v0.4). `captureSequence` and `capturedAt` describe the CURRENT
 * snapshot of the pair and come from the store's authoritative chronology —
 * never from a lexical snapshot-id order and never from a fresh clock read.
 */
export interface TimelineCaptureInput {
  readonly snapshotId: string;
  readonly captureSequence: number;
  readonly capturedAt: string;
  readonly changeSet: ChangeSet;
}

/** Input for the deterministic Project Timeline derivation (v0.4). */
export interface DeriveProjectTimelineInput {
  /** Adjacent comparisons in authoritative capture order, oldest first. */
  readonly captures: readonly TimelineCaptureInput[];
  readonly query: TimelineQuery;
}

/** The eight approved Project Brain Kernel binding operations. */
export interface ProjectBrainKernelApi {
  deriveProjectIdentity(
    seed: ProjectIdentitySeedInput,
  ): ProjectBrainKernelResult<ProjectIdentity>;
  fingerprintMinimizedContent(
    input: FingerprintContentInput,
  ): ProjectBrainKernelResult<string>;
  deriveEvidenceId(record: EvidenceRecord): ProjectBrainKernelResult<string>;
  deriveFreshness(input: DeriveFreshnessInput): ProjectBrainKernelResult<Freshness>;
  finalizeProjectState(state: ProjectState): ProjectBrainKernelResult<ProjectState>;
  finalizeProjectSnapshot(
    snapshot: ProjectSnapshot,
  ): ProjectBrainKernelResult<ProjectSnapshot>;
  diffProjectSnapshots(
    input: DiffProjectSnapshotsInput,
  ): ProjectBrainKernelResult<ChangeSet>;
  deriveProjectTimeline(
    input: DeriveProjectTimelineInput,
  ): ProjectBrainKernelResult<TimelineResult>;
}

/** The unavailable-error envelope factory (fail-closed for every operation). */
export function unavailableProjectBrainError<T>(
  reason: string,
): ProjectBrainKernelResult<T> {
  return {
    ok: false,
    error: { code: "OMP-K-PB-0000", message: `Kernel binding unavailable: ${reason}` },
  };
}

/**
 * Deterministic fail-closed Project Brain binding used until a real WASM binding
 * is injected. Every operation refuses instead of guessing.
 */
export function createUnavailableProjectBrainKernelApi(
  reason = "kernel_binding_not_configured",
): ProjectBrainKernelApi {
  return {
    deriveProjectIdentity: () => unavailableProjectBrainError(reason),
    fingerprintMinimizedContent: () => unavailableProjectBrainError(reason),
    deriveEvidenceId: () => unavailableProjectBrainError(reason),
    deriveFreshness: () => unavailableProjectBrainError(reason),
    finalizeProjectState: () => unavailableProjectBrainError(reason),
    finalizeProjectSnapshot: () => unavailableProjectBrainError(reason),
    diffProjectSnapshots: () => unavailableProjectBrainError(reason),
    deriveProjectTimeline: () => unavailableProjectBrainError(reason),
  };
}
