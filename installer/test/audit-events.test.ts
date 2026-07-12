import { describe, expect, it } from "vitest";
import {
  createInstallerAuditEvent,
  createInstallerAuditEventDryRun,
  createInstallerAuditEvents,
  createInstallerDecisionReport,
  exampleInstallerAuditEventInput,
  exampleInstallerDecisionReportInput,
  formatInstallerAuditEventsMarkdown,
  validateInstallerAuditEvents,
} from "../src/index.js";
import type {
  InstallerAuditEvent,
  InstallerAuditEventInput,
  InstallerDecisionReport,
} from "../src/index.js";

// Deep-clone the fixture so per-test mutations never leak between cases.
function input(): InstallerAuditEventInput {
  return structuredClone(exampleInstallerAuditEventInput());
}

// Build a decision report with a chosen decision/ok and section shape.
function decisionWith(
  overrides: Partial<InstallerDecisionReport>,
): InstallerDecisionReport {
  const base = createInstallerDecisionReport(exampleInstallerDecisionReportInput());
  return { ...base, ...overrides };
}

describe("createInstallerAuditEvent", () => {
  it("omits optional subject and reason when undefined", () => {
    const event = createInstallerAuditEvent({
      sequence: 1,
      kind: "preview_started",
      level: "info",
      message: "started",
      root: "/tmp/oh-my-pm",
    });
    expect(event).not.toHaveProperty("subject");
    expect(event).not.toHaveProperty("reason");
  });

  it("includes optional subject and reason when provided", () => {
    const event = createInstallerAuditEvent({
      sequence: 2,
      kind: "section_evaluated",
      level: "warning",
      message: "recorded",
      root: "/tmp/oh-my-pm",
      subject: "assembly",
      reason: "some_reason",
    });
    expect(event.subject).toBe("assembly");
    expect(event.reason).toBe("some_reason");
  });
});

