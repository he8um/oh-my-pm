// Project Brain Runtime API types and dependency ports (v0.3 Phase 3).
//
// This is a SEPARATE programmatic surface from the existing Runtime.handle()
// request/response contract. It depends only on narrow interfaces — never on a
// Node implementation, the Node memory adapter, or a system clock. Providers are
// reached solely through the observation port; persistence solely through the
// memory port; Kernel semantics solely through the Kernel binding port.

import type {
  ChangeCategory,
  ChangeSet,
  EvidenceRecord,
  Freshness,
  Locale,
  NormalizedProviderResponse,
  ProjectIdentity,
  ProjectSnapshot,
  ProjectState,
  ProviderRequest,
  StateItemKind,
  TimelineResult,
} from "@oh-my-pm/contracts";
import type {
  DeriveFreshnessInput,
  DeriveProjectTimelineInput,
  DiffProjectSnapshotsInput,
  FingerprintContentInput,
  ProjectBrainKernelResult,
  ProjectIdentitySeedInput,
} from "@oh-my-pm/kernel";
import type {
  EvidenceCandidate,
  ProjectStateDerivationInput,
  ProjectStateDerivationResult,
} from "@oh-my-pm/skills";
import type { ProjectBrainRuntimeErrorEnvelope } from "./errors.js";

// --- Kernel port -----------------------------------------------------------

/**
 * The narrow Kernel binding surface the Runtime needs. Structurally compatible
 * with `@oh-my-pm/kernel`'s `ProjectBrainKernelApi`. The Runtime never derives a
 * salt and never recomputes a fingerprint itself.
 */
export interface ProjectBrainKernelPort {
  deriveProjectIdentity(seed: ProjectIdentitySeedInput): ProjectBrainKernelResult<ProjectIdentity>;
  fingerprintMinimizedContent(input: FingerprintContentInput): ProjectBrainKernelResult<string>;
  deriveEvidenceId(record: EvidenceRecord): ProjectBrainKernelResult<string>;
  deriveFreshness(input: DeriveFreshnessInput): ProjectBrainKernelResult<Freshness>;
  finalizeProjectState(state: ProjectState): ProjectBrainKernelResult<ProjectState>;
  finalizeProjectSnapshot(snapshot: ProjectSnapshot): ProjectBrainKernelResult<ProjectSnapshot>;
  diffProjectSnapshots(input: DiffProjectSnapshotsInput): ProjectBrainKernelResult<ChangeSet>;
  /** The pure v0.4 Project Timeline derivation. */
  deriveProjectTimeline(
    input: DeriveProjectTimelineInput,
  ): ProjectBrainKernelResult<TimelineResult>;
}

// --- Memory port -----------------------------------------------------------
//
// Structurally compatible with the Phase 2 project memory ProjectMemoryStore,
// restricted to the subset the Runtime uses. The Runtime receives an
// implementation through this port; it never imports or constructs the Node
// persistence adapter.

/**
 * A stored snapshot summary, as returned by the memory port in authoritative
 * capture chronology (oldest first).
 *
 * `capturedAt` and `sequence` are the store's own authoritative chronology
 * fields (store format 2). They are optional at the type level only so the port
 * stays structurally compatible with a store that predates the chronology; the
 * v0.4 timeline query REQUIRES both and fails closed when either is absent
 * rather than falling back to a lexical id order or a timestamp comparison.
 */
export interface MemorySnapshotSummary {
  readonly snapshotId: string;
  readonly isLatest: boolean;
  /** The capture time from the authoritative history entry. */
  readonly capturedAt?: string;
  /** The contiguous 1-based capture ordinal; the authoritative chronology. */
  readonly sequence?: number;
}

