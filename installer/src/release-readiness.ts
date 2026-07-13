// Installer release readiness summary: aggregate already-built non-mutating
// readiness layers (installer decision report, audit trail export dry-run,
// controlled write dry-run envelope) into one small release-readiness report.
// This is a summary layer only — it never creates release outputs, calls a
// write adapter, writes files, or executes an install or rollback.

import type {
  InstallerReleaseReadinessDryRunReport,
  InstallerReleaseReadinessInput,
  InstallerReleaseReadinessReport,
  InstallerReleaseReadinessSection,
  InstallerReleaseReadinessStatus,
  InstallerReleaseReadinessSummary,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Dedupe strings in first-occurrence order without mutating the source. */
function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/** Build the readiness sections in fixed order; inputs are never mutated. */
export function createInstallerReleaseReadinessSections(
  input: InstallerReleaseReadinessInput,
): InstallerReleaseReadinessSection[] {
  const { decision, auditExport, controlledWrite } = input;
  return [
    {
      id: "installer-decision",
      label: "Installer decision report",
      ok: decision.ok,
      status: decision.decision,
      reasons: dedupe([...decision.blockingReasons, ...decision.reviewReasons]),
    },
    {
      id: "audit-export",
      label: "Audit trail export dry-run",
      ok: auditExport.ok,
      status: auditExport.ok ? "ready" : "blocked",
      reasons: dedupe([...auditExport.validation.reasons]),
    },
    {
      id: "controlled-write",
      label: "Controlled write dry-run envelope",
      ok: controlledWrite.ok,
      status: controlledWrite.ok ? "ready" : "blocked",
      reasons: dedupe([...controlledWrite.envelope.summary.reasons]),
    },
  ];
}

/**
 * Collect section reasons in section order, deduped in first-occurrence order.
 * A not-ok section with no reasons of its own contributes a fallback reason.
 */
export function collectInstallerReleaseReadinessReasons(
  sections: readonly InstallerReleaseReadinessSection[],
): string[] {
  const reasons: string[] = [];
  for (const section of sections) {
    if (section.reasons.length > 0) {
      reasons.push(...section.reasons);
    } else if (!section.ok) {
      reasons.push(`release_readiness_section_not_ready:${section.id}`);
    }
  }
  return dedupe(reasons);
}

/** Summarize section counts and aggregate status; nothing is executed. */
export function summarizeInstallerReleaseReadiness(
  input: InstallerReleaseReadinessInput,
  sections: readonly InstallerReleaseReadinessSection[],
  reasons: readonly string[],
): InstallerReleaseReadinessSummary {
  let status: InstallerReleaseReadinessStatus = "ready";
  if (sections.some((section) => section.status === "blocked")) {
    status = "blocked";
  } else if (sections.some((section) => section.status === "review-required")) {
    status = "review-required";
  }
  return {
    status,
    sectionsReady: sections.filter((section) => section.status === "ready").length,
    sectionsBlocked: sections.filter((section) => section.status === "blocked").length,
    sectionsReviewRequired: sections.filter((section) => section.status === "review-required")
      .length,
    uniqueReasons: reasons.length,
    plannedWriteSteps: input.controlledWrite.envelope.summary.plannedSteps,
  };
}

/**
 * Build the release-readiness report. It is ok only when the aggregate status
 * is ready and no reasons remain. Nothing is created or executed.
 */
export function createInstallerReleaseReadinessReport(
  input: InstallerReleaseReadinessInput,
): InstallerReleaseReadinessReport {
  const sections = createInstallerReleaseReadinessSections(input);
  const reasons = collectInstallerReleaseReadinessReasons(sections);
  const summary = summarizeInstallerReleaseReadiness(input, sections, reasons);
  return {
    ok: summary.status === "ready" && reasons.length === 0,
    status: summary.status,
    sections,
    reasons,
    summary,
  };
}

/**
 * Build the report and wrap it in a dry-run report. A ready report omits
 * warnings; otherwise its reasons surface as OMP-I-6001 warnings. Nothing is
 * written.
 */
export function createInstallerReleaseReadinessDryRun(
  input: InstallerReleaseReadinessInput,
): InstallerReleaseReadinessDryRunReport {
  const report = createInstallerReleaseReadinessReport(input);
  if (report.ok) {
    return { ok: true, report };
  }
  return {
    ok: false,
    report,
    warnings: report.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}

/** Render the report as deterministic markdown with one trailing newline. */
export function formatInstallerReleaseReadinessMarkdown(
  report: InstallerReleaseReadinessReport,
): string {
  const lines = [
    "# OH MY PM Installer Release Readiness",
    "",
    `Status: \`${report.status}\``,
    "",
    "## Summary",
    "",
    `- Ready sections: ${report.summary.sectionsReady}`,
    `- Blocked sections: ${report.summary.sectionsBlocked}`,
    `- Review-required sections: ${report.summary.sectionsReviewRequired}`,
    `- Unique reasons: ${report.summary.uniqueReasons}`,
    `- Planned write steps: ${report.summary.plannedWriteSteps}`,
    "",
    "## Sections",
    "",
  ];
  for (const section of report.sections) {
    lines.push(`- \`${section.id}\`: \`${section.status}\` — ${section.label}`);
  }
  lines.push("", "## Reasons", "");
  if (report.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of report.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
