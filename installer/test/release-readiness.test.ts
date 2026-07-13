import { describe, expect, it } from "vitest";
import {
  collectInstallerReleaseReadinessReasons,
  createInstallerReleaseReadinessDryRun,
  createInstallerReleaseReadinessReport,
  createInstallerReleaseReadinessSections,
  exampleInstallerReleaseReadinessInput,
  formatInstallerReleaseReadinessMarkdown,
  summarizeInstallerReleaseReadiness,
} from "../src/index.js";
import type {
  InstallerReleaseReadinessInput,
  InstallerReleaseReadinessSection,
  InstallerReleaseReadinessSectionId,
} from "../src/index.js";

const SECTION_ORDER: InstallerReleaseReadinessSectionId[] = [
  "installer-decision",
  "audit-export",
  "controlled-write",
];

const LABELS: Record<InstallerReleaseReadinessSectionId, string> = {
  "installer-decision": "Installer decision report",
  "audit-export": "Audit trail export dry-run",
  "controlled-write": "Controlled write dry-run envelope",
};

function input(
  overrides: Partial<InstallerReleaseReadinessInput> = {},
): InstallerReleaseReadinessInput {
  return { ...exampleInstallerReleaseReadinessInput(), ...overrides };
}

describe("createInstallerReleaseReadinessSections", () => {
  it("returns sections in the fixed order", () => {
    const sections = createInstallerReleaseReadinessSections(input());
    expect(sections.map((section) => section.id)).toEqual(SECTION_ORDER);
  });

  it("uses stable labels", () => {
    const sections = createInstallerReleaseReadinessSections(input());
    for (const section of sections) {
      expect(section.label).toBe(LABELS[section.id]);
    }
  });

  it("mirrors the installer decision status and reasons", () => {
    const base = input();
    const decision = {
      ...base.decision,
      ok: false,
      decision: "review-required" as const,
      blockingReasons: [],
      reviewReasons: ["decision_review_reason", "decision_review_reason"],
    };
    const sections = createInstallerReleaseReadinessSections({ ...base, decision });
    const section = sections.find((s) => s.id === "installer-decision");
    expect(section?.status).toBe("review-required");
    expect(section?.ok).toBe(false);
    // Reasons are deduped in first-occurrence order.
    expect(section?.reasons).toEqual(["decision_review_reason"]);
  });

  it("mirrors the audit export ok and reasons", () => {
    const base = input();
    const auditExport = {
      ...base.auditExport,
      ok: false,
      validation: { ok: false, reasons: ["audit_reason"] },
    };
    const section = createInstallerReleaseReadinessSections({ ...base, auditExport }).find(
      (s) => s.id === "audit-export",
    );
    expect(section?.ok).toBe(false);
    expect(section?.status).toBe("blocked");
    expect(section?.reasons).toEqual(["audit_reason"]);
  });

  it("mirrors the controlled write ok and reasons", () => {
    const base = input();
    const controlledWrite = {
      ...base.controlledWrite,
      ok: false,
      envelope: {
        ...base.controlledWrite.envelope,
        summary: { ...base.controlledWrite.envelope.summary, reasons: ["controlled_reason"] },
      },
    };
    const section = createInstallerReleaseReadinessSections({ ...base, controlledWrite }).find(
      (s) => s.id === "controlled-write",
    );
    expect(section?.ok).toBe(false);
    expect(section?.status).toBe("blocked");
    expect(section?.reasons).toEqual(["controlled_reason"]);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createInstallerReleaseReadinessSections(base);
    expect(base).toEqual(snapshot);
  });
});

describe("collectInstallerReleaseReadinessReasons", () => {
  it("dedupes reasons in first-occurrence order across sections", () => {
    const sections: InstallerReleaseReadinessSection[] = [
      { id: "installer-decision", label: "d", ok: false, status: "blocked", reasons: ["a", "b"] },
      { id: "audit-export", label: "a", ok: false, status: "blocked", reasons: ["b", "c"] },
      { id: "controlled-write", label: "c", ok: true, status: "ready", reasons: [] },
    ];
    expect(collectInstallerReleaseReadinessReasons(sections)).toEqual(["a", "b", "c"]);
  });

  it("adds a fallback reason only when a not-ok section has no reasons", () => {
    const sections: InstallerReleaseReadinessSection[] = [
      { id: "installer-decision", label: "d", ok: false, status: "blocked", reasons: [] },
      { id: "audit-export", label: "a", ok: true, status: "ready", reasons: [] },
    ];
    expect(collectInstallerReleaseReadinessReasons(sections)).toEqual([
      "release_readiness_section_not_ready:installer-decision",
    ]);
  });
});

