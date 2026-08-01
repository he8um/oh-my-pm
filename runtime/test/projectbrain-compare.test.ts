import { describe, expect, it } from "vitest";

import {
  createProjectBrainRuntime,
  PROJECT_BRAIN_RUNTIME_ERROR_CODES,
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
import type { RecordingMemoryPort } from "./projectbrain-fixtures.js";
import type { ScriptedObservation } from "./projectbrain-fixtures.js";

const kernel = realKernel();

const stalenessPolicy = { evidenceStaleAfterSeconds: 604_800, maxFutureSkewSeconds: 86_400 };

function runtime(memory: RecordingMemoryPort, script: ReadonlyMap<string, ScriptedObservation>) {
  return createProjectBrainRuntime({
    kernel,
    memory,
    observation: scriptedObservationPort(script),
    deriver: realDeriver,
  });
}

/** Capture one snapshot from a Markdown body into the given memory. */
async function captureDoc(
  memory: RecordingMemoryPort,
  body: string,
  capturedAt: string,
): Promise<void> {
  const script = new Map<string, ScriptedObservation>([
    ["o1", { ok: true, items: [markdownItem("docs/status.md", body)] }],
  ]);
  const result = await runtime(memory, script).capture(
    captureInput([markdownObservation("o1", "docs/status.md")], {
      capturedAt,
      observedAt: capturedAt,
    }),
  );
  expect(result.ok).toBe(true);
}

describe("compare — no history", () => {
  it("returns noPriorMemory when no store exists", async () => {
    const memory = inMemoryMemoryPort();
    const result = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy,
    });
    expect(result.status).toBe("noPriorMemory");
  });

  it("returns insufficientHistory with only one snapshot", async () => {
    const memory = inMemoryMemoryPort();
    await captureDoc(memory, "# P\n## Next\n- A", "2026-01-11T00:00:00Z");
    const result = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy,
    });
    expect(result.status).toBe("insufficientHistory");
  });
});

describe("compare — selection and diff", () => {
  it("compares the latest two snapshots deterministically and writes nothing", async () => {
    const memory = inMemoryMemoryPort();
    await captureDoc(
      memory,
      "# P\n## Next\n- Wire the API\n## Risks\n- Timeline tight",
      "2026-01-11T00:00:00Z",
    );
    await captureDoc(
      memory,
      "# P\n## Next\n- Wire the API\n- Add tests\n## Risks\n- Timeline tight\n## Blockers\n- Auth down",
      "2026-01-12T00:00:00Z",
    );
    const commitsBefore = memory.commits.length;
    const result = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy,
    });
    expect(result.status).toBe("compared");
    expect(result.changeSet).toBeDefined();
    expect(result.changeSet!.changes.length).toBeGreaterThan(0);
    // Determinism: a repeat compare yields a deep-equal result.
    const again = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy,
    });
    expect(again).toEqual(result);
    // Compare performs no write.
    expect(memory.commits.length).toBe(commitsBefore);
  });

  it("compares an explicit snapshot pair", async () => {
    const memory = inMemoryMemoryPort();
    await captureDoc(memory, "# P\n## Next\n- A", "2026-01-11T00:00:00Z");
    await captureDoc(memory, "# P\n## Next\n- A\n- B", "2026-01-12T00:00:00Z");
    const manifest = await memory.readManifest("proj-1");
    const [previousSnapshotId, currentSnapshotId] = manifest!.snapshotIds;
    const result = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      previousSnapshotId,
      currentSnapshotId,
      stalenessPolicy,
    });
    expect(result.status).toBe("compared");
    expect(result.previousSnapshotId).toBe(previousSnapshotId);
    expect(result.currentSnapshotId).toBe(currentSnapshotId);
  });

  it("rejects an invalid explicit selection (same id)", async () => {
    const memory = inMemoryMemoryPort();
    await captureDoc(memory, "# P\n## Next\n- A", "2026-01-11T00:00:00Z");
    const manifest = await memory.readManifest("proj-1");
    const id = manifest!.snapshotIds[0]!;
    const result = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      previousSnapshotId: id,
      currentSnapshotId: id,
      stalenessPolicy,
    });
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(PROJECT_BRAIN_RUNTIME_ERROR_CODES.invalidInput);
  });

  it("rejects an explicit selection referencing an unknown snapshot", async () => {
    const memory = inMemoryMemoryPort();
    await captureDoc(memory, "# P\n## Next\n- A", "2026-01-11T00:00:00Z");
    await captureDoc(memory, "# P\n## Next\n- A\n- B", "2026-01-12T00:00:00Z");
    const manifest = await memory.readManifest("proj-1");
    const result = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      previousSnapshotId: manifest!.snapshotIds[0]!,
      currentSnapshotId: "snapshot:sha256:deadbeef",
      stalenessPolicy,
    });
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(PROJECT_BRAIN_RUNTIME_ERROR_CODES.invalidInput);
  });
});

describe("compare — corruption", () => {
  it("fails safely when a referenced evidence record is missing", async () => {
    const memory = inMemoryMemoryPort();
    await captureDoc(memory, "# P\n## Risks\n- Timeline tight", "2026-01-11T00:00:00Z");
    await captureDoc(
      memory,
      "# P\n## Risks\n- Timeline tight\n- Budget cut",
      "2026-01-12T00:00:00Z",
    );
    // Corrupt the store by deleting one evidence record.
    const evidenceId = [...memory.evidenceStore.keys()][0]!;
    memory.evidenceStore.delete(evidenceId);
    const result = await runtime(memory, new Map()).compare({
      requestId: "c1",
      projectId: "proj-1",
      comparedAt: "2026-01-20T00:00:00Z",
      stalenessPolicy,
    });
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(PROJECT_BRAIN_RUNTIME_ERROR_CODES.storedRecordReadFailed);
  });
});
