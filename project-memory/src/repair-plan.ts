// Repair-plan construction: turn a scan result into an ordered, executable plan.
//
// Pure. This module performs no I/O, holds no lock, reads no clock, and mutates
// nothing; the timestamp and operation id are injected by the caller. A plan is a
// value that can be printed, compared, and stored without any possibility of
// touching the store — which is what makes "preview writes nothing" a structural
// property rather than a promise.
//
// Action ordering is deliberate and is the plan's main contribution beyond the
// scan. Actions run in dependency order:
//
//   1. reclaim a dead stale lock          -- nothing else can proceed while a
//                                            stale lock blocks the writer
//   2. remove owned temporary residue     -- cheap, non-authoritative, and it
//                                            keeps a later rebuild from seeing
//                                            half-written files
//   3. quarantine authoritative files     -- isolate damaged bytes BEFORE any
//                                            derived rebuild, so the rebuild
//                                            projects only verified records
//   4. re-index verified orphans          -- add back records that proved valid
//   5. rebuild derived manifest/index     -- last, from whatever verified after
//                                            every isolation above
//
// Reversing 3 and 5 would rebuild the manifest from records that are about to be
// isolated, producing an inventory that references quarantined bytes.

import type {
  RepairActionCode,
  RepairFinding,
  RepairPlan,
  RepairPlannedAction,
  RepairScanResult,
  RepairSummary,
} from "./repair-types.js";
import { REPAIR_PLAN_VERSION } from "./repair-types.js";
import { deriveQuarantineEntryKey } from "./repair-scan.js";

/**
 * Execution order for planned actions. Lower runs first.
 *
 * `report_*` actions carry no mutation but are ordered last so a plan reads as
 * "everything that will be done, then everything that cannot be".
 */
const ACTION_ORDER: readonly RepairActionCode[] = [
  "reclaim_dead_stale_lock",
  "remove_owned_temporary_residue",
  "quarantine_authoritative_file",
  "reindex_verified_orphan",
  "rebuild_derived_manifest",
  "rebuild_derived_index",
  "report_unsupported_schema",
  "report_unrepairable",
] as const;

/** Actions that mutate the store. Everything else is report-only. */
const MUTATING_ACTIONS: ReadonlySet<RepairActionCode> = new Set<RepairActionCode>([
  "reclaim_dead_stale_lock",
  "remove_owned_temporary_residue",
  "quarantine_authoritative_file",
  "reindex_verified_orphan",
  "rebuild_derived_manifest",
  "rebuild_derived_index",
]);

/** Inputs for building a plan. All injected; the module reads no ambient state. */
export interface BuildRepairPlanInput {
  readonly scan: RepairScanResult;
  readonly operationId: string;
  /** RFC3339 timestamp from the injected clock. */
  readonly generatedAt: string;
}

/**
 * Build the deterministic repair plan for a scan.
 *
 * Determinism contract: identical store bytes, an identical injected timestamp,
 * and an identical operation id produce a byte-identical plan. Nothing here reads
 * a clock, a random source, or the filesystem, so the only inputs are the three
 * above.
 */
export function buildRepairPlan(input: BuildRepairPlanInput): RepairPlan {
  const { scan, operationId, generatedAt } = input;

  const actions: RepairPlannedAction[] = [];
  const blocked: RepairPlannedAction[] = [];

  for (const finding of scan.findings) {
    const planned = plannedActionFor(finding);
    // A repairable finding whose action actually mutates becomes an executable
    // step. Everything else -- blocked, unrepairable, or report-only -- is kept
    // visible in `blocked` rather than dropped, so a plan never hides a problem
    // it declined to act on.
    if (finding.repairability === "repairable" && MUTATING_ACTIONS.has(finding.action)) {
      actions.push(planned);
    } else {
      blocked.push(planned);
    }
  }

  // Deduplicate derived rebuilds: many findings can independently justify one
  // manifest rebuild, and rebuilding twice in a single apply would be wasted work
  // whose second pass reads state the first already replaced.
  const deduped = dedupeDerivedRebuilds(actions);

  return {
    planVersion: REPAIR_PLAN_VERSION,
    operationId,
    projectId: scan.projectId,
    storeFingerprint: scan.storeFingerprint,
    generatedAt,
    findings: scan.findings,
    actions: sortActions(deduped),
    blocked: sortActions(blocked),
    summary: summarizeActions(scan.summary, deduped),
  };
}

/** Map one finding to its planned action, attaching a quarantine slot key. */
function plannedActionFor(finding: RepairFinding): RepairPlannedAction {
  const base = {
    action: finding.action,
    code: finding.code,
    authority: finding.authority,
    target: finding.target,
  };
  // Only an isolating action needs a payload slot. The key is derived from the
  // store-relative path, so it is stable across retries of the same plan and
  // computable even for bytes that cannot be parsed.
  if (finding.action === "quarantine_authoritative_file") {
    return { ...base, entryKey: deriveQuarantineEntryKey(finding.target) };
  }
  return base;
}

/**
 * Collapse repeated derived rebuilds to one action each.
 *
 * A manifest rebuild is idempotent and whole-store: running it once after every
 * isolation produces the same result as running it once per justifying finding.
 * The retained action keeps the first target it was justified by, so the plan
 * still records why the rebuild is there.
 */
function dedupeDerivedRebuilds(
  actions: readonly RepairPlannedAction[],
): readonly RepairPlannedAction[] {
  const out: RepairPlannedAction[] = [];
  let haveManifestRebuild = false;
  let haveIndexRebuild = false;
  for (const action of actions) {
    if (action.action === "rebuild_derived_manifest") {
      if (haveManifestRebuild) continue;
      haveManifestRebuild = true;
    }
    if (action.action === "rebuild_derived_index") {
      if (haveIndexRebuild) continue;
      haveIndexRebuild = true;
    }
    out.push(action);
  }
  // A manifest rebuild already reprojects the chronology, so a separate index
  // rebuild beside it is redundant work on the same bytes.
  return haveManifestRebuild ? out.filter((a) => a.action !== "rebuild_derived_index") : out;
}

/** Sort planned actions into dependency order, then by target for determinism. */
function sortActions(actions: readonly RepairPlannedAction[]): readonly RepairPlannedAction[] {
  const rank = new Map(ACTION_ORDER.map((action, index) => [action, index]));
  return [...actions].sort((a, b) => {
    const byAction =
      (rank.get(a.action) ?? ACTION_ORDER.length) - (rank.get(b.action) ?? ACTION_ORDER.length);
    if (byAction !== 0) return byAction;
    return a.target < b.target ? -1 : a.target > b.target ? 1 : 0;
  });
}

/** The plan summary: the scan's finding tallies plus the executable action count. */
function summarizeActions(
  scanSummary: RepairSummary,
  actions: readonly RepairPlannedAction[],
): RepairSummary {
  return {
    findingCount: scanSummary.findingCount,
    repairableCount: actions.length,
    blockedCount: scanSummary.blockedCount,
    unrepairableCount: scanSummary.unrepairableCount,
  };
}
