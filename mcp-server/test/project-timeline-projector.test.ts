// v0.4 — project_timeline projector tests.
//
// The projector is pure: it copies only the allow-listed event fields, drops
// (never partially emits) an event whose required identifiers are unsafe, bounds
// the page, keeps hasMore/nextBeforeSequence truthful, and renders deterministic
// sanitized Markdown grouped by capture.

import type { TimelineEvent, TimelineResult } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";

import { findForbiddenMarker } from "../src/project-changes-projector.js";
import {
  DEFAULT_TIMELINE_LIMIT,
  emptyTimelineResult,
  MAX_TIMELINE_LIMIT,
  MIN_TIMELINE_LIMIT,
  projectTimelineEvent,
  projectTimelineResult,
  renderProjectTimelineMarkdown,
} from "../src/project-timeline-projector.js";

const PROJECT = "proj-1";

function event(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    eventId: `event:sha256:${"a".repeat(64)}`,
    projectId: PROJECT,
    snapshotId: "snapshot:current",
    captureSequence: 2,
    eventSequence: 0,
    capturedAt: "2026-01-02T00:00:00Z",
    category: "added",
    kind: "task",
    subjectId: "task-1",
    evidenceCount: 2,
    title: "Wire the API",
    status: "open",
    severity: "medium",
    dueDate: "2026-03-01",
    ...over,
  };
}

function timeline(events: TimelineEvent[], over: Partial<TimelineResult> = {}): TimelineResult {
  return {
    projectId: PROJECT,
    eventCount: events.length,
    hasMore: false,
    events,
    ...over,
  };
}

describe("project_timeline projector — bounds", () => {
  it("mirrors the Kernel page-size bounds", () => {
    expect(DEFAULT_TIMELINE_LIMIT).toBe(20);
    expect(MIN_TIMELINE_LIMIT).toBe(1);
    expect(MAX_TIMELINE_LIMIT).toBe(100);
  });
});

describe("project_timeline projector — event projection", () => {
  it("projects every allow-listed field and nothing else", () => {
    const projected = projectTimelineEvent(event());
    expect(projected).not.toBeNull();
    expect(Object.keys(projected!).sort()).toEqual(
      [
        "eventId",
        "snapshotId",
        "captureSequence",
        "eventSequence",
        "capturedAt",
        "category",
        "kind",
        "subjectId",
        "title",
        "status",
        "severity",
        "dueDate",
        "evidenceCount",
      ].sort(),
    );
    // projectId is NOT repeated on each event; it lives on the result.
    expect("projectId" in projected!).toBe(false);
  });

  it("omits absent optional fields rather than emitting null", () => {
    const projected = projectTimelineEvent(
      event({ title: undefined, status: undefined, severity: undefined, dueDate: undefined }),
    );
    expect(projected).not.toBeNull();
    expect("title" in projected!).toBe(false);
    expect("status" in projected!).toBe(false);
    expect("severity" in projected!).toBe(false);
    expect("dueDate" in projected!).toBe(false);
    expect(projected!.evidenceCount).toBe(2);
  });

  it("drops an event with an unknown category or kind", () => {
    expect(projectTimelineEvent(event({ category: "invented" as never }))).toBeNull();
    expect(projectTimelineEvent(event({ kind: "epic" as never }))).toBeNull();
  });

  it("drops an event whose required identifier is empty or control-bearing", () => {
    for (const over of [
      { eventId: "" },
      { snapshotId: "" },
      { subjectId: "" },
      { capturedAt: "" },
      { eventId: "bad\u0000id" },
      { subjectId: "bad\nid" },
    ] as Partial<TimelineEvent>[]) {
      expect(projectTimelineEvent(event(over))).toBeNull();
    }
  });

  it("drops an event whose ordinal is not a safe integer or is out of range", () => {
    for (const over of [
      { captureSequence: 0 },
      { captureSequence: -1 },
      { captureSequence: 1.5 },
      { eventSequence: -1 },
      { eventSequence: 2.5 },
      { evidenceCount: -1 },
      { captureSequence: Number.NaN },
    ] as Partial<TimelineEvent>[]) {
      expect(projectTimelineEvent(event(over))).toBeNull();
    }
  });

  it("accepts eventSequence 0 and evidenceCount 0", () => {
    const projected = projectTimelineEvent(event({ eventSequence: 0, evidenceCount: 0 }));
    expect(projected).not.toBeNull();
    expect(projected!.eventSequence).toBe(0);
    expect(projected!.evidenceCount).toBe(0);
  });

  it("omits an optional display field that looks like an absolute path", () => {
    for (const title of ["/Users/someone/plan.md", "C:\\work\\plan.md", "\\\\server\\share"]) {
      const projected = projectTimelineEvent(event({ title }));
      expect(projected).not.toBeNull();
      expect(projected!.title).toBeUndefined();
    }
  });

  it("omits an optional display field matching a planted secret sentinel", () => {
    const secret = "ghp_UNIQUE_PLANTED_SENTINEL_0001";
    const projected = projectTimelineEvent(event({ title: `token is ${secret}` }), [secret]);
    expect(projected).not.toBeNull();
    expect(projected!.title).toBeUndefined();
  });

  it("omits an oversize optional display field but keeps the event", () => {
    const projected = projectTimelineEvent(event({ title: "x".repeat(5000) }));
    expect(projected).not.toBeNull();
    expect(projected!.title).toBeUndefined();
    expect(projected!.subjectId).toBe("task-1");
  });

  it("rejects an oversize required identifier outright", () => {
    expect(projectTimelineEvent(event({ subjectId: "x".repeat(5000) }))).toBeNull();
  });
});

