import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createNodeProjectMemoryStore,
  NodeFileSystem,
  resolveNodeDataRoot,
} from "../src/node-adapter.js";
import { DependencyInjectedStore } from "../src/store.js";

const PID = "proj-1";

function makeSnapshot(evidenceRefs: readonly string[] = []): Record<string, unknown> {
  return {
    snapshotId: "snap-1",
    projectId: PID,
    schemaVersion: 1,
    capturedAt: "2026-01-01T00:00:00.000Z",
    sourceBoundaries: [],
    evidenceRefs: [...evidenceRefs],
    fingerprint: "sha256:" + "b".repeat(64),
  };
}

function makeEvidence(): Record<string, unknown> {
  return {
    evidenceId: "ev-1",
    projectId: PID,
    schemaVersion: 1,
    sourceKind: "markdown",
    sourceIdentity: "docs/status.md#L1",
    observedAt: "2026-01-01T00:00:00.000Z",
    provenance: { line: "1" },
    rawContentPolicy: "minimized",
    retentionState: "active",
    contentFingerprint: "sha256:" + "a".repeat(64),
  };
}

describe("resolveNodeDataRoot", () => {
  it("honors an explicit override", () => {
    expect(resolveNodeDataRoot("/explicit/root")).toBe("/explicit/root");
  });

  it("resolves a platform-appropriate default that is never persisted verbatim", () => {
    const root = resolveNodeDataRoot();
    expect(root.length).toBeGreaterThan(0);
    expect(root).toContain("oh-my-pm");
  });
});

describe("NodeFileSystem-backed store (real filesystem)", () => {
  let root: string;
  let dataRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "oh-my-pm-mem-"));
    dataRoot = join(root, "data");
    projectRoot = join(root, "project");
    await mkdir(projectRoot, { recursive: true });
    // Plant a project file we later prove is byte-identical.
    await writeFile(join(projectRoot, "README.md"), "# project\nunchanged\n", "utf8");
  });

  afterEach(async () => {
    // Remove exactly the owned temp directory (never an inferred parent).
    await rm(root, { recursive: true, force: true });
  });

  it("commits, reads, verifies, exports, and deletes without touching the project", async () => {
    const store = createNodeProjectMemoryStore({
      dataRootOverride: dataRoot,
      filesystem: { now: () => "2026-01-01T00:00:00.000Z", isProcessAlive: () => true },
    });

    const projectBefore = await readFile(join(projectRoot, "README.md"), "utf8");

    await store.commitSnapshotBundle({
      projectId: PID,
      projectRootBoundary: projectRoot,
      operationId: "op-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      snapshot: makeSnapshot(["ev-1"]) as never,
      evidence: [makeEvidence() as never],
    });

    const snapshot = await store.readSnapshot(PID, "snap-1");
    expect(snapshot.snapshotId).toBe("snap-1");

    const verification = await store.verify(PID);
    expect(verification.ok).toBe(true);

    const exportDir = join(root, "export");
    const exportResult = await store.exportProject({
      projectId: PID,
      projectRootBoundary: projectRoot,
      operationId: "op-exp",
      destination: exportDir,
    });
    expect(exportResult.snapshotCount).toBe(1);
    const exportedManifest = await readFile(join(exportDir, "manifest.json"), "utf8");
    expect(exportedManifest.length).toBeGreaterThan(0);

    // Project file is byte-identical after every operation.
    const projectAfter = await readFile(join(projectRoot, "README.md"), "utf8");
    expect(projectAfter).toBe(projectBefore);

    const del = await store.deleteProject({
      projectId: PID,
      projectRootBoundary: projectRoot,
      operationId: "op-del",
      confirmation: PID,
    });
    expect(del.deleted).toBe(true);

    // Project still byte-identical after delete.
    expect(await readFile(join(projectRoot, "README.md"), "utf8")).toBe(projectBefore);
  });

  it("applies POSIX 0700/0600 modes on non-Windows platforms", async () => {
    if (process.platform === "win32") return; // ACL-based; modes not meaningful
    const store = new DependencyInjectedStore({
      fs: new NodeFileSystem({ now: () => "2026-01-01T00:00:00.000Z" }),
      dataRoot,
    });
    await store.commitSnapshotBundle({
      projectId: PID,
      projectRootBoundary: projectRoot,
      operationId: "op-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      snapshot: makeSnapshot(["ev-1"]) as never,
      evidence: [makeEvidence() as never],
    });
    const manifestStat = await stat(join(dataRoot, "project-brain", "v1", "projects"));
    // Directory owner-only bits set (0700); group/other have no access.
    expect(manifestStat.mode & 0o077).toBe(0);
  });
});

