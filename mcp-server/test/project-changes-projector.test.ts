// v0.3 Phase 5 — project_changes strict projector tests.
//
// The projector is pure: it maps a Kernel ChangeSet to the bounded, sanitized
// public result. These tests assert allowlist extraction (title/status/severity/
// dueDate/evidenceCount), omission/rejection of every unsafe or forbidden field,
// complete twelve-category counts, preserved Kernel order, bounded truncation,
// and Markdown escaping.

import type { CanonicalStateItem, ChangeSet, StateChange } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  CHANGE_COUNT_ORDER,
  countByCategory,
  findForbiddenMarker,
  noHistoryResult,
  projectComparedResult,
  projectStateChange,
  renderProjectChangesMarkdown,
} from "../src/project-changes-projector.js";

function item(over: Partial<CanonicalStateItem> = {}): CanonicalStateItem {
  return {
    kind: "task",
    id: "task-1",
    title: "Do the thing",
    evidenceRefs: ["ev-1"],
    ...over,
  };
}

function change(over: Partial<StateChange> = {}): StateChange {
  return {
    category: "added",
    itemKind: "task",
    itemId: "task-1",
    evidenceRefs: ["ev-1"],
    ...over,
  };
}

function changeSet(changes: StateChange[]): ChangeSet {
  return {
    projectId: "p",
    previousSnapshotId: "snapshot:prev",
    currentSnapshotId: "snapshot:curr",
    comparedAt: "2026-02-01T00:00:00.000Z",
    changes,
    schemaVersion: 1,
  };
}

describe("projectStateChange — categories and kinds", () => {
  const CATEGORIES = [
    "added",
    "removed",
    "modified",
    "resolved",
    "reopened",
    "becameOverdue",
    "noLongerOverdue",
    "severityIncreased",
    "severityDecreased",
    "fresh",
    "stale",
    "evidenceChanged",
  ] as const;

  it("projects every one of the twelve categories", () => {
    for (const category of CATEGORIES) {
      const projected = projectStateChange(change({ category }));
      expect(projected).not.toBeNull();
      expect(projected!.category).toBe(category);
    }
  });

  it("projects every one of the six item kinds", () => {
    for (const itemKind of [
      "milestone",
      "task",
      "risk",
      "decision",
      "dependency",
      "blocker",
    ] as const) {
      const projected = projectStateChange(change({ itemKind }));
      expect(projected!.itemKind).toBe(itemKind);
    }
  });

  it("drops a change with an unknown category or kind", () => {
    expect(projectStateChange(change({ category: "bogus" as never }))).toBeNull();
    expect(projectStateChange(change({ itemKind: "epic" as never }))).toBeNull();
  });

  it("drops a change with an unsafe required item id", () => {
    expect(projectStateChange(change({ itemId: "" }))).toBeNull();
    expect(projectStateChange(change({ itemId: "badid" }))).toBeNull();
    expect(projectStateChange(change({ itemId: "x".repeat(300) }))).toBeNull();
  });
});

