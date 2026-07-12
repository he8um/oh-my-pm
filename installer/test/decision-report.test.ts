import { describe, expect, it } from "vitest";
import {
  collectInstallerDecisionBlockingReasons,
  collectInstallerDecisionReviewReasons,
  createInstallerDecisionDryRun,
  createInstallerDecisionReport,
  createInstallerDecisionSections,
  exampleInstallerDecisionReportInput,
  formatInstallerDecisionReportMarkdown,
  summarizeInstallerDecisionReport,
} from "../src/index.js";
import type { InstallerDecisionReportInput } from "../src/index.js";

const SECTION_ORDER = [
  "assembly",
  "archive",
  "metadata",
  "integrity",
  "channel",
  "update-policy",
  "update-impact",
  "rollback-impact",
];

// Deep-clone the fixture so per-test mutations never leak between cases.
function input(): InstallerDecisionReportInput {
  return structuredClone(exampleInstallerDecisionReportInput());
}

describe("createInstallerDecisionSections", () => {
  it("produces sections in the exact fixed order", () => {
    const sections = createInstallerDecisionSections(input());
    expect(sections.map((section) => section.name)).toEqual(SECTION_ORDER);
  });

  it("dedupes reasons per section in first-occurrence order", () => {
    const base = input();
    base.metadata.ok = false;
    base.metadata.validation = {
      ok: false,
      reasons: ["a", "b", "a", "b"],
    };
    const sections = createInstallerDecisionSections(base);
    const metadata = sections.find((section) => section.name === "metadata");
    expect(metadata?.reasons).toEqual(["a", "b"]);
  });

  it("never surfaces a signature value in section reasons", () => {
    const sections = createInstallerDecisionSections(input());
    const serialized = JSON.stringify(sections);
    expect(serialized).not.toContain("placeholder:");
    expect(serialized).not.toContain("BEGIN");
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createInstallerDecisionSections(base);
    expect(base).toEqual(snapshot);
  });
});

describe("collectInstallerDecisionBlockingReasons", () => {
  it("promotes failed-section reasons to blocking reasons", () => {
    const base = input();
    base.channel.ok = false;
    base.channel.validation = { ok: false, reasons: ["channel_broken"] };
    const sections = createInstallerDecisionSections(base);
    expect(collectInstallerDecisionBlockingReasons(sections)).toContain("channel_broken");
  });

  it("dedupes blocking reasons across failed sections", () => {
    const base = input();
    base.metadata.ok = false;
    base.metadata.validation = { ok: false, reasons: ["shared_reason"] };
    base.integrity.ok = false;
    base.integrity.verification = {
      ok: false,
      reasons: ["shared_reason"],
      metadataValidation: { ok: true, reasons: [] },
    };
    const sections = createInstallerDecisionSections(base);
    const blocking = collectInstallerDecisionBlockingReasons(sections);
    expect(blocking.filter((reason) => reason === "shared_reason")).toHaveLength(1);
  });

  it("adds install_operations_empty when there are no install operations", () => {
    const base = input();
    base.installOperations = [];
    const report = createInstallerDecisionReport(base);
    expect(report.blockingReasons).toContain("install_operations_empty");
  });
});

describe("collectInstallerDecisionReviewReasons", () => {
  it("flags an already-current update policy decision", () => {
    const base = input();
    base.updatePolicy.report.decision = "already-current";
    const sections = createInstallerDecisionSections(base);
    expect(collectInstallerDecisionReviewReasons(base, sections)).toContain(
      "update_policy_already_current",
    );
  });

  it("flags update impact with no changes", () => {
    const base = input();
    base.updateImpact.preview.operations = [];
    const sections = createInstallerDecisionSections(base);
    expect(collectInstallerDecisionReviewReasons(base, sections)).toContain(
      "update_impact_no_changes",
    );
  });

  it("flags rollback impact with no changes", () => {
    const base = input();
    base.rollbackImpact.preview.operations = [
      { kind: "unchanged", path: "bin/oh-my-pm" },
    ];
    const sections = createInstallerDecisionSections(base);
    expect(collectInstallerDecisionReviewReasons(base, sections)).toContain(
      "rollback_impact_no_changes",
    );
  });

  it("flags non-blocking warnings from a passing section", () => {
    const base = input();
    base.assembly.warnings = [{ code: "OMP-I-6001", message: "assembly_include_file_missing" }];
    const sections = createInstallerDecisionSections(base);
    expect(collectInstallerDecisionReviewReasons(base, sections)).toContain(
      "install_preview_has_warnings",
    );
  });

  it("dedupes review reasons", () => {
    const base = input();
    base.updateImpact.preview.operations = [];
    base.rollbackImpact.preview.operations = [];
    const sections = createInstallerDecisionSections(base);
    const review = collectInstallerDecisionReviewReasons(base, sections);
    expect(new Set(review).size).toBe(review.length);
  });
});

