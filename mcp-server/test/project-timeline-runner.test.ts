// v0.4 — project_timeline read-only runner tests.
//
// The runner reads already-captured local memory and derives a bounded timeline
// through the real Runtime and the real store. These tests use temporary data
// directories outside the repository (real adapter) for the derivation paths, and
// injected fake stores for the version/corruption paths. They assert read-only
// behavior (no write/lock/migration/data-dir creation), capture-chronology
// ordering, bounded projection, filtering, pagination, determinism, a single
// clock read, and sanitized controlled errors.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NormalizedProviderItem } from "@oh-my-pm/contracts";
import { createNodeWasmProjectBrainKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createNodeProjectMemoryStore } from "@oh-my-pm/project-memory";
import {
  createProjectBrainRuntime,
  createProviderRegistryObservationPort,
} from "@oh-my-pm/runtime";
import { deriveProjectBrainState } from "@oh-my-pm/skills";
import { afterEach, describe, expect, it } from "vitest";

import { runProjectTimeline } from "../src/project-timeline-runner.js";
import type { ProjectTimelineStore } from "../src/project-timeline-runner.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function tempDataRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pt-runner-"));
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

function realStore(dataRoot: string): ProjectTimelineStore {
  return createNodeProjectMemoryStore({
    dataRootOverride: dataRoot,
  }) as unknown as ProjectTimelineStore;
}

const PROJECT_ID = "timeline-runner-proj";
const CLOCK = () => "2026-02-01T00:00:00.000Z";

