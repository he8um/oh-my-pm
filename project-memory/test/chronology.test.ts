// v0.3 Phase 4.1 — store-format v2 snapshot capture chronology.
//
// Proves the native (v2) chronology invariants directly against the store: the
// authoritative order is capture order (sequence), NOT the lexical id order and
// NOT a fresh clock read; idempotent re-captures never grow or reorder history;
// and every chronology-corruption shape surfaces as a controlled error.

import { describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { computeIntegrity, deriveProjectKey, DOMAIN_MANIFEST_INTEGRITY } from "../src/integrity.js";
import { buildManifest, serializeManifest } from "../src/manifest.js";
import { manifestPathFor, resolveStoreLayout } from "../src/path-safety.js";
import { DependencyInjectedStore } from "../src/store.js";
import type { ProjectStoreManifest, SnapshotHistoryEntry } from "../src/types.js";
import { DATA_ROOT, makeSnapshot, PROJECT_ROOT } from "./fixtures.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const layout = resolveStoreLayout(DATA_ROOT);
const PID = "proj-1";

/** Commit one snapshot with the given id and capture time. */
async function commit(
  store: DependencyInjectedStore,
  snapshotId: string,
  capturedAt: string,
): Promise<void> {
  await store.commitSnapshotBundle({
    projectId: PID,
    projectRootBoundary: PROJECT_ROOT,
    operationId: `op-${snapshotId}`,
    occurredAt: capturedAt,
    // The snapshot payload carries its own capturedAt; the store never invents one.
    snapshot: makeSnapshot(PID, snapshotId, [], { capturedAt }),
    evidence: [],
  });
}

describe("native v2 chronology", () => {
  // Capture order A -> B -> C with ids whose lexical order (C < A < B) differs
  // from capture order, so any lexical leak would be caught immediately.
  const A = "snap-cccc"; // captured first
  const B = "snap-dddd"; // captured second
  const C = "snap-aaaa"; // captured third (lexically first)

  async function seedAbc(): Promise<{ store: DependencyInjectedStore; fs: MemoryFileSystem }> {
    const fs = new MemoryFileSystem();
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await commit(store, A, "2026-01-01T00:00:00.000Z");
    await commit(store, B, "2026-01-02T00:00:00.000Z");
    await commit(store, C, "2026-01-03T00:00:00.000Z");
    return { store, fs };
  }

  it("listSnapshots returns capture order A -> B -> C despite lexical id order", async () => {
    const { store } = await seedAbc();
    const summaries = await store.listSnapshots(PID);
    expect(summaries.map((s) => s.snapshotId)).toEqual([A, B, C]);
    expect(summaries.map((s) => s.sequence)).toEqual([1, 2, 3]);
    expect(summaries.map((s) => s.isLatest)).toEqual([false, false, true]);
    // The inventory (snapshotIds) stays lexically sorted; it is not the order.
    const manifest = await store.readManifest(PID);
    expect([...manifest!.snapshotIds]).toEqual([C, A, B].sort());
  });

  it("pins the latest to the final capture and marks the origin native", async () => {
    const { store } = await seedAbc();
    const manifest = await store.readManifest(PID);
    expect(manifest!.latestSnapshotId).toBe(C);
    expect(manifest!.snapshotChronologyOrigin).toBe("native");
    expect(manifest!.snapshotHistory).toEqual([
      { snapshotId: A, capturedAt: "2026-01-01T00:00:00.000Z", sequence: 1 },
      { snapshotId: B, capturedAt: "2026-01-02T00:00:00.000Z", sequence: 2 },
      { snapshotId: C, capturedAt: "2026-01-03T00:00:00.000Z", sequence: 3 },
    ]);
  });

  it("is idempotent for a repeated latest capture: no append, no reorder", async () => {
    const { store } = await seedAbc();
    const again = await commitResult(store, C, "2026-01-03T00:00:00.000Z");
    expect(again.idempotent).toBe(true);
    expect(again.snapshotCount).toBe(3);
    const manifest = await store.readManifest(PID);
    expect(manifest!.snapshotHistory).toHaveLength(3);
    expect(manifest!.snapshotHistory![2]?.sequence).toBe(3);
    expect(manifest!.latestSnapshotId).toBe(C);
  });
});

async function commitResult(
  store: DependencyInjectedStore,
  snapshotId: string,
  capturedAt: string,
) {
  return store.commitSnapshotBundle({
    projectId: PID,
    projectRootBoundary: PROJECT_ROOT,
    operationId: `op-${snapshotId}-again`,
    occurredAt: capturedAt,
    snapshot: makeSnapshot(PID, snapshotId, [], { capturedAt }),
    evidence: [],
  });
}

// --- Corruption: every chronology-invariant violation is a controlled error --

describe("v2 chronology corruption", () => {
  const projectKey = deriveProjectKey(PID);
  const manifestPath = manifestPathFor(layout, projectKey);

  /** Seed a valid two-capture v2 store and return its parsed manifest. */
  async function seed(fs: MemoryFileSystem): Promise<ProjectStoreManifest> {
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await commit(store, "snap-1", "2026-01-01T00:00:00.000Z");
    await commit(store, "snap-2", "2026-01-02T00:00:00.000Z");
    return (await store.readManifest(PID))!;
  }

  /** Re-sign a manifest body so integrity is valid but chronology is corrupt. */
  function resignWith(
    base: ProjectStoreManifest,
    history: readonly SnapshotHistoryEntry[],
    overrides: Partial<ProjectStoreManifest> = {},
  ): string {
    const { integrity, ...body } = { ...base, snapshotHistory: history, ...overrides };
    void integrity;
    // buildManifest computes a fresh, valid integrity over the (corrupt) body so
    // the failure is proven to come from the chronology guard, not integrity.
    return serializeManifest(unsafeBuild(body));
  }

  it("rejects a duplicate history id", async () => {
    const fs = new MemoryFileSystem();
    const m = await seed(fs);
    fs.poke(
      manifestPath,
      resignWith(m, [
        { snapshotId: "snap-1", capturedAt: "2026-01-01T00:00:00.000Z", sequence: 1 },
        { snapshotId: "snap-1", capturedAt: "2026-01-02T00:00:00.000Z", sequence: 2 },
      ]),
    );
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
  });

  it("rejects a duplicate sequence", async () => {
    const fs = new MemoryFileSystem();
    const m = await seed(fs);
    fs.poke(
      manifestPath,
      resignWith(m, [
        { snapshotId: "snap-1", capturedAt: "2026-01-01T00:00:00.000Z", sequence: 1 },
        { snapshotId: "snap-2", capturedAt: "2026-01-02T00:00:00.000Z", sequence: 1 },
      ]),
    );
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
  });

  it("rejects a gap in the sequence", async () => {
    const fs = new MemoryFileSystem();
    const m = await seed(fs);
    fs.poke(
      manifestPath,
      resignWith(m, [
        { snapshotId: "snap-1", capturedAt: "2026-01-01T00:00:00.000Z", sequence: 1 },
        { snapshotId: "snap-2", capturedAt: "2026-01-02T00:00:00.000Z", sequence: 3 },
      ]),
    );
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
  });

  it("rejects an inventory id missing from the chronology", async () => {
    const fs = new MemoryFileSystem();
    const m = await seed(fs);
    fs.poke(
      manifestPath,
      resignWith(m, [
        { snapshotId: "snap-1", capturedAt: "2026-01-01T00:00:00.000Z", sequence: 1 },
      ]), // snap-2 still in inventory but absent from history
    );
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
  });

  it("rejects an unknown history id (not in the inventory)", async () => {
    const fs = new MemoryFileSystem();
    const m = await seed(fs);
    fs.poke(
      manifestPath,
      resignWith(m, [
        { snapshotId: "snap-1", capturedAt: "2026-01-01T00:00:00.000Z", sequence: 1 },
        { snapshotId: "ghost", capturedAt: "2026-01-02T00:00:00.000Z", sequence: 2 },
      ]),
    );
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
  });

  it("rejects a latest pointer that is not the final chronology entry", async () => {
    const fs = new MemoryFileSystem();
    const m = await seed(fs);
    fs.poke(
      manifestPath,
      resignWith(
        m,
        [
          { snapshotId: "snap-1", capturedAt: "2026-01-01T00:00:00.000Z", sequence: 1 },
          { snapshotId: "snap-2", capturedAt: "2026-01-02T00:00:00.000Z", sequence: 2 },
        ],
        { latestSnapshotId: "snap-1" },
      ),
    );
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
  });

  it("rejects an invalid chronology origin", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    // Hand-build a body with an invalid origin and a fresh integrity digest.
    const raw = JSON.parse(fs.peek(manifestPath) as string);
    raw.snapshotChronologyOrigin = "bogus";
    // Re-sign so integrity is valid but the origin is invalid.
    const { integrity, ...body } = raw;
    void integrity;
    fs.poke(manifestPath, serializeManifest(unsafeBuild(body)));
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
  });

  it("rejects a capturedAt that disagrees with the snapshot record (via verify)", async () => {
    const fs = new MemoryFileSystem();
    const m = await seed(fs);
    // The history says snap-1 was captured at a different time than its record.
    fs.poke(
      manifestPath,
      resignWith(m, [
        { snapshotId: "snap-1", capturedAt: "2099-01-01T00:00:00.000Z", sequence: 1 },
        { snapshotId: "snap-2", capturedAt: "2026-01-02T00:00:00.000Z", sequence: 2 },
      ]),
    );
    const verification = await new DependencyInjectedStore({
      fs,
      dataRoot: DATA_ROOT,
    }).verify(PID);
    expect(verification.ok).toBe(false);
    expect(verification.issues.some((i) => i.detail.includes("capturedAt"))).toBe(true);
  });

  it("rejects a tampered chronology when integrity is left stale", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    // Change the history WITHOUT re-signing → integrity mismatch.
    const raw = JSON.parse(fs.peek(manifestPath) as string);
    raw.snapshotHistory[0].sequence = 5;
    fs.poke(manifestPath, JSON.stringify(raw));
    await expect(read(fs)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.integrityMismatch,
    });
  });

  function read(fs: MemoryFileSystem): Promise<unknown> {
    return new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT }).readManifest(PID);
  }
});

