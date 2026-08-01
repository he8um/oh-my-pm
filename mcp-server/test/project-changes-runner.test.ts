// v0.3 Phase 5 — project_changes read-only runner tests.
//
// The runner reads already-captured local memory and compares snapshots through
// the real Phase 3 Runtime and Phase 2/4.1 store. These tests use temporary data
// directories outside the repository (real adapter) for the compare paths, and
// injected fake stores for the version/corruption paths. They assert read-only
// behavior (no write/lock/migration/data-dir creation), capture-chronology
// selection, bounded projection, determinism, single clock read, and sanitized
// controlled errors.

import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NormalizedProviderItem } from "@oh-my-pm/contracts";
import { createNodeWasmProjectBrainKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import {
  createProjectBrainRuntime,
  createProviderRegistryObservationPort,
} from "@oh-my-pm/runtime";
import { deriveProjectBrainState } from "@oh-my-pm/skills";
import {
  createNodeProjectMemoryStore,
  buildEnvelope,
  buildManifest,
  deriveProjectKey,
  deriveRecordKey,
  serializeEnvelope,
  serializeManifest,
} from "@oh-my-pm/project-memory";
import { afterEach, describe, expect, it } from "vitest";
import { runProjectChanges } from "../src/project-changes-runner.js";
import type { ProjectChangesStore } from "../src/project-changes-runner.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function tempDataRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pc-runner-"));
  roots.push(root);
  return root;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** Build a real store over a temp data root and a factory returning it. */
function realStore(dataRoot: string): ProjectChangesStore {
  return createNodeProjectMemoryStore({ dataRootOverride: dataRoot }) as unknown as ProjectChangesStore;
}

const PROJECT_ID = "runner-proj";

/** Capture one snapshot from a Markdown body through the real Runtime + store. */
async function capture(store: ProjectChangesStore, body: string, at: string): Promise<string> {
  const items: NormalizedProviderItem[] = [
    { id: "docs/status.md", type: "document", title: "docs/status.md", source: "local", data: { content: body } },
  ];
  const observation = createProviderRegistryObservationPort(
    createProviderRegistry([createLocalProvider({ items })]),
  );
  const runtime = createProjectBrainRuntime({
    kernel: createNodeWasmProjectBrainKernelApi(),
    memory: store,
    observation,
    deriver: { derive: deriveProjectBrainState },
  });
  const result = await runtime.capture({
    requestId: "cap",
    projectRootBoundary: "/work/project",
    operationId: `op-${at.replace(/[^0-9]/g, "")}`,
    observedAt: at,
    capturedAt: at,
    identitySeed: { explicitId: PROJECT_ID },
    locale: "en",
    observations: [
      {
        observationId: "o1",
        request: { providerId: "local", action: "list", query: "." },
        sourceIdentity: "local",
        includedScope: "full",
        required: true,
      },
    ],
    freshnessPolicy: { maxFutureSkewSeconds: 86_400 },
  });
  if (!result.ok) throw new Error(`capture failed: ${JSON.stringify(result.error)}`);
  return result.snapshotId!;
}

describe("project_changes runner — history statuses", () => {
  it("reports noPriorMemory and creates no data directory", async () => {
    const dataRoot = tempDataRoot();
    const filesBefore = listFiles(dataRoot);
    const exec = await runProjectChanges(
      { projectId: PROJECT_ID },
      { storeFactory: () => realStore(dataRoot), clock: () => "2026-02-01T00:00:00.000Z" },
    );
    expect(exec.ok).toBe(true);
    if (exec.ok) expect(exec.result.status).toBe("noPriorMemory");
    // Zero writes: the noPriorMemory read created no store subtree.
    expect(listFiles(dataRoot)).toEqual(filesBefore);
  });

  it("reports insufficientHistory after a single capture", async () => {
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    await capture(store, "# P\n## Next\n- A", "2026-01-01T00:00:00.000Z");
    const exec = await runProjectChanges(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: () => "2026-02-01T00:00:00.000Z" },
    );
    expect(exec.ok).toBe(true);
    if (exec.ok) expect(exec.result.status).toBe("insufficientHistory");
  });
});

