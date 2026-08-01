// v0.3 Phase 4.1 — production store-format 1 -> 2 chronology-recovery migration.
//
// A v1 manifest kept only a lexically sorted inventory and a latest pointer; the
// exact commit order of older captures was lost. This suite proves the
// deterministic recovery: older snapshots sort by capturedAt then id, the known
// latest is pinned last, sequences are contiguous, the origin is recoveredV1, a
// backup is retained, the migration is recorded, immutable records are NOT
// rewritten, a pre-commit failure leaves the v1 store readable from backup, and
// migration never runs from a read.

import { describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { deriveProjectKey, deriveRecordKey } from "../src/integrity.js";
import {
  buildEnvelope,
  buildManifest,
  serializeEnvelope,
  serializeManifest,
} from "../src/manifest.js";
import { defaultMigrationRegistry } from "../src/migrations.js";
import {
  BACKUPS_DIRNAME,
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
const projectKey = deriveProjectKey(PID);

/** A v1 snapshot payload with its own capturedAt. */
function v1Snapshot(snapshotId: string, capturedAt: string): Record<string, unknown> {
  return { snapshotId, projectId: PID, schemaVersion: 1, capturedAt };
}

/**
 * Plant a store-format v1 store with four snapshots. The lexically SORTED
 * inventory places the latest in the MIDDLE, and the capturedAt values are set
 * so the recovered order differs from both lexical order and inventory order.
 *
 * ids (lexical):   s-a, s-b, s-c, s-d   (inventory order after sort)
 * latest pointer:  s-b                  (in the middle of the sorted inventory)
 * capturedAt:      s-a=t3, s-c=t1, s-d=t2   (older pool, latest excluded)
 * recovered order: s-c(t1) -> s-d(t2) -> s-a(t3) -> s-b(latest, pinned last)
 */
function plantV1Store(fs: MemoryFileSystem): void {
  const snapshots: Record<string, string> = {
    "s-a": "2026-01-03T00:00:00.000Z",
    "s-b": "2026-01-09T00:00:00.000Z", // latest; capturedAt irrelevant to order
    "s-c": "2026-01-01T00:00:00.000Z",
    "s-d": "2026-01-02T00:00:00.000Z",
  };
  for (const [id, capturedAt] of Object.entries(snapshots)) {
    const env = buildEnvelope("snapshot", PID, id, v1Snapshot(id, capturedAt));
    fs.poke(
      recordPathFor(layout, projectKey, SNAPSHOTS_DIRNAME, deriveRecordKey("snapshot", id)),
      serializeEnvelope(env),
    );
  }
  const manifest = buildManifest({
    storeFormatVersion: 1,
    projectBrainSchemaVersion: 1,
    projectId: PID,
    projectKey,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-09T00:00:00.000Z",
    latestSnapshotId: "s-b",
    snapshotIds: ["s-a", "s-b", "s-c", "s-d"],
    evidenceIds: [],
    migrationHistory: [],
  });
  fs.poke(manifestPathFor(layout, projectKey), serializeManifest(manifest));
}

function store(fs: MemoryFileSystem): DependencyInjectedStore {
  return new DependencyInjectedStore({
    fs,
    dataRoot: DATA_ROOT,
    migrations: defaultMigrationRegistry(),
  });
}

describe("store 1 -> 2 chronology recovery migration", () => {
  it("recovers a deterministic chronology with the latest pinned last", async () => {
    const fs = new MemoryFileSystem();
    plantV1Store(fs);
    const s = store(fs);

    // A read before migration refuses the un-migrated v1 store.
    await expect(s.readManifest(PID)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.migrationRequired,
    });

    await s.migrateProject(PID, "op-mig", "2026-02-01T00:00:00.000Z");

    const manifest = await s.readManifest(PID);
    expect(manifest!.storeFormatVersion).toBe(2);
    expect(manifest!.snapshotChronologyOrigin).toBe("recoveredV1");
    // Older snapshots sort by capturedAt then id; the known latest is pinned last.
    expect(manifest!.snapshotHistory!.map((e) => e.snapshotId)).toEqual([
      "s-c",
      "s-d",
      "s-a",
      "s-b",
    ]);
    expect(manifest!.snapshotHistory!.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(manifest!.latestSnapshotId).toBe("s-b");
    // The inventory stays lexically sorted (inventory, not chronology).
    expect([...manifest!.snapshotIds]).toEqual(["s-a", "s-b", "s-c", "s-d"]);

    // listSnapshots surfaces the recovered capture order oldest-first.
    const summaries = await s.listSnapshots(PID);
    expect(summaries.map((e) => e.snapshotId)).toEqual(["s-c", "s-d", "s-a", "s-b"]);
    expect(summaries[3]?.isLatest).toBe(true);
  });

  it("uses capturedAt-then-id as the deterministic tie-break", async () => {
    const fs = new MemoryFileSystem();
    // Two older snapshots share a capturedAt; id ascending breaks the tie.
    for (const [id, capturedAt] of [
      ["s-y", "2026-01-01T00:00:00.000Z"],
      ["s-x", "2026-01-01T00:00:00.000Z"],
      ["s-z", "2026-01-05T00:00:00.000Z"], // latest
    ] as const) {
      const env = buildEnvelope("snapshot", PID, id, v1Snapshot(id, capturedAt));
      fs.poke(
        recordPathFor(layout, projectKey, SNAPSHOTS_DIRNAME, deriveRecordKey("snapshot", id)),
        serializeEnvelope(env),
      );
    }
    fs.poke(
      manifestPathFor(layout, projectKey),
      serializeManifest(
        buildManifest({
          storeFormatVersion: 1,
          projectBrainSchemaVersion: 1,
          projectId: PID,
          projectKey,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-05T00:00:00.000Z",
          latestSnapshotId: "s-z",
          snapshotIds: ["s-x", "s-y", "s-z"],
          evidenceIds: [],
          migrationHistory: [],
        }),
      ),
    );
    const s = store(fs);
    await s.migrateProject(PID, "op-mig", "2026-02-01T00:00:00.000Z");
    const manifest = await s.readManifest(PID);
    // Equal capturedAt → id ascending: s-x before s-y; latest s-z pinned last.
    expect(manifest!.snapshotHistory!.map((e) => e.snapshotId)).toEqual(["s-x", "s-y", "s-z"]);
  });

  it("retains a backup, records the migration, and does not rewrite records", async () => {
    const fs = new MemoryFileSystem();
    plantV1Store(fs);
    // Capture each immutable snapshot record's bytes before migrating.
    const before = new Map<string, string>();
    for (const id of ["s-a", "s-b", "s-c", "s-d"]) {
      const path = recordPathFor(
        layout,
        projectKey,
        SNAPSHOTS_DIRNAME,
        deriveRecordKey("snapshot", id),
      );
      before.set(path, fs.peek(path) as string);
    }
    const s = store(fs);
    await s.migrateProject(PID, "op-mig", "2026-02-01T00:00:00.000Z");

    // The backup exists and is not auto-deleted.
    const backupDir = `${projectDirFor(layout, projectKey)}/${BACKUPS_DIRNAME}/op-mig`;
    expect(await fs.exists(`${backupDir}/manifest.json`)).toBe(true);

    // The migration is recorded.
    const manifest = await s.readManifest(PID);
    expect(manifest!.migrationHistory).toHaveLength(1);
    expect(manifest!.migrationHistory[0]?.fromStoreFormatVersion).toBe(1);
    expect(manifest!.migrationHistory[0]?.toStoreFormatVersion).toBe(2);

    // Immutable snapshot records are byte-identical (never rewritten).
    for (const [path, bytes] of before) {
      expect(fs.peek(path)).toBe(bytes);
    }

    // Post-migration verification succeeds.
    const verification = await s.verify(PID);
    expect(verification.ok).toBe(true);
  });

  it("leaves the v1 store readable from backup when recovery fails before commit", async () => {
    const fs = new MemoryFileSystem();
    // Plant a v1 store whose inventory references a snapshot with no readable
    // payload, so chronology recovery throws BEFORE the atomic manifest commit.
    const env = buildEnvelope("snapshot", PID, "s-a", v1Snapshot("s-a", "2026-01-01T00:00:00.000Z"));
    fs.poke(
      recordPathFor(layout, projectKey, SNAPSHOTS_DIRNAME, deriveRecordKey("snapshot", "s-a")),
      serializeEnvelope(env),
    );
    const originalManifest = serializeManifest(
      buildManifest({
        storeFormatVersion: 1,
        projectBrainSchemaVersion: 1,
        projectId: PID,
        projectKey,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        latestSnapshotId: "s-a",
        snapshotIds: ["ghost", "s-a"], // ghost has no readable payload
        evidenceIds: [],
        migrationHistory: [],
      }),
    );
    fs.poke(manifestPathFor(layout, projectKey), originalManifest);

    const s = store(fs);
    await expect(
      s.migrateProject(PID, "op-mig", "2026-02-01T00:00:00.000Z"),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.corruption });

    // The on-disk manifest is still the original v1 manifest (commit never ran).
    expect(fs.peek(manifestPathFor(layout, projectKey))).toBe(originalManifest);
    // The backup of the original v1 manifest is retained.
    const backupDir = `${projectDirFor(layout, projectKey)}/${BACKUPS_DIRNAME}/op-mig`;
    expect(await fs.exists(`${backupDir}/manifest.json`)).toBe(true);
  });

  it("never migrates automatically during a read", async () => {
    const fs = new MemoryFileSystem();
    plantV1Store(fs);
    const s = store(fs);
    await s.readManifest(PID).catch(() => undefined);
    await s.inspect(PID).catch(() => undefined);
    await s.verify(PID).catch(() => undefined);
    await s.listSnapshots(PID).catch(() => undefined);
    // The on-disk manifest is still format 1 — no read triggered a migration.
    const raw = JSON.parse(fs.peek(manifestPathFor(layout, projectKey)) as string);
    expect(raw.storeFormatVersion).toBe(1);
    expect(raw.snapshotHistory).toBeUndefined();
  });

  it("migrates then captures exactly once (v1 store gains a v2 capture)", async () => {
    const fs = new MemoryFileSystem();
    plantV1Store(fs);
    const s = store(fs);
    await s.migrateProject(PID, "op-mig", "2026-02-01T00:00:00.000Z");
    // A new v2 capture appends an exact entry at the next contiguous sequence.
    await s.commitSnapshotBundle({
      projectId: PID,
      projectRootBoundary: "/work/my-project",
      operationId: "op-new",
      occurredAt: "2026-03-01T00:00:00.000Z",
      snapshot: {
        snapshotId: "s-new",
        projectId: PID,
        schemaVersion: 1,
        capturedAt: "2026-03-01T00:00:00.000Z",
        sourceBoundaries: [],
        evidenceRefs: [],
        fingerprint: "sha256:" + "e".repeat(64),
      } as never,
      evidence: [],
    });
    const manifest = await s.readManifest(PID);
    // Origin stays recoveredV1 across later exact captures; new entry is #5.
    expect(manifest!.snapshotChronologyOrigin).toBe("recoveredV1");
    expect(manifest!.snapshotHistory!.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(manifest!.snapshotHistory![4]).toEqual({
      snapshotId: "s-new",
      capturedAt: "2026-03-01T00:00:00.000Z",
      sequence: 5,
    });
    expect(manifest!.latestSnapshotId).toBe("s-new");
  });
});
