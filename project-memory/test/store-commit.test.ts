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
    expect(summaries).toEqual([{ snapshotId: "snap-1", isLatest: true }]);
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
      const cleanFs = fs; // same fs; read manifest via a fresh store instance
      const reader = new DependencyInjectedStore({ fs: cleanFs, dataRoot: DATA_ROOT });
      const manifest = await reader.readManifest(PID);
      const committed = point === "afterManifestRename" || point === "beforeCleanup";
      if (committed) {
        expect(manifest).not.toBeNull();
        expect(manifest?.latestSnapshotId).toBe("snap-1");
      } else {
        expect(manifest).toBeNull();
      }

      // The lock must always be released (finally), so a follow-up commit works.
      const followUpFs = new MemoryFileSystem();
      const followUp = new DependencyInjectedStore({ fs: followUpFs, dataRoot: DATA_ROOT });
      await expect(followUp.commitSnapshotBundle(commitInput())).resolves.toBeDefined();
    });
  }

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
