import { describe, expect, it } from "vitest";

import {
  PROJECT_BRAIN_SCHEMA_VERSION,
  type ChangeCategory,
  type StateItemKind,
  type TimelineEvent,
  type TimelineQuery,
  type TimelineResult,
} from "../src/index.js";

// The v0.4 timeline contracts reuse the v0.3 Project Brain schema version; the
// schema is NOT bumped by adding a derived, non-persisted projection.
const V = PROJECT_BRAIN_SCHEMA_VERSION;

/** The exact ChangeSet taxonomy the timeline reuses — no second taxonomy. */
const CATEGORIES: readonly ChangeCategory[] = [
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
];

const KINDS: readonly StateItemKind[] = [
  "milestone",
  "task",
  "risk",
  "decision",
  "dependency",
  "blocker",
];

/** A complete event exercising every allow-listed field. */
const fullEvent: TimelineEvent = {
  eventId: `event:sha256:${"a".repeat(64)}`,
  projectId: "pb_explicit_project",
  snapshotId: "snap_0002",
  captureSequence: 2,
  eventSequence: 0,
  capturedAt: "2026-07-25T00:00:00Z",
  category: "severityIncreased",
  kind: "risk",
  subjectId: "risk_0001",
  evidenceCount: 3,
  title: "Timeline slip",
  status: "open",
  severity: "high",
  dueDate: "2026-09-01",
};

/** A minimal event: only the required fields, no optional presentation values. */
const minimalEvent: TimelineEvent = {
  eventId: `event:sha256:${"b".repeat(64)}`,
  projectId: "pb_explicit_project",
  snapshotId: "snap_0003",
  captureSequence: 3,
  eventSequence: 1,
  capturedAt: "2026-07-26T00:00:00Z",
  category: "evidenceChanged",
  kind: "decision",
  subjectId: "dec_0001",
  evidenceCount: 0,
};

const minimalQuery: TimelineQuery = { projectId: "pb_explicit_project" };

const fullQuery: TimelineQuery = {
  projectId: "pb_explicit_project",
  limit: 50,
  beforeSequence: 9,
  category: "added",
  kind: "task",
};

const pagedResult: TimelineResult = {
  projectId: "pb_explicit_project",
  eventCount: 2,
  hasMore: true,
  nextBeforeSequence: 2,
  events: [minimalEvent, fullEvent],
};

const emptyResult: TimelineResult = {
  projectId: "pb_explicit_project",
  eventCount: 0,
  hasMore: false,
  events: [],
};

const fixtures = { fullEvent, minimalEvent, minimalQuery, fullQuery, pagedResult, emptyResult };

describe("v0.4 Project Timeline contracts", () => {
  it("keeps the Project Brain schema version at 1 (the timeline adds no schema)", () => {
    expect(V).toBe(1);
  });

  it("carries the full allow-listed event projection", () => {
    expect(fullEvent.eventId).toMatch(/^event:sha256:[0-9a-f]{64}$/);
    expect(fullEvent.captureSequence).toBe(2);
    expect(fullEvent.eventSequence).toBe(0);
    expect(fullEvent.evidenceCount).toBe(3);
    expect(fullEvent.title).toBe("Timeline slip");
    expect(fullEvent.status).toBe("open");
    expect(fullEvent.severity).toBe("high");
    expect(fullEvent.dueDate).toBe("2026-09-01");
  });

  it("permits an event with no optional presentation values", () => {
    expect(minimalEvent.title).toBeUndefined();
    expect(minimalEvent.status).toBeUndefined();
    expect(minimalEvent.severity).toBeUndefined();
    expect(minimalEvent.dueDate).toBeUndefined();
    // The required identity/position fields are still complete.
    expect(minimalEvent.subjectId).toBe("dec_0001");
    expect(minimalEvent.evidenceCount).toBe(0);
  });

  it("reuses the existing ChangeSet taxonomy for category and kind", () => {
    for (const category of CATEGORIES) {
      const event: TimelineEvent = { ...minimalEvent, category };
      expect(CATEGORIES).toContain(event.category);
    }
    for (const kind of KINDS) {
      const event: TimelineEvent = { ...minimalEvent, kind };
      expect(KINDS).toContain(event.kind);
    }
    expect(CATEGORIES).toHaveLength(12);
    expect(KINDS).toHaveLength(6);
  });

  it("accepts a query with only the required project id", () => {
    expect(minimalQuery.projectId).toBe("pb_explicit_project");
    expect(minimalQuery.limit).toBeUndefined();
    expect(minimalQuery.beforeSequence).toBeUndefined();
    expect(minimalQuery.category).toBeUndefined();
    expect(minimalQuery.kind).toBeUndefined();
  });

  it("accepts a fully specified bounded query", () => {
    expect(fullQuery.limit).toBe(50);
    expect(fullQuery.beforeSequence).toBe(9);
    expect(fullQuery.category).toBe("added");
    expect(fullQuery.kind).toBe("task");
  });

  it("bounds a result by its event array and reports the cursor truthfully", () => {
    expect(pagedResult.eventCount).toBe(pagedResult.events.length);
    expect(pagedResult.hasMore).toBe(true);
    expect(pagedResult.nextBeforeSequence).toBe(2);
  });

  it("represents an empty timeline as a valid result with no cursor", () => {
    expect(emptyResult.eventCount).toBe(0);
    expect(emptyResult.events).toHaveLength(0);
    expect(emptyResult.hasMore).toBe(false);
    expect(emptyResult.nextBeforeSequence).toBeUndefined();
  });

  it("round-trips every fixture through JSON stringify/parse", () => {
    for (const fixture of Object.values(fixtures)) {
      expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
    }
  });

  it("serializes byte-identically for identical input", () => {
    const a = JSON.stringify(pagedResult);
    const b = JSON.stringify({ ...pagedResult, events: [...pagedResult.events] });
    expect(a).toBe(b);
  });

  it("exposes no evidence ids, raw values, paths, or credentials", () => {
    const serialized = JSON.stringify(fixtures);
    // No absolute paths.
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
    // Never the forbidden projections: evidence ids, raw item objects, owner,
    // priority, metadata, previous/current values, or credentials.
    for (const forbidden of [
      "evidenceRefs",
      "previousValue",
      "currentValue",
      "owner",
      "priority",
      "metadata",
      "authorization",
      "bearer",
      '"token"',
      '"body"',
      "password",
      "secret",
      "dataDir",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("carries no path, data directory, or mutation field on a query", () => {
    const serialized = JSON.stringify({ minimalQuery, fullQuery });
    for (const forbidden of ["dataDir", "root", "path", "apply", "migrate", "confirm", "force"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
