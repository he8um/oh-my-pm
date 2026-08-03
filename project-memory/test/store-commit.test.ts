import { describe, expect, it } from "vitest";

import { ProjectMemoryError, PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import type { CommitFailurePoint } from "../src/filesystem.js";
import { DependencyInjectedStore } from "../src/store.js";
import { DATA_ROOT, makeEvidence, makeSnapshot, makeStore, PROJECT_ROOT } from "./fixtures.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const PID = "proj-1";

function commitInput(occurredAt = "2026-01-01T00:00:00.000Z") {
  return {
    projectId: PID,
    projectRootBoundary: PROJECT_ROOT,
    operationId: "op-1",
    occurredAt,
    snapshot: makeSnapshot(PID, "snap-1", ["ev-1"]),
    evidence: [makeEvidence(PID, "ev-1")],
  };
}

describe("first commit", () => {
  it("commits a snapshot bundle and makes it readable", async () => {
    const { store } = makeStore();
    const result = await store.commitSnapshotBundle(commitInput());
    expect(result.snapshotId).toBe("snap-1");
    expect(result.latestSnapshotId).toBe("snap-1");
    expect(result.snapshotCount).toBe(1);
    expect(result.evidenceCount).toBe(1);

    const snapshot = await store.readSnapshot(PID, "snap-1");
    expect(snapshot.snapshotId).toBe("snap-1");
    const evidence = await store.readEvidence(PID, "ev-1");
    expect(evidence.evidenceId).toBe("ev-1");

    const summaries = await store.listSnapshots(PID);
    // v2 chronology: oldest-first summaries carry the capture time and a
    // contiguous 1-based sequence.
    expect(summaries).toEqual([
      {
        snapshotId: "snap-1",
        capturedAt: "2026-01-01T00:00:00.000Z",
        sequence: 1,
        isLatest: true,
      },
    ]);
  });

  it("removes staging after a successful commit", async () => {
    const { store, fs } = makeStore();
    await store.commitSnapshotBundle(commitInput());
    const stagingPaths = [...fs.nodes.keys()].filter((p) => p.includes("/staging"));
    expect(stagingPaths).toEqual([]);
  });
});

describe("idempotency and conflict", () => {
  it("is idempotent for an identical repeated commit", async () => {
    const { store } = makeStore();
    await store.commitSnapshotBundle(commitInput());
    const again = await store.commitSnapshotBundle(commitInput());
    expect(again.idempotent).toBe(true);
    expect(again.snapshotCount).toBe(1);
    expect(again.evidenceCount).toBe(1);
  });

  it("rejects the same snapshot id with a different payload", async () => {
    const { store } = makeStore();
    await store.commitSnapshotBundle(commitInput());
    const conflicting = {
      ...commitInput(),
      snapshot: makeSnapshot(PID, "snap-1", ["ev-1"], { fingerprint: "sha256:" + "d".repeat(64) }),
    };
    await expect(store.commitSnapshotBundle(conflicting)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.recordConflict,
    });
  });

  it("rejects a snapshot referencing unknown evidence", async () => {
    const { store } = makeStore();
    const bad = {
      ...commitInput(),
      snapshot: makeSnapshot(PID, "snap-1", ["ev-missing"]),
      evidence: [makeEvidence(PID, "ev-1")],
    };
    await expect(store.commitSnapshotBundle(bad)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.missingReferencedRecord,
    });
  });
});

