import { describe, expect, it } from "vitest";
import {
  createInstallerAuditEvents,
  createInstallerAuditTrailExportDryRun,
  createInstallerAuditTrailExportPlan,
  exampleInstallerAuditEventInput,
  exampleInstallerAuditTrailExportInput,
  formatInstallerAuditEventsMarkdown,
  formatInstallerAuditTrailExportContent,
  validateInstallerAuditTrailExportFormat,
  validateInstallerAuditTrailExportPlan,
} from "../src/index.js";
import type {
  InstallerAuditEvent,
  InstallerAuditTrailExportPlan,
} from "../src/index.js";

// A deterministic non-empty event sequence for content/plan tests.
function events(): InstallerAuditEvent[] {
  return createInstallerAuditEvents(exampleInstallerAuditEventInput());
}

describe("validateInstallerAuditTrailExportFormat", () => {
  it("accepts the supported formats", () => {
    expect(validateInstallerAuditTrailExportFormat("json")).toBe(true);
    expect(validateInstallerAuditTrailExportFormat("jsonl")).toBe(true);
    expect(validateInstallerAuditTrailExportFormat("markdown")).toBe(true);
  });

  it("rejects an unsupported value", () => {
    expect(validateInstallerAuditTrailExportFormat("yaml")).toBe(false);
    expect(validateInstallerAuditTrailExportFormat("")).toBe(false);
  });
});

