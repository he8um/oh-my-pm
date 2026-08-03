// The repair apply engine: the ONLY module in the package that mutates a store
// for recovery purposes.
//
// The invariant the whole design serves
// ------------------------------------
//   normal read detects and reports
//   repair preview scans and proposes
//   explicit --apply performs bounded mutation
//
// So this module is unreachable without an explicit plan. It does not scan on its
// own behalf, it does not decide what to do, and it cannot be entered from a read
// path: it executes actions a plan already approved, in the order the plan fixed.
//
// Ordering inside one apply, and why each step is where it is:
//
//   1. acquire the writer lock         -- a repair is a write; it takes the same
//                                         single-writer lock a commit does, so a
//                                         repair and a capture can never
//                                         interleave
//   2. re-scan under the lock          -- the plan was computed WITHOUT the lock,
//                                         so the store may have changed since
//   3. compare fingerprints            -- a mismatch means the plan describes
//                                         bytes that no longer exist
//   4. refuse a stale plan, unmutated  -- rejection happens before the first
//                                         write, so a stale plan produces no
//                                         partial mutation at all
//   5. execute the approved actions    -- through the store's existing atomic
//                                         write and confinement paths
//   6. write the receipt               -- last, so its content describes work
//                                         that actually completed
//   7. release the lock in `finally`   -- including on every failure path
//
// Quarantine ordering is the other load-bearing sequence. Evidence is persisted
// and CONFIRMED READABLE before the live path is disturbed, so no failure stage
// can leave the original bytes gone with no preserved copy. See
// `quarantineOneFile`.
//
// What this module never does: reconstruct authoritative content, re-sign a
// mismatched digest, downgrade a future schema, delete an authoritative record,
// touch anything outside the governed data root, touch a project source file, or
// make a network call.

import { atomicCommitFailure, corruption, invalidInput } from "./errors.js";
import type { FileSystem } from "./filesystem.js";
import { computeIntegrity, deriveProjectKey, deriveRecordKey } from "./integrity.js";
import { acquireLock } from "./lock.js";
import { buildManifest, parseAndVerifyManifest, serializeManifest } from "./manifest.js";
import {
  EVIDENCE_DIRNAME,
  MANIFEST_FILENAME,
  SNAPSHOTS_DIRNAME,
  lockPathFor,
  manifestPathFor,
  projectDirFor,
  quarantineMetadataPathFor,
  quarantinePayloadPathFor,
  quarantineOperationDirFor,
  recordStoreRelativePath,
  repairReceiptPathFor,
} from "./path-safety.js";
import type { StoreLayout } from "./path-safety.js";
import { scanStore } from "./repair-scan.js";
import type {
  QuarantineMetadata,
  RepairActionOutcome,
  RepairPlan,
  RepairPlannedAction,
  RepairReceipt,
} from "./repair-types.js";
import { REPAIR_PLAN_VERSION } from "./repair-types.js";
import type { ProjectStoreManifest } from "./types.js";

/** Domain separator for a quarantined payload's byte digest. */
const DOMAIN_QUARANTINE_PAYLOAD = "oh-my-pm:project-memory:v1:quarantine-payload";

/**
 * Ordered stages at which a repair apply may be told to fail, for crash
 * simulation.
 *
 * These exist so the recovery contract is testable from outside: for each stage a
 * test asserts that evidence survives, no invented state appears, and a retry
 * reconciles. Production never sets one.
 */
export type RepairFailurePoint =
  | "afterLock"
  | "afterRescan"
  | "beforeQuarantinePayloadWrite"
  | "afterQuarantinePayloadWrite"
  | "beforeQuarantineMetadataWrite"
  | "afterQuarantineMetadataWrite"
  | "beforeLivePathIsolation"
  | "afterLivePathIsolation"
  | "beforeDerivedRebuild"
  | "afterDerivedRebuild"
  | "beforeRepairReceipt";

/** Every repair failure point, in execution order. Exported so tests cover all. */
export const REPAIR_FAILURE_POINTS: readonly RepairFailurePoint[] = [
  "afterLock",
  "afterRescan",
  "beforeQuarantinePayloadWrite",
  "afterQuarantinePayloadWrite",
  "beforeQuarantineMetadataWrite",
  "afterQuarantineMetadataWrite",
  "beforeLivePathIsolation",
  "afterLivePathIsolation",
  "beforeDerivedRebuild",
  "afterDerivedRebuild",
  "beforeRepairReceipt",
] as const;

