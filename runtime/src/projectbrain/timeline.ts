// Read-only Project Timeline query (v0.4).
//
// One provider-independent Runtime operation. It reads the authoritative capture
// chronology from the memory port, reads the committed snapshots and their
// referenced evidence, compares each adjacent pair through the existing Kernel
// diff, and hands the resulting ChangeSets to the pure Kernel timeline
// derivation.
//
// It performs NO write, lock, capture, migration, export, delete, provider call,
// or network request, and creates no application-data directory. Every failure
// path fails CLOSED: a corrupt manifest, a missing snapshot, an integrity
// mismatch, or an unsupported store format produces a controlled failure, never
// a partial timeline.

import type { EvidenceRecord, ProjectSnapshot, TimelineResult } from "@oh-my-pm/contracts";
import type { TimelineCaptureInput } from "@oh-my-pm/kernel";
import {
  errorEnvelope,
  invalidInput,
  isProjectBrainRuntimeError,
  kernelFailed,
  type ProjectBrainRuntimeError,
  storedRecordReadFailed,
  timelineFailed,
} from "./errors.js";
import type {
  ProjectBrainRuntimeDeps,
  ProjectBrainTraceEntry,
  TimelineProjectInput,
  TimelineProjectResult,
} from "./types.js";

/** Inclusive bounds for the page size, mirroring the Kernel derivation. */
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * The maximum number of adjacent comparisons one query performs. A longer
 * history still works: only a bounded window of the newest captures is read, so
 * a large store never turns one read into an unbounded amount of work.
 */
const MAX_COMPARISONS = 200;

function validateTimelineInput(input: TimelineProjectInput): void {
  for (const [field, value] of [
    ["requestId", input.requestId],
    ["projectId", input.projectId],
    ["comparedAt", input.comparedAt],
  ] as const) {
    if (typeof value !== "string" || value.length === 0) {
      throw invalidInput(`${field} must be a non-empty string`);
    }
  }
  if (input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || input.limit < MIN_LIMIT || input.limit > MAX_LIMIT) {
      throw invalidInput("limit must be an integer between 1 and 100");
    }
  }
  if (input.beforeSequence !== undefined) {
    if (!Number.isInteger(input.beforeSequence) || input.beforeSequence < 0) {
      throw invalidInput("beforeSequence must be a non-negative integer");
    }
  }
}

/** Read a snapshot and its referenced evidence, failing closed on any gap. */
async function loadSnapshot(
  deps: ProjectBrainRuntimeDeps,
  projectId: string,
  snapshotId: string,
): Promise<{ snapshot: ProjectSnapshot; evidence: EvidenceRecord[] }> {
  let snapshot: ProjectSnapshot;
  try {
    snapshot = await deps.memory.readSnapshot(projectId, snapshotId);
  } catch {
    // A manifest-referenced snapshot that cannot be read (missing, corrupt, or
    // integrity-mismatched) fails the whole query. There is no partial timeline.
    throw storedRecordReadFailed("a committed snapshot could not be read");
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

/**
 * The authoritative chronology entry the timeline needs. The memory port returns
 * the store's own `snapshotHistory`-derived summaries; a summary missing its
 * capture sequence or timestamp means the store is not a supported store format
 * 2 chronology and the query fails closed rather than falling back to a lexical
 * id order or a timestamp comparison.
 */
interface ChronologyEntry {
  readonly snapshotId: string;
  readonly captureSequence: number;
  readonly capturedAt: string;
}

function readChronology(
  summaries: readonly {
    snapshotId: string;
    isLatest: boolean;
    capturedAt?: string;
    sequence?: number;
  }[],
): ChronologyEntry[] {
  const entries: ChronologyEntry[] = [];
  for (const summary of summaries) {
    if (
      typeof summary.capturedAt !== "string" ||
      summary.capturedAt.length === 0 ||
      typeof summary.sequence !== "number" ||
      !Number.isInteger(summary.sequence) ||
      summary.sequence < 1
    ) {
      // NO fallback to lexical snapshot-id ordering and NO fallback to
      // timestamps: the capture sequence is the only authoritative order.
      throw storedRecordReadFailed("the store does not expose an authoritative capture chronology");
    }
    entries.push({
      snapshotId: summary.snapshotId,
      captureSequence: summary.sequence,
      capturedAt: summary.capturedAt,
    });
  }
  // The port documents oldest-capture-first order; assert it rather than trust
  // it, so a disturbed order fails closed instead of producing a wrong timeline.
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i]!.captureSequence <= entries[i - 1]!.captureSequence) {
      throw storedRecordReadFailed("the store chronology is not strictly ascending");
    }
  }
  return entries;
}

/**
 * Select the bounded window of adjacent pairs this query needs.
 *
 * Only pairs whose CURRENT snapshot is eligible under `beforeSequence` matter,
 * and only the newest `MAX_COMPARISONS` of those are read — the timeline is
 * newest-first, so older pairs beyond the window can never appear on the
 * requested page. When the window truncates the history, the derivation's own
 * `hasMore` stays truthful because the window's oldest capture is still a real
 * capture with events below it.
 */
