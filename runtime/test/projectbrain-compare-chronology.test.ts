// v0.3 Phase 4.1 — Runtime default-compare chronology.
//
// The default comparison must compare the latest committed capture with the one
// committed IMMEDIATELY before it, using the memory port's capture chronology
// (listSnapshots, oldest first) — never a lexical id order. This suite captures
// four snapshots and wraps the port so the manifest inventory (snapshotIds) is
// lexically sorted while the chronology stays capture order; the default pair
// must still be the last two in CAPTURE order.

import { describe, expect, it } from "vitest";

import { createProjectBrainRuntime } from "../src/projectbrain/index.js";
import type {
  MemoryManifest,
  MemorySnapshotSummary,
  ProjectMemoryPort,
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

/** Capture one snapshot from a Markdown body; return its content-derived id. */
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

/**
 * Wrap a recording port so the manifest inventory (snapshotIds) is presented in
 * LEXICAL order while listSnapshots keeps the real capture (chronological)
 * order — exactly the mismatch the real store's v2 manifest exhibits. A default
 * compare that followed the inventory order would pick the wrong pair.
 */
function lexicalInventoryPort(
  base: RecordingMemoryPort,
  captureOrder: readonly string[],
): ProjectMemoryPort {
  return {
    async readManifest(projectId: string): Promise<MemoryManifest | null> {
      const manifest = await base.readManifest(projectId);
      if (manifest === null) return null;
      return { ...manifest, snapshotIds: [...manifest.snapshotIds].sort() };
    },
    async listSnapshots(projectId: string): Promise<MemorySnapshotSummary[]> {
      // Authoritative capture order, oldest first (as the real store returns).
      const latest = captureOrder[captureOrder.length - 1];
      return captureOrder.map((id) => ({ snapshotId: id, isLatest: id === latest }));
    },
    readSnapshot: (projectId, snapshotId) => base.readSnapshot(projectId, snapshotId),
    readEvidence: (projectId, evidenceId) => base.readEvidence(projectId, evidenceId),
    commitSnapshotBundle: (input) => base.commitSnapshotBundle(input),
  };
}

describe("default compare uses capture chronology, not lexical order", () => {
  it("selects the immediate predecessor across four snapshots with lexical mismatch", async () => {
    const memory = inMemoryMemoryPort();
    // Four captures with distinct bodies → four distinct content-derived ids.
    const order: string[] = [];
    order.push(await captureDoc(memory, "# P\n## Next\n- A", "2026-01-01T00:00:00Z"));
    order.push(await captureDoc(memory, "# P\n## Next\n- A\n- B", "2026-01-02T00:00:00Z"));
    order.push(await captureDoc(memory, "# P\n## Next\n- A\n- B\n- C", "2026-01-03T00:00:00Z"));
    order.push(
      await captureDoc(memory, "# P\n## Next\n- A\n- B\n- C\n- D", "2026-01-04T00:00:00Z"),
    );
    expect(new Set(order).size).toBe(4);

    // Confirm the lexical order genuinely differs from the capture order (else
    // the test would not exercise the invariant).
    const lexical = [...order].sort();
    expect(lexical).not.toEqual(order);

    const port = lexicalInventoryPort(memory, order);
    const runtime = createProjectBrainRuntime({
      kernel,
      memory: port,
      observation: scriptedObservationPort(new Map()),
      deriver: realDeriver,
    });
    const result = await runtime.compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy,
    });
    expect(result.status).toBe("compared");
    // current = last capture; previous = the immediately preceding capture.
    expect(result.currentSnapshotId).toBe(order[3]);
    expect(result.previousSnapshotId).toBe(order[2]);
  });

  it("explicit pair selection remains exact and unaffected by chronology", async () => {
    const memory = inMemoryMemoryPort();
    const order: string[] = [];
    order.push(await captureDoc(memory, "# P\n## Next\n- A", "2026-01-01T00:00:00Z"));
    order.push(await captureDoc(memory, "# P\n## Next\n- A\n- B", "2026-01-02T00:00:00Z"));
    order.push(await captureDoc(memory, "# P\n## Next\n- A\n- B\n- C", "2026-01-03T00:00:00Z"));

    const port = lexicalInventoryPort(memory, order);
    const runtime = createProjectBrainRuntime({
      kernel,
      memory: port,
      observation: scriptedObservationPort(new Map()),
      deriver: realDeriver,
    });
    // Explicitly compare the FIRST and THIRD captures (skipping the middle).
    const result = await runtime.compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      previousSnapshotId: order[0],
      currentSnapshotId: order[2],
      stalenessPolicy,
    });
    expect(result.status).toBe("compared");
    expect(result.previousSnapshotId).toBe(order[0]);
    expect(result.currentSnapshotId).toBe(order[2]);
  });

  it("fails safely when the chronology disagrees with the latest pointer", async () => {
    const memory = inMemoryMemoryPort();
    const order: string[] = [];
    order.push(await captureDoc(memory, "# P\n## Next\n- A", "2026-01-01T00:00:00Z"));
    order.push(await captureDoc(memory, "# P\n## Next\n- A\n- B", "2026-01-02T00:00:00Z"));

    // A port whose listSnapshots final entry contradicts manifest.latestSnapshotId.
    const contradictory: ProjectMemoryPort = {
      async readManifest(projectId) {
        const manifest = await memory.readManifest(projectId);
        return manifest === null ? null : { ...manifest, latestSnapshotId: order[0]! };
      },
      async listSnapshots() {
        // Final entry is order[1], but the manifest claims latest is order[0].
        return order.map((id) => ({ snapshotId: id, isLatest: id === order[1] }));
      },
      readSnapshot: (p, s) => memory.readSnapshot(p, s),
      readEvidence: (p, e) => memory.readEvidence(p, e),
      commitSnapshotBundle: (i) => memory.commitSnapshotBundle(i),
    };
    const runtime = createProjectBrainRuntime({
      kernel,
      memory: contradictory,
      observation: scriptedObservationPort(new Map()),
      deriver: realDeriver,
    });
    const result = await runtime.compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy,
    });
    expect(result.status).toBe("failed");
  });
});
