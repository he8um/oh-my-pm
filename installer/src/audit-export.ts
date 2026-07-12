// Installer audit trail export plan: render a local in-memory audit event
// sequence into an export payload (JSON, JSONL, or Markdown). The payload is
// returned to the caller only — nothing here writes files, persists logs,
// sends metrics, retrieves packages, or executes anything. The fingerprint
// is descriptive metadata, not a cryptographic checksum.

import type {
  InstallerAuditEvent,
  InstallerAuditTrailExportDryRunReport,
  InstallerAuditTrailExportFormat,
  InstallerAuditTrailExportInput,
  InstallerAuditTrailExportPlan,
  InstallerAuditTrailExportValidationReport,
} from "./types.js";
import { formatInstallerAuditEventsMarkdown } from "./audit-events.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

const AUDIT_TRAIL_EXPORT_FORMATS: readonly InstallerAuditTrailExportFormat[] = [
  "json",
  "jsonl",
  "markdown",
];

/** True only for a supported export format value. */
export function validateInstallerAuditTrailExportFormat(
  value: string,
): value is InstallerAuditTrailExportFormat {
  return (AUDIT_TRAIL_EXPORT_FORMATS as readonly string[]).includes(value);
}

/**
 * Render an event sequence as export content. `json` is pretty-printed with a
 * two-space indent; `jsonl` is one JSON object per line with exactly one
 * trailing newline when events exist; `markdown` reuses the audit event
 * renderer. The input events are never mutated.
 */
export function formatInstallerAuditTrailExportContent(
  events: readonly InstallerAuditEvent[],
  format: InstallerAuditTrailExportFormat,
): string {
  if (format === "json") {
    return JSON.stringify([...events], null, 2);
  }
  if (format === "jsonl") {
    if (events.length === 0) {
      return "";
    }
    return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
  }
  return formatInstallerAuditEventsMarkdown(events);
}

/** Build a deterministic export plan; no cryptography, filesystem, or logging. */
export function createInstallerAuditTrailExportPlan(
  input: InstallerAuditTrailExportInput,
): InstallerAuditTrailExportPlan {
  const { events, format } = input;
  const content = formatInstallerAuditTrailExportContent(events, format);
  const eventCount = events.length;
  const sizeBytes = new TextEncoder().encode(content).length;
  return {
    format,
    eventCount,
    sizeBytes,
    fingerprint: `audit-export:${format}:${eventCount}:${sizeBytes}`,
    content,
  };
}

/** Validate an export plan; reasons are deterministic and each appears once. */
export function validateInstallerAuditTrailExportPlan(
  plan: InstallerAuditTrailExportPlan,
): InstallerAuditTrailExportValidationReport {
  const reasons: string[] = [];

  if (!validateInstallerAuditTrailExportFormat(plan.format)) {
    reasons.push("audit_trail_export_format_invalid");
  }
  if (plan.eventCount === 0) {
    reasons.push("audit_trail_export_events_empty");
  }
  if (plan.content.length === 0) {
    reasons.push("audit_trail_export_content_missing");
  }
  if (plan.sizeBytes < 0 || plan.sizeBytes !== new TextEncoder().encode(plan.content).length) {
    reasons.push("audit_trail_export_size_invalid");
  }
  if (plan.fingerprint.length === 0) {
    reasons.push("audit_trail_export_fingerprint_missing");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Build and validate the export plan. A valid plan omits warnings; an invalid
 * one surfaces its reasons as OMP-I-6001 warnings. Nothing is written or sent.
 */
export function createInstallerAuditTrailExportDryRun(
  input: InstallerAuditTrailExportInput,
): InstallerAuditTrailExportDryRunReport {
  const plan = createInstallerAuditTrailExportPlan(input);
  const validation = validateInstallerAuditTrailExportPlan(plan);
  if (validation.ok) {
    return { ok: true, plan, validation };
  }
  return {
    ok: false,
    plan,
    validation,
    warnings: validation.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