/** The minimal manifest fields the Runtime reads. */
export interface MemoryManifest {
  readonly projectId: string;
  readonly latestSnapshotId: string | null;
  readonly snapshotIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

/** Input to a memory commit (structurally the Phase 2 bundle input). */
export interface MemoryCommitInput {
  readonly projectId: string;
  readonly projectRootBoundary: string;
  readonly operationId: string;
  readonly occurredAt: string;
  readonly snapshot: ProjectSnapshot;
  readonly evidence: readonly EvidenceRecord[];
}

/** Result of a memory commit. */
export interface MemoryCommitResult {
  readonly projectId: string;
  readonly snapshotId: string;
  readonly idempotent: boolean;
  readonly latestSnapshotId: string;
  readonly snapshotCount: number;
  readonly evidenceCount: number;
}

/** The narrow persistence surface the Runtime uses (reads + one commit). */
export interface ProjectMemoryPort {
  readManifest(projectId: string): Promise<MemoryManifest | null>;
  listSnapshots(projectId: string): Promise<MemorySnapshotSummary[]>;
  readSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshot>;
  readEvidence(projectId: string, evidenceId: string): Promise<EvidenceRecord>;
  commitSnapshotBundle(input: MemoryCommitInput): Promise<MemoryCommitResult>;
}

// --- Observation port ------------------------------------------------------

/** A single read-only provider observation request. */
export interface ProjectObservationRequest {
  readonly observationId: string;
  readonly request: ProviderRequest;
  /** Sanitized source reference key; never an absolute path or token. */
  readonly sourceIdentity: string;
  readonly includedScope: string;
  readonly required: boolean;
}

/** The outcome of executing one observation. */
export interface ProjectObservationResult {
  readonly observationId: string;
  readonly ok: boolean;
  /** Present only on success. */
  readonly response?: NormalizedProviderResponse;
  /** True when the provider reported warnings (drives partial coverage). */
  readonly hasWarnings: boolean;
  /** Stable, sanitized failure reason code (never a raw provider message). */
  readonly failureCode?: string;
}

/** The provider-independent observation port. */
export interface ProjectObservationPort {
  observe(
    request: ProjectObservationRequest,
    context: { readonly requestId: string },
  ): Promise<ProjectObservationResult>;
}

// --- State deriver port ----------------------------------------------------

/** The pure state deriver port (structurally the Skills derivation function). */
export interface ProjectStateDeriver {
  derive(input: ProjectStateDerivationInput): ProjectStateDerivationResult;
}

// --- Runtime dependencies --------------------------------------------------

/** Everything the Project Brain Runtime depends on (interfaces only). */
export interface ProjectBrainRuntimeDeps {
  readonly kernel: ProjectBrainKernelPort;
  readonly memory: ProjectMemoryPort;
  readonly observation: ProjectObservationPort;
  readonly deriver: ProjectStateDeriver;
}

// --- Capture input / result ------------------------------------------------

/** Caller-supplied identity seed for capture. */
export interface ProjectIdentitySeedCaptureInput {
  readonly explicitId?: string;
  readonly normalizedRootToken?: string;
  readonly localSalt?: string;
  readonly displayName?: string;
  readonly rootHint?: string;
}

/** Capture input. All timestamps and ids are caller-injected. */
export interface CaptureProjectInput {
  readonly requestId: string;
  /** Write-safety boundary only; never persisted. */
  readonly projectRootBoundary: string;
  readonly operationId: string;
  readonly observedAt: string;
  readonly capturedAt: string;
  readonly identitySeed: ProjectIdentitySeedCaptureInput;
  readonly locale: Locale;
  readonly observations: readonly ProjectObservationRequest[];
  readonly freshnessPolicy: {
    readonly maxFutureSkewSeconds: number;
  };
}

/** Per-source coverage as observed. */
export interface CaptureCoverageEntry {
  readonly sourceIdentity: string;
  readonly coverageState: "complete" | "partial" | "skipped";
  readonly gapReason?: string;
}

/** A stable trace entry (sanitized). */
export interface ProjectBrainTraceEntry {
  readonly step: string;
  readonly status: "ok" | "fail" | "skip";
  readonly detail?: string;
}

/** Capture result (sanitized). */
export interface CaptureProjectResult {
  readonly requestId: string;
  readonly ok: boolean;
  readonly projectId?: string;
  readonly snapshotId?: string;
  readonly stateFingerprint?: string;
  readonly snapshotFingerprint?: string;
  readonly idempotent?: boolean;
  readonly itemCount?: number;
  readonly evidenceCount?: number;
  readonly coverage: readonly CaptureCoverageEntry[];
  readonly coverageComplete?: boolean;
  readonly error?: ProjectBrainRuntimeErrorEnvelope;
  readonly trace: readonly ProjectBrainTraceEntry[];
}

// --- Compare input / result ------------------------------------------------

/** Compare input. */
export interface CompareProjectInput {
  readonly requestId: string;
  readonly projectId: string;
  readonly comparedAt: string;
  readonly previousSnapshotId?: string;
  readonly currentSnapshotId?: string;
  readonly stalenessPolicy: {
    readonly evidenceStaleAfterSeconds: number;
    readonly maxFutureSkewSeconds: number;
  };
}

/** Compare status. */
export type CompareStatus = "compared" | "noPriorMemory" | "insufficientHistory" | "failed";

/** Compare result (sanitized). */
export interface CompareProjectResult {
  readonly requestId: string;
  readonly status: CompareStatus;
  readonly projectId: string;
  readonly previousSnapshotId?: string;
  readonly currentSnapshotId?: string;
  readonly changeSet?: ChangeSet;
  readonly error?: ProjectBrainRuntimeErrorEnvelope;
  readonly trace: readonly ProjectBrainTraceEntry[];
}

// --- Timeline input / result (v0.4) ----------------------------------------

/**
 * A read-only timeline request. It carries NO path, data directory, token,
 * apply, migrate, confirm, or force field: a timeline query cannot mutate
 * anything and cannot choose a filesystem location.
 */
export interface TimelineProjectInput {
  readonly requestId: string;
  readonly projectId: string;
  /** The comparison boundary timestamp used by each adjacent diff. */
  readonly comparedAt: string;
  /** Page size (1..100). Omitted uses the documented default of 20. */
  readonly limit?: number;
  /** Exclusive upper bound on captureSequence for pagination. */
  readonly beforeSequence?: number;
  readonly category?: ChangeCategory;
  readonly kind?: StateItemKind;
  readonly stalenessPolicy: {
    readonly evidenceStaleAfterSeconds: number;
    readonly maxFutureSkewSeconds: number;
  };
}

/**
 * Timeline status. `noPriorMemory` reports that no store exists for the project;
 * it still carries a valid EMPTY result so a caller never has to special-case a
 * missing timeline. `derived` covers both a populated and a legitimately empty
 * timeline. `failed` never carries a partial result.
 */
export type TimelineStatus = "derived" | "noPriorMemory" | "failed";

/** Timeline result (sanitized). */
export interface TimelineProjectResult {
  readonly requestId: string;
  readonly status: TimelineStatus;
  readonly projectId: string;
  /** Present on every non-failed status; absent only on failure. */
  readonly result?: TimelineResult;
  readonly error?: ProjectBrainRuntimeErrorEnvelope;
  readonly trace: readonly ProjectBrainTraceEntry[];
}

/** The Project Brain Runtime API. */
export interface ProjectBrainRuntime {
  capture(input: CaptureProjectInput): Promise<CaptureProjectResult>;
  compare(input: CompareProjectInput): Promise<CompareProjectResult>;
  /** The read-only v0.4 Project Timeline query. */
  timeline(input: TimelineProjectInput): Promise<TimelineProjectResult>;
}

/** Re-exported candidate type for the evidence pipeline. */
export type { EvidenceCandidate };
