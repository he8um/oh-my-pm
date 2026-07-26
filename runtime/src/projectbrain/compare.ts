// Compare orchestration (v0.3 Phase 3).
//
// Selects two committed snapshots, reads and verifies them and their referenced
// evidence through the memory port, calls the existing Kernel deterministic
// diff, and returns a sanitized ChangeSet. It performs NO write and acquires no
// write lock. No-history outcomes are controlled statuses, not failures.

import type { EvidenceRecord, ProjectSnapshot } from "@oh-my-pm/contracts";
import {
  compareFailed,
  errorEnvelope,
  invalidInput,
  isProjectBrainRuntimeError,
  kernelFailed,
  ProjectBrainRuntimeError,
  storedRecordReadFailed,
} from "./errors.js";
import type {
  CompareProjectInput,
  CompareProjectResult,
  ProjectBrainRuntimeDeps,
  ProjectBrainTraceEntry,
} from "./types.js";

/** The resolved snapshot pair for a comparison. */
interface SelectedPair {
  readonly previousSnapshotId: string;
  readonly currentSnapshotId: string;
}

/** A no-history sentinel returned by selection. */
type SelectionOutcome =
  | { readonly kind: "pair"; readonly pair: SelectedPair }
  | { readonly kind: "noPriorMemory" }
  | { readonly kind: "insufficientHistory" };

function validateCompareInput(input: CompareProjectInput): void {
  for (const [field, value] of [
    ["requestId", input.requestId],
    ["projectId", input.projectId],
    ["comparedAt", input.comparedAt],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      throw invalidInput(`${field} must be a non-empty string`);
    }
  }
  const hasPrev = input.previousSnapshotId !== undefined;
  const hasCurr = input.currentSnapshotId !== undefined;
  if (hasPrev !== hasCurr) {
    throw invalidInput("explicit selection requires both previousSnapshotId and currentSnapshotId");
  }
  if (hasPrev && hasCurr && input.previousSnapshotId === input.currentSnapshotId) {
    throw invalidInput("previousSnapshotId and currentSnapshotId must differ");
  }
}

/** Resolve the snapshot pair (explicit or default latest-two). */
async function selectPair(
  deps: ProjectBrainRuntimeDeps,
  input: CompareProjectInput,
): Promise<SelectionOutcome> {
  const manifest = await deps.memory.readManifest(input.projectId);
  if (manifest === null) return { kind: "noPriorMemory" };
  const snapshotIds = manifest.snapshotIds;

  if (input.previousSnapshotId !== undefined && input.currentSnapshotId !== undefined) {
    if (
      !snapshotIds.includes(input.previousSnapshotId) ||
      !snapshotIds.includes(input.currentSnapshotId)
    ) {
      throw invalidInput("an explicitly selected snapshot is not in the store");
    }
    return {
      kind: "pair",
      pair: {
        previousSnapshotId: input.previousSnapshotId,
        currentSnapshotId: input.currentSnapshotId,
      },
    };
  }

  // Default: current = the latest committed capture; previous = the capture
  // committed immediately before it. The authoritative order is the memory
  // port's capture chronology (listSnapshots, oldest first) — NOT a lexical id
  // order and NOT a fresh clock read. There is no lexical-order fallback.
  if (snapshotIds.length === 0 || manifest.latestSnapshotId === null) {
    return { kind: "noPriorMemory" };
  }
  const summaries = await deps.memory.listSnapshots(input.projectId);
  const ordered = summaries.map((s) => s.snapshotId);
  if (ordered.length < 2) return { kind: "insufficientHistory" };
  // The final chronological entry is the current capture and must match the
  // manifest's latest pointer; any disagreement is a stored-record error, never
  // a silent fallback.
  const current = ordered[ordered.length - 1]!;
  if (current !== manifest.latestSnapshotId) {
    throw storedRecordReadFailed("the store chronology disagrees with the latest pointer");
  }
  const previous = ordered[ordered.length - 2]!;
  return { kind: "pair", pair: { previousSnapshotId: previous, currentSnapshotId: current } };
}

/** Read a snapshot and its referenced evidence, verifying every record exists. */
async function loadSnapshotWithEvidence(
  deps: ProjectBrainRuntimeDeps,
  projectId: string,
  snapshotId: string,
): Promise<{ snapshot: ProjectSnapshot; evidence: EvidenceRecord[] }> {
  let snapshot: ProjectSnapshot;
  try {
    snapshot = await deps.memory.readSnapshot(projectId, snapshotId);
  } catch {
    throw storedRecordReadFailed("a selected snapshot could not be read");
  }
  const evidence: EvidenceRecord[] = [];
  const seen = new Set<string>();
  for (const evidenceId of [...snapshot.evidenceRefs].sort()) {
    if (seen.has(evidenceId)) continue;
    seen.add(evidenceId);
    try {
      evidence.push(await deps.memory.readEvidence(projectId, evidenceId));
    } catch {
      throw storedRecordReadFailed("a referenced evidence record could not be read");
    }
  }
  return { snapshot, evidence };
}

/** Run one compare and return a sanitized result. */
export async function compareProject(
  deps: ProjectBrainRuntimeDeps,
  input: CompareProjectInput,
): Promise<CompareProjectResult> {
  const trace: ProjectBrainTraceEntry[] = [{ step: "compare.receive", status: "ok" }];
  try {
    validateCompareInput(input);
    trace.push({ step: "compare.validate", status: "ok" });

    const selection = await selectPair(deps, input);
    if (selection.kind === "noPriorMemory") {
      trace.push({ step: "compare.select", status: "skip", detail: "noPriorMemory" });
      return { requestId: input.requestId, status: "noPriorMemory", projectId: input.projectId, trace };
    }
    if (selection.kind === "insufficientHistory") {
      trace.push({ step: "compare.select", status: "skip", detail: "insufficientHistory" });
      return {
        requestId: input.requestId,
        status: "insufficientHistory",
        projectId: input.projectId,
        trace,
      };
    }
    const { previousSnapshotId, currentSnapshotId } = selection.pair;
    trace.push({ step: "compare.select", status: "ok" });

    const previous = await loadSnapshotWithEvidence(deps, input.projectId, previousSnapshotId);
    const current = await loadSnapshotWithEvidence(deps, input.projectId, currentSnapshotId);
    trace.push({ step: "compare.load", status: "ok" });

    const diffResult = deps.kernel.diffProjectSnapshots({
      previous: previous.snapshot,
      current: current.snapshot,
      previousEvidence: previous.evidence,
      currentEvidence: current.evidence,
      comparedAt: input.comparedAt,
      stalenessPolicy: {
        evidenceStaleAfterSeconds: input.stalenessPolicy.evidenceStaleAfterSeconds,
        maxFutureSkewSeconds: input.stalenessPolicy.maxFutureSkewSeconds,
      },
    });
    if (!diffResult.ok) {
      throw kernelFailed(`diffProjectSnapshots failed (${diffResult.error.code})`);
    }
    trace.push({ step: "compare.diff", status: "ok" });

    return {
      requestId: input.requestId,
      status: "compared",
      projectId: input.projectId,
      previousSnapshotId,
      currentSnapshotId,
      changeSet: diffResult.value,
      trace,
    };
  } catch (err) {
    const runtimeError: ProjectBrainRuntimeError = isProjectBrainRuntimeError(err)
      ? err
      : compareFailed("compare failed");
    trace.push({ step: "compare.fail", status: "fail", detail: runtimeError.code });
    return {
      requestId: input.requestId,
      status: "failed",
      projectId: input.projectId,
      error: errorEnvelope(runtimeError.code, runtimeError.message),
      trace,
    };
  }
}
