import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { deriveProjectKey, deriveRecordKey } from "../src/integrity.js";
import {
  EVIDENCE_DIRNAME,
  manifestPathFor,
  projectDirFor,
  recordPathFor,
  resolveStoreLayout,
  SNAPSHOTS_DIRNAME,
} from "../src/path-safety.js";
import { DependencyInjectedStore } from "../src/store.js";
import { DATA_ROOT, makeEvidence, makeSnapshot, PROJECT_ROOT } from "./fixtures.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const layout = resolveStoreLayout(DATA_ROOT);
const PID = "proj-1";

async function seed(fs: MemoryFileSystem): Promise<DependencyInjectedStore> {
  const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
  await store.commitSnapshotBundle({
    projectId: PID,
    projectRootBoundary: PROJECT_ROOT,
    operationId: "op-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    snapshot: makeSnapshot(PID, "snap-1", ["ev-1"]),
    evidence: [makeEvidence(PID, "ev-1")],
  });
  return store;
}

describe("corruption handling", () => {
  it("rejects a malformed manifest JSON", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    fs.poke(manifestPathFor(layout, deriveProjectKey(PID)), "{ not json");
    await expect(
      new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT }).readManifest(PID),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.corruption });
  });

  it("reports a missing referenced record via verify", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const recordPath = recordPathFor(
      layout,
      deriveProjectKey(PID),
      SNAPSHOTS_DIRNAME,
      deriveRecordKey("snapshot", "snap-1"),
    );
    // remove(), not nodes.delete(): the raw map is keyed on "/" while recordPathFor
    // returns a platform-native path, so a raw delete matches nothing on Windows.
    fs.remove(recordPath);
    const verification = await new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT }).verify(PID);
    expect(verification.ok).toBe(false);
    expect(verification.issues.some((i) => i.kind === "missingRecord")).toBe(true);
  });

  it("rejects a record whose payload was tampered (integrity mismatch)", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const recordPath = recordPathFor(
      layout,
      deriveProjectKey(PID),
      EVIDENCE_DIRNAME,
      deriveRecordKey("evidence", "ev-1"),
    );
    const env = JSON.parse(fs.peek(recordPath) as string);
    env.payload.retentionState = "superseded";
    fs.poke(recordPath, JSON.stringify(env));
    await expect(
      new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT }).readEvidence(PID, "ev-1"),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.integrityMismatch });
  });

  it("rejects a record stored under the wrong project", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const recordPath = recordPathFor(
      layout,
      deriveProjectKey(PID),
      EVIDENCE_DIRNAME,
      deriveRecordKey("evidence", "ev-1"),
    );
    const env = JSON.parse(fs.peek(recordPath) as string);
    env.projectId = "someone-else";
    fs.poke(recordPath, JSON.stringify(env));
    // Integrity is computed over projectId too, so this fails integrity first.
    await expect(
      new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT }).readEvidence(PID, "ev-1"),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.integrityMismatch });
  });

  it("refuses an unsupported newer store format", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    // Rebuild a manifest claiming a store format NEWER than the current v2 with
    // valid integrity. (v2 is now the current supported format; v3 is newer.)
    const { buildManifest, serializeManifest } = await import("../src/manifest.js");
    const newer = buildManifest({
      storeFormatVersion: 3,
      projectBrainSchemaVersion: 1,
      projectId: PID,
      projectKey: deriveProjectKey(PID),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      latestSnapshotId: "snap-1",
      snapshotIds: ["snap-1"],
      evidenceIds: ["ev-1"],
      migrationHistory: [],
    });
    fs.poke(manifestPathFor(layout, deriveProjectKey(PID)), serializeManifest(newer));
    await expect(
      new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT }).readManifest(PID),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.unsupportedStoreVersion });
  });

  it("does not auto-repair: a corrupt store stays corrupt after inspect", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    const manifestPath = manifestPathFor(layout, deriveProjectKey(PID));
    const before = fs.peek(manifestPath);
    fs.poke(manifestPath, "{ broken");
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await store.inspect(PID).catch(() => undefined);
    // inspect never rewrites the manifest.
    expect(fs.peek(manifestPath)).toBe("{ broken");
    expect(fs.peek(manifestPath)).not.toBe(before);
  });

  it("reports a symlink inside a record directory as an integrity issue", async () => {
    const fs = new MemoryFileSystem();
    await seed(fs);
    // Built from the package's OWN path functions and joined natively. A literal
    // "/project-brain/v1/projects/..." string does not match what the layout
    // produces on Windows, where resolve() adds a drive letter and join() uses
    // backslashes -- so the planted link landed somewhere the store never looked.
    const dir = join(projectDirFor(layout, deriveProjectKey(PID)), SNAPSHOTS_DIRNAME);
    fs.plantSymlink(join(dir, "evil.json"), "/etc/passwd");
    const inspection = await new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT }).inspect(PID);
    expect(inspection.issues.some((i) => i.detail.includes("symlink"))).toBe(true);
  });
});