function selectWindow(
  chronology: readonly ChronologyEntry[],
  beforeSequence: number | undefined,
): { previous: ChronologyEntry; current: ChronologyEntry }[] {
  const pairs: { previous: ChronologyEntry; current: ChronologyEntry }[] = [];
  for (let i = 1; i < chronology.length; i += 1) {
    const current = chronology[i]!;
    if (beforeSequence !== undefined && current.captureSequence >= beforeSequence) {
      continue;
    }
    pairs.push({ previous: chronology[i - 1]!, current });
  }
  // Keep the newest window.
  return pairs.length > MAX_COMPARISONS ? pairs.slice(pairs.length - MAX_COMPARISONS) : pairs;
}

/** Run one read-only timeline query and return a sanitized result. */
export async function timelineProject(
  deps: ProjectBrainRuntimeDeps,
  input: TimelineProjectInput,
): Promise<TimelineProjectResult> {
  const trace: ProjectBrainTraceEntry[] = [{ step: "timeline.receive", status: "ok" }];
  try {
    validateTimelineInput(input);
    trace.push({ step: "timeline.validate", status: "ok" });

    // A project with no store at all is not a failure: it has an empty timeline.
    const manifest = await deps.memory.readManifest(input.projectId);
    if (manifest === null) {
      trace.push({ step: "timeline.select", status: "skip", detail: "noPriorMemory" });
      return {
        requestId: input.requestId,
        status: "noPriorMemory",
        projectId: input.projectId,
        result: emptyResult(input.projectId),
        trace,
      };
    }

    const chronology = readChronology(await deps.memory.listSnapshots(input.projectId));
    // The final chronological entry must agree with the manifest's latest
    // pointer; a disagreement is a stored-record error, never a silent fallback.
    const newest = chronology[chronology.length - 1];
    if (
      chronology.length > 0 &&
      (newest === undefined || newest.snapshotId !== manifest.latestSnapshotId)
    ) {
      throw storedRecordReadFailed("the store chronology disagrees with the latest pointer");
    }
    // Zero or one committed snapshot has no adjacent pair: an empty, valid
    // timeline rather than a failure.
    if (chronology.length < 2) {
      trace.push({ step: "timeline.select", status: "skip", detail: "insufficientHistory" });
      return {
        requestId: input.requestId,
        status: "derived",
        projectId: input.projectId,
        result: emptyResult(input.projectId),
        trace,
      };
    }

    const window = selectWindow(chronology, input.beforeSequence);
    trace.push({ step: "timeline.select", status: "ok" });

    // Compare each adjacent pair. Snapshots are read once per pair boundary by
    // carrying the previous read forward, so an N-pair window performs N+1
    // snapshot reads rather than 2N.
    const captures: TimelineCaptureInput[] = [];
    let carried: { snapshotId: string; loaded: Awaited<ReturnType<typeof loadSnapshot>> } | null =
      null;
    for (const pair of window) {
      const previous =
        carried !== null && carried.snapshotId === pair.previous.snapshotId
          ? carried.loaded
          : await loadSnapshot(deps, input.projectId, pair.previous.snapshotId);
      const current = await loadSnapshot(deps, input.projectId, pair.current.snapshotId);
      carried = { snapshotId: pair.current.snapshotId, loaded: current };

      const diff = deps.kernel.diffProjectSnapshots({
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
      if (!diff.ok) {
        throw kernelFailed(`diffProjectSnapshots failed (${diff.error.code})`);
      }
      captures.push({
        snapshotId: pair.current.snapshotId,
        captureSequence: pair.current.captureSequence,
        capturedAt: pair.current.capturedAt,
        changeSet: diff.value,
      });
    }
    trace.push({ step: "timeline.compare", status: "ok" });

    // The pure Kernel derivation performs the filtering, ordering, pagination,
    // and sanitization. The Runtime contributes no ordering rule of its own.
    const derived = deps.kernel.deriveProjectTimeline({
      captures,
      query: {
        projectId: input.projectId,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.beforeSequence !== undefined ? { beforeSequence: input.beforeSequence } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
      },
    });
    if (!derived.ok) {
      throw kernelFailed(`deriveProjectTimeline failed (${derived.error.code})`);
    }
    trace.push({ step: "timeline.derive", status: "ok" });

    return {
      requestId: input.requestId,
      status: "derived",
      projectId: input.projectId,
      result: derived.value,
      trace,
    };
  } catch (err) {
    const runtimeError: ProjectBrainRuntimeError = isProjectBrainRuntimeError(err)
      ? err
      : timelineFailed("timeline failed");
    trace.push({ step: "timeline.fail", status: "fail", detail: runtimeError.code });
    return {
      requestId: input.requestId,
      status: "failed",
      projectId: input.projectId,
      error: errorEnvelope(runtimeError.code, runtimeError.message),
      trace,
    };
  }
}

/** A valid, empty timeline for a project with no comparable history. */
function emptyResult(projectId: string): TimelineResult {
  return { projectId, eventCount: 0, hasMore: false, events: [] };
}