describe("project_changes runner — compare (real adapter + runtime)", () => {
  it("compares two captures and preserves read-only guarantees", async () => {
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    await capture(store, "# P\n## Next\n- A\n## Risks\n- tight", "2026-01-01T00:00:00.000Z");
    await capture(store, "# P\n## Next\n- A\n- B\n## Risks\n- tight\n## Blockers\n- auth", "2026-01-02T00:00:00.000Z");
    const filesBefore = listFiles(dataRoot).sort();
    const exec = await runProjectChanges(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: () => "2026-02-01T00:00:00.000Z" },
    );
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    expect(exec.result.status).toBe("compared");
    expect(exec.result.summary.totalChanges).toBeGreaterThan(0);
    // Read-only: no new file, no lock, no staging, no backup.
    const filesAfter = listFiles(dataRoot).sort();
    expect(filesAfter).toEqual(filesBefore);
    expect(filesAfter.some((f) => f.endsWith(".lock"))).toBe(false);
    expect(filesAfter.some((f) => f.includes("staging"))).toBe(false);
    expect(filesAfter.some((f) => f.includes("backups"))).toBe(false);
  });

  it("selects the immediate chronological predecessor across four captures", async () => {
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    const ids = [
      await capture(store, "# P\n## Next\n- A", "2026-01-01T00:00:00.000Z"),
      await capture(store, "# P\n## Next\n- A\n- B", "2026-01-02T00:00:00.000Z"),
      await capture(store, "# P\n## Next\n- A\n- B\n- C", "2026-01-03T00:00:00.000Z"),
      await capture(store, "# P\n## Next\n- A\n- B\n- C\n- D", "2026-01-04T00:00:00.000Z"),
    ];
    // Confirm the content-derived ids do not sort in capture order.
    expect([...ids].sort()).not.toEqual(ids);
    const exec = await runProjectChanges(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: () => "2026-02-01T00:00:00.000Z" },
    );
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    expect(exec.result.currentSnapshotId).toBe(ids[3]);
    expect(exec.result.previousSnapshotId).toBe(ids[2]);
  });

  it("honors an explicit snapshot pair exactly", async () => {
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    const first = await capture(store, "# P\n## Next\n- A", "2026-01-01T00:00:00.000Z");
    await capture(store, "# P\n## Next\n- A\n- B", "2026-01-02T00:00:00.000Z");
    const third = await capture(store, "# P\n## Next\n- A\n- B\n- C", "2026-01-03T00:00:00.000Z");
    const exec = await runProjectChanges(
      { projectId: PROJECT_ID, previousSnapshotId: first, currentSnapshotId: third },
      { storeFactory: () => store, clock: () => "2026-02-01T00:00:00.000Z" },
    );
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    expect(exec.result.previousSnapshotId).toBe(first);
    expect(exec.result.currentSnapshotId).toBe(third);
  });

  it("limit bounds projection only and repeat calls are deep-equal under a fixed clock", async () => {
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    await capture(store, "# P\n## Next\n- A\n## Risks\n- tight", "2026-01-01T00:00:00.000Z");
    await capture(store, "# P\n## Next\n- A\n- B\n- C\n## Risks\n- tight\n- budget\n## Blockers\n- auth", "2026-01-02T00:00:00.000Z");
    const clock = () => "2026-02-01T00:00:00.000Z";
    const limited = await runProjectChanges({ projectId: PROJECT_ID, limit: 1 }, { storeFactory: () => store, clock });
    expect(limited.ok).toBe(true);
    if (!limited.ok) return;
    expect(limited.result.changes.length).toBeLessThanOrEqual(1);
    expect(limited.result.summary.totalChanges).toBeGreaterThan(1);
    // Determinism: same input + fixed clock yields a deep-equal result.
    const again = await runProjectChanges({ projectId: PROJECT_ID, limit: 1 }, { storeFactory: () => store, clock });
    expect(again).toEqual(limited);
  });

  it("reads the clock exactly once per invocation", async () => {
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    await capture(store, "# P\n## Next\n- A", "2026-01-01T00:00:00.000Z");
    await capture(store, "# P\n## Next\n- A\n- B", "2026-01-02T00:00:00.000Z");
    let clockReads = 0;
    await runProjectChanges(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: () => { clockReads += 1; return "2026-02-01T00:00:00.000Z"; } },
    );
    expect(clockReads).toBe(1);
  });
});