describe("projectStateChange — allowlist extraction", () => {
  it("extracts title, status, severity, dueDate, and evidenceCount only", () => {
    const projected = projectStateChange(
      change({
        category: "modified",
        itemKind: "risk",
        itemId: "risk-9",
        evidenceRefs: ["ev-1", "ev-2", "ev-3"],
        previousValue: item({
          kind: "risk",
          id: "risk-9",
          title: "Budget",
          status: "open",
          severity: "low",
          dueDate: "2026-03-01",
          owner: "alice",
          priority: "high",
          metadata: { classification: "secret-meta" },
        }),
        currentValue: item({
          kind: "risk",
          id: "risk-9",
          title: "Budget",
          status: "mitigating",
          severity: "high",
          dueDate: "2026-04-01",
        }),
      }),
    );
    expect(projected).toEqual({
      category: "modified",
      itemKind: "risk",
      itemId: "risk-9",
      title: "Budget",
      previousStatus: "open",
      currentStatus: "mitigating",
      previousSeverity: "low",
      currentSeverity: "high",
      previousDueDate: "2026-03-01",
      currentDueDate: "2026-04-01",
      evidenceCount: 3,
    });
    // Never carries owner, priority, metadata, evidenceRefs, or structured values.
    const json = JSON.stringify(projected);
    for (const forbidden of [
      "owner",
      "priority",
      "metadata",
      "evidenceRefs",
      "classification",
      "secret-meta",
      "alice",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("omits an optional display field that is unsafe or looks like a path", () => {
    const projected = projectStateChange(
      change({
        currentValue: item({
          title: "/Users/x/secret/plan.md", // absolute-path-like → omitted
          status: "badstatus", // control char → omitted
          severity: "x".repeat(200), // over bound → omitted
        }),
      }),
    );
    expect(projected!.title).toBeUndefined();
    expect(projected!.currentStatus).toBeUndefined();
    expect(projected!.currentSeverity).toBeUndefined();
  });

  it("scrubs a planted secret sentinel from an optional display field", () => {
    const projected = projectStateChange(
      change({ currentValue: item({ title: "See ghp_PLANTEDSECRET now" }) }),
      ["ghp_PLANTEDSECRET"],
    );
    expect(projected!.title).toBeUndefined();
  });

  it("keeps an ordinary title that merely contains the word token", () => {
    const projected = projectStateChange(
      change({ currentValue: item({ title: "Rotate the API token" }) }),
    );
    expect(projected!.title).toBe("Rotate the API token");
  });
});

describe("countByCategory", () => {
  it("returns complete counts for all twelve categories in stable order", () => {
    const counts = countByCategory([
      change({ category: "added" }),
      change({ category: "added" }),
      change({ category: "removed" }),
      change({ category: "evidenceChanged" }),
    ]);
    expect(Object.keys(counts)).toEqual([...CHANGE_COUNT_ORDER]);
    expect(counts.added).toBe(2);
    expect(counts.removed).toBe(1);
    expect(counts.evidenceChanged).toBe(1);
    expect(counts.modified).toBe(0);
  });
});

describe("projectComparedResult — order, limits, truncation", () => {
  it("preserves the exact Kernel order (never reorders by category)", () => {
    const result = projectComparedResult(
      changeSet([
        change({ category: "removed", itemId: "a" }),
        change({ category: "added", itemId: "b" }),
        change({ category: "modified", itemId: "c" }),
      ]),
      "p",
      "snapshot:prev",
      "snapshot:curr",
      50,
    );
    expect(result.changes.map((c) => c.itemId)).toEqual(["a", "b", "c"]);
  });

  it("bounds the changes array by limit and reports truncation", () => {
    const changes = Array.from({ length: 10 }, (_v, i) => change({ itemId: `task-${i}` }));
    const limited = projectComparedResult(
      changeSet(changes),
      "p",
      "snapshot:prev",
      "snapshot:curr",
      1,
    );
    expect(limited.changes).toHaveLength(1);
    expect(limited.summary.totalChanges).toBe(10);
    expect(limited.summary.returnedChanges).toBe(1);
    expect(limited.summary.truncated).toBe(true);
    // Counts always cover the FULL set, not the bounded prefix.
    expect(limited.summary.countsByCategory.added).toBe(10);

    const full = projectComparedResult(
      changeSet(changes),
      "p",
      "snapshot:prev",
      "snapshot:curr",
      100,
    );
    expect(full.changes).toHaveLength(10);
    expect(full.summary.truncated).toBe(false);
  });

  it("clamps a limit above the hard maximum to 100", () => {
    const changes = Array.from({ length: 120 }, (_v, i) => change({ itemId: `task-${i}` }));
    const result = projectComparedResult(
      changeSet(changes),
      "p",
      "snapshot:prev",
      "snapshot:curr",
      100,
    );
    expect(result.changes).toHaveLength(100);
    expect(result.summary.truncated).toBe(true);
  });
});

describe("no-history results", () => {
  it("emits empty, non-error controlled results", () => {
    for (const status of ["noPriorMemory", "insufficientHistory"] as const) {
      const result = noHistoryResult(status, "p");
      expect(result.status).toBe(status);
      expect(result.changes).toEqual([]);
      expect(result.summary).toEqual({
        totalChanges: 0,
        returnedChanges: 0,
        truncated: false,
        countsByCategory: countByCategory([]),
      });
    }
  });
});

describe("Markdown rendering", () => {
  it("escapes table delimiters in cells (a control-char title is omitted upstream)", () => {
    const result = projectComparedResult(
      changeSet([
        // itemId is a required field: pipes are escaped in the cell. A title
        // containing a Markdown pipe (no control char) is kept and escaped.
        change({ itemId: "id|with|pipes", currentValue: item({ title: "title | with pipe" }) }),
      ]),
      "p",
      "snapshot:prev",
      "snapshot:curr",
      50,
    );
    const md = renderProjectChangesMarkdown(result);
    expect(md).toContain("id\\|with\\|pipes");
    expect(md).toContain("title \\| with pipe");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("omits a title that carries a control character (never escaped into a cell)", () => {
    const projected = projectStateChange(change({ currentValue: item({ title: "line1\nline2" }) }));
    expect(projected!.title).toBeUndefined();
  });

  it("renders a short fixed body for no-history statuses", () => {
    const md = renderProjectChangesMarkdown(noHistoryResult("insufficientHistory", "p"));
    expect(md).toContain("Insufficient history");
    expect(md).not.toContain("| Category |");
  });
});

describe("findForbiddenMarker", () => {
  it("flags structural leak markers but not ordinary text", () => {
    expect(findForbiddenMarker('{"previousValue":1}')).toBe("previousValue");
    expect(findForbiddenMarker('{"trace":[]}')).toBe('"trace"');
    expect(findForbiddenMarker("a clean title about traceability")).toBeNull();
  });
});
