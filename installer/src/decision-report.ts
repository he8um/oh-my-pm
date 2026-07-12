// Installer decision report: aggregate the local preview layers (assembly,
// archive, metadata, integrity, channel, update policy, update impact, and
// rollback impact) into one deterministic verdict. This is a pure read of
// already computed local reports — nothing here retrieves packages, creates
// archives, writes files, or runs installation or rollback.

import type {
  InstallerDecisionDryRunReport,
  InstallerDecisionReport,
  InstallerDecisionReportInput,
  InstallerDecisionReportSection,
  InstallerDecisionReportSummary,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Append each reason once, preserving first-occurrence order. */
function dedupe(reasons: readonly string[]): string[] {
  const out: string[] = [];
  for (const reason of reasons) {
    if (!out.includes(reason)) {
      out.push(reason);
    }
  }
  return out;
}

/** Warning messages carried by a dry-run report, in order. */
function warningMessages(warnings?: readonly { message: string }[]): string[] {
  return (warnings ?? []).map((warning) => warning.message);
}

/**
 * Build the eight decision sections in a fixed order. Each section's verdict
 * and reasons come straight from the matching local report; inputs are never
 * mutated and no signature value is ever copied in.
 */
export function createInstallerDecisionSections(
  input: InstallerDecisionReportInput,
): InstallerDecisionReportSection[] {
  return [
    {
      name: "assembly",
      ok: input.assembly.ok,
      reasons: dedupe(warningMessages(input.assembly.warnings)),
    },
    {
      name: "archive",
      ok: input.archive.ok,
      reasons: dedupe(warningMessages(input.archive.warnings)),
    },
    {
      name: "metadata",
      ok: input.metadata.ok,
      reasons: dedupe(input.metadata.validation.reasons),
    },
    {
      name: "integrity",
      ok: input.integrity.ok,
      reasons: dedupe(input.integrity.verification.reasons),
    },
    {
      name: "channel",
      ok: input.channel.ok,
      reasons: dedupe(input.channel.validation.reasons),
    },
    {
      name: "update-policy",
      ok: input.updatePolicy.ok,
      reasons: dedupe(input.updatePolicy.report.reasons),
    },
    {
      name: "update-impact",
      ok: input.updateImpact.ok,
      reasons: dedupe(input.updateImpact.preview.reasons),
    },
    {
      name: "rollback-impact",
      ok: input.rollbackImpact.ok,
      reasons: dedupe(input.rollbackImpact.preview.reasons),
    },
  ];
}

/**
 * Collect blocking reasons: every reason from a failed section, plus a marker
 * when there are no install operations. Deduped in first-occurrence order.
 */
export function collectInstallerDecisionBlockingReasons(
  sections: readonly InstallerDecisionReportSection[],
): string[] {
  const reasons: string[] = [];
  for (const section of sections) {
    if (!section.ok) {
      reasons.push(...section.reasons);
    }
  }
  return dedupe(reasons);
}

/**
 * Collect review reasons: benign no-op or warning states that do not block a
 * ready verdict but warrant a human look. Deduped in first-occurrence order.
 */
export function collectInstallerDecisionReviewReasons(
  input: InstallerDecisionReportInput,
  sections: readonly InstallerDecisionReportSection[],
): string[] {
  const reasons: string[] = [];

  if (input.updatePolicy.report.decision === "already-current") {
    reasons.push("update_policy_already_current");
  }

  const updateOperations = input.updateImpact.preview.operations;
  if (
    updateOperations.length === 0 ||
    updateOperations.every((operation) => operation.kind === "unchanged")
  ) {
    reasons.push("update_impact_no_changes");
  }

  const rollbackOperations = input.rollbackImpact.preview.operations;
  if (
    rollbackOperations.length === 0 ||
    rollbackOperations.every((operation) => operation.kind === "unchanged")
  ) {
    reasons.push("rollback_impact_no_changes");
  }

  const hasBlocking = sections.some((section) => !section.ok);
  const hasReasons = sections.some((section) => section.reasons.length > 0);
  if (!hasBlocking && hasReasons) {
    reasons.push("install_preview_has_warnings");
  }

  return dedupe(reasons);
}

/** Aggregate counts across the local preview layers. */
export function summarizeInstallerDecisionReport(
  input: InstallerDecisionReportInput,
): InstallerDecisionReportSummary {
  const sections = createInstallerDecisionSections(input);
  const uniqueReasons = dedupe(sections.flatMap((section) => section.reasons));
  return {
    installOperations: input.installOperations.length,
    archiveEntries: input.archive.plan.entries.length,
    channelEntries: input.channel.channel.entries.length,
    updateImpactOperations: input.updateImpact.preview.operations.length,
    rollbackImpactOperations: input.rollbackImpact.preview.operations.length,
    warnings: uniqueReasons.length,
  };
}

/**
 * Build the aggregated decision report. `blocked` wins over `review-required`,
 * and `ready` requires no blocking and no review reasons; `ok` is true only
 * for a `ready` decision. Inputs are never mutated.
 */
export function createInstallerDecisionReport(
  input: InstallerDecisionReportInput,
): InstallerDecisionReport {
  const sections = createInstallerDecisionSections(input);
  const blockingReasons = collectInstallerDecisionBlockingReasons(sections);
  if (input.installOperations.length === 0) {
    if (!blockingReasons.includes("install_operations_empty")) {
      blockingReasons.push("install_operations_empty");
    }
  }
  const reviewReasons = collectInstallerDecisionReviewReasons(input, sections);
  const summary = summarizeInstallerDecisionReport(input);

  let decision: InstallerDecisionReport["decision"];
  if (blockingReasons.length > 0) {
    decision = "blocked";
  } else if (reviewReasons.length > 0) {
    decision = "review-required";
  } else {
    decision = "ready";
  }

  return {
    ok: decision === "ready",
    decision,
    root: input.root,
    sections,
    blockingReasons,
    reviewReasons,
    summary,
  };
}

/**
 * Wrap the decision report in a dry-run report. A ready report omits warnings;
 * otherwise its blocking and review reasons surface as OMP-I-6001 warnings.
 */
export function createInstallerDecisionDryRun(
  input: InstallerDecisionReportInput,
): InstallerDecisionDryRunReport {
  const report = createInstallerDecisionReport(input);
  if (report.ok) {
    return { ok: true, report };
  }
  return {
    ok: false,
    report,
    warnings: [...report.blockingReasons, ...report.reviewReasons].map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}

/** Render a decision report as deterministic markdown with one trailing newline. */
export function formatInstallerDecisionReportMarkdown(
  report: InstallerDecisionReport,
): string {
  const lines = [
    "# OH MY PM Installer Decision Report",
    "",
    `Decision: \`${report.decision}\``,
    `Root: \`${report.root}\``,
    "",
    "## Summary",
    "",
    `- Install operations: ${report.summary.installOperations}`,
    `- Archive entries: ${report.summary.archiveEntries}`,
    `- Channel entries: ${report.summary.channelEntries}`,
    `- Update impact operations: ${report.summary.updateImpactOperations}`,
    `- Rollback impact operations: ${report.summary.rollbackImpactOperations}`,
    `- Unique warnings: ${report.summary.warnings}`,
    "",
    "## Sections",
    "",
  ];
  for (const section of report.sections) {
    lines.push(`- \`${section.name}\`: ${section.ok ? "ok" : "failed"}`);
  }
  lines.push("", "## Blocking Reasons", "");
  if (report.blockingReasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of report.blockingReasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  lines.push("", "## Review Reasons", "");
  if (report.reviewReasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of report.reviewReasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