describe("summarizeInstallerDecisionReport", () => {
  it("counts operations and entries across layers", () => {
    const summary = summarizeInstallerDecisionReport(input());
    expect(summary.installOperations).toBe(2);
    expect(summary.archiveEntries).toBe(2);
    expect(summary.channelEntries).toBe(1);
    expect(summary.updateImpactOperations).toBe(2);
    expect(summary.rollbackImpactOperations).toBe(3);
  });

  it("counts warnings as the number of unique section reasons", () => {
    const base = input();
    base.metadata.ok = false;
    base.metadata.validation = { ok: false, reasons: ["r1", "r2"] };
    base.integrity.ok = false;
    base.integrity.verification = {
      ok: false,
      reasons: ["r2", "r3"],
      metadataValidation: { ok: true, reasons: [] },
    };
    const summary = summarizeInstallerDecisionReport(base);
    // r1, r2, r3 => 3 unique.
    expect(summary.warnings).toBe(3);
  });
});

describe("createInstallerDecisionReport", () => {
  it("is blocked when a section fails", () => {
    const base = input();
    base.channel.ok = false;
    base.channel.validation = { ok: false, reasons: ["channel_broken"] };
    const report = createInstallerDecisionReport(base);
    expect(report.decision).toBe("blocked");
    expect(report.ok).toBe(false);
  });

  it("is review-required when only review reasons exist", () => {
    const base = input();
    base.updateImpact.preview.operations = [];
    const report = createInstallerDecisionReport(base);
    expect(report.decision).toBe("review-required");
    expect(report.ok).toBe(false);
    expect(report.blockingReasons).toEqual([]);
    expect(report.reviewReasons.length).toBeGreaterThan(0);
  });

  it("is ready when there are no blocking or review reasons", () => {
    const report = createInstallerDecisionReport(input());
    expect(report.decision).toBe("ready");
    expect(report.ok).toBe(true);
    expect(report.blockingReasons).toEqual([]);
    expect(report.reviewReasons).toEqual([]);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createInstallerDecisionReport(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createInstallerDecisionDryRun", () => {
  it("omits warnings for a ready report", () => {
    const dryRun = createInstallerDecisionDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a non-ready report", () => {
    const base = input();
    base.channel.ok = false;
    base.channel.validation = { ok: false, reasons: ["channel_broken"] };
    const dryRun = createInstallerDecisionDryRun(base);
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings?.length).toBeGreaterThan(0);
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
  });
});

describe("formatInstallerDecisionReportMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const report = createInstallerDecisionReport(input());
    const markdown = formatInstallerDecisionReportMarkdown(report);
    expect(markdown).toBe(formatInstallerDecisionReportMarkdown(report));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("contains sections and reason lists", () => {
    const report = createInstallerDecisionReport(input());
    const markdown = formatInstallerDecisionReportMarkdown(report);
    expect(markdown).toContain("# OH MY PM Installer Decision Report");
    expect(markdown).toContain("## Sections");
    expect(markdown).toContain("`assembly`: ok");
    expect(markdown).toContain("## Blocking Reasons");
    expect(markdown).toContain("## Review Reasons");
    expect(markdown).toContain("- none");
  });

  it("never renders a signature value or a remote URL", () => {
    const report = createInstallerDecisionReport(input());
    const markdown = formatInstallerDecisionReportMarkdown(report);
    expect(markdown).not.toContain("placeholder:");
    expect(markdown).not.toContain("BEGIN");
    expect(markdown).not.toMatch(/https?:\/\//);
  });
});

describe("exampleInstallerDecisionReportInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerDecisionReportInput()).toEqual(exampleInstallerDecisionReportInput());
  });

  it("produces a non-blocked dry run", () => {
    const dryRun = createInstallerDecisionDryRun(exampleInstallerDecisionReportInput());
    expect(dryRun.report.decision).not.toBe("blocked");
    expect(dryRun.report.blockingReasons).toEqual([]);
  });
});