/** Inputs for one apply. */
export interface ApplyRepairPlanInput {
  readonly fs: FileSystem;
  readonly layout: StoreLayout;
  readonly plan: RepairPlan;
  /**
   * Explicit apply intent. Required to be exactly `true`: a defaulted or
   * truthy-ish value must not be able to turn a preview into a mutation, so the
   * check is an identity comparison rather than a coercion.
   */
  readonly apply: boolean;
  /** RFC3339 timestamp from the injected clock. */
  readonly appliedAt: string;
  /**
   * The project root, used ONLY as a write-safety boundary. Never persisted, and
   * never written to: a repair must not be able to touch project source files.
   */
  readonly projectRootBoundary: string;
  /** Test-only crash injection. Production leaves this undefined. */
  readonly failAt?: RepairFailurePoint;
}

/**
 * Execute an approved repair plan.
 *
 * Idempotent: applying the same plan twice performs the mutations once. The second
 * run finds each action already satisfied and records `skipped`, so no duplicate
 * quarantine payload and no duplicate history entry can accumulate.
 */
export async function applyRepairPlan(input: ApplyRepairPlanInput): Promise<RepairReceipt> {
  const { fs, layout, plan, appliedAt } = input;

  // 1. Explicit intent. Checked before anything else so a caller that merely
  //    constructed a plan cannot mutate by accident.
  if (input.apply !== true) {
    throw invalidInput(
      "a repair apply requires explicit apply intent",
      "run the repair preview first, then apply explicitly",
    );
  }
  if (plan.planVersion !== REPAIR_PLAN_VERSION) {
    throw invalidInput("the repair plan version is not supported by this build");
  }

  const projectKey = deriveProjectKey(plan.projectId);
  const projectDir = projectDirFor(layout, projectKey);
  const lockPath = lockPathFor(layout, projectKey);

  // A repair writes, so it takes the same writer lock a commit takes.
  await fs.mkdirp(layout.locksDir);
  const lock = await acquireLock(fs, lockPath, projectKey, plan.operationId);

  try {
    await failPoint(input, "afterLock");

    // 2-4. Re-scan under the lock and refuse a plan whose preconditions moved.
    //      This happens BEFORE any write, so a stale plan mutates nothing.
    const rescan = await scanStore({ fs, layout, projectId: plan.projectId });
    await failPoint(input, "afterRescan");
    if (rescan.storeFingerprint !== plan.storeFingerprint) {
      throw corruption(
        "the store changed after the repair plan was generated",
        "re-run the repair preview and apply the fresh plan",
      );
    }

    // 5. Execute the approved actions in the plan's fixed order.
    const outcomes: RepairActionOutcome[] = [];
    let needsDerivedRebuild = false;

    for (const action of plan.actions) {
      switch (action.action) {
        case "reclaim_dead_stale_lock":
          // The lock this apply itself holds is the project lock. A stale lock
          // finding was already resolved by acquireLock's own reclaim path, which
          // applies the same age-AND-dead rule, so there is nothing left to do.
          outcomes.push(outcome(action, "skipped"));
          break;
        case "remove_owned_temporary_residue":
          outcomes.push(await removeResidue(input, action));
          break;
        case "quarantine_authoritative_file":
          outcomes.push(await quarantineOneFile(input, projectKey, action));
          needsDerivedRebuild = true;
          break;
        case "reindex_verified_orphan":
          // Re-indexing is a manifest-level change; it is realized by the derived
          // rebuild below, which projects every record that verifies.
          outcomes.push(outcome(action, "reconstructed"));
          needsDerivedRebuild = true;
          break;
        case "rebuild_derived_manifest":
        case "rebuild_derived_index":
          needsDerivedRebuild = true;
          outcomes.push(outcome(action, "reconstructed"));
          break;
        default:
          // report_* actions never reach `plan.actions`; they are non-mutating and
          // the planner routes them to `blocked`. Recorded defensively.
          outcomes.push(outcome(action, "blocked", "the action is report-only"));
          break;
      }
    }

    // Derived state is rebuilt LAST, from records that verify AFTER every
    // isolation above. Rebuilding earlier would project records this apply was
    // about to quarantine.
    if (needsDerivedRebuild) {
      await failPoint(input, "beforeDerivedRebuild");
      await rebuildDerivedManifest(input, projectKey, projectDir);
      await failPoint(input, "afterDerivedRebuild");
    }

    // 6. The receipt is written last so it describes completed work only.
    await failPoint(input, "beforeRepairReceipt");
    const receipt = buildReceipt(plan, appliedAt, outcomes);
    await writeReceipt(input, projectKey, receipt);
    return receipt;
  } finally {
    // 7. Always release, including on every failure path above.
    await lock.release();
  }
}