describe("summarizeInstallerReleaseReadiness", () => {
  function sectionsWith(
    statuses: InstallerReleaseReadinessSection["status"][],
  ): InstallerReleaseReadinessSection[] {
    return statuses.map((status, index) => ({
      id: SECTION_ORDER[index] ?? "controlled-write",
      label: "x",
      ok: status === "ready",
      status,
      reasons: [],
    }));
  }

  it("lets blocked beat review-required", () => {
    const sections = sectionsWith(["review-required", "blocked", "ready"]);
    expect(summarizeInstallerReleaseReadiness(input(), sections, []).status).toBe("blocked");
  });

  it("lets review-required beat ready", () => {
    const sections = sectionsWith(["review-required", "ready", "ready"]);
    expect(summarizeInstallerReleaseReadiness(input(), sections, []).status).toBe(
      "review-required",
    );
  });

  it("is ready when every section is ready", () => {
    const sections = sectionsWith(["ready", "ready", "ready"]);
    expect(summarizeInstallerReleaseReadiness(input(), sections, []).status).toBe("ready");
  });

  it("reports plannedWriteSteps from the controlled write summary", () => {
    const base = input();
    const summary = summarizeInstallerReleaseReadiness(base, [], ["r"]);
    expect(summary.plannedWriteSteps).toBe(base.controlledWrite.envelope.summary.plannedSteps);
    expect(summary.uniqueReasons).toBe(1);
  });
});

describe("createInstallerReleaseReadinessReport", () => {
  it("is ok only for ready status with zero reasons", () => {
    const report = createInstallerReleaseReadinessReport(input());
    expect(report.status).toBe("ready");
    expect(report.reasons).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("is not ok when a section blocks", () => {
    const base = input();
    const report = createInstallerReleaseReadinessReport({
      ...base,
      auditExport: {
        ...base.auditExport,
        ok: false,
        validation: { ok: false, reasons: ["audit_reason"] },
      },
    });
    expect(report.ok).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.reasons).toContain("audit_reason");
  });

  it("carries no content, artifact, destination, command, adapter object, or result fields", () => {
    const report = createInstallerReleaseReadinessReport(input());
    for (const key of Object.keys(report)) {
      expect(key).not.toMatch(/content|artifact|asset|dest|command|adapter|object|result|remote|url/i);
    }
    for (const key of Object.keys(report.summary)) {
      expect(key).not.toMatch(/content|artifact|asset|dest|command|adapter|object|result|remote|url/i);
    }
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe("createInstallerReleaseReadinessDryRun", () => {
  it("omits warnings for a ready report", () => {
    const dryRun = createInstallerReleaseReadinessDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a not-ready report", () => {
    const base = input();
    const dryRun = createInstallerReleaseReadinessDryRun({
      ...base,
      auditExport: {
        ...base.auditExport,
        ok: false,
        validation: { ok: false, reasons: ["audit_reason"] },
      },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(dryRun.warnings?.some((warning) => warning.message === "audit_reason")).toBe(true);
  });
});

describe("formatInstallerReleaseReadinessMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const report = createInstallerReleaseReadinessReport(input());
    const markdown = formatInstallerReleaseReadinessMarkdown(report);
    expect(markdown).toBe(formatInstallerReleaseReadinessMarkdown(report));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("includes status, summary, sections, and reasons", () => {
    const report = createInstallerReleaseReadinessReport(input());
    const markdown = formatInstallerReleaseReadinessMarkdown(report);
    expect(markdown).toContain("# OH MY PM Installer Release Readiness");
    expect(markdown).toContain("Status: `ready`");
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("- Planned write steps: 2");
    expect(markdown).toContain("## Sections");
    expect(markdown).toContain("`installer-decision`: `ready` — Installer decision report");
    expect(markdown).toContain("## Reasons");
  });

  it("renders `- none` when there are no reasons", () => {
    const report = createInstallerReleaseReadinessReport(input());
    expect(report.reasons).toEqual([]);
    expect(formatInstallerReleaseReadinessMarkdown(report)).toContain("- none");
  });

  it("lists reasons when present", () => {
    const base = input();
    const report = createInstallerReleaseReadinessReport({
      ...base,
      auditExport: {
        ...base.auditExport,
        ok: false,
        validation: { ok: false, reasons: ["audit_reason"] },
      },
    });
    expect(formatInstallerReleaseReadinessMarkdown(report)).toContain("- `audit_reason`");
  });
});

describe("exampleInstallerReleaseReadinessInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerReleaseReadinessInput()).toEqual(
      exampleInstallerReleaseReadinessInput(),
    );
  });

  it("produces a ready dry run from the fixture chain", () => {
    const dryRun = createInstallerReleaseReadinessDryRun(exampleInstallerReleaseReadinessInput());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.report.status).toBe("ready");
  });
});
