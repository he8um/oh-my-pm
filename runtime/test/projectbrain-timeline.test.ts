// v0.4 — the read-only Runtime Project Timeline query.
//
// Proves the query derives a bounded, deterministic timeline over real captured
// snapshots using the authoritative capture chronology, performs ZERO writes,
// makes no provider call, fails closed on every corruption condition, and never
// falls back to a lexical snapshot-id order or a timestamp comparison.

import { describe, expect, it } from "vitest";

import { createProjectBrainRuntime } from "../src/projectbrain/index.js";
import type {
  MemoryManifest,
  MemorySnapshotSummary,
  ProjectMemoryPort,
  ProjectObservationPort,
  ProjectStateDeriver,
  TimelineProjectResult,
} from "../src/projectbrain/index.js";
import {
  captureInput,
  inMemoryMemoryPort,
  markdownItem,
  markdownObservation,
  realDeriver,
  realKernel,
  scriptedObservationPort,
} from "./projectbrain-fixtures.js";
import type { RecordingMemoryPort, ScriptedObservation } from "./projectbrain-fixtures.js";

const kernel = realKernel();
const stalenessPolicy = { evidenceStaleAfterSeconds: 604_800, maxFutureSkewSeconds: 86_400 };

/** An observation port that fails closed: the timeline must never observe. */
const inertObservation: ProjectObservationPort = {
  async observe() {
    throw new Error("the timeline query must perform no observation");
  },
};

/** A deriver that fails closed: the timeline must never derive state. */
const inertDeriver: ProjectStateDeriver = {
  derive() {
    throw new Error("the timeline query must perform no state derivation");
  },
};

/** Capture one snapshot from a Markdown body. */
async function captureDoc(
  memory: RecordingMemoryPort,
  body: string,
  capturedAt: string,
): Promise<string> {
  const script = new Map<string, ScriptedObservation>([
    ["o1", { ok: true, items: [markdownItem("docs/status.md", body)] }],
  ]);
  const runtime = createProjectBrainRuntime({
    kernel,
    memory,
    observation: scriptedObservationPort(script),
    deriver: realDeriver,
  });
  const result = await runtime.capture(
    captureInput([markdownObservation("o1", "docs/status.md")], {
      capturedAt,
      observedAt: capturedAt,
    }),
  );
  expect(result.ok).toBe(true);
  return result.snapshotId!;
}

/** Run a timeline query with inert observation/deriver ports. */
function timeline(
  memory: ProjectMemoryPort,
  overrides: Record<string, unknown> = {},
): Promise<TimelineProjectResult> {
  const runtime = createProjectBrainRuntime({
    kernel,
    memory,
    observation: inertObservation,
    deriver: inertDeriver,
  });
  return runtime.timeline({
    requestId: "req-timeline",
    projectId: "proj-1",
    comparedAt: "2026-02-01T00:00:00Z",
    stalenessPolicy,
    ...overrides,
  });
}

/** Three captures with progressively changing task/risk content. */
async function threeCaptures(): Promise<RecordingMemoryPort> {
  const memory = inMemoryMemoryPort();
  await captureDoc(
    memory,
    "# Plan\n\n## Tasks\n\n- [ ] Ship the timeline\n\n## Risks\n\n- Scope creep is a risk\n",
    "2026-01-01T00:00:00Z",
  );
  await captureDoc(
    memory,
    "# Plan\n\n## Tasks\n\n- [x] Ship the timeline\n- [ ] Write the docs\n\n## Risks\n\n- Scope creep is a risk\n",
    "2026-01-02T00:00:00Z",
  );
  await captureDoc(
    memory,
    "# Plan\n\n## Tasks\n\n- [x] Ship the timeline\n- [x] Write the docs\n- [ ] Qualify the release\n\n## Risks\n\n- Scope creep is a risk\n- Windows shims are a blocker\n",
    "2026-01-03T00:00:00Z",
  );
  return memory;
}

