import { describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { deriveProjectKey } from "../src/integrity.js";
import { projectDirFor, resolveStoreLayout } from "../src/path-safety.js";
import { DependencyInjectedStore } from "../src/store.js";
import { DATA_ROOT, makeEvidence, makeSnapshot, PROJECT_ROOT } from "./fixtures.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const layout = resolveStoreLayout(DATA_ROOT);
const PID = "proj-1";

async function seed(fs: MemoryFileSystem, projectId = PID): Promise<DependencyInjectedStore> {
  const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
  await store.commitSnapshotBundle({
    projectId,
    projectRootBoundary: PROJECT_ROOT,
    operationId: "op-seed",
    occurredAt: "2026-01-01T00:00:00.000Z",
    snapshot: makeSnapshot(projectId, "snap-1", ["ev-1"]),
    evidence: [makeEvidence(projectId, "ev-1")],
  });
  return store;
}

function exportInput(destination: string) {
  return { projectId: PID, projectRootBoundary: PROJECT_ROOT, operationId: "op-exp", destination };
}

describe("export", () => {
  it("exports committed records only and verifies the copy", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    const result = await store.exportProject(exportInput("/exports/copy"));
    expect(result.snapshotCount).toBe(1);
    expect(result.evidenceCount).toBe(1);
    expect(result.inventory).toHaveLength(2);
    expect(result.inventoryIntegrity).toMatch(/^sha256:/);
    // The export directory holds a manifest, an export-manifest, and records —
    // and no locks or staging.
    const exported = [...fs.nodes.keys()].filter((p) => p.startsWith("/exports/copy"));
    expect(exported.some((p) => p.endsWith("manifest.json"))).toBe(true);
    expect(exported.some((p) => p.endsWith("export-manifest.json"))).toBe(true);
    expect(exported.some((p) => p.includes("/staging"))).toBe(false);
    expect(exported.some((p) => p.endsWith(".lock"))).toBe(false);
  });

  it("leaves the source store byte-identical", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    const projectDir = projectDirFor(layout, deriveProjectKey(PID));
    const before = new Map([...fs.snapshot()].filter(([p]) => p.startsWith(projectDir)));
    await store.exportProject(exportInput("/exports/copy"));
    const after = new Map([...fs.snapshot()].filter(([p]) => p.startsWith(projectDir)));
    expect(after).toEqual(before);
  });

  it("rejects a destination inside the project root", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    await expect(store.exportProject(exportInput(`${PROJECT_ROOT}/out`))).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.pathEscape,
    });
  });

  it("rejects a destination inside the active data root", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    await expect(store.exportProject(exportInput(`${DATA_ROOT}/out`))).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.pathEscape,
    });
  });

  it("rejects an existing destination", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    await fs.mkdirp("/exports/copy");
    await expect(store.exportProject(exportInput("/exports/copy"))).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.invalidInput,
    });
  });
});

describe("delete", () => {
  function delInput(overrides: Record<string, unknown> = {}) {
    return {
      projectId: PID,
      projectRootBoundary: PROJECT_ROOT,
      operationId: "op-del",
      confirmation: PID,
      ...overrides,
    };
  }

  it("requires a confirmation exactly equal to the project id", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    await expect(store.deleteProject(delInput({ confirmation: "wrong" }))).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.deleteConfirmationMismatch,
    });
  });

  it("deletes a verified store and is a no-op when missing", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    const projectDir = projectDirFor(layout, deriveProjectKey(PID));
    const del = await store.deleteProject(delInput());
    expect(del.deleted).toBe(true);
    expect(await fs.exists(projectDir)).toBe(false);
    // Second delete is a controlled no-op.
    const again = await store.deleteProject(delInput());
    expect(again.deleted).toBe(false);
  });

  it("refuses to delete a corrupt store by default and allows force", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs);
    // Corrupt the manifest.
    const { manifestPathFor } = await import("../src/path-safety.js");
    fs.poke(manifestPathFor(layout, deriveProjectKey(PID)), "{ broken");
    await expect(store.deleteProject(delInput())).rejects.toMatchObject({
      code: PROJECT_MEMORY_ERROR_CODES.corruption,
    });
    const forced = await store.deleteProject(delInput({ forceCorruptDelete: true }));
    expect(forced.deleted).toBe(true);
  });

  it("never deletes another project", async () => {
    const fs = new MemoryFileSystem();
    const store = await seed(fs, PID);
    await seed(fs, "other-proj");
    await store.deleteProject(delInput());
    // The other project's store is untouched.
    const otherDir = projectDirFor(layout, deriveProjectKey("other-proj"));
    expect(await fs.exists(otherDir)).toBe(true);
  });
});