describe("createInstallerAuditEvents", () => {
  it("starts with preview_started at sequence 1", () => {
    const events = createInstallerAuditEvents(input());
    expect(events[0].kind).toBe("preview_started");
    expect(events[0].sequence).toBe(1);
    expect(events[0].level).toBe("info");
  });

  it("emits section events in section order", () => {
    const base = input();
    const sectionEvents = createInstallerAuditEvents(base).filter(
      (event) => event.kind === "section_evaluated",
    );
    expect(sectionEvents.map((event) => event.subject)).toEqual(
      base.decision.sections.map((section) => section.name),
    );
  });

  it("emits one event per reason when a section has reasons", () => {
    const base = input();
    base.decision.sections = [
      { name: "assembly", ok: false, reasons: ["r1", "r2"] },
      { name: "archive", ok: true, reasons: [] },
    ];
    const events = createInstallerAuditEvents(base);
    const sectionEvents = events.filter((event) => event.kind === "section_evaluated");
    expect(sectionEvents).toHaveLength(3);
    expect(sectionEvents[0]).toMatchObject({
      subject: "assembly",
      level: "error",
      reason: "r1",
    });
    expect(sectionEvents[1]).toMatchObject({
      subject: "assembly",
      level: "error",
      reason: "r2",
    });
    expect(sectionEvents[2]).toMatchObject({ subject: "archive", level: "info" });
    expect(sectionEvents[2]).not.toHaveProperty("reason");
  });

  it("uses warning level for reasons on a passing section", () => {
    const base = input();
    base.decision.sections = [{ name: "assembly", ok: true, reasons: ["r1"] }];
    const [, sectionEvent] = createInstallerAuditEvents(base);
    expect(sectionEvent).toMatchObject({ level: "warning", reason: "r1" });
  });

  it("ends with decision_reported then preview_completed", () => {
    const events = createInstallerAuditEvents(input());
    expect(events[events.length - 2].kind).toBe("decision_reported");
    expect(events[events.length - 1].kind).toBe("preview_completed");
  });

  it("uses a contiguous sequence starting at 1", () => {
    const events = createInstallerAuditEvents(input());
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_event, index) => index + 1),
    );
  });

  it("reports an error decision event when blocked", () => {
    const base = input();
    base.decision = decisionWith({ decision: "blocked", ok: false });
    const events = createInstallerAuditEvents(base);
    const decisionEvent = events.find((event) => event.kind === "decision_reported");
    expect(decisionEvent).toMatchObject({ level: "error", subject: "blocked" });
    const completed = events.find((event) => event.kind === "preview_completed");
    expect(completed?.level).toBe("warning");
  });

  it("reports a warning decision event when review-required", () => {
    const base = input();
    base.decision = decisionWith({ decision: "review-required", ok: false });
    const events = createInstallerAuditEvents(base);
    const decisionEvent = events.find((event) => event.kind === "decision_reported");
    expect(decisionEvent).toMatchObject({ level: "warning", subject: "review-required" });
  });

  it("reports an info decision event when ready", () => {
    const base = input();
    base.decision = decisionWith({ decision: "ready", ok: true });
    const events = createInstallerAuditEvents(base);
    const decisionEvent = events.find((event) => event.kind === "decision_reported");
    expect(decisionEvent).toMatchObject({ level: "info", subject: "ready" });
    const completed = events.find((event) => event.kind === "preview_completed");
    expect(completed?.level).toBe("info");
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createInstallerAuditEvents(base);
    expect(base).toEqual(snapshot);
  });

  it("never surfaces a signature value or a remote URL", () => {
    const serialized = JSON.stringify(createInstallerAuditEvents(input()));
    expect(serialized).not.toContain("placeholder:");
    expect(serialized).not.toContain("BEGIN");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe("validateInstallerAuditEvents", () => {
  it("flags an empty sequence", () => {
    const report = validateInstallerAuditEvents([]);
    expect(report.ok).toBe(false);
    expect(report.reasons).toEqual(["audit_events_must_not_be_empty"]);
  });

  it("accepts a well-formed sequence", () => {
    const report = validateInstallerAuditEvents(createInstallerAuditEvents(input()));
    expect(report.ok).toBe(true);
    expect(report.reasons).toEqual([]);
  });

  it("flags a non-contiguous sequence", () => {
    const events: InstallerAuditEvent[] = [
      createInstallerAuditEvent({
        sequence: 2,
        kind: "preview_started",
        level: "info",
        message: "m",
        root: "/tmp",
      }),
    ];
    expect(validateInstallerAuditEvents(events).reasons).toContain(
      "audit_event_sequence_invalid",
    );
  });

  it("flags a duplicate sequence", () => {
    const events: InstallerAuditEvent[] = [
      createInstallerAuditEvent({
        sequence: 1,
        kind: "preview_started",
        level: "info",
        message: "m",
        root: "/tmp",
      }),
      createInstallerAuditEvent({
        sequence: 1,
        kind: "preview_completed",
        level: "info",
        message: "m",
        root: "/tmp",
      }),
    ];
    const report = validateInstallerAuditEvents(events);
    expect(report.reasons).toContain("audit_event_sequence_invalid");
    expect(report.reasons).toContain("audit_event_duplicate_sequence");
  });

  it("flags an invalid kind and level", () => {
    const events = [
      {
        sequence: 1,
        kind: "not_a_kind",
        level: "not_a_level",
        message: "m",
        root: "/tmp",
      } as unknown as InstallerAuditEvent,
    ];
    const report = validateInstallerAuditEvents(events);
    expect(report.reasons).toContain("audit_event_kind_invalid");
    expect(report.reasons).toContain("audit_event_level_invalid");
  });

  it("flags a missing message and root", () => {
    const events: InstallerAuditEvent[] = [
      createInstallerAuditEvent({
        sequence: 1,
        kind: "preview_started",
        level: "info",
        message: "",
        root: "",
      }),
    ];
    const report = validateInstallerAuditEvents(events);
    expect(report.reasons).toContain("audit_event_message_missing");
    expect(report.reasons).toContain("audit_event_root_missing");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const events = [
      {
        sequence: 3,
        kind: "bad",
        level: "bad",
        message: "",
        root: "",
      } as unknown as InstallerAuditEvent,
      {
        sequence: 3,
        kind: "bad",
        level: "bad",
        message: "",
        root: "",
      } as unknown as InstallerAuditEvent,
    ];
    const report = validateInstallerAuditEvents(events);
    expect(report.reasons).toEqual([
      "audit_event_sequence_invalid",
      "audit_event_kind_invalid",
      "audit_event_level_invalid",
      "audit_event_message_missing",
      "audit_event_root_missing",
      "audit_event_duplicate_sequence",
    ]);
    expect(new Set(report.reasons).size).toBe(report.reasons.length);
  });
});

describe("createInstallerAuditEventDryRun", () => {
  it("is ok and omits warnings for a valid sequence", () => {
    const dryRun = createInstallerAuditEventDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
    expect(dryRun.validation.ok).toBe(true);
  });
});

describe("formatInstallerAuditEventsMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const events = createInstallerAuditEvents(input());
    const markdown = formatInstallerAuditEventsMarkdown(events);
    expect(markdown).toBe(formatInstallerAuditEventsMarkdown(events));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("contains sequence, level, kind, message, subject, and reason", () => {
    const base = input();
    base.decision.sections = [{ name: "assembly", ok: false, reasons: ["broken"] }];
    const markdown = formatInstallerAuditEventsMarkdown(createInstallerAuditEvents(base));
    expect(markdown).toContain("# OH MY PM Installer Audit Events");
    expect(markdown).toContain("`1` `info` `preview_started` Installer preview started");
    expect(markdown).toContain("assembly — Section reason recorded reason: broken");
  });

  it("never renders a signature value or a remote URL", () => {
    const markdown = formatInstallerAuditEventsMarkdown(createInstallerAuditEvents(input()));
    expect(markdown).not.toContain("placeholder:");
    expect(markdown).not.toContain("BEGIN");
    expect(markdown).not.toMatch(/https?:\/\//);
  });
});

describe("exampleInstallerAuditEventInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerAuditEventInput()).toEqual(exampleInstallerAuditEventInput());
  });

  it("produces a valid dry run", () => {
    const dryRun = createInstallerAuditEventDryRun(exampleInstallerAuditEventInput());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.events.length).toBeGreaterThan(0);
  });
});