/** Capture one snapshot from a Markdown body through the real Runtime + store. */
async function capture(store: ProjectTimelineStore, body: string, at: string): Promise<string> {
  const items: NormalizedProviderItem[] = [
    {
      id: "docs/status.md",
      type: "document",
      title: "docs/status.md",
      source: "local",
      data: { content: body },
    },
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

/** Build a store with three captures and return it plus its data root. */
async function threeCaptures(): Promise<{ store: ProjectTimelineStore; dataRoot: string }> {
  const dataRoot = tempDataRoot();
  const store = realStore(dataRoot);
  await capture(store, "# P\n## Next\n- A\n## Risks\n- tight", "2026-01-01T00:00:00.000Z");
  await capture(store, "# P\n## Next\n- A\n- B\n## Risks\n- tight", "2026-01-02T00:00:00.000Z");
  await capture(
    store,
    "# P\n## Next\n- A\n- B\n- C\n## Risks\n- tight\n## Blockers\n- auth is down",
    "2026-01-03T00:00:00.000Z",
  );
  return { store, dataRoot };
}

describe("project_timeline runner — empty and degenerate history", () => {
  it("returns an empty valid result and creates no data directory", async () => {
    const dataRoot = tempDataRoot();
    const filesBefore = listFiles(dataRoot);
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => realStore(dataRoot), clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    if (exec.ok) {
      expect(exec.result.eventCount).toBe(0);
      expect(exec.result.events).toEqual([]);
      expect(exec.result.hasMore).toBe(false);
      expect(exec.result.nextBeforeSequence).toBeUndefined();
      expect(exec.result.chronology).toBe("capture-order");
    }
    expect(listFiles(dataRoot)).toEqual(filesBefore);
  });

  it("returns an empty valid result after a single capture", async () => {
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    await capture(store, "# P\n## Next\n- A", "2026-01-01T00:00:00.000Z");
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    if (exec.ok) expect(exec.result.eventCount).toBe(0);
  });
});

describe("project_timeline runner — derivation over the real adapter", () => {
  it("derives events newest capture first and preserves read-only guarantees", async () => {
    const { store, dataRoot } = await threeCaptures();
    const filesBefore = listFiles(dataRoot).sort();
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    expect(exec.result.eventCount).toBeGreaterThan(0);
    const events = exec.result.events;
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1]!;
      const next = events[i]!;
      if (prev.captureSequence === next.captureSequence) {
        expect(next.eventSequence).toBeGreaterThan(prev.eventSequence);
      } else {
        expect(next.captureSequence).toBeLessThan(prev.captureSequence);
      }
    }
    // Two comparisons over three captures: captures 2 and 3 only.
    expect([...new Set(events.map((e) => e.captureSequence))].sort()).toEqual([2, 3]);
    // Read-only: no new file, no lock, no staging, no backup.
    const filesAfter = listFiles(dataRoot).sort();
    expect(filesAfter).toEqual(filesBefore);
    expect(filesAfter.some((f) => f.endsWith(".lock"))).toBe(false);
    expect(filesAfter.some((f) => f.includes("staging"))).toBe(false);
    expect(filesAfter.some((f) => f.includes("backups"))).toBe(false);
  });

  it("uses capture chronology even when the snapshot ids do not sort that way", async () => {
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
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    // The newest event belongs to capture 4, whose snapshot id is ids[3].
    expect(exec.result.events[0]!.captureSequence).toBe(4);
    expect(exec.result.events[0]!.snapshotId).toBe(ids[3]);
  });

  it("is deterministic and byte-stable across repeated runs", async () => {
    const { store } = await threeCaptures();
    const a = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    const b = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("reads the clock at most once per invocation", async () => {
    const { store } = await threeCaptures();
    let reads = 0;
    await runProjectTimeline(
      { projectId: PROJECT_ID },
      {
        storeFactory: () => store,
        clock: () => {
          reads += 1;
          return "2026-02-01T00:00:00.000Z";
        },
      },
    );
    expect(reads).toBe(1);
  });

  it("exposes no evidence id, raw value, or path", async () => {
    const { store, dataRoot } = await threeCaptures();
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    const serialized = JSON.stringify(exec.result);
    expect(serialized).not.toContain(dataRoot);
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
    for (const forbidden of [
      "evidenceRefs",
      "previousValue",
      "currentValue",
      "contentFingerprint",
      "stateFingerprint",
      "snapshotHistory",
      "dataRoot",
      "projectRoot",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("project_timeline runner — filters and pagination", () => {
  it("filters by category", async () => {
    const { store } = await threeCaptures();
    const all = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    const category = all.result.events[0]!.category;
    const filtered = await runProjectTimeline(
      { projectId: PROJECT_ID, category },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.result.eventCount).toBeGreaterThan(0);
    for (const e of filtered.result.events) expect(e.category).toBe(category);
  });

  it("filters by kind", async () => {
    const { store } = await threeCaptures();
    const filtered = await runProjectTimeline(
      { projectId: PROJECT_ID, kind: "task" },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    for (const e of filtered.result.events) expect(e.kind).toBe("task");
  });

  it("combines filters as a conjunction", async () => {
    const { store } = await threeCaptures();
    const filtered = await runProjectTimeline(
      { projectId: PROJECT_ID, category: "added", kind: "task" },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    for (const e of filtered.result.events) {
      expect(e.category).toBe("added");
      expect(e.kind).toBe("task");
    }
  });

  it("paginates with beforeSequence without duplicating or skipping", async () => {
    const { store } = await threeCaptures();
    const full = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const seen: string[] = [];
    let before: number | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await runProjectTimeline(
        {
          projectId: PROJECT_ID,
          limit: 1,
          ...(before !== undefined ? { beforeSequence: before } : {}),
        },
        { storeFactory: () => store, clock: CLOCK },
      );
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      for (const e of page.result.events) seen.push(e.eventId);
      if (!page.result.hasMore) {
        expect(page.result.nextBeforeSequence).toBeUndefined();
        break;
      }
      before = page.result.nextBeforeSequence!;
    }
    expect(seen).toEqual(full.result.events.map((e) => e.eventId));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("excludes captures at or above beforeSequence", async () => {
    const { store } = await threeCaptures();
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID, beforeSequence: 3 },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    for (const e of exec.result.events) expect(e.captureSequence).toBeLessThan(3);
  });

  it("defaults the page size to 20 and honours the maximum of 100", async () => {
    const { store } = await threeCaptures();
    const dflt = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(dflt.ok).toBe(true);
    if (dflt.ok) expect(dflt.result.eventCount).toBeLessThanOrEqual(20);
    const max = await runProjectTimeline(
      { projectId: PROJECT_ID, limit: 100 },
      { storeFactory: () => store, clock: CLOCK },
    );
    expect(max.ok).toBe(true);
  });
});

describe("project_timeline runner — controlled input failures", () => {
  const store = () => realStore(tempDataRoot());

  it.each([
    [{}, "projectId"],
    [{ projectId: "" }, "projectId"],
    [{ projectId: "   " }, "projectId"],
    [{ projectId: "." }, "projectId"],
    [{ projectId: ".." }, "projectId"],
    [{ projectId: "a/b" }, "projectId"],
    [{ projectId: "a\\b" }, "projectId"],
    [{ projectId: "C:/data" }, "projectId"],
    [{ projectId: "bad\u0000id" }, "projectId"],
  ])("rejects an invalid project id %#", async (input) => {
    const exec = await runProjectTimeline(input as never, { storeFactory: store, clock: CLOCK });
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_timeline_invalid_input");
  });

  it.each([0, 101, -1, 1.5, Number.NaN, Number.MAX_VALUE])(
    "rejects the out-of-range limit %s",
    async (limit) => {
      const exec = await runProjectTimeline({ projectId: PROJECT_ID, limit } as never, {
        storeFactory: store,
        clock: CLOCK,
      });
      expect(exec.ok).toBe(false);
      if (!exec.ok) expect(exec.code).toBe("project_timeline_invalid_input");
    },
  );

  it.each([-1, 1.5, Number.NaN])("rejects the invalid beforeSequence %s", async (before) => {
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID, beforeSequence: before } as never,
      { storeFactory: store, clock: CLOCK },
    );
    expect(exec.ok).toBe(false);
  });

  it("rejects a category or kind outside the existing taxonomy", async () => {
    for (const input of [
      { projectId: PROJECT_ID, category: "invented" },
      { projectId: PROJECT_ID, kind: "epic" },
      { projectId: PROJECT_ID, category: 1 },
    ]) {
      const exec = await runProjectTimeline(input as never, {
        storeFactory: store,
        clock: CLOCK,
      });
      expect(exec.ok).toBe(false);
      if (!exec.ok) expect(exec.code).toBe("project_timeline_invalid_input");
    }
  });

  it("rejects a non-object input", async () => {
    for (const input of [null, undefined, 42, "x"]) {
      const exec = await runProjectTimeline(input as never, {
        storeFactory: store,
        clock: CLOCK,
      });
      expect(exec.ok).toBe(false);
    }
  });
});

describe("project_timeline runner — store version and corruption", () => {
  /** A minimal fake store reporting a chosen version state. */
  function fakeStore(
    versionState: "migrationRequired" | "unsupportedNewer" | "incompatibleSchema" | "supported",
    over: Partial<ProjectTimelineStore> = {},
  ): ProjectTimelineStore {
    return {
      async inspect() {
        return { exists: true, versionState };
      },
      async readManifest() {
        return null;
      },
      async listSnapshots() {
        return [];
      },
      async readSnapshot() {
        throw new Error("not implemented");
      },
      async readEvidence() {
        throw new Error("not implemented");
      },
      async commitSnapshotBundle() {
        throw new Error("the timeline must never commit");
      },
      ...over,
    } as ProjectTimelineStore;
  }

  it("reports migrationRequired without migrating", async () => {
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => fakeStore("migrationRequired"), clock: CLOCK },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) {
      expect(exec.code).toBe("project_timeline_migration_required");
      expect(exec.message).not.toContain("/");
    }
  });

  it("reports an unsupported newer store", async () => {
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => fakeStore("unsupportedNewer"), clock: CLOCK },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_timeline_unsupported_store");
  });

  it("reports an incompatible schema", async () => {
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => fakeStore("incompatibleSchema"), clock: CLOCK },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_timeline_incompatible_schema");
  });

  it("reports a read failure when inspect throws", async () => {
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      {
        storeFactory: () =>
          fakeStore("supported", {
            async inspect() {
              throw new Error("/Users/someone/secret leaked");
            },
          } as never),
        clock: CLOCK,
      },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) {
      expect(exec.code).toBe("project_timeline_read_failed");
      expect(exec.message).not.toContain("secret");
      expect(exec.message).not.toContain("/Users/");
    }
  });

  it("reports memory unavailable when the store cannot be constructed", async () => {
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      {
        storeFactory: () => {
          throw new Error("module not found: /some/private/path");
        },
        clock: CLOCK,
      },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) {
      expect(exec.code).toBe("project_timeline_memory_unavailable");
      expect(exec.message).not.toContain("/some/private/path");
    }
  });

  it("fails closed with no partial result when a snapshot cannot be read", async () => {
    const { store } = await threeCaptures();
    const broken: ProjectTimelineStore = {
      inspect: (p) => store.inspect(p),
      readManifest: (p) => store.readManifest(p),
      listSnapshots: (p) => store.listSnapshots(p),
      async readSnapshot() {
        throw new Error("corrupt record");
      },
      readEvidence: (p, e) => store.readEvidence(p, e),
      commitSnapshotBundle: () => {
        throw new Error("the timeline must never commit");
      },
    } as ProjectTimelineStore;
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => broken, clock: CLOCK },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_timeline_read_failed");
  });

  it("fails closed when the chronology carries no capture sequence", async () => {
    const { store } = await threeCaptures();
    const legacy: ProjectTimelineStore = {
      inspect: (p) => store.inspect(p),
      readManifest: (p) => store.readManifest(p),
      async listSnapshots(p) {
        // A pre-chronology store shape: ids only. There is no fallback.
        const summaries = await store.listSnapshots(p);
        return summaries.map((s) => ({ snapshotId: s.snapshotId, isLatest: s.isLatest }));
      },
      readSnapshot: (p, s) => store.readSnapshot(p, s),
      readEvidence: (p, e) => store.readEvidence(p, e),
      commitSnapshotBundle: () => {
        throw new Error("the timeline must never commit");
      },
    } as ProjectTimelineStore;
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => legacy, clock: CLOCK },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) expect(exec.code).toBe("project_timeline_read_failed");
  });

  it("reports a kernel failure without leaking a cause", async () => {
    const { store } = await threeCaptures();
    const kernel = {
      ...createNodeWasmProjectBrainKernelApi(),
      deriveProjectTimeline: () =>
        ({ ok: false, error: { code: "OMP-K-PB-1002", message: "injected" } }) as never,
    };
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, kernel, clock: CLOCK },
    );
    expect(exec.ok).toBe(false);
    if (!exec.ok) {
      expect(exec.code).toBe("project_timeline_kernel_unavailable");
      expect(exec.message).not.toContain("injected");
    }
  });

  it("never commits, even when the store would allow it", async () => {
    const { store, dataRoot } = await threeCaptures();
    let commits = 0;
    const watched: ProjectTimelineStore = {
      inspect: (p) => store.inspect(p),
      readManifest: (p) => store.readManifest(p),
      listSnapshots: (p) => store.listSnapshots(p),
      readSnapshot: (p, s) => store.readSnapshot(p, s),
      readEvidence: (p, e) => store.readEvidence(p, e),
      async commitSnapshotBundle(input) {
        commits += 1;
        return store.commitSnapshotBundle(input);
      },
    } as ProjectTimelineStore;
    const before = listFiles(dataRoot).sort();
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => watched, clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    expect(commits).toBe(0);
    expect(listFiles(dataRoot).sort()).toEqual(before);
  });

  it("creates no application-data directory when the root does not exist", async () => {
    const parent = tempDataRoot();
    const absent = join(parent, "not-created-yet");
    expect(existsSync(absent)).toBe(false);
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => realStore(absent), clock: CLOCK },
    );
    expect(exec.ok).toBe(true);
    expect(existsSync(absent)).toBe(false);
  });

  it("scrubs a planted secret sentinel from an optional display field", async () => {
    const secret = "ghp_UNIQUE_PLANTED_SENTINEL_9999";
    const dataRoot = tempDataRoot();
    const store = realStore(dataRoot);
    await capture(store, `# P\n## Next\n- A`, "2026-01-01T00:00:00.000Z");
    await capture(store, `# P\n## Next\n- A\n- ${secret}`, "2026-01-02T00:00:00.000Z");
    const exec = await runProjectTimeline(
      { projectId: PROJECT_ID },
      { storeFactory: () => store, clock: CLOCK, secretSentinels: [secret] },
    );
    expect(exec.ok).toBe(true);
    if (exec.ok) expect(JSON.stringify(exec.result)).not.toContain(secret);
  });
});
