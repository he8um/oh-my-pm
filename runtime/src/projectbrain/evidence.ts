// Evidence minimization pipeline (v0.3 Phase 3).
//
// Turns the Skills-layer evidence candidates into finalized, minimized
// EvidenceRecords using the Kernel. For each candidate it builds a bounded
// fingerprint input in memory, calls the Kernel to fingerprint it, constructs an
// EvidenceRecord with rawContentPolicy = "minimized", derives its evidence id,
// and records the candidateId -> evidenceId mapping. The ephemeral
// fingerprintInput and all raw provider data are discarded here and never cross
// into persistence or any public result.

import type { EvidenceRecord, EvidenceSourceKind } from "@oh-my-pm/contracts";
import type { EvidenceCandidate } from "@oh-my-pm/skills";
import { kernelFailed } from "./errors.js";
import type { ProjectBrainKernelPort } from "./types.js";

/** The output of minimizing all evidence candidates. */
export interface MinimizedEvidence {
  /** Finalized, minimized evidence records (ids only reference in state). */
  readonly records: readonly EvidenceRecord[];
  /** Map from ephemeral candidateId to the final evidenceId. */
  readonly candidateToEvidenceId: ReadonlyMap<string, string>;
}

/** The Skills EvidenceCandidate sourceKind is already the contract taxonomy. */
function sourceKindOf(candidate: EvidenceCandidate): EvidenceSourceKind {
  return candidate.sourceKind as EvidenceSourceKind;
}

/**
 * Minimize every evidence candidate through the Kernel. Deterministic: the same
 * candidates and Kernel produce deep-equal records. A Kernel failure aborts
 * (throws) so no partial evidence set can be committed.
 */
export function minimizeEvidence(
  kernel: ProjectBrainKernelPort,
  projectId: string,
  candidates: readonly EvidenceCandidate[],
): MinimizedEvidence {
  const records: EvidenceRecord[] = [];
  const candidateToEvidenceId = new Map<string, string>();

  for (const candidate of candidates) {
    // 1. Fingerprint the bounded, minimized content input.
    const fpResult = kernel.fingerprintMinimizedContent({
      content: candidate.fingerprintInput,
    });
    if (!fpResult.ok) {
      throw kernelFailed(`fingerprintMinimizedContent failed (${fpResult.error.code})`);
    }

    // 2. Construct the minimized EvidenceRecord (never storing verbatim text).
    // The evidenceId is a placeholder until the Kernel derives the final id.
    const base: EvidenceRecord = {
      evidenceId: "pending",
      projectId,
      sourceKind: sourceKindOf(candidate),
      sourceIdentity: candidate.sourceIdentity,
      observedAt: candidate.observedAt,
      provenance: { ...candidate.provenance },
      rawContentPolicy: "minimized",
      retentionState: "active",
      schemaVersion: 1,
      contentFingerprint: fpResult.value,
    };
    const withSourceUpdatedAt =
      candidate.sourceUpdatedAt !== undefined
        ? { ...base, sourceUpdatedAt: candidate.sourceUpdatedAt }
        : base;
    const record =
      candidate.metadata !== undefined && Object.keys(candidate.metadata).length > 0
        ? { ...withSourceUpdatedAt, metadata: { ...candidate.metadata } }
        : withSourceUpdatedAt;

    // 3. Derive the deterministic evidence id from the minimized record.
    const idResult = kernel.deriveEvidenceId(record);
    if (!idResult.ok) {
      throw kernelFailed(`deriveEvidenceId failed (${idResult.error.code})`);
    }
    const finalized: EvidenceRecord = { ...record, evidenceId: idResult.value };
    records.push(finalized);
    candidateToEvidenceId.set(candidate.candidateId, idResult.value);
  }

  return { records, candidateToEvidenceId };
}