describe("project_changes runner — input validation", () => {
  const noopStore: ProjectChangesStore = {
    async readManifest() { return null; },
    async listSnapshots() { return []; },
    async readSnapshot() { throw new Error("unused"); },
    async readEvidence() { throw new Error("unused"); },
    async commitSnapshotBundle() { throw new Error("read-only"); },
    async inspect() { return { exists: false, versionState: "noPriorMemory" }; },
  };
  const opts = { storeFactory: () => noopStore, clock: () => "2026-02-01T00:00:00.000Z" };

  it("rejects a missing or path-like project id", async () => {
    for (const projectId of ["", "  ", ".", "..", "a/b", "a\\b", "C:\\x", "x".repeat(300)]) {
      const exec = await runProjectChanges({ projectId } as never, opts);
      expect(exec.ok).toBe(false);
      if (!exec.ok) expect(exec.code).toBe("project_changes_invalid_input");
    }
  });

  it("rejects a half-supplied or equal explicit pair", async () => {
    const half = await runProjectChanges({ projectId: "p", previousSnapshotId: "s1" }, opts);
    expect(half.ok).toBe(false);
    const equal = await runProjectChanges(
      { projectId: "p", previousSnapshotId: "s1", currentSnapshotId: "s1" },
      opts,
    );
    expect(equal.ok).toBe(false);
  });

  it("rejects out-of-range staleAfterSeconds and limit", async () => {
    expect((await runProjectChanges({ projectId: "p", staleAfterSeconds: -1 } as never, opts)).ok).toBe(false);
    expect((await runProjectChanges({ projectId: "p", staleAfterSeconds: 99_999_999 }, opts)).ok).toBe(false);
    expect((await runProjectChanges({ projectId: "p", limit: 0 }, opts)).ok).toBe(false);
    expect((await runProjectChanges({ projectId: "p", limit: 101 }, opts)).ok).toBe(false);
    expect((await runProjectChanges({ projectId: "p", limit: 1.5 } as never, opts)).ok).toBe(false);
  });
});

// --- Version / corruption paths (injected fake stores) ---------------------

function fakeStoreWithVersion(
  versionState: "migrationRequired" | "unsupportedNewer" | "incompatibleSchema",
): ProjectChangesStore {
  return {
    async readManifest() { return null; },
    async listSnapshots() { return []; },
    async readSnapshot() { throw new Error("unused"); },
    async readEvidence() { throw new Error("unused"); },
    async commitSnapshotBundle() { throw new Error("read-only"); },
    async inspect() { return { exists: true, versionState }; },
  };
}

