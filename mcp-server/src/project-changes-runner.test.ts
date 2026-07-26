import { describe, expect, it, vi } from "vitest";
import type { ProjectBrainRuntime } from "@oh-my-pm/runtime";
import { createProjectChangesExecutor } from "./project-changes-runner.js";

function runtimeResult(status: "noPriorMemory" | "insufficientHistory"): ProjectBrainRuntime {
  return {
    capture: vi.fn(),
    compare: vi.fn(async (input) => ({
      requestId: input.requestId,
      status,
      projectId: input.projectId,
      trace: [],
    })),
  };
}

describe("project changes runner", () => {
  it.each(["noPriorMemory", "insufficientHistory"] as const)(
    "returns controlled %s with zero changes",
    async (status) => {
      const clock = vi.fn(() => "2026-07-26T12:00:00.000Z");
      const execute = createProjectChangesExecutor({
        clock,
        dataRootOverride: "/tmp/unused-project-changes-test",
        runtime: runtimeResult(status),
      });
      const result = await execute({ projectId: "project" });
      expect(result).toMatchObject({
        ok: true,
        result: {
          status,
          chronology: "capture-order",
          changes: [],
          summary: {
            totalChanges: 0,
            returnedChanges: 0,
            truncated: false,
          },
        },
      });
      expect(clock).toHaveBeenCalledTimes(1);
    },
  );

  it("forwards an exact explicit pair, limit policy, and one clock value", async () => {
    const previousSnapshotId = `snapshot:${"a".repeat(64)}`;
    const currentSnapshotId = `snapshot:${"b".repeat(64)}`;
    const compare = vi.fn(async (input) => ({
      requestId: input.requestId,
      status: "compared" as const,
      projectId: input.projectId,
      previousSnapshotId,
      currentSnapshotId,
      changeSet: {
        projectId: input.projectId,
        previousSnapshotId,
        currentSnapshotId,
        comparedAt: input.comparedAt,
        schemaVersion: 1,
        changes: [],
      },
      trace: [],
    }));
    const runtime: ProjectBrainRuntime = { capture: vi.fn(), compare };
    const clock = vi.fn(() => "2026-07-26T12:00:00.000Z");
    const execute = createProjectChangesExecutor({
      clock,
      dataRootOverride: "/tmp/unused-project-changes-test",
      runtime,
    });
    const result = await execute({
      projectId: "project",
      previousSnapshotId,
      currentSnapshotId,
      staleAfterSeconds: 0,
      limit: 1,
    });
    expect(result.ok).toBe(true);
    expect(compare).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        previousSnapshotId,
        currentSnapshotId,
        comparedAt: "2026-07-26T12:00:00.000Z",
        stalenessPolicy: {
          evidenceStaleAfterSeconds: 0,
          maxFutureSkewSeconds: 0,
        },
      }),
    );
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input before reading the clock or Runtime", async () => {
    const clock = vi.fn(() => "2026-07-26T12:00:00.000Z");
    const runtime = runtimeResult("noPriorMemory");
    const execute = createProjectChangesExecutor({
      clock,
      dataRootOverride: "/tmp/unused-project-changes-test",
      runtime,
    });
    const result = await execute({ projectId: "/tmp/project" });
    expect(result).toMatchObject({ ok: false, code: "project_changes_invalid_input" });
    expect(clock).not.toHaveBeenCalled();
    expect(runtime.compare).not.toHaveBeenCalled();
  });

  it.each([
    ["migrationRequired", [], "project_changes_migration_required"],
    ["unsupportedNewer", [], "project_changes_unsupported_store"],
    ["incompatibleSchema", [], "project_changes_incompatible_schema"],
    [
      "supported",
      [{ kind: "integrityFailure", detail: "manifest integrity" }],
      "project_changes_store_corrupt",
    ],
  ] as const)(
    "maps %s inspection to %s without constructing the Kernel",
    async (versionState, issues, expectedCode) => {
      const store = {
        inspect: vi.fn(async () => ({
          projectId: "project",
          exists: true,
          versionState,
          storeFormatVersion: 2,
          projectBrainSchemaVersion: 1,
          snapshotCount: 2,
          evidenceCount: 0,
          latestSnapshotId: `snapshot:${"b".repeat(64)}`,
          issues,
        })),
      };
      const kernelAvailable = vi.fn(() => true);
      const execute = createProjectChangesExecutor({
        clock: () => "2026-07-26T12:00:00.000Z",
        store: store as never,
        kernelAvailable,
      });
      const result = await execute({ projectId: "project" });
      expect(result).toMatchObject({ ok: false, code: expectedCode });
      expect(kernelAvailable).not.toHaveBeenCalled();
    },
  );
});