describe("commit-point failure injection", () => {
  const points: CommitFailurePoint[] = [
    "afterLock",
    "afterStagingCreated",
    "afterFirstRecordWritten",
    "afterRecordsMoved",
    "beforeManifestRename",
    "afterManifestRename",
    "beforeCleanup",
  ];

  for (const point of points) {
    it(`fails at ${point} with old-store/new-store semantics preserved`, async () => {
      const fs = new MemoryFileSystem({ failAt: point });
      const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
      await expect(store.commitSnapshotBundle(commitInput())).rejects.toBeInstanceOf(
        ProjectMemoryError,
      );

      // Before the manifest rename: no manifest exists → old store authoritative.
      // After the manifest rename: the manifest exists → new store authoritative.
      const reader = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
      const manifest = await reader.readManifest(PID);
      const committed = point === "afterManifestRename" || point === "beforeCleanup";
      if (committed) {
        expect(manifest).not.toBeNull();
        expect(manifest?.latestSnapshotId).toBe("snap-1");
      } else {
        expect(manifest).toBeNull();
      }

      // No MIXED state: a manifest that exists must verify, and its referenced
      // records must all be present. A half-committed store would fail here
      // rather than merely looking plausible.
      if (committed) {
        const verification = await reader.verify(PID);
        expect(verification.manifestVerified).toBe(true);
        expect(verification.ok).toBe(true);
        expect(verification.verifiedSnapshotIds).toEqual(["snap-1"]);
        expect(verification.verifiedEvidenceIds).toEqual(["ev-1"]);
      }

      // The lock must have been released in `finally`, and any staging residue
      // must still be on disk for inspection rather than silently adopted.
      expect(fs.pathsMatching("/locks/")).toEqual([]);
      const residue = fs.pathsMatching("/staging");
      if (point !== "afterLock" && point !== "beforeCleanup") {
        expect(residue.length).toBeGreaterThan(0);
      }

      // Recovery runs against THIS store -- the one that just crashed, with
      // whatever residue the failed commit left behind. A fresh
      // MemoryFileSystem here would have no lock file, no staging, and no
      // partial records, and would therefore prove nothing about recovery.
      fs.simulateRestart();
      const recovered = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
      const result = await recovered.commitSnapshotBundle(commitInput());

      // The recovered store is fully coherent: one snapshot, one evidence
      // record, a verifying manifest, and a contiguous chronology.
      expect(result.latestSnapshotId).toBe("snap-1");
      expect(result.snapshotCount).toBe(1);
      expect(result.evidenceCount).toBe(1);

      const afterVerify = await recovered.verify(PID);
      expect(afterVerify.manifestVerified).toBe(true);
      expect(afterVerify.verifiedSnapshotIds).toEqual(["snap-1"]);
      expect(afterVerify.verifiedEvidenceIds).toEqual(["ev-1"]);

      expect(await recovered.listSnapshots(PID)).toEqual([
        {
          snapshotId: "snap-1",
          capturedAt: "2026-01-01T00:00:00.000Z",
          sequence: 1,
          isLatest: true,
        },
      ]);

      // The records are readable and carry the committed payload, so recovery
      // restored data rather than just a manifest that parses.
      expect((await recovered.readSnapshot(PID, "snap-1")).snapshotId).toBe("snap-1");
      expect((await recovered.readEvidence(PID, "ev-1")).evidenceId).toBe("ev-1");

      // Staging is cleaned by the successful commit: residue is transient, not
      // permanent.
      expect(fs.pathsMatching("/staging")).toEqual([]);
      expect(fs.pathsMatching("/locks/")).toEqual([]);
    });
  }

  it("a second crash on an already-committed store still recovers", async () => {
    // Two crashes in a row, both against persisted state: the first leaves a
    // committed store, the second fails on top of it. The store must never
    // regress to the pre-first-commit state.
    const fs = new MemoryFileSystem();
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await store.commitSnapshotBundle(commitInput());

    fs.failAt = "afterFirstRecordWritten";
    const crashing = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await expect(
      crashing.commitSnapshotBundle({
        ...commitInput("2026-01-02T00:00:00.000Z"),
        operationId: "op-2",
        snapshot: makeSnapshot(PID, "snap-2", ["ev-2"]),
        evidence: [makeEvidence(PID, "ev-2")],
      }),
    ).rejects.toBeInstanceOf(ProjectMemoryError);

    // The first snapshot is still authoritative and still verifies.
    fs.simulateRestart();
    const reader = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    const manifest = await reader.readManifest(PID);
    expect(manifest?.latestSnapshotId).toBe("snap-1");
    const verification = await reader.verify(PID);
    expect(verification.manifestVerified).toBe(true);
    expect(verification.verifiedSnapshotIds).toEqual(["snap-1"]);

    // And the interrupted second capture can be completed afterwards.
    const completed = await reader.commitSnapshotBundle({
      ...commitInput("2026-01-02T00:00:00.000Z"),
      operationId: "op-2",
      snapshot: makeSnapshot(PID, "snap-2", ["ev-2"]),
      evidence: [makeEvidence(PID, "ev-2")],
    });
    expect(completed.latestSnapshotId).toBe("snap-2");
    expect(completed.snapshotCount).toBe(2);
    const summaries = await reader.listSnapshots(PID);
    expect(summaries.map((s) => s.sequence)).toEqual([1, 2]);
    expect(summaries.at(-1)?.isLatest).toBe(true);
  });

  it("reports abandoned staging without adopting it", async () => {
    const fs = new MemoryFileSystem({ failAt: "afterFirstRecordWritten" });
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await expect(store.commitSnapshotBundle(commitInput())).rejects.toBeInstanceOf(
      ProjectMemoryError,
    );
    const reader = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    const inspection = await reader.inspect(PID);
    expect(inspection.issues.some((i) => i.kind === "abandonedStaging")).toBe(true);
  });
});

describe("input validation and limits", () => {
  it("rejects a non-matching snapshot projectId", async () => {
    const { store } = makeStore();
    const bad = { ...commitInput(), snapshot: makeSnapshot("other", "snap-1") };
    await expect(store.commitSnapshotBundle(bad)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.invalidInput,
    });
  });

  it("rejects an operationId with unsafe characters", async () => {
    const { store } = makeStore();
    const bad = { ...commitInput(), operationId: "../etc" };
    await expect(store.commitSnapshotBundle(bad)).rejects.toBeInstanceOf(ProjectMemoryError);
  });

  it("rejects an operationId that is a traversal token", async () => {
    const { store } = makeStore();
    for (const operationId of [".", ".."]) {
      await expect(
        store.commitSnapshotBundle({ ...commitInput(), operationId }),
      ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.invalidInput });
    }
  });

  it("rejects when the project root equals the data root", async () => {
    const { store } = makeStore();
    const bad = { ...commitInput(), projectRootBoundary: DATA_ROOT };
    await expect(store.commitSnapshotBundle(bad)).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.pathEscape,
    });
  });
});