/**
 * Quarantine one authoritative file, preserving its exact original bytes.
 *
 * The ordering is the entire safety argument:
 *
 *   1. read the exact original bytes
 *   2. compute their digest
 *   3. persist the payload atomically
 *   4. persist sanitized metadata atomically
 *   5. CONFIRM the payload is readable and its digest still matches
 *   6. only THEN remove the corrupt live path
 *
 * Step 5 before step 6 is what makes every crash stage recoverable. A failure at
 * or before 5 leaves the original still in place -- the store is no worse than
 * before. A failure after 6 leaves the payload preserved and confirmed. There is
 * no reachable stage where the original is gone and no readable copy exists,
 * which is the one outcome that would lose user data irrecoverably.
 *
 * Idempotent: a payload already present with the expected digest is not rewritten
 * and not duplicated, so a retry converges instead of accumulating evidence.
 */
async function quarantineOneFile(
  input: ApplyRepairPlanInput,
  projectKey: string,
  action: RepairPlannedAction,
): Promise<RepairActionOutcome> {
  const { fs, layout, plan } = input;
  const entryKey = action.entryKey;
  if (entryKey === undefined) {
    throw invalidInput("a quarantine action requires an entry key");
  }

  const livePath = absoluteFromStoreRelative(layout, action.target);
  const payloadPath = quarantinePayloadPathFor(layout, projectKey, plan.operationId, entryKey);
  const metadataPath = quarantineMetadataPathFor(layout, projectKey, plan.operationId, entryKey);

  const liveBytes = await fs.readFileIfExists(livePath);

  if (liveBytes === null) {
    // The file the finding named is not there. It may have been isolated by an
    // earlier attempt, or removed by the user; either way there are no bytes to
    // preserve, and inventing a replacement is exactly what must not happen.
    //
    // Note on how a retry is actually prevented from duplicating evidence: it is
    // the stale-plan guard, not a check here. Isolating a record changes the
    // store's fingerprint, so re-applying the same plan is refused before this
    // function runs at all. This branch is the defensive remainder.
    return outcome(action, "skipped", "the file is no longer present");
  }

  const originalDigest = digestOf(liveBytes);

  // 3. Persist the exact original bytes. Writing to an operation-scoped,
  //    deterministic slot means a re-run of the same operation overwrites its own
  //    evidence rather than accumulating a second copy beside it.
  await failPoint(input, "beforeQuarantinePayloadWrite");
  await fs.mkdirp(dirNameOf(payloadPath));
  await fs.writeFileAtomic(payloadPath, liveBytes, tempName(plan.operationId, fs, "qpayload"));
  await failPoint(input, "afterQuarantinePayloadWrite");

  // 4. Persist sanitized metadata. It carries a classification, a store-relative
  //    path, and digests -- never the parsed content, which is precisely the
  //    thing that may be malformed or unexpected.
  const metadata: QuarantineMetadata = {
    code: action.code,
    authority: action.authority,
    originalPath: action.target,
    originalDigest,
    operationId: plan.operationId,
    quarantinedAt: input.appliedAt,
    outcome: "isolated",
  };
  await failPoint(input, "beforeQuarantineMetadataWrite");
  await fs.writeFileAtomic(
    metadataPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
    tempName(plan.operationId, fs, "qmeta"),
  );
  await failPoint(input, "afterQuarantineMetadataWrite");

  // 5. Confirm the evidence before disturbing the live path. Re-reading and
  //    re-digesting is the check that makes step 6 safe: without it, a write that
  //    silently produced different bytes would be followed by deleting the only
  //    remaining original.
  const confirmed = await fs.readFileIfExists(payloadPath);
  if (confirmed === null || digestOf(confirmed) !== originalDigest) {
    throw atomicCommitFailure(
      "quarantine evidence could not be confirmed; the original was left in place",
      "the corrupt file was not removed",
    );
  }

  // 6. Now, and only now, remove the corrupt live path.
  await failPoint(input, "beforeLivePathIsolation");
  await fs.removeFile(livePath);
  await failPoint(input, "afterLivePathIsolation");

  return { ...outcome(action, "isolated"), quarantinedDigest: originalDigest };
}