/**
 * Build a manifest with a valid integrity digest over a possibly-invalid body,
 * bypassing buildManifest's own chronology validation. This lets the corruption
 * tests prove that parse-time chronology verification (not integrity) rejects a
 * self-consistent but invalid chronology. Test-only.
 */
function unsafeBuild(body: Record<string, unknown>): ProjectStoreManifest {
  // Reuse buildManifest when the body is valid; when it is deliberately corrupt,
  // buildManifest would throw, so we compute the digest directly instead.
  try {
    return buildManifest(body as never);
  } catch {
    // Compute a valid integrity over the corrupt body via a re-parse round trip:
    // serialize with a placeholder, then hash through the public parse helper is
    // not possible, so we hand-compute using the same scheme the manifest uses.
    return signCorruptBody(body);
  }
}

// The corrupt-body signer mirrors manifest.ts's integrity scheme so a corrupt
// body still carries a VALID digest — proving the chronology guard is what
// rejects it. Kept local to the test to avoid widening the package surface.
function signCorruptBody(body: Record<string, unknown>): ProjectStoreManifest {
  const canonicalBody: Record<string, unknown> = {
    storeFormatVersion: body["storeFormatVersion"],
    projectBrainSchemaVersion: body["projectBrainSchemaVersion"],
    projectId: body["projectId"],
    projectKey: body["projectKey"],
    createdAt: body["createdAt"],
    updatedAt: body["updatedAt"],
    latestSnapshotId: body["latestSnapshotId"],
    snapshotIds: body["snapshotIds"],
    evidenceIds: body["evidenceIds"],
    migrationHistory: (body["migrationHistory"] as unknown[]).map((e) => {
      const entry = e as Record<string, unknown>;
      return {
        fromStoreFormatVersion: entry["fromStoreFormatVersion"],
        toStoreFormatVersion: entry["toStoreFormatVersion"],
        migratedAt: entry["migratedAt"],
        operationId: entry["operationId"],
        backupKey: entry["backupKey"],
      };
    }),
  };
  if (body["snapshotHistory"] !== undefined) {
    canonicalBody["snapshotHistory"] = (body["snapshotHistory"] as unknown[]).map((e) => {
      const entry = e as Record<string, unknown>;
      return {
        snapshotId: entry["snapshotId"],
        capturedAt: entry["capturedAt"],
        sequence: entry["sequence"],
      };
    });
  }
  if (body["snapshotChronologyOrigin"] !== undefined) {
    canonicalBody["snapshotChronologyOrigin"] = body["snapshotChronologyOrigin"];
  }
  const integrity = computeIntegrity(DOMAIN_MANIFEST_INTEGRITY, canonicalBody as never);
  return { ...(body as unknown as ProjectStoreManifest), integrity };
}
