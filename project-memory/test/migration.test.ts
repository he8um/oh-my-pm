import { describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { deriveProjectKey, deriveRecordKey } from "../src/integrity.js";
import { buildEnvelope, buildManifest, serializeEnvelope, serializeManifest } from "../src/manifest.js";
import { migration1to2, MigrationRegistry, planMigration } from "../src/migrations.js";
import type { MigrationDefinition } from "../src/migrations.js";
import {
  BACKUPS_DIRNAME,
  EVIDENCE_DIRNAME,
  manifestPathFor,
  projectDirFor,
  recordPathFor,
  resolveStoreLayout,
  SNAPSHOTS_DIRNAME,
} from "../src/path-safety.js";
import { DependencyInjectedStore } from "../src/store.js";
import { DATA_ROOT } from "./fixtures.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const layout = resolveStoreLayout(DATA_ROOT);
const PID = "proj-1";

/**
 * Plant a synthetic FORMAT 0 store on disk: a valid-integrity manifest that
 * declares storeFormatVersion 0, plus one snapshot and one evidence record whose
 * envelopes ALSO declare format 0 (so buildEnvelope integrity matches). Format 0
 * is a test-only, never-released format used solely to prove the mechanism.
 */
function plantFormat0Store(fs: MemoryFileSystem): void {
  const projectKey = deriveProjectKey(PID);
  // The snapshot payload carries its own capturedAt so the chained 0 -> 1 -> 2
  // migration can recover a v2 chronology from the persisted record.
  const snapshotPayload = {
    snapshotId: "snap-1",
    projectId: PID,
    schemaVersion: 1,
    capturedAt: "2025-01-01T00:00:00.000Z",
    legacy: true,
  };
  const evidencePayload = { evidenceId: "ev-1", projectId: PID, schemaVersion: 1, legacy: true };

  const snapEnv = buildEnvelope("snapshot", PID, "snap-1", snapshotPayload);
  const evEnv = buildEnvelope("evidence", PID, "ev-1", evidencePayload);
  fs.poke(
    recordPathFor(layout, projectKey, SNAPSHOTS_DIRNAME, deriveRecordKey("snapshot", "snap-1")),
    serializeEnvelope(snapEnv),
  );
  fs.poke(
    recordPathFor(layout, projectKey, EVIDENCE_DIRNAME, deriveRecordKey("evidence", "ev-1")),
    serializeEnvelope(evEnv),
  );

  const manifest = buildManifest({
    storeFormatVersion: 0,
    projectBrainSchemaVersion: 1,
    projectId: PID,
    projectKey,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    latestSnapshotId: "snap-1",
    snapshotIds: ["snap-1"],
    evidenceIds: ["ev-1"],
    migrationHistory: [],
  });
  fs.poke(manifestPathFor(layout, projectKey), serializeManifest(manifest));
}

/** A synthetic 0 -> 1 migration that only re-stamps the store format version. */
const synthetic0to1: MigrationDefinition = {
  fromStoreFormatVersion: 0,
  toStoreFormatVersion: 1,
  migrate: (source) => ({
    manifest: { ...source.manifest, storeFormatVersion: 1 },
    snapshots: source.snapshots,
    evidence: source.evidence,
  }),
};

/** The registry the mechanism tests use: the synthetic 0 -> 1 step chained with
 *  the real production 1 -> 2 chronology-recovery step, so migrateProject can
 *  advance a planted format-0 store all the way to the current format (2). */
function chainedRegistry(): MigrationRegistry {
  return new MigrationRegistry([synthetic0to1, migration1to2]);
}

describe("migration mechanism", () => {
  it("plans an ordered path and refuses when a step is missing", () => {
    const registry = chainedRegistry();
    const plan = planMigration(registry, 0);
    expect(plan.steps).toHaveLength(2); // 0 -> 1 -> 2
    expect(() => planMigration(new MigrationRegistry(), 0)).toThrow();
  });

  it("migrates a synthetic 0 -> 1 -> 2 store, backs up, and records history", async () => {
    const fs = new MemoryFileSystem();
    plantFormat0Store(fs);
    const store = new DependencyInjectedStore({
      fs,
      dataRoot: DATA_ROOT,
      migrations: chainedRegistry(),
    });

    // A read before migration must refuse an older, un-migrated store.
    await expect(store.readManifest(PID)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.migrationRequired,
    });

    await store.migrateProject(PID, "op-mig", "2026-02-01T00:00:00.000Z");

    // After migration the store reads normally at the current format (2) with a
    // recovered chronology and a single migration-history entry (0 -> 2).
    const manifest = await store.readManifest(PID);
    expect(manifest?.storeFormatVersion).toBe(2);
    expect(manifest?.snapshotChronologyOrigin).toBe("recoveredV1");
    expect(manifest?.snapshotHistory).toEqual([
      { snapshotId: "snap-1", capturedAt: "2025-01-01T00:00:00.000Z", sequence: 1 },
    ]);
    expect(manifest?.migrationHistory).toHaveLength(1);
    expect(manifest?.migrationHistory[0]?.fromStoreFormatVersion).toBe(0);
    expect(manifest?.migrationHistory[0]?.toStoreFormatVersion).toBe(2);

    // A backup was created and is NOT auto-deleted.
    const backupDir = `${projectDirFor(layout, deriveProjectKey(PID))}/${BACKUPS_DIRNAME}/op-mig`;
    expect(await fs.exists(backupDir)).toBe(true);
  });

  it("an injected post-migration failure preserves the original store", async () => {
    const fs = new MemoryFileSystem();
    plantFormat0Store(fs);
    // A broken 0 -> 1 step produces a manifest that fails verification (its
    // snapshot list references a record that will not be found).
    const broken: MigrationDefinition = {
      fromStoreFormatVersion: 0,
      toStoreFormatVersion: 1,
      migrate: (source) => ({
        manifest: {
          ...source.manifest,
          storeFormatVersion: 1,
          snapshotIds: ["snap-1", "ghost"],
          latestSnapshotId: "snap-1",
        },
        snapshots: source.snapshots,
        evidence: source.evidence,
      }),
    };
    const store = new DependencyInjectedStore({
      fs,
      dataRoot: DATA_ROOT,
      migrations: new MigrationRegistry([broken, migration1to2]),
    });
    // The broken 0 -> 1 step feeds an inconsistent chronology into 1 -> 2, which
    // buildManifest rejects before the atomic commit — a controlled corruption.
    await expect(
      store.migrateProject(PID, "op-mig", "2026-02-01T00:00:00.000Z"),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.corruption });
    // The pre-migration backup exists so the original is recoverable.
    const backupDir = `${projectDirFor(layout, deriveProjectKey(PID))}/${BACKUPS_DIRNAME}/op-mig`;
    expect(await fs.exists(`${backupDir}/manifest.json`)).toBe(true);
    // The on-disk manifest is still format 0 (the atomic commit never ran).
    const raw = fs.peek(manifestPathFor(layout, deriveProjectKey(PID))) as string;
    expect(JSON.parse(raw).storeFormatVersion).toBe(0);
  });

  it("never migrates automatically during a read", async () => {
    const fs = new MemoryFileSystem();
    plantFormat0Store(fs);
    const store = new DependencyInjectedStore({
      fs,
      dataRoot: DATA_ROOT,
      migrations: chainedRegistry(),
    });
    await store.readManifest(PID).catch(() => undefined);
    // The on-disk manifest is still format 0 — no read triggered a migration.
    const raw = fs.peek(manifestPathFor(layout, deriveProjectKey(PID))) as string;
    expect(JSON.parse(raw).storeFormatVersion).toBe(0);
  });
});