describe("atomic write on a real filesystem", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "oh-my-pm-atomic-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const TARGET = "manifest.json";
  const OLD = '{"v":1}';
  const NEW = '{"v":2}';

  /**
   * Drive the real Node primitives through the shared algorithm.
   *
   * This goes through NodeFileSystem.writeFileAtomic, so it exercises real
   * open/fsync/rename syscalls rather than an in-memory model. Stages that would
   * require killing the process mid-syscall are covered by the deterministic
   * suite in atomic-write.test.ts; what is proven HERE is that the real
   * primitives satisfy the same contract on this platform.
   */
  it("replaces an existing file and leaves no temp residue", async () => {
    const fs = new NodeFileSystem();
    const target = join(root, TARGET);
    await writeFile(target, OLD, "utf8");

    await fs.writeFileAtomic(target, NEW, "manifest.json.op-1.4242.tmp");

    expect(await readFile(target, "utf8")).toBe(NEW);
    const entries = await readdir(root);
    expect(entries).toEqual([TARGET]);
  });

  it("creates a new file when the target does not exist", async () => {
    const fs = new NodeFileSystem();
    const target = join(root, TARGET);
    await fs.writeFileAtomic(target, NEW, "manifest.json.op-1.4242.tmp");
    expect(await readFile(target, "utf8")).toBe(NEW);
    expect(await readdir(root)).toEqual([TARGET]);
  });

  it("leaves the old file intact when the temp file cannot be created", async () => {
    // A directory at the temp path makes open(...,"w") fail with EISDIR, which
    // models a failure at the very first stage using only real syscalls.
    const fs = new NodeFileSystem();
    const target = join(root, TARGET);
    await writeFile(target, OLD, "utf8");
    const tmpName = "manifest.json.op-1.4242.tmp";
    await mkdir(join(root, tmpName), { recursive: true });

    await expect(fs.writeFileAtomic(target, NEW, tmpName)).rejects.toThrow();

    // Old content survives untouched: the rename never ran.
    expect(await readFile(target, "utf8")).toBe(OLD);

    // A retry with a clean temp name converges.
    await fs.writeFileAtomic(target, NEW, "manifest.json.op-1.4243.tmp");
    expect(await readFile(target, "utf8")).toBe(NEW);
  });

  it("does not remove another writer's temp file", async () => {
    // Cleanup is scoped to this operation's own temp name. A concurrent writer's
    // temp file carries a different operation id and pid and must survive.
    const fs = new NodeFileSystem();
    const target = join(root, TARGET);
    const foreign = join(root, "manifest.json.op-9.9999.tmp");
    await writeFile(foreign, "other writer", "utf8");

    await fs.writeFileAtomic(target, NEW, "manifest.json.op-1.4242.tmp");

    expect(await readFile(foreign, "utf8")).toBe("other writer");
    expect((await readdir(root)).sort()).toEqual([TARGET, "manifest.json.op-9.9999.tmp"].sort());
  });

  it("writes owner-only file modes on POSIX", async () => {
    if (process.platform === "win32") return;
    const fs = new NodeFileSystem();
    const target = join(root, TARGET);
    await fs.writeFileAtomic(target, NEW, "manifest.json.op-1.4242.tmp");
    const info = await stat(target);
    expect(info.mode & 0o077).toBe(0);
  });
});