describe("timeline — no history", () => {
  it("returns an empty valid timeline for an unknown project", async () => {
    const result = await timeline(inMemoryMemoryPort());
    expect(result.status).toBe("noPriorMemory");
    expect(result.result).toEqual({
      projectId: "proj-1",
      eventCount: 0,
      hasMore: false,
      events: [],
    });
    expect(result.error).toBeUndefined();
  });

  it("returns an empty valid timeline for a single committed snapshot", async () => {
    const memory = inMemoryMemoryPort();
    await captureDoc(memory, "# Plan\n\n- [ ] One task\n", "2026-01-01T00:00:00Z");
    const result = await timeline(memory);
    expect(result.status).toBe("derived");
    expect(result.result!.eventCount).toBe(0);
    expect(result.result!.hasMore).toBe(false);
    expect(result.result!.nextBeforeSequence).toBeUndefined();
  });

  it("produces no events when adjacent snapshots are identical", async () => {
    const memory = inMemoryMemoryPort();
    const body = "# Plan\n\n- [ ] One task\n";
    await captureDoc(memory, body, "2026-01-01T00:00:00Z");
    // An identical capture is idempotent in the store, so no second snapshot
    // exists and there is nothing to compare.
    await captureDoc(memory, body, "2026-01-01T00:00:00Z");
    const result = await timeline(memory);
    expect(result.status).toBe("derived");
    expect(result.result!.eventCount).toBe(0);
  });
});

describe("timeline — derivation over real captures", () => {
  it("derives events in authoritative capture order, newest capture first", async () => {
    const memory = await threeCaptures();
    const result = await timeline(memory);
    expect(result.status).toBe("derived");
    const events = result.result!.events;
    expect(events.length).toBeGreaterThan(0);
    // Capture sequences descend; within a capture, event sequences ascend.
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1]!;
      const next = events[i]!;
      if (prev.captureSequence === next.captureSequence) {
        expect(next.eventSequence).toBeGreaterThan(prev.eventSequence);
      } else {
        expect(next.captureSequence).toBeLessThan(prev.captureSequence);
      }
    }
    // Two comparisons over three captures: sequences 2 and 3 only (capture 1 has
    // no predecessor).
    const sequences = new Set(events.map((e) => e.captureSequence));
    expect([...sequences].sort()).toEqual([2, 3]);
  });

  it("attributes every event to its capture's snapshot id and timestamp", async () => {
    const memory = await threeCaptures();
    const summaries = await memory.listSnapshots("proj-1");
    const bySequence = new Map(summaries.map((s) => [s.sequence!, s]));
    const result = await timeline(memory);
    for (const event of result.result!.events) {
      const summary = bySequence.get(event.captureSequence)!;
      expect(event.snapshotId).toBe(summary.snapshotId);
      expect(event.capturedAt).toBe(summary.capturedAt);
      expect(event.projectId).toBe("proj-1");
    }
  });

  it("is deterministic and byte-stable across repeated queries", async () => {
    const memory = await threeCaptures();
    const a = await timeline(memory);
    const b = await timeline(memory);
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
  });

  it("exposes only the allow-listed event projection", async () => {
    const memory = await threeCaptures();
    const result = await timeline(memory);
    const serialized = JSON.stringify(result.result);
    for (const forbidden of [
      "evidenceRefs",
      "previousValue",
      "currentValue",
      "metadata",
      "contentFingerprint",
      "stateFingerprint",
      "sourceBoundaries",
      "/Users/",
      "/work/project",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // The evidence COUNT is present; the ids are not.
    for (const event of result.result!.events) {
      expect(Number.isInteger(event.evidenceCount)).toBe(true);
    }
  });
});

