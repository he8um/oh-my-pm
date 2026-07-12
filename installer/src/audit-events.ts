// Installer audit event model: turn a local decision report into a
// deterministic in-memory event sequence describing the preview pipeline.
// Events are returned to the caller only — nothing here writes logs, persists
// audit files, emits metrics, retrieves packages, or executes anything.

import type {
  InstallerAuditEvent,
  InstallerAuditEventDryRunReport,
  InstallerAuditEventInput,
  InstallerAuditEventKind,
  InstallerAuditEventLevel,
  InstallerAuditEventValidationReport,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

const AUDIT_EVENT_KINDS: readonly InstallerAuditEventKind[] = [
  "preview_started",
  "section_evaluated",
  "decision_reported",
  "preview_completed",
];

const AUDIT_EVENT_LEVELS: readonly InstallerAuditEventLevel[] = ["info", "warning", "error"];

/** Build one audit event, attaching optional fields only when provided. */
export function createInstallerAuditEvent(input: {
  sequence: number;
  kind: InstallerAuditEventKind;
  level: InstallerAuditEventLevel;
  message: string;
  root: string;
  subject?: string;
  reason?: string;
}): InstallerAuditEvent {
  return {
    sequence: input.sequence,
    kind: input.kind,
    level: input.level,
    message: input.message,
    root: input.root,
    ...(input.subject === undefined ? {} : { subject: input.subject }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

/**
 * Build the full event sequence for a decision report: a start event, one or
 * more section events per section (one per reason when reasons exist), the
 * decision event, and a completion event. Sequences are contiguous from 1 and
 * the report is never mutated.
 */
export function createInstallerAuditEvents(
  input: InstallerAuditEventInput,
): InstallerAuditEvent[] {
  const { root, decision } = input;
  const events: InstallerAuditEvent[] = [];
  let sequence = 1;

  events.push(
    createInstallerAuditEvent({
      sequence: sequence++,
      kind: "preview_started",
      level: "info",
      message: "Installer preview started",
      root,
    }),
  );

  for (const section of decision.sections) {
    if (section.reasons.length === 0) {
      events.push(
        createInstallerAuditEvent({
          sequence: sequence++,
          kind: "section_evaluated",
          level: section.ok ? "info" : "warning",
          message: section.ok
            ? "Section evaluated successfully"
            : "Section evaluated with issues",
          root,
          subject: section.name,
        }),
      );
    } else {
      for (const reason of section.reasons) {
        events.push(
          createInstallerAuditEvent({
            sequence: sequence++,
            kind: "section_evaluated",
            level: section.ok ? "warning" : "error",
            message: "Section reason recorded",
            root,
            subject: section.name,
            reason,
          }),
        );
      }
    }
  }

  let decisionLevel: InstallerAuditEventLevel;
  if (decision.decision === "ready") {
    decisionLevel = "info";
  } else if (decision.decision === "review-required") {
    decisionLevel = "warning";
  } else {
    decisionLevel = "error";
  }
  events.push(
    createInstallerAuditEvent({
      sequence: sequence++,
      kind: "decision_reported",
      level: decisionLevel,
      message: "Installer decision reported",
      root,
      subject: decision.decision,
    }),
  );

  events.push(
    createInstallerAuditEvent({
      sequence: sequence++,
      kind: "preview_completed",
      level: decision.ok ? "info" : "warning",
      message: "Installer preview completed",
      root,
      subject: decision.decision,
    }),
  );

  return events;
}

/** Validate an event sequence; reasons are deterministic and each appears once. */
export function validateInstallerAuditEvents(
  events: readonly InstallerAuditEvent[],
): InstallerAuditEventValidationReport {
  const reasons: string[] = [];

  if (events.length === 0) {
    reasons.push("audit_events_must_not_be_empty");
    return { ok: false, reasons };
  }

  const sequenceInvalid = events.some(
    (event, index) => event.sequence !== index + 1,
  );
  if (sequenceInvalid) {
    reasons.push("audit_event_sequence_invalid");
  }

  if (events.some((event) => !AUDIT_EVENT_KINDS.includes(event.kind))) {
    reasons.push("audit_event_kind_invalid");
  }
  if (events.some((event) => !AUDIT_EVENT_LEVELS.includes(event.level))) {
    reasons.push("audit_event_level_invalid");
  }
  if (events.some((event) => event.message.length === 0)) {
    reasons.push("audit_event_message_missing");
  }
  if (events.some((event) => event.root.length === 0)) {
    reasons.push("audit_event_root_missing");
  }

  const seen = new Set<number>();
  let duplicate = false;
  for (const event of events) {
    if (seen.has(event.sequence)) {
      duplicate = true;
      break;
    }
    seen.add(event.sequence);
  }
  if (duplicate) {
    reasons.push("audit_event_duplicate_sequence");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Build and validate the audit event sequence. A valid sequence omits
 * warnings; an invalid one surfaces its reasons as OMP-I-6001 warnings.
 */
export function createInstallerAuditEventDryRun(
  input: InstallerAuditEventInput,
): InstallerAuditEventDryRunReport {
  const events = createInstallerAuditEvents(input);
  const validation = validateInstallerAuditEvents(events);
  if (validation.ok) {
    return { ok: true, events, validation };
  }
  return {
    ok: false,
    events,
    validation,
    warnings: validation.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}

/** Render an event sequence as deterministic markdown with one trailing newline. */
export function formatInstallerAuditEventsMarkdown(
  events: readonly InstallerAuditEvent[],
): string {
  const lines = ["# OH MY PM Installer Audit Events", ""];
  for (const event of events) {
    const body =
      event.subject === undefined ? event.message : `${event.subject} — ${event.message}`;
    const suffix = event.reason === undefined ? "" : ` reason: ${event.reason}`;
    lines.push(
      `- \`${event.sequence}\` \`${event.level}\` \`${event.kind}\` ${body}${suffix}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