describe("formatInstallerAuditTrailExportContent", () => {
  it("renders json as deterministic pretty JSON of the event array", () => {
    const source = events();
    const content = formatInstallerAuditTrailExportContent(source, "json");
    expect(content).toBe(JSON.stringify(source, null, 2));
    expect(JSON.parse(content)).toEqual(source);
    expect(content).toBe(formatInstallerAuditTrailExportContent(source, "json"));
  });

  it("renders jsonl as one object per line with one trailing newline", () => {
    const source = events();
    const content = formatInstallerAuditTrailExportContent(source, "jsonl");
    expect(content.endsWith("\n")).toBe(true);
    expect(content.endsWith("\n\n")).toBe(false);
    const lines = content.slice(0, -1).split("\n");
    expect(lines).toHaveLength(source.length);
    lines.forEach((line, index) => {
      expect(JSON.parse(line)).toEqual(source[index]);
    });
  });

  it("renders markdown by reusing the audit event markdown", () => {
    const source = events();
    expect(formatInstallerAuditTrailExportContent(source, "markdown")).toBe(
      formatInstallerAuditEventsMarkdown(source),
    );
  });

  it("returns an empty string for empty jsonl", () => {
    expect(formatInstallerAuditTrailExportContent([], "jsonl")).toBe("");
  });

  it("does not mutate the input events", () => {
    const source = events();
    const snapshot = structuredClone(source);
    formatInstallerAuditTrailExportContent(source, "json");
    formatInstallerAuditTrailExportContent(source, "jsonl");
    formatInstallerAuditTrailExportContent(source, "markdown");
    expect(source).toEqual(snapshot);
  });

  it("contains no remote URL and no signature value", () => {
    for (const format of ["json", "jsonl", "markdown"] as const) {
      const content = formatInstallerAuditTrailExportContent(events(), format);
      expect(content).not.toMatch(/https?:\/\//);
      expect(content).not.toContain("placeholder:");
      expect(content).not.toContain("BEGIN");
    }
  });
});

describe("createInstallerAuditTrailExportPlan", () => {
  it("reports the event count matching the events length", () => {
    const source = events();
    const plan = createInstallerAuditTrailExportPlan({ events: source, format: "jsonl" });
    expect(plan.eventCount).toBe(source.length);
  });

  it("reports sizeBytes as the UTF-8 byte length of the content", () => {
    const source = events();
    const plan = createInstallerAuditTrailExportPlan({ events: source, format: "json" });
    expect(plan.sizeBytes).toBe(new TextEncoder().encode(plan.content).length);
  });

  it("builds the fingerprint from format, event count, and size", () => {
    const source = events();
    const plan = createInstallerAuditTrailExportPlan({ events: source, format: "markdown" });
    expect(plan.fingerprint).toBe(
      `audit-export:markdown:${plan.eventCount}:${plan.sizeBytes}`,
    );
  });

  it("has no output path, filename, destination, or telemetry field", () => {
    const plan = createInstallerAuditTrailExportPlan({ events: events(), format: "jsonl" });
    for (const key of Object.keys(plan)) {
      expect(key).not.toMatch(/path|file|dest|url|remote|telemetry|sink/i);
    }
  });
});

describe("validateInstallerAuditTrailExportPlan", () => {
  it("passes a valid plan", () => {
    const plan = createInstallerAuditTrailExportPlan({ events: events(), format: "jsonl" });
    const report = validateInstallerAuditTrailExportPlan(plan);
    expect(report.ok).toBe(true);
    expect(report.reasons).toEqual([]);
  });

  it("flags an invalid format", () => {
    const plan = createInstallerAuditTrailExportPlan({ events: events(), format: "jsonl" });
    const report = validateInstallerAuditTrailExportPlan({
      ...plan,
      format: "yaml" as unknown as InstallerAuditTrailExportPlan["format"],
    });
    expect(report.reasons).toContain("audit_trail_export_format_invalid");
  });

  it("flags empty events", () => {
    const plan = createInstallerAuditTrailExportPlan({ events: [], format: "jsonl" });
    const report = validateInstallerAuditTrailExportPlan(plan);
    expect(report.reasons).toContain("audit_trail_export_events_empty");
  });

  it("flags missing content", () => {
    const plan = createInstallerAuditTrailExportPlan({ events: events(), format: "jsonl" });
    const report = validateInstallerAuditTrailExportPlan({
      ...plan,
      content: "",
      sizeBytes: 0,
    });
    expect(report.reasons).toContain("audit_trail_export_content_missing");
  });

  it("flags an invalid size", () => {
    const plan = createInstallerAuditTrailExportPlan({ events: events(), format: "jsonl" });
    const report = validateInstallerAuditTrailExportPlan({ ...plan, sizeBytes: -1 });
    expect(report.reasons).toContain("audit_trail_export_size_invalid");
    const mismatch = validateInstallerAuditTrailExportPlan({
      ...plan,
      sizeBytes: plan.sizeBytes + 1,
    });
    expect(mismatch.reasons).toContain("audit_trail_export_size_invalid");
  });

  it("flags a missing fingerprint", () => {
    const plan = createInstallerAuditTrailExportPlan({ events: events(), format: "jsonl" });
    const report = validateInstallerAuditTrailExportPlan({ ...plan, fingerprint: "" });
    expect(report.reasons).toContain("audit_trail_export_fingerprint_missing");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    // An empty, format-invalid, content-missing, size-invalid, fingerprint-missing plan.
    const report = validateInstallerAuditTrailExportPlan({
      format: "yaml" as unknown as InstallerAuditTrailExportPlan["format"],
      eventCount: 0,
      sizeBytes: -1,
      fingerprint: "",
      content: "",
    });
    expect(report.reasons).toEqual([
      "audit_trail_export_format_invalid",
      "audit_trail_export_events_empty",
      "audit_trail_export_content_missing",
      "audit_trail_export_size_invalid",
      "audit_trail_export_fingerprint_missing",
    ]);
    expect(new Set(report.reasons).size).toBe(report.reasons.length);
  });
});

describe("createInstallerAuditTrailExportDryRun", () => {
  it("is ok and omits warnings for a valid export", () => {
    const dryRun = createInstallerAuditTrailExportDryRun({
      events: events(),
      format: "jsonl",
    });
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
    expect(dryRun.validation.ok).toBe(true);
  });

  it("returns OMP-I-6001 warnings for an invalid export", () => {
    const dryRun = createInstallerAuditTrailExportDryRun({ events: [], format: "jsonl" });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(dryRun.warnings?.some((warning) => warning.message === "audit_trail_export_events_empty")).toBe(
      true,
    );
  });
});

describe("exampleInstallerAuditTrailExportInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerAuditTrailExportInput()).toEqual(
      exampleInstallerAuditTrailExportInput(),
    );
  });

  it("produces a valid dry run", () => {
    const dryRun = createInstallerAuditTrailExportDryRun(
      exampleInstallerAuditTrailExportInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.plan.eventCount).toBeGreaterThan(0);
    expect(dryRun.plan.sizeBytes).toBeGreaterThan(0);
  });
});