describe("timeline — filters and pagination", () => {
  it("filters by category deterministically", async () => {
    const memory = await threeCaptures();
    const all = await timeline(memory);
    const category = all.result!.events[0]!.category;
    const filtered = await timeline(memory, { category });
    expect(filtered.result!.events.length).toBeGreaterThan(0);
    for (const event of filtered.result!.events) {
      expect(event.category).toBe(category);
    }
  });

  it("filters by kind deterministically", async () => {
    const memory = await threeCaptures();
    const all = await timeline(memory);
    const kind = all.result!.events[0]!.kind;
    const filtered = await timeline(memory, { kind });
    for (const event of filtered.result!.events) {
      expect(event.kind).toBe(kind);
    }
  });

  it("combines category and kind as a conjunction", async () => {
    const memory = await threeCaptures();
    const all = await timeline(memory);
    const { category, kind } = all.result!.events[0]!;
    const filtered = await timeline(memory, { category, kind });
    for (const event of filtered.result!.events) {
      expect(event.category).toBe(category);
      expect(event.kind).toBe(kind);
    }
  });

  it("paginates with beforeSequence without duplicating or skipping", async () => {
    const memory = await threeCaptures();
    const full = await timeline(memory);
    const seen: string[] = [];
    let before: number | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await timeline(memory, {
        limit: 1,
        ...(before !== undefined ? { beforeSequence: before } : {}),
      });
      for (const event of page.result!.events) seen.push(event.eventId);
      if (!page.result!.hasMore) {
        expect(page.result!.nextBeforeSequence).toBeUndefined();
        break;
      }
      before = page.result!.nextBeforeSequence!;
    }
    expect(seen).toEqual(full.result!.events.map((e) => e.eventId));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("excludes captures at or above beforeSequence", async () => {
    const memory = await threeCaptures();
    const result = await timeline(memory, { beforeSequence: 3 });
    for (const event of result.result!.events) {
      expect(event.captureSequence).toBeLessThan(3);
    }
  });

  it("rejects an out-of-range limit as a controlled validation failure", async () => {
    const memory = await threeCaptures();
    for (const limit of [0, 101, 1.5]) {
      const result = await timeline(memory, { limit });
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("OMP-R-PB-6001");
      expect(result.result).toBeUndefined();
    }
  });

  it("rejects a negative beforeSequence", async () => {
    const memory = await threeCaptures();
    const result = await timeline(memory, { beforeSequence: -1 });
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6001");
  });

  it("rejects a malformed project id", async () => {
    const memory = await threeCaptures();
    const result = await timeline(memory, { projectId: "" });
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6001");
  });
});

describe("timeline — read-only guarantees", () => {
  it("performs zero writes", async () => {
    const memory = await threeCaptures();
    const commitsBefore = memory.commits.length;
    const snapshotsBefore = memory.snapshotStore.size;
    const evidenceBefore = memory.evidenceStore.size;
    await timeline(memory);
    await timeline(memory, { limit: 1 });
    await timeline(memory, { category: "added" });
    expect(memory.commits.length).toBe(commitsBefore);
    expect(memory.snapshotStore.size).toBe(snapshotsBefore);
    expect(memory.evidenceStore.size).toBe(evidenceBefore);
  });

  it("makes no provider call and performs no state derivation", async () => {
    // The inert ports throw if reached; a successful query proves neither ran.
    const memory = await threeCaptures();
    const result = await timeline(memory);
    expect(result.status).toBe("derived");
  });

  it("calls only read methods on the memory port", async () => {
    const memory = await threeCaptures();
    const called: string[] = [];
    const watched: ProjectMemoryPort = {
      readManifest: (p) => {
        called.push("readManifest");
        return memory.readManifest(p);
      },
      listSnapshots: (p) => {
        called.push("listSnapshots");
        return memory.listSnapshots(p);
      },
      readSnapshot: (p, s) => {
        called.push("readSnapshot");
        return memory.readSnapshot(p, s);
      },
      readEvidence: (p, e) => {
        called.push("readEvidence");
        return memory.readEvidence(p, e);
      },
      commitSnapshotBundle: () => {
        called.push("commitSnapshotBundle");
        throw new Error("the timeline query must never commit");
      },
    };
    const result = await timeline(watched);
    expect(result.status).toBe("derived");
    expect(called).not.toContain("commitSnapshotBundle");
    expect(new Set(called)).toEqual(
      new Set(["readManifest", "listSnapshots", "readSnapshot", "readEvidence"]),
    );
  });
});

describe("timeline — fail-closed corruption behavior", () => {
  /** Wrap a port, overriding selected reads. */
  function corrupt(
    memory: RecordingMemoryPort,
    overrides: Partial<ProjectMemoryPort>,
  ): ProjectMemoryPort {
    return {
      readManifest: (p) => memory.readManifest(p),
      listSnapshots: (p) => memory.listSnapshots(p),
      readSnapshot: (p, s) => memory.readSnapshot(p, s),
      readEvidence: (p, e) => memory.readEvidence(p, e),
      commitSnapshotBundle: (i) => memory.commitSnapshotBundle(i),
      ...overrides,
    };
  }

  it("fails closed when a manifest-referenced snapshot cannot be read", async () => {
    const memory = await threeCaptures();
    const result = await timeline(
      corrupt(memory, {
        async readSnapshot() {
          throw new Error("snapshot missing");
        },
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6009");
    expect(result.result).toBeUndefined();
  });

  it("fails closed when a referenced evidence record cannot be read", async () => {
    const memory = await threeCaptures();
    const result = await timeline(
      corrupt(memory, {
        async readEvidence() {
          throw new Error("evidence missing");
        },
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6009");
  });

  it("fails closed when the manifest itself cannot be read", async () => {
    const memory = await threeCaptures();
    const result = await timeline(
      corrupt(memory, {
        async readManifest() {
          throw new Error("manifest corrupt");
        },
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.result).toBeUndefined();
  });

  it("fails closed when the store exposes no authoritative capture chronology", async () => {
    const memory = await threeCaptures();
    const result = await timeline(
      corrupt(memory, {
        async listSnapshots(p): Promise<MemorySnapshotSummary[]> {
          // A pre-chronology store shape: ids only. There is NO fallback to a
          // lexical id order and NO fallback to timestamps.
          const summaries = await memory.listSnapshots(p);
          return summaries.map((s) => ({ snapshotId: s.snapshotId, isLatest: s.isLatest }));
        },
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6009");
    expect(result.result).toBeUndefined();
  });

  it("fails closed when the chronology is not strictly ascending", async () => {
    const memory = await threeCaptures();
    const result = await timeline(
      corrupt(memory, {
        async listSnapshots(p): Promise<MemorySnapshotSummary[]> {
          return [...(await memory.listSnapshots(p))].reverse();
        },
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6009");
  });

  it("fails closed when the chronology disagrees with the latest pointer", async () => {
    const memory = await threeCaptures();
    const result = await timeline(
      corrupt(memory, {
        async readManifest(p): Promise<MemoryManifest | null> {
          const manifest = await memory.readManifest(p);
          if (manifest === null) return null;
          return { ...manifest, latestSnapshotId: "snapshot-that-does-not-exist" };
        },
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6009");
  });

  it("fails closed when the Kernel diff fails, with no partial timeline", async () => {
    const memory = await threeCaptures();
    const failingKernel = {
      ...kernel,
      diffProjectSnapshots: () =>
        ({ ok: false, error: { code: "OMP-K-PB-1004", message: "injected" } }) as never,
    };
    const runtime = createProjectBrainRuntime({
      kernel: failingKernel,
      memory,
      observation: inertObservation,
      deriver: inertDeriver,
    });
    const result = await runtime.timeline({
      requestId: "req-timeline",
      projectId: "proj-1",
      comparedAt: "2026-02-01T00:00:00Z",
      stalenessPolicy,
    });
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("OMP-R-PB-6003");
    expect(result.result).toBeUndefined();
  });

  it("emits a sanitized trace on failure with no raw cause", async () => {
    const memory = await threeCaptures();
    const result = await timeline(
      corrupt(memory, {
        async readSnapshot() {
          throw new Error("/Users/someone/secret/path leaked");
        },
      }),
    );
    expect(result.status).toBe("failed");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("secret");
    expect(result.trace.some((entry) => entry.status === "fail")).toBe(true);
  });
});

describe("timeline — chronology is authoritative, not lexical", () => {
  it("uses capture order even when the manifest inventory is lexically sorted", async () => {
    const memory = await threeCaptures();
    const chronological = (await memory.listSnapshots("proj-1")).map((s) => s.snapshotId);
    const wrapped: ProjectMemoryPort = {
      async readManifest(p) {
        const manifest = await memory.readManifest(p);
        if (manifest === null) return null;
        // The real v2 manifest keeps snapshotIds as a lexically sorted
        // inventory; the chronology lives in listSnapshots.
        return { ...manifest, snapshotIds: [...manifest.snapshotIds].sort() };
      },
      listSnapshots: (p) => memory.listSnapshots(p),
      readSnapshot: (p, s) => memory.readSnapshot(p, s),
      readEvidence: (p, e) => memory.readEvidence(p, e),
      commitSnapshotBundle: (i) => memory.commitSnapshotBundle(i),
    };
    const result = await timeline(wrapped);
    expect(result.status).toBe("derived");
    // Events reference only the two newest captures in CAPTURE order.
    const referenced = new Set(result.result!.events.map((e) => e.snapshotId));
    expect(referenced.has(chronological[0]!)).toBe(false);
    for (const id of referenced) {
      expect([chronological[1], chronological[2]]).toContain(id);
    }
  });

  it("orders by capture sequence, not by capturedAt, when timestamps collide", async () => {
    const memory = await threeCaptures();
    const collided: ProjectMemoryPort = {
      readManifest: (p) => memory.readManifest(p),
      async listSnapshots(p): Promise<MemorySnapshotSummary[]> {
        // Every capture reports the SAME timestamp; only the sequence differs.
        return (await memory.listSnapshots(p)).map((s) => ({
          ...s,
          capturedAt: "2026-01-01T00:00:00Z",
        }));
      },
      readSnapshot: (p, s) => memory.readSnapshot(p, s),
      readEvidence: (p, e) => memory.readEvidence(p, e),
      commitSnapshotBundle: (i) => memory.commitSnapshotBundle(i),
    };
    const result = await timeline(collided);
    expect(result.status).toBe("derived");
    const sequences = result.result!.events.map((e) => e.captureSequence);
    // Still strictly non-increasing despite identical timestamps.
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]!).toBeLessThanOrEqual(sequences[i - 1]!);
    }
  });
});
