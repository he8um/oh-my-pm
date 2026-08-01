import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