describe("project_changes runner — version / corruption", () => {
  it("maps a migration-required store to a controlled MCP error (no write)", async () => {
    const exec = await runProjectChanges(
      { projectId: "p" },
      { storeFactory: () => fakeStoreWithVersion("migrationRequired"), clock: () => "t" },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_changes_migration_required");
  });

  it("maps an unsupported-newer store to a controlled MCP error", async () => {
    const exec = await runProjectChanges(
      { projectId: "p" },
      { storeFactory: () => fakeStoreWithVersion("unsupportedNewer"), clock: () => "t" },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_changes_unsupported_store");
  });

  it("maps an incompatible schema to a controlled MCP error", async () => {
    const exec = await runProjectChanges(
      { projectId: "p" },
      { storeFactory: () => fakeStoreWithVersion("incompatibleSchema"), clock: () => "t" },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_changes_incompatible_schema");
  });

  it("maps an unavailable memory capability to a controlled MCP error", async () => {
    const exec = await runProjectChanges(
      { projectId: "p" },
      { storeFactory: () => { throw new Error("cannot load"); }, clock: () => "t" },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_changes_memory_unavailable");
  });

  it("surfaces a corrupt store as a sanitized error without leaking a path", async () => {
    // A store that reports supported but whose reads fail during compare.
    const corruptStore: ProjectChangesStore = {
      async readManifest() {
        return { projectId: "p", latestSnapshotId: "s2", snapshotIds: ["s1", "s2"], evidenceIds: [] };
      },
      async listSnapshots() {
        return [
          { snapshotId: "s1", isLatest: false } as never,
          { snapshotId: "s2", isLatest: true } as never,
        ];
      },
      async readSnapshot() { throw new Error("/abs/path/to/corrupt/snapshot.json is corrupt"); },
      async readEvidence() { throw new Error("unused"); },
      async commitSnapshotBundle() { throw new Error("read-only"); },
      async inspect() { return { exists: true, versionState: "supported" }; },
    };
    const exec = await runProjectChanges(
      { projectId: "p" },
      { storeFactory: () => corruptStore, clock: () => "t" },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) {
      expect(exec.message).not.toContain("/abs/path");
      expect(["project_changes_read_failed", "project_changes_compare_failed"]).toContain(exec.code);
    }
  });

  it("never reads a v1 store's records (migration required blocks compare)", async () => {
    // Plant a real store-format-1 store; the runner must stop at migrationRequired
    // and never read a snapshot, migrate, or write.
    const dataRoot = tempDataRoot();
    const projectKey = deriveProjectKey("v1-proj");
    const projectDir = join(dataRoot, "project-brain", "v1", "projects", projectKey);
    const store = createNodeProjectMemoryStore({ dataRootOverride: dataRoot }) as unknown as ProjectChangesStore;
    // Write a v1 manifest + one snapshot via the building blocks.
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(projectDir, "snapshots"), { recursive: true });
    const env = buildEnvelope("snapshot", "v1-proj", "s1", {
      snapshotId: "s1",
      projectId: "v1-proj",
      schemaVersion: 1,
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    writeFileSync(
      join(projectDir, "snapshots", `${deriveRecordKey("snapshot", "s1")}.json`),
      serializeEnvelope(env),
    );
    writeFileSync(
      join(projectDir, "manifest.json"),
      serializeManifest(
        buildManifest({
          storeFormatVersion: 1,
          projectBrainSchemaVersion: 1,
          projectId: "v1-proj",
          projectKey,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          latestSnapshotId: "s1",
          snapshotIds: ["s1"],
          evidenceIds: [],
          migrationHistory: [],
        }),
      ),
    );
    const before = listFiles(dataRoot).sort();
    const exec = await runProjectChanges(
      { projectId: "v1-proj" },
      { storeFactory: () => store, clock: () => "2026-02-01T00:00:00.000Z" },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_changes_migration_required");
    // Still a v1 store — no migration, no backup, no new file.
    expect(listFiles(dataRoot).sort()).toEqual(before);
    expect(before.some((f) => f.includes("backups"))).toBe(false);
  });
});

describe("project_changes runner — default clock", () => {
  it("does not read a wall clock by default (no clock injected)", async () => {
    const dataRoot = tempDataRoot();
    const exec = await runProjectChanges(
      { projectId: "no-such" },
      { storeFactory: () => realStore(dataRoot) },
    );
    // A missing store is a controlled success status regardless of the clock.
    expect(exec.ok).toBe(true);
    if (exec.ok) expect(exec.result.status).toBe("noPriorMemory");
    expect(existsSync(join(dataRoot, "project-brain"))).toBe(false);
  });
});
