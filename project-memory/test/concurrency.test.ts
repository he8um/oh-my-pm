import { describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { acquireLock, STALE_LOCK_THRESHOLD_MS } from "../src/lock.js";
import { deriveProjectKey } from "../src/integrity.js";
import { lockPathFor, resolveStoreLayout } from "../src/path-safety.js";
import { DependencyInjectedStore } from "../src/store.js";
import { DATA_ROOT, makeEvidence, makeSnapshot, PROJECT_ROOT } from "./fixtures.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const layout = resolveStoreLayout(DATA_ROOT);

function input(projectId: string, opId: string) {
  return {
    projectId,
    projectRootBoundary: PROJECT_ROOT,
    operationId: opId,
    occurredAt: "2026-01-01T00:00:00.000Z",
    snapshot: makeSnapshot(projectId, "snap-1", ["ev-1"]),
    evidence: [makeEvidence(projectId, "ev-1")],
  };
}

describe("single-writer lock", () => {
  it("serializes two writers on the same project (second is refused mid-hold)", async () => {
    const fs = new MemoryFileSystem();
    const key = deriveProjectKey("proj-1");
    await fs.mkdirp(layout.locksDir);
    const lockPath = lockPathFor(layout, key);
    // Hold the lock, then a second acquire must be refused.
    const held = await acquireLock(fs, lockPath, key, "op-a");
    await expect(acquireLock(fs, lockPath, key, "op-b")).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.storeLocked,
    });
    await held.release();
    // After release, a new writer succeeds.
    const next = await acquireLock(fs, lockPath, key, "op-c");
    expect(next.path).toBe(lockPath);
    await next.release();
  });

  it("a live (non-stale) lock is preserved", async () => {
    let now = 0;
    const fs = new MemoryFileSystem({
      now: () => new Date(now).toISOString(),
      isProcessAlive: () => true, // owner alive
    });
    const key = deriveProjectKey("proj-1");
    await fs.mkdirp(layout.locksDir);
    const lockPath = lockPathFor(layout, key);
    await acquireLock(fs, lockPath, key, "op-a");
    // Advance well past the stale threshold, but the owner is alive → preserved.
    now = STALE_LOCK_THRESHOLD_MS * 10;
    await expect(acquireLock(fs, lockPath, key, "op-b")).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.storeLocked,
    });
  });

  it("a stale dead lock is reclaimed", async () => {
    let now = 0;
    const fs = new MemoryFileSystem({
      now: () => new Date(now).toISOString(),
      isProcessAlive: () => false, // owner dead
    });
    const key = deriveProjectKey("proj-1");
    await fs.mkdirp(layout.locksDir);
    const lockPath = lockPathFor(layout, key);
    await acquireLock(fs, lockPath, key, "op-a");
    now = STALE_LOCK_THRESHOLD_MS + 1; // old
    const reclaimed = await acquireLock(fs, lockPath, key, "op-b");
    expect(reclaimed.path).toBe(lockPath);
    await reclaimed.release();
  });

  it("an old but live lock is not reclaimed", async () => {
    let now = 0;
    const fs = new MemoryFileSystem({
      now: () => new Date(now).toISOString(),
      isProcessAlive: () => true,
    });
    const key = deriveProjectKey("proj-1");
    await fs.mkdirp(layout.locksDir);
    const lockPath = lockPathFor(layout, key);
    await acquireLock(fs, lockPath, key, "op-a");
    now = STALE_LOCK_THRESHOLD_MS + 1;
    await expect(acquireLock(fs, lockPath, key, "op-b")).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.storeLocked,
    });
  });

  it("different projects do not contend", async () => {
    const fs = new MemoryFileSystem();
    await fs.mkdirp(layout.locksDir);
    const a = await acquireLock(fs, lockPathFor(layout, deriveProjectKey("a")), deriveProjectKey("a"), "op-a");
    const b = await acquireLock(fs, lockPathFor(layout, deriveProjectKey("b")), deriveProjectKey("b"), "op-b");
    expect(a.path).not.toBe(b.path);
    await a.release();
    await b.release();
  });
});

describe("reads never lock", () => {
  it("readManifest and readSnapshot acquire no lock file", async () => {
    const fs = new MemoryFileSystem();
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await store.commitSnapshotBundle(input("proj-1", "op-1"));
    // A read must not create or leave a lock file.
    await store.readManifest("proj-1");
    await store.readSnapshot("proj-1", "snap-1");
    const lockPaths = [...fs.nodes.keys()].filter((p) => p.endsWith(".lock"));
    expect(lockPaths).toEqual([]);
  });
});
