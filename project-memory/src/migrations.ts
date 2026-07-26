// Store-format migration mechanism. Migrations are ordered one-version steps
// run under a project lock: the source is verified, a backup is taken, the
// target is committed atomically, the target is verified, and the completed
// steps are recorded in the manifest history. The mechanism carries one real
// PRODUCTION migration, `1 -> 2` (Phase 4.1), which reconstructs the best
// deterministic capture chronology a v1 store can yield. Migration NEVER runs
// automatically during a read.

import { corruption, invalidInput, migrationRequired } from "./errors.js";
import { CURRENT_STORE_FORMAT_VERSION } from "./types.js";
import type { JsonObject, SnapshotHistoryEntry } from "./types.js";

/** A single one-version migration step definition. */
export interface MigrationDefinition {
  readonly fromStoreFormatVersion: number;
  readonly toStoreFormatVersion: number;
  /**
   * Transform a source manifest body and its record payloads into the target
   * shape. Pure and deterministic; performs no I/O. The store handles locking,
   * backup, atomic commit, and verification around this call.
   */
  readonly migrate: (source: MigrationSource) => MigrationTarget;
}

/** The pre-migration store material handed to a migration step. */
export interface MigrationSource {
  readonly storeFormatVersion: number;
  readonly manifest: JsonObject;
  readonly snapshots: readonly JsonObject[];
  readonly evidence: readonly JsonObject[];
}

/** The post-migration store material produced by a migration step. */
export interface MigrationTarget {
  readonly manifest: JsonObject;
  readonly snapshots: readonly JsonObject[];
  readonly evidence: readonly JsonObject[];
}

/** An ordered registry of migration steps keyed by source version. */
export class MigrationRegistry {
  private readonly byFrom = new Map<number, MigrationDefinition>();

  constructor(definitions: readonly MigrationDefinition[] = []) {
    for (const def of definitions) this.register(def);
  }

  register(def: MigrationDefinition): void {
    if (def.toStoreFormatVersion !== def.fromStoreFormatVersion + 1) {
      throw invalidInput("a migration step must advance exactly one version");
    }
    if (this.byFrom.has(def.fromStoreFormatVersion)) {
      throw invalidInput(`duplicate migration step from version ${def.fromStoreFormatVersion}`);
    }
    this.byFrom.set(def.fromStoreFormatVersion, def);
  }

  get(fromVersion: number): MigrationDefinition | undefined {
    return this.byFrom.get(fromVersion);
  }
}

/** An ordered plan to migrate from a source version to the current version. */
export interface MigrationPlan {
  readonly fromStoreFormatVersion: number;
  readonly toStoreFormatVersion: number;
  readonly steps: readonly MigrationDefinition[];
}

/** The outcome of running a migration plan. */
export interface MigrationResult {
  readonly fromStoreFormatVersion: number;
  readonly toStoreFormatVersion: number;
  readonly stepsApplied: number;
}

/**
 * Build an ordered migration plan from a source version up to the current store
 * format version. Throws a controlled migration-required error when a step is
 * missing (no path to the current version exists).
 */
export function planMigration(
  registry: MigrationRegistry,
  fromVersion: number,
  toVersion: number = CURRENT_STORE_FORMAT_VERSION,
): MigrationPlan {
  if (fromVersion >= toVersion) {
    throw invalidInput("migration source version must be below the target version");
  }
  const steps: MigrationDefinition[] = [];
  let current = fromVersion;
  while (current < toVersion) {
    const step = registry.get(current);
    if (step === undefined) {
      throw migrationRequired(
        `no migration step is registered from store format version ${current}`,
        "this store format cannot be migrated without a registered step",
      );
    }
    steps.push(step);
    current = step.toStoreFormatVersion;
  }
  return { fromStoreFormatVersion: fromVersion, toStoreFormatVersion: toVersion, steps };
}