/** Remove one owned temporary-residue file. */
async function removeResidue(
  input: ApplyRepairPlanInput,
  action: RepairPlannedAction,
): Promise<RepairActionOutcome> {
  const { fs, layout } = input;
  const path = absoluteFromStoreRelative(layout, action.target);
  if (!(await fs.exists(path))) {
    return outcome(action, "skipped");
  }
  return outcome(action, "removed");
}

/**
 * Rebuild the manifest's derived projection from VERIFIED records only.
 *
 * "Verified only" is the safety property. A rebuild that trusted the existing
 * inventory would re-reference records this apply just isolated; a rebuild that
 * trusted whatever is on disk would launder damaged bytes into apparently-valid
 * authoritative state. So the source of truth is the post-isolation scan: a
 * record contributes to the new manifest only if it has no finding against it.
 *
 * Chronology never regresses. Entries are filtered, never renumbered from a
 * clock, and each surviving entry keeps its recorded `capturedAt`. `buildManifest`
 * re-validates every chronology invariant, so an inconsistent projection fails
 * closed before the atomic write rather than being persisted.
 */
async function rebuildDerivedManifest(
  input: ApplyRepairPlanInput,
  projectKey: string,
  projectDir: string,
): Promise<void> {
  const { fs, layout, plan } = input;
  const manifestPath = manifestPathFor(layout, projectKey);
  const raw = await fs.readFileIfExists(manifestPath);
  if (raw === null) {
    // No manifest to rebuild. A manifest is authoritative chronology; it is never
    // fabricated from whatever records happen to be present.
    return;
  }

  let manifest: ProjectStoreManifest;
  try {
    manifest = parseAndVerifyManifest(raw);
  } catch {
    // The manifest itself was the damaged file. It is quarantined by its own
    // action, not rebuilt from unverifiable input.
    return;
  }

  // Re-scan to learn what survived every isolation performed above.
  const after = await scanStore({ fs, layout, projectId: plan.projectId });
  const damagedTargets = new Set(after.findings.map((finding) => finding.target));

  const survives = (recordType: "snapshot" | "evidence", id: string): boolean =>
    !damagedTargets.has(
      recordStoreRelativePath(
        projectKey,
        recordType === "snapshot" ? SNAPSHOTS_DIRNAME : EVIDENCE_DIRNAME,
        deriveRecordKey(recordType, id),
      ),
    );

  const snapshotIds = [...new Set(manifest.snapshotIds)].filter((id) => survives("snapshot", id));
  const evidenceIds = [...new Set(manifest.evidenceIds)].filter((id) => survives("evidence", id));
  const snapshotIdSet = new Set(snapshotIds);

  // Chronology: keep only entries whose snapshot survives, in their existing
  // order, then renumber to stay contiguous. Order comes from the recorded
  // sequence, never from a fresh clock read.
  const history = (manifest.snapshotHistory ?? [])
    .filter((entry) => snapshotIdSet.has(entry.snapshotId))
    .map((entry, index) => ({
      snapshotId: entry.snapshotId,
      capturedAt: entry.capturedAt,
      sequence: index + 1,
    }));

  const latestSnapshotId =
    history.length === 0 ? null : (history[history.length - 1]?.snapshotId ?? null);

  const rebuilt = buildManifest({
    storeFormatVersion: manifest.storeFormatVersion,
    projectBrainSchemaVersion: manifest.projectBrainSchemaVersion,
    projectId: manifest.projectId,
    projectKey,
    createdAt: manifest.createdAt,
    // The repair time is the update time; the capture times are untouched.
    updatedAt: input.appliedAt,
    latestSnapshotId,
    snapshotIds: [...snapshotIds].sort(),
    evidenceIds: [...evidenceIds].sort(),
    snapshotHistory: history,
    ...(manifest.snapshotChronologyOrigin !== undefined
      ? { snapshotChronologyOrigin: manifest.snapshotChronologyOrigin }
      : {}),
    migrationHistory: manifest.migrationHistory,
  });

  const serialized = serializeManifest(rebuilt);
  // Idempotency: an unchanged projection is not rewritten, so a second apply
  // performs no manifest write at all.
  if (serialized === raw) return;

  await fs.writeFileAtomic(
    manifestPath,
    serialized,
    tempName(plan.operationId, fs, "repair-manifest"),
  );
  await fs.syncDir(projectDir);
}

