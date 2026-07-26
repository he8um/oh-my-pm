import { describe, expect, it } from "vitest";
import type { CompareProjectResult } from "@oh-my-pm/runtime";
import {
  MCP_PROJECT_CHANGE_CATEGORIES,
  projectCompareResult,
  renderProjectChangesMarkdown,
} from "./index.js";

const PREVIOUS = `snapshot:${"a".repeat(64)}`;
const CURRENT = `snapshot:${"b".repeat(64)}`;

function compared(changes: unknown[]): CompareProjectResult {
  return {
    requestId: "request",
    status: "compared",
    projectId: "project",
    previousSnapshotId: PREVIOUS,
    currentSnapshotId: CURRENT,
    changeSet: {
      projectId: "project",
      previousSnapshotId: PREVIOUS,
      currentSnapshotId: CURRENT,
      comparedAt: "2026-01-01T00:00:00.000Z",
      schemaVersion: 1,
      changes,
    } as never,
    trace: [],
  };
}

describe("project changes projector", () => {
  it("covers all categories, preserves Kernel order, and computes complete counts", () => {
    const changes = MCP_PROJECT_CHANGE_CATEGORIES.map((category, index) => ({
      category,
      itemKind: "task",
      itemId: `task-${index}`,
      evidenceRefs: [`evidence-${index}`, `evidence-${index}`],
      previousValue: {
        kind: "task",
        id: `task-${index}`,
        title: "Old",
        status: "open",
        severity: "low",
        dueDate: "2026-01-01",
        evidenceRefs: [],
        metadata: { body: "PRIVATE" },
        owner: "PRIVATE",
      },
      currentValue: {
        kind: "task",
        id: `task-${index}`,
        title: `Title ${index}`,
        status: "done",
        severity: "high",
        dueDate: "2026-02-01",
        evidenceRefs: [],
      },
    }));
    const result = projectCompareResult(compared(changes), 100)!;
    expect(result.changes.map((change) => change.category)).toEqual(
      MCP_PROJECT_CHANGE_CATEGORIES,
    );
    expect(result.summary.totalChanges).toBe(12);
    expect(result.summary.returnedChanges).toBe(12);
    expect(result.summary.truncated).toBe(false);
    expect(Object.keys(result.summary.countsByCategory)).toEqual(
      MCP_PROJECT_CHANGE_CATEGORIES,
    );
    expect(Object.values(result.summary.countsByCategory)).toEqual(Array(12).fill(1));
    expect(result.changes[0]).toMatchObject({
      title: "Title 0",
      previousStatus: "open",
      currentStatus: "done",
      previousSeverity: "low",
      currentSeverity: "high",
      previousDueDate: "2026-01-01",
      currentDueDate: "2026-02-01",
      evidenceCount: 1,
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "previousValue",
      "currentValue",
      "evidenceRefs",
      "metadata",
      "owner",
      "PRIVATE",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("applies only the bounded prefix and omits unsafe optional strings", () => {
    const result = projectCompareResult(
      compared([
        {
          category: "modified",
          itemKind: "task",
          itemId: "task-1",
          evidenceRefs: [],
          currentValue: {
            kind: "task",
            id: "task-1",
            title: "SECRET-SENTINEL",
            status: "bad\u0000status",
            severity: "x".repeat(65),
            dueDate: "/tmp/private",
            evidenceRefs: [],
          },
        },
        {
          category: "added",
          itemKind: "risk",
          itemId: "risk-2",
          evidenceRefs: [],
          currentValue: {
            kind: "risk",
            id: "risk-2",
            title: "Second",
            evidenceRefs: [],
          },
        },
      ]),
      1,
      ["SECRET-SENTINEL"],
    )!;
    expect(result.summary).toMatchObject({
      totalChanges: 2,
      returnedChanges: 1,
      truncated: true,
    });
    expect(result.changes[0]).toEqual({
      category: "modified",
      itemKind: "task",
      itemId: "task-1",
      evidenceCount: 0,
    });
  });

  it("renders deterministic escaped, newline-terminated Markdown", () => {
    const result = projectCompareResult(
      compared([
        {
          category: "added",
          itemKind: "task",
          itemId: "task|1",
          evidenceRefs: [],
          currentValue: {
            kind: "task",
            id: "task|1",
            title: "Line | one",
            evidenceRefs: [],
          },
        },
      ]),
      50,
    )!;
    const markdown = renderProjectChangesMarkdown(result);
    expect(markdown).toContain("task\\|1");
    expect(markdown).toContain("Line \\| one");
    expect(markdown.endsWith("\n")).toBe(true);
  });
});
