// Store-format migration mechanism (scaffold). Migrations are ordered
// one-version steps under a project lock: the source is verified, a backup is
// taken, the target is committed atomically, the target is verified, and the
// completed steps are recorded in the manifest history. No PRODUCTION migration
// is required for the first format; the mechanism is proven by a synthetic,
// test-only `0 -> 1` migration. Migration NEVER runs automatically during a read.

import { invalidInput, migrationRequired } from "./errors.js";
import { CURRENT_STORE_FORMAT_VERSION } from "./types.js";
import type { JsonObject } from "./types.js";

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
