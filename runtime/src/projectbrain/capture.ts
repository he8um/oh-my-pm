// Capture orchestration (v0.3 Phase 3).
//
// Resolves identity, runs read-only observations, derives canonical state and
// minimized evidence, finalizes state and snapshot through the Kernel, and
// commits exactly one snapshot bundle through the memory port. No write occurs
// before the single commit; any failure before it leaves nothing persisted. Raw
// provider content and the ephemeral fingerprint input are discarded before the
// commit. The analyzed project is never written.

import type {
  CanonicalStateItem,
  EvidenceRecord,
  Freshness,
  ProjectIdentity,
  ProjectSnapshot,
  ProjectState,
  SourceBoundary,
  SourceDescriptor,
  StateItemKind,
} from "@oh-my-pm/contracts";
import type { ProjectStateDerivationResult, StateItemDraft } from "@oh-my-pm/skills";
import { providerItemsToTextItems } from "../plan-utils.js";
import { assertNoForbiddenEvidenceFields } from "./privacy.js";
import {
  derivationFailed,
  errorEnvelope,
  invalidInput,
  isProjectBrainRuntimeError,
  kernelFailed,
  persistenceCommitFailed,
  type ProjectBrainRuntimeError,
} from "./errors.js";
import { minimizeEvidence } from "./evidence.js";
import type { MinimizedEvidence } from "./evidence.js";
import { runObservations } from "./observation.js";
import type {
  CaptureProjectInput,
  CaptureProjectResult,
  ProjectBrainRuntimeDeps,
  ProjectBrainTraceEntry,
} from "./types.js";

/** Maximum observations accepted in one capture. */
const MAX_OBSERVATIONS = 1000;