// --- Production migration: store format 1 -> 2 (Phase 4.1) -----------------
//
// A v1 manifest kept only a lexically sorted `snapshotIds` inventory and a
// `latestSnapshotId` pointer; the exact commit order of older captures was not
// preserved. This migration reconstructs the best DETERMINISTIC chronology a v1
// store can yield:
//
//   1. read each Snapshot payload's own `capturedAt` (validated below);
//   2. remove `latestSnapshotId` from the sortable historical pool;
//   3. sort the remaining snapshots by capturedAt ascending, then id ascending;
//   4. append `latestSnapshotId` last (its known commit-recency is the only
//      authoritative ordering fact v1 retained);
//   5. assign contiguous sequence values 1..N;
//   6. mark the chronology origin `recoveredV1`.
//
// Immutable Snapshot/Evidence payloads are preserved verbatim — no record is
// rewritten merely to change chronology. The transform is pure and performs no
// I/O; the store handles the lock, backup, atomic commit, and verification.
//
// LIMITATION (documented, not hidden): when v1 capturedAt values were equal or
// non-monotonic, the exact relative order of older captures cannot be recovered.
// The result is deterministic and pins the known latest capture correctly; every
// capture committed AFTER the migration is exact.

/** Read a snapshot payload's own snapshotId (opaque payloads are objects). */
function payloadSnapshotId(payload: JsonObject): string | undefined {
  const id = (payload as { snapshotId?: unknown }).snapshotId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** Read a snapshot payload's own capturedAt. */
function payloadCapturedAt(payload: JsonObject): string | undefined {
  const at = (payload as { capturedAt?: unknown }).capturedAt;
  return typeof at === "string" && at.length > 0 ? at : undefined;
}

/**
 * The production `1 -> 2` migration. Adds an authoritative `snapshotHistory`
 * and `snapshotChronologyOrigin = recoveredV1` to a v1 manifest, deriving the
 * order deterministically from the persisted snapshot capture times with the
 * known latest capture pinned last.
 */
export const migration1to2: MigrationDefinition = {
  fromStoreFormatVersion: 1,
  toStoreFormatVersion: 2,
  migrate: (source) => {
    const manifest = source.manifest;
    const inventory = Array.isArray(manifest["snapshotIds"])
      ? (manifest["snapshotIds"] as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const latest =
      typeof manifest["latestSnapshotId"] === "string"
        ? (manifest["latestSnapshotId"] as string)
        : null;

    // Index each snapshot payload's capturedAt by its own id.
    const capturedAtById = new Map<string, string>();
    for (const payload of source.snapshots) {
      const id = payloadSnapshotId(payload);
      const at = id !== undefined ? payloadCapturedAt(payload) : undefined;
      if (id === undefined || at === undefined) {
        throw corruption(
          "a v1 snapshot payload is missing a valid id/capturedAt for chronology recovery",
          "the store may be corrupt",
        );
      }
      capturedAtById.set(id, at);
    }
    for (const id of inventory) {
      if (!capturedAtById.has(id)) {
        throw corruption(
          "a v1 inventory id has no readable snapshot payload for chronology recovery",
          "the store may be corrupt",
        );
      }
    }

    // The sortable historical pool excludes the pinned latest.
    const historical = inventory.filter((id) => id !== latest);
    historical.sort((a, b) => {
      const ca = capturedAtById.get(a)!;
      const cb = capturedAtById.get(b)!;
      if (ca < cb) return -1;
      if (ca > cb) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const ordered = latest !== null ? [...historical, latest] : historical;

    const snapshotHistory: SnapshotHistoryEntry[] = ordered.map((id, index) => ({
      snapshotId: id,
      capturedAt: capturedAtById.get(id)!,
      sequence: index + 1,
    }));

    // Inventory stays sorted-unique (path-sorted inventory is unchanged); only
    // the chronology and origin are added. latestSnapshotId is preserved.
    return {
      manifest: {
        ...manifest,
        storeFormatVersion: 2,
        snapshotIds: [...inventory].sort(),
        latestSnapshotId: latest,
        snapshotHistory: snapshotHistory as unknown as JsonObject[],
        snapshotChronologyOrigin: "recoveredV1",
      },
      snapshots: source.snapshots,
      evidence: source.evidence,
    };
  },
};

/**
 * The default production migration registry: exactly the registered `1 -> 2`
 * chronology-recovery migration. This is the registry wired into the Node
 * adapter so a real v1 store on disk can be migrated once, explicitly, to v2.
 */
export function defaultMigrationRegistry(): MigrationRegistry {
  return new MigrationRegistry([migration1to2]);
}