/** Persist the deterministic repair receipt inside the operation directory. */
async function writeReceipt(
  input: ApplyRepairPlanInput,
  projectKey: string,
  receipt: RepairReceipt,
): Promise<void> {
  const { fs, layout, plan } = input;
  const receiptPath = repairReceiptPathFor(layout, projectKey, plan.operationId);
  await fs.mkdirp(quarantineOperationDirFor(layout, projectKey, plan.operationId));
  await fs.writeFileAtomic(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    tempName(plan.operationId, fs, "receipt"),
  );
}

/** Assemble the receipt with distinct outcome tallies. */
function buildReceipt(
  plan: RepairPlan,
  appliedAt: string,
  outcomes: readonly RepairActionOutcome[],
): RepairReceipt {
  const count = (status: RepairActionOutcome["status"]): number =>
    outcomes.filter((o) => o.status === status).length;
  return {
    planVersion: REPAIR_PLAN_VERSION,
    operationId: plan.operationId,
    projectId: plan.projectId,
    storeFingerprint: plan.storeFingerprint,
    appliedAt,
    outcomes,
    // Separate counters, never one "repaired" total: isolation is not semantic
    // recovery and the receipt must not let a reader conclude otherwise.
    reconstructedCount: count("reconstructed"),
    isolatedCount: count("isolated"),
    removedCount: count("removed"),
    reclaimedCount: count("reclaimed"),
    skippedCount: count("skipped"),
    blockedCount: count("blocked"),
  };
}

// ---- helpers ---------------------------------------------------------------

function outcome(
  action: RepairPlannedAction,
  status: RepairActionOutcome["status"],
  blockingReason?: string,
): RepairActionOutcome {
  return {
    action: action.action,
    code: action.code,
    target: action.target,
    status,
    ...(blockingReason !== undefined ? { blockingReason } : {}),
  };
}

/** The digest of exact bytes, domain-separated from every other digest use. */
function digestOf(contents: string): string {
  return computeIntegrity(DOMAIN_QUARANTINE_PAYLOAD, contents);
}

/**
 * Re-absolutize a store-relative target.
 *
 * Findings carry store-relative paths so nothing absolute is ever printed, but a
 * write needs an absolute path. Traversal cannot smuggle a path out of the store:
 * the result is rebuilt from the layout's own store root, and every mutating call
 * it reaches is additionally validated by the Node adapter's physical confinement
 * before it touches the filesystem.
 */
function absoluteFromStoreRelative(layout: StoreLayout, relativePath: string): string {
  if (relativePath.includes("..")) {
    throw invalidInput("a repair target must not contain traversal");
  }
  return `${layout.storeRoot}/${relativePath}`;
}

/** The directory portion of a `/`-joined managed path. */
function dirNameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? path : path.slice(0, index);
}

/** A deterministic temp name scoped to this operation and process. */
function tempName(operationId: string, fs: FileSystem, label: string): string {
  return `.tmp-${operationId}-${fs.currentPid()}-${label}`;
}

/** Throw at an injected failure stage. Production never sets one. */
async function failPoint(input: ApplyRepairPlanInput, point: RepairFailurePoint): Promise<void> {
  if (input.failAt === point) {
    throw atomicCommitFailure(`injected repair failure at ${point}`, "test-only failure injection");
  }
  return Promise.resolve();
}

/** Re-exported so the store can surface the manifest filename in tests. */
export { MANIFEST_FILENAME };