function validateCaptureInput(input: CaptureProjectInput): void {
  for (const [field, value] of [
    ["requestId", input.requestId],
    ["projectRootBoundary", input.projectRootBoundary],
    ["operationId", input.operationId],
    ["observedAt", input.observedAt],
    ["capturedAt", input.capturedAt],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      throw invalidInput(`${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(input.observations)) {
    throw invalidInput("observations must be an array");
  }
  if (input.observations.length > MAX_OBSERVATIONS) {
    throw invalidInput("observations exceed the maximum permitted count");
  }
  const seen = new Set<string>();
  for (const obs of input.observations) {
    if (typeof obs.observationId !== "string" || obs.observationId.length === 0) {
      throw invalidInput("each observation requires an observationId");
    }
    if (seen.has(obs.observationId)) {
      throw invalidInput("duplicate observationId in observations");
    }
    seen.add(obs.observationId);
  }
  const seed = input.identitySeed;
  const hasExplicit = typeof seed.explicitId === "string" && seed.explicitId.length > 0;
  const hasDerived =
    typeof seed.normalizedRootToken === "string" &&
    seed.normalizedRootToken.length > 0 &&
    typeof seed.localSalt === "string" &&
    seed.localSalt.length > 0;
  if (!hasExplicit && !hasDerived) {
    throw invalidInput("identitySeed requires an explicitId or a normalizedRootToken + localSalt");
  }
}

/** Convert a draft into a CanonicalStateItem, mapping candidate ids to evidence ids. */
function toCanonicalItem(
  draft: StateItemDraft,
  candidateToEvidenceId: ReadonlyMap<string, string>,
): CanonicalStateItem {
  const evidenceRefs: string[] = [];
  for (const candidateId of draft.evidenceRefIds) {
    const evidenceId = candidateToEvidenceId.get(candidateId);
    if (evidenceId === undefined) {
      throw derivationFailed("a state item references an unknown evidence candidate");
    }
    if (!evidenceRefs.includes(evidenceId)) evidenceRefs.push(evidenceId);
  }
  const item: CanonicalStateItem = {
    kind: draft.kind as StateItemKind,
    id: draft.id,
    title: draft.title,
    evidenceRefs,
  };
  const withStatus = draft.status !== undefined ? { ...item, status: draft.status } : item;
  const withSeverity =
    draft.severity !== undefined ? { ...withStatus, severity: draft.severity } : withStatus;
  const withOwner =
    draft.owner !== undefined ? { ...withSeverity, owner: draft.owner } : withSeverity;
  const withDue =
    draft.dueDate !== undefined ? { ...withOwner, dueDate: draft.dueDate } : withOwner;
  const withPriority =
    draft.priority !== undefined ? { ...withDue, priority: draft.priority } : withDue;
  return draft.metadata !== undefined && Object.keys(draft.metadata).length > 0
    ? { ...withPriority, metadata: { ...draft.metadata } }
    : withPriority;
}

function mapDrafts(
  drafts: readonly StateItemDraft[],
  candidateToEvidenceId: ReadonlyMap<string, string>,
): CanonicalStateItem[] {
  return drafts.map((draft) => toCanonicalItem(draft, candidateToEvidenceId));
}

/** Collect the evidence changed timestamps for freshness (sourceUpdatedAt or observedAt). */
function evidenceChangedAts(records: readonly EvidenceRecord[]): (string | null)[] {
  return records.map((r) => r.sourceUpdatedAt ?? r.observedAt);
}

function sourceUpdatedAts(records: readonly EvidenceRecord[]): (string | null)[] {
  return records.map((r) => r.sourceUpdatedAt ?? null);
}

/** Run one capture and return a sanitized result. */
export async function captureProject(
  deps: ProjectBrainRuntimeDeps,
  input: CaptureProjectInput,
): Promise<CaptureProjectResult> {
  const trace: ProjectBrainTraceEntry[] = [{ step: "capture.receive", status: "ok" }];

  try {
    validateCaptureInput(input);
    trace.push({ step: "capture.validate", status: "ok" });

    // 1. Resolve identity through the Kernel (never generates a salt).
    const identityResult = deps.kernel.deriveProjectIdentity({
      ...(input.identitySeed.explicitId !== undefined
        ? { explicitId: input.identitySeed.explicitId }
        : {}),
      ...(input.identitySeed.normalizedRootToken !== undefined
        ? { normalizedRootToken: input.identitySeed.normalizedRootToken }
        : {}),
      ...(input.identitySeed.localSalt !== undefined
        ? { localSalt: input.identitySeed.localSalt }
        : {}),
      ...(input.identitySeed.displayName !== undefined
        ? { displayName: input.identitySeed.displayName }
        : {}),
      ...(input.identitySeed.rootHint !== undefined
        ? { rootHint: input.identitySeed.rootHint }
        : {}),
    });
    if (!identityResult.ok) {
      throw kernelFailed(`deriveProjectIdentity failed (${identityResult.error.code})`);
    }
    const identity: ProjectIdentity = identityResult.value;
    trace.push({ step: "capture.identity", status: "ok" });

    // 2-3. Execute observations and classify coverage.
    const observed = await runObservations(deps.observation, input.observations, {
      requestId: input.requestId,
    });
    trace.push({ step: "capture.observe", status: "ok" });

    // 4. Derive provider-independent state and minimized evidence candidates.
    const textItems = providerItemsToTextItems(observed.items);
    let derivation: ProjectStateDerivationResult;
    try {
      derivation = deps.deriver.derive({
        items: textItems,
        now: input.capturedAt,
        observedAt: input.observedAt,
        coverageGaps: observed.coverageGaps,
      });
    } catch {
      throw derivationFailed("state derivation failed");
    }
    trace.push({ step: "capture.derive", status: "ok" });

    // 5-6. Minimize evidence through the Kernel; discard raw content and the
    // ephemeral fingerprint input. (Only candidate.fingerprintInput crosses into
    // minimizeEvidence, and it is never carried into a record.)
    const freshlyMinimized = minimizeEvidence(
      deps.kernel,
      identity.id,
      derivation.evidenceCandidates,
    );
    // Evidence ids are content-addressed (the Kernel derives them from content,
    // not from the capture time). A re-observation of unchanged content therefore
    // yields the same id. Reuse the already-committed record for such ids so the
    // record payload stays byte-identical and the commit is idempotent; a content
    // change yields a new id and a new record. Reads are lock-free.
    const minimized = await reconcileEvidenceWithStore(deps.memory, identity.id, freshlyMinimized);
    trace.push({ step: "capture.minimize", status: "ok" });

    // Map drafts -> canonical items with final evidence ids.
    const milestones = mapDrafts(derivation.milestones, minimized.candidateToEvidenceId);
    const tasks = mapDrafts(derivation.tasks, minimized.candidateToEvidenceId);
    const risks = mapDrafts(derivation.risks, minimized.candidateToEvidenceId);
    const decisions = mapDrafts(derivation.decisions, minimized.candidateToEvidenceId);
    const dependencies = mapDrafts(derivation.dependencies, minimized.candidateToEvidenceId);
    const blockers = mapDrafts(derivation.blockers, minimized.candidateToEvidenceId);

    const evidenceRefs = minimized.records.map((r) => r.evidenceId);
    const sources: SourceDescriptor[] = derivation.sources.map((s) => ({
      sourceKind: s.sourceKind,
      sourceIdentity: s.sourceIdentity,
    }));

    // 7. Derive freshness through the Kernel.
    const freshnessResult = deps.kernel.deriveFreshness({
      observationAt: input.observedAt,
      referenceAt: input.capturedAt,
      sourceUpdatedAts: sourceUpdatedAts(minimized.records),
      evidenceChangedAts: evidenceChangedAts(minimized.records),
      coverageGaps: [...observed.coverageGaps],
      maxFutureSkewSeconds: input.freshnessPolicy.maxFutureSkewSeconds,
    });
    if (!freshnessResult.ok) {
      throw kernelFailed(`deriveFreshness failed (${freshnessResult.error.code})`);
    }
    const freshness: Freshness = freshnessResult.value;

    // 8. Build and finalize the ProjectState (Kernel is authoritative).
    const draftState: ProjectState = {
      identity,
      observedAt: input.observedAt,
      sources,
      statusSummary: { ...derivation.statusSummary },
      evidenceRefs,
      freshness,
      schemaVersion: 1,
      stateFingerprint: "",
      ...(derivation.objective !== undefined ? { objective: derivation.objective } : {}),
      ...(milestones.length > 0 ? { milestones } : {}),
      ...(tasks.length > 0 ? { tasks } : {}),
      ...(risks.length > 0 ? { risks } : {}),
      ...(decisions.length > 0 ? { decisions } : {}),
      ...(dependencies.length > 0 ? { dependencies } : {}),
      ...(blockers.length > 0 ? { blockers } : {}),
    };
    const stateResult = deps.kernel.finalizeProjectState(draftState);
    if (!stateResult.ok) {
      throw kernelFailed(`finalizeProjectState failed (${stateResult.error.code})`);
    }
    const state = stateResult.value;
    trace.push({ step: "capture.finalizeState", status: "ok" });

    // 9. Build and finalize the ProjectSnapshot.
    const sourceBoundaries: SourceBoundary[] = observed.coverage.map((c) => ({
      sourceIdentity: c.sourceIdentity,
      includedScope: includedScopeFor(input, c.sourceIdentity),
      coverageState: c.coverageState,
      ...(c.gapReason !== undefined ? { gapReason: c.gapReason } : {}),
    }));
    const draftSnapshot: ProjectSnapshot = {
      snapshotId: "",
      projectId: identity.id,
      capturedAt: input.capturedAt,
      sourceBoundaries,
      state,
      evidenceRefs,
      schemaVersion: 1,
      fingerprint: "",
    };
    const snapshotResult = deps.kernel.finalizeProjectSnapshot(draftSnapshot);
    if (!snapshotResult.ok) {
      throw kernelFailed(`finalizeProjectSnapshot failed (${snapshotResult.error.code})`);
    }
    const snapshot = snapshotResult.value;
    trace.push({ step: "capture.finalizeSnapshot", status: "ok" });

    // Pre-commit privacy scan: prove no forbidden raw/provider/secret/path field
    // (including fingerprintInput) reaches persistence.
    assertNoForbiddenEvidenceFields(snapshot, "snapshot");
    for (const record of minimized.records) {
      assertNoForbiddenEvidenceFields(record, "evidence");
    }
    trace.push({ step: "capture.privacyScan", status: "ok" });

    // 10. Commit exactly one snapshot bundle. The FIRST and ONLY write.
    let commit;
    try {
      commit = await deps.memory.commitSnapshotBundle({
        projectId: identity.id,
        projectRootBoundary: input.projectRootBoundary,
        operationId: input.operationId,
        occurredAt: input.capturedAt,
        snapshot,
        evidence: minimized.records,
      });
    } catch (err) {
      throw persistenceCommitFailed(
        isProjectBrainRuntimeError(err) ? err.message : "snapshot commit failed",
      );
    }
    trace.push({ step: "capture.commit", status: "ok" });

    const itemCount =
      milestones.length +
      tasks.length +
      risks.length +
      decisions.length +
      dependencies.length +
      blockers.length;

    return {
      requestId: input.requestId,
      ok: true,
      projectId: identity.id,
      snapshotId: commit.snapshotId,
      stateFingerprint: state.stateFingerprint,
      snapshotFingerprint: snapshot.fingerprint,
      idempotent: commit.idempotent,
      itemCount,
      evidenceCount: minimized.records.length,
      coverage: observed.coverage,
      coverageComplete: observed.coverageComplete,
      trace,
    };
  } catch (err) {
    const runtimeError: ProjectBrainRuntimeError = isProjectBrainRuntimeError(err)
      ? err
      : invalidInput("capture failed");
    trace.push({ step: "capture.fail", status: "fail", detail: runtimeError.code });
    return {
      requestId: input.requestId,
      ok: false,
      coverage: [],
      error: errorEnvelope(runtimeError.code, runtimeError.message),
      trace,
    };
  }
}

/** The included scope declared for a source identity, or "full" by default. */
function includedScopeFor(input: CaptureProjectInput, sourceIdentity: string): string {
  for (const obs of input.observations) {
    if (obs.sourceIdentity === sourceIdentity) return obs.includedScope;
  }
  return "full";
}

/**
 * Reconcile freshly minimized evidence against any already-committed store. For
 * an evidence id that already exists with an identical content fingerprint, the
 * stored record is reused verbatim (preserving its original observed time) so the
 * commit stays idempotent; a differing content fingerprint under the same id is a
 * genuine conflict surfaced by the memory commit. Reads acquire no write lock.
 */
async function reconcileEvidenceWithStore(
  memory: ProjectBrainRuntimeDeps["memory"],
  projectId: string,
  minimized: MinimizedEvidence,
): Promise<MinimizedEvidence> {
  const manifest = await memory.readManifest(projectId);
  if (manifest === null) return minimized;
  const existingIds = new Set(manifest.evidenceIds);

  const records = [] as (typeof minimized.records)[number][];
  for (const record of minimized.records) {
    if (!existingIds.has(record.evidenceId)) {
      records.push(record);
      continue;
    }
    // The id already exists. Read the stored record and reuse it when the content
    // fingerprint matches (idempotent re-observation of unchanged content).
    let stored;
    try {
      stored = await memory.readEvidence(projectId, record.evidenceId);
    } catch {
      // If the stored record cannot be read, keep the fresh one; the commit path
      // will surface any genuine conflict.
      records.push(record);
      continue;
    }
    if (stored.contentFingerprint === record.contentFingerprint) {
      records.push(stored);
    } else {
      records.push(record);
    }
  }
  return { records, candidateToEvidenceId: minimized.candidateToEvidenceId };
}