describe("project_timeline projector — result projection", () => {
  it("builds a valid empty result", () => {
    const result = emptyTimelineResult(PROJECT);
    expect(result).toEqual({
      schemaVersion: 1,
      projectId: PROJECT,
      eventCount: 0,
      hasMore: false,
      chronology: "capture-order",
      events: [],
    });
  });

  it("reports capture-order chronology and schema version 1", () => {
    const result = projectTimelineResult(timeline([event()]), PROJECT, 20);
    expect(result.schemaVersion).toBe(1);
    expect(result.chronology).toBe("capture-order");
    expect(result.projectId).toBe(PROJECT);
  });

  it("keeps eventCount equal to the projected array length", () => {
    const events = [event(), event({ eventSequence: 1, subjectId: "task-2" })];
    const result = projectTimelineResult(timeline(events), PROJECT, 20);
    expect(result.eventCount).toBe(result.events.length);
    expect(result.eventCount).toBe(2);
  });

  it("preserves the Kernel order without reordering", () => {
    const events = [
      event({ captureSequence: 3, eventSequence: 0, subjectId: "c" }),
      event({ captureSequence: 3, eventSequence: 1, subjectId: "a" }),
      event({ captureSequence: 2, eventSequence: 0, subjectId: "b" }),
    ];
    const result = projectTimelineResult(timeline(events), PROJECT, 20);
    expect(result.events.map((e) => e.subjectId)).toEqual(["c", "a", "b"]);
  });

  it("carries the Kernel hasMore and cursor through unchanged when it does not re-bound", () => {
    const result = projectTimelineResult(
      timeline([event()], { hasMore: true, nextBeforeSequence: 2 }),
      PROJECT,
      20,
    );
    expect(result.hasMore).toBe(true);
    expect(result.nextBeforeSequence).toBe(2);
  });

  it("omits the cursor when there is no more", () => {
    const result = projectTimelineResult(timeline([event()]), PROJECT, 20);
    expect(result.hasMore).toBe(false);
    expect(result.nextBeforeSequence).toBeUndefined();
  });

  it("applies its defensive ceiling at a capture boundary, never inside one", () => {
    const events = [
      event({ captureSequence: 3, eventSequence: 0, subjectId: "a" }),
      event({ captureSequence: 3, eventSequence: 1, subjectId: "b" }),
      event({ captureSequence: 2, eventSequence: 0, subjectId: "c" }),
    ];
    const result = projectTimelineResult(timeline(events), PROJECT, 2);
    // Capture 3 is returned WHOLE (both its events); capture 2 would exceed the
    // ceiling and is deferred. Trimming inside capture 3 would silently skip an
    // event, because the cursor advances past the whole capture.
    expect(result.eventCount).toBe(2);
    expect(result.events.map((e) => e.subjectId)).toEqual(["a", "b"]);
    expect(result.hasMore).toBe(true);
    expect(result.nextBeforeSequence).toBe(3);
  });

  it("never splits a capture, even when that capture alone exceeds the ceiling", () => {
    const events = [
      event({ captureSequence: 3, eventSequence: 0, subjectId: "a" }),
      event({ captureSequence: 3, eventSequence: 1, subjectId: "b" }),
      event({ captureSequence: 3, eventSequence: 2, subjectId: "c" }),
    ];
    const result = projectTimelineResult(timeline(events), PROJECT, 1);
    // The whole capture is returned rather than trimmed mid-capture.
    expect(result.eventCount).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it("clamps a limit outside the supported range at a capture boundary", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      event({ captureSequence: 5 - i, eventSequence: 0, subjectId: `t-${i}` }),
    );
    // Limit 0 clamps to 1: one whole capture (one event here).
    expect(projectTimelineResult(timeline(events), PROJECT, 0).eventCount).toBe(1);
    // Limit 1000 clamps to 100: every capture fits.
    expect(projectTimelineResult(timeline(events), PROJECT, 1000).eventCount).toBe(5);
  });

  it("drops an unsafe event without emitting it partially", () => {
    const events = [event({ subjectId: "ok" }), event({ subjectId: "" })];
    const result = projectTimelineResult(timeline(events), PROJECT, 20);
    expect(result.eventCount).toBe(1);
    expect(result.events[0]!.subjectId).toBe("ok");
    // The dropped event bounded the page below the source length, so hasMore is
    // reported truthfully rather than silently claiming completeness.
    expect(result.hasMore).toBe(true);
  });

  it("tolerates a non-array events field defensively", () => {
    const result = projectTimelineResult(
      { projectId: PROJECT, eventCount: 0, hasMore: false, events: null as never },
      PROJECT,
      20,
    );
    expect(result.eventCount).toBe(0);
    expect(result.events).toEqual([]);
  });

  it("carries no forbidden structural marker", () => {
    const result = projectTimelineResult(timeline([event()]), PROJECT, 20);
    const serialized = `${JSON.stringify(result)}\n${renderProjectTimelineMarkdown(result)}`;
    expect(findForbiddenMarker(serialized)).toBeNull();
  });

  it("is deterministic across repeated projections", () => {
    const events = [event(), event({ eventSequence: 1, subjectId: "task-2" })];
    const a = projectTimelineResult(timeline(events), PROJECT, 20);
    const b = projectTimelineResult(timeline(events), PROJECT, 20);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("project_timeline projector — Markdown", () => {
  it("groups events by capture under fixed headings", () => {
    const events = [
      event({ captureSequence: 3, eventSequence: 0, subjectId: "a", snapshotId: "snapshot:3" }),
      event({ captureSequence: 3, eventSequence: 1, subjectId: "b", snapshotId: "snapshot:3" }),
      event({
        captureSequence: 2,
        eventSequence: 0,
        subjectId: "c",
        snapshotId: "snapshot:2",
        capturedAt: "2026-01-01T00:00:00Z",
      }),
    ];
    const markdown = renderProjectTimelineMarkdown(
      projectTimelineResult(timeline(events), PROJECT, 20),
    );
    expect(markdown).toContain("# Project Timeline");
    expect(markdown).toContain("### Capture #3 — 2026-01-02T00:00:00Z");
    expect(markdown).toContain("### Capture #2 — 2026-01-01T00:00:00Z");
    expect(markdown).toContain("`snapshot:3`");
    expect(markdown).toContain("`snapshot:2`");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("renders an empty timeline without inventing content", () => {
    const markdown = renderProjectTimelineMarkdown(emptyTimelineResult(PROJECT));
    expect(markdown).toContain("# Project Timeline");
    expect(markdown).toContain("No timeline events");
    expect(markdown).not.toContain("### Capture");
  });

  it("escapes a cell so a table row can never break or inject", () => {
    const markdown = renderProjectTimelineMarkdown(
      projectTimelineResult(
        timeline([event({ title: "a | b \\ c" })]),
        PROJECT,
        20,
      ),
    );
    expect(markdown).toContain("a \\| b \\\\ c");
  });

  it("is byte-identical across repeated renders", () => {
    const result = projectTimelineResult(timeline([event()]), PROJECT, 20);
    expect(renderProjectTimelineMarkdown(result)).toBe(renderProjectTimelineMarkdown(result));
  });
});
