// v0.3 Phase 4 — deterministic brief/JSON/Markdown formatters for `memory`.
//
// Pure rendering of a MemoryCommandOutcome. Output carries no ANSI, no absolute
// path, no raw document content, and no secret. JSON is one newline-terminated
// object with a stable envelope; Markdown uses fixed headings; brief is a
// concise, stable human summary. Success results go to stdout; failures are
// rendered to stderr by the caller in the selected mode.

import type { CliOutputMode } from "@oh-my-pm/contracts";
import type {
  MemoryCaptureOutcome,
  MemoryChangesOutcome,
  MemoryCommandOutcome,
  MemoryDeleteOutcome,
  MemoryExportOutcome,
  MemoryFailureOutcome,
  MemoryHistoryOutcome,
  MemoryStatusOutcome,
  MemoryTimelineOutcome,
} from "@oh-my-pm/application";

/** The stable exit code for a completed outcome (0 on success unless noted). */
export function memoryOutcomeExitCode(outcome: MemoryCommandOutcome): number {
  if (!outcome.ok) return outcome.exitCode;
  // A read command that finds no prior memory / insufficient history is a
  // controlled non-error status with its own exit code (3).
  if (outcome.command === "memory.changes") {
    if (outcome.status === "noPriorMemory" || outcome.status === "insufficientHistory") {
      return 3;
    }
  }
  return 0;
}

/** Render a completed outcome to the selected mode. */
export function formatMemoryOutcome(outcome: MemoryCommandOutcome, mode: CliOutputMode): string {
  if (!outcome.ok) {
    return formatFailure(outcome, mode);
  }
  if (mode === "json") return renderJson(outcome);
  if (mode === "markdown") return renderMarkdown(outcome);
  return renderBrief(outcome);
}

// --- JSON ------------------------------------------------------------------

/** The machine-readable envelope. Data is the outcome minus the command tag. */
function renderJson(outcome: Extract<MemoryCommandOutcome, { ok: true }>): string {
  const { command, ...rest } = outcome as { command: string; ok: true } & Record<string, unknown>;
  const mode = "mode" in rest ? (rest["mode"] as string) : undefined;
  const data: Record<string, unknown> = { ...rest };
  delete data["ok"];
  if (mode !== undefined) delete data["mode"];
  const envelope = {
    command,
    ok: true,
    ...(mode !== undefined ? { mode } : {}),
    data,
    warnings: [] as string[],
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

function renderJsonError(outcome: MemoryFailureOutcome): string {
  const envelope = {
    command: outcome.command,
    ok: false,
    error: { code: outcome.code, message: outcome.message },
    warnings: [] as string[],
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

// --- failure ---------------------------------------------------------------

function formatFailure(outcome: MemoryFailureOutcome, mode: CliOutputMode): string {
  if (mode === "json") return renderJsonError(outcome);
  if (mode === "markdown") {
    return `# OH MY PM Memory Error\n\n- Code: ${outcome.code}\n- Message: ${outcome.message}\n`;
  }
  return `error ${outcome.code}: ${outcome.message}\n`;
}

// --- brief -----------------------------------------------------------------

function renderBrief(outcome: Extract<MemoryCommandOutcome, { ok: true }>): string {
  switch (outcome.command) {
    case "memory.capture":
      return captureBrief(outcome);
    case "memory.changes":
      return changesBrief(outcome);
    case "memory.status":
      return statusBrief(outcome);
    case "memory.history":
      return historyBrief(outcome);
    case "memory.export":
      return exportBrief(outcome);
    case "memory.delete":
      return deleteBrief(outcome);
    case "memory.timeline":
      return timelineBrief(outcome);
  }
}

function captureBrief(o: MemoryCaptureOutcome): string {
  const lines = [`OH MY PM memory capture: ${o.mode}`];
  if (o.mode === "preview") {
    lines.push(`would write: ${o.wouldWrite === false ? "no" : "yes"}`);
    lines.push(`would create snapshot: ${o.wouldCreateSnapshot ? "yes" : "no"}`);
    lines.push(`would be idempotent: ${o.wouldBeIdempotent ? "yes" : "no"}`);
    if (o.wouldMigrateStore) lines.push("would migrate store: yes");
  } else {
    lines.push(`written: ${o.written ? "yes" : "no"}`);
    lines.push(`idempotent: ${o.idempotent ? "yes" : "no"}`);
    if (o.storeMigrated) lines.push("store migrated: yes");
  }
  lines.push(`project: ${o.projectId}`);
  lines.push(`snapshot: ${o.snapshotId}`);
  lines.push(`state fingerprint: ${o.stateFingerprint}`);
  lines.push(`snapshot fingerprint: ${o.snapshotFingerprint}`);
  lines.push(`items: ${o.itemCount}`);
  lines.push(`evidence: ${o.evidenceCount}`);
  lines.push(`snapshots: ${o.snapshotCount}`);
  lines.push(`coverage: ${o.coverageComplete ? "complete" : "partial"}`);
  lines.push("");
  return lines.join("\n");
}

function changesBrief(o: MemoryChangesOutcome): string {
  if (o.status === "noPriorMemory") {
    return `OH MY PM memory changes: no previous observation\nproject: ${o.projectId}\n`;
  }
  if (o.status === "insufficientHistory") {
    return `OH MY PM memory changes: insufficient history\nproject: ${o.projectId}\n`;
  }
  const lines = [`OH MY PM memory changes: ${o.changeCount ?? 0}`, `project: ${o.projectId}`];
  if (o.previousSnapshotId !== undefined) lines.push(`previous: ${o.previousSnapshotId}`);
  if (o.currentSnapshotId !== undefined) lines.push(`current: ${o.currentSnapshotId}`);
  lines.push("");
  return lines.join("\n");
}

function statusBrief(o: MemoryStatusOutcome): string {
  const lines = [
    `OH MY PM memory status: ${o.status}`,
    `project: ${o.projectId}`,
    `snapshots: ${o.snapshotCount}`,
    `evidence: ${o.evidenceCount}`,
    `latest snapshot: ${o.latestSnapshotId ?? "none"}`,
  ];
  if (o.storeFormatVersion !== null) lines.push(`store format: ${o.storeFormatVersion}`);
  if (o.projectBrainSchemaVersion !== null) {
    lines.push(`schema: ${o.projectBrainSchemaVersion}`);
  }
  if (o.issues.length > 0) lines.push(`issues: ${o.issues.join(", ")}`);
  lines.push("");
  return lines.join("\n");
}

function historyBrief(o: MemoryHistoryOutcome): string {
  const lines = [`OH MY PM memory history: ${o.records.length} of ${o.snapshotCount}`];
  lines.push(`project: ${o.projectId}`);
  if (o.chronologyOrigin !== undefined) lines.push(`chronology: ${o.chronologyOrigin}`);
  for (const record of o.records) {
    lines.push(
      `- #${record.sequence} ${record.snapshotId} @ ${record.capturedAt}${record.isLatest ? " (latest)" : ""}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function exportBrief(o: MemoryExportOutcome): string {
  const lines = [`OH MY PM memory export: ${o.mode}`];
  if (o.mode === "preview") {
    lines.push(`would export: ${o.wouldExport ? "yes" : "no"}`);
  } else {
    lines.push(`exported: ${o.exported ? "yes" : "no"}`);
  }
  lines.push(`project: ${o.projectId}`);
  lines.push(`destination: ${o.destination}`);
  lines.push(`snapshots: ${o.snapshotCount}`);
  lines.push(`evidence: ${o.evidenceCount}`);
  lines.push("");
  return lines.join("\n");
}

function deleteBrief(o: MemoryDeleteOutcome): string {
  const lines = [`OH MY PM memory delete: ${o.mode}`];
  lines.push(`project: ${o.projectId}`);
  lines.push(`store exists: ${o.storeExists ? "yes" : "no"}`);
  if (o.mode === "preview") {
    lines.push(`would delete: ${o.wouldDelete ? "yes" : "no"}`);
    if (o.snapshotCount !== undefined) lines.push(`snapshots: ${o.snapshotCount}`);
    if (o.evidenceCount !== undefined) lines.push(`evidence: ${o.evidenceCount}`);
  } else {
    lines.push(`deleted: ${o.deleted ? "yes" : "no"}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * A concise timeline summary. Bounded and allow-listed: it shows the same fields
 * as the JSON projection and never more.
 */
function timelineBrief(o: MemoryTimelineOutcome): string {
  const lines = [`OH MY PM memory timeline: ${o.eventCount}`];
  lines.push(`project: ${o.projectId}`);
  lines.push(`limit: ${o.limit}`);
  if (o.category !== undefined) lines.push(`category: ${o.category}`);
  if (o.kind !== undefined) lines.push(`kind: ${o.kind}`);
  lines.push(`more: ${o.hasMore ? "yes" : "no"}`);
  if (o.nextBeforeSequence !== undefined) {
    lines.push(`next before sequence: ${o.nextBeforeSequence}`);
  }
  for (const event of o.events) {
    const detail = [
      event.status !== undefined ? `status ${event.status}` : "",
      event.severity !== undefined ? `severity ${event.severity}` : "",
      event.dueDate !== undefined ? `due ${event.dueDate}` : "",
    ]
      .filter((part) => part !== "")
      .join(", ");
    lines.push(
      `- #${event.captureSequence}.${event.eventSequence} ${event.category} ${event.kind} ${event.subjectId}` +
        `${event.title !== undefined ? ` — ${event.title}` : ""}` +
        `${detail !== "" ? ` (${detail})` : ""}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// --- markdown --------------------------------------------------------------

function renderMarkdown(outcome: Extract<MemoryCommandOutcome, { ok: true }>): string {
  switch (outcome.command) {
    case "memory.capture":
      return captureMarkdown(outcome);
    case "memory.changes":
      return changesMarkdown(outcome);
    case "memory.status":
      return statusMarkdown(outcome);
    case "memory.history":
      return historyMarkdown(outcome);
    case "memory.export":
      return exportMarkdown(outcome);
    case "memory.delete":
      return deleteMarkdown(outcome);
    case "memory.timeline":
      return timelineMarkdown(outcome);
  }
}

function captureMarkdown(o: MemoryCaptureOutcome): string {
  const rows = [
    `- Mode: ${o.mode}`,
    o.mode === "preview"
      ? `- Would write: ${o.wouldWrite === false ? "no" : "yes"}`
      : `- Written: ${o.written ? "yes" : "no"}`,
    o.mode === "preview"
      ? `- Would create snapshot: ${o.wouldCreateSnapshot ? "yes" : "no"}`
      : `- Idempotent: ${o.idempotent ? "yes" : "no"}`,
    o.mode === "preview" ? `- Would be idempotent: ${o.wouldBeIdempotent ? "yes" : "no"}` : "",
    o.mode === "preview" && o.wouldMigrateStore ? "- Would migrate store: yes" : "",
    o.mode === "applied" && o.storeMigrated ? "- Store migrated: yes" : "",
    `- Project: \`${o.projectId}\``,
    `- Snapshot: \`${o.snapshotId}\``,
    `- State fingerprint: \`${o.stateFingerprint}\``,
    `- Snapshot fingerprint: \`${o.snapshotFingerprint}\``,
    `- Items: ${o.itemCount}`,
    `- Evidence: ${o.evidenceCount}`,
    `- Snapshots: ${o.snapshotCount}`,
    `- Coverage: ${o.coverageComplete ? "complete" : "partial"}`,
  ].filter((line) => line !== "");
  return ["# OH MY PM Memory Capture", "", ...rows, ""].join("\n");
}

function changesMarkdown(o: MemoryChangesOutcome): string {
  if (o.status !== "compared") {
    const label = o.status === "noPriorMemory" ? "No previous observation" : "Insufficient history";
    return [
      "# OH MY PM Memory Changes",
      "",
      `- Status: ${o.status}`,
      `- ${label}`,
      `- Project: \`${o.projectId}\``,
      "",
    ].join("\n");
  }
  const rows = [
    `- Status: compared`,
    `- Project: \`${o.projectId}\``,
    `- Changes: ${o.changeCount ?? 0}`,
  ];
  if (o.previousSnapshotId !== undefined) rows.push(`- Previous: \`${o.previousSnapshotId}\``);
  if (o.currentSnapshotId !== undefined) rows.push(`- Current: \`${o.currentSnapshotId}\``);
  return ["# OH MY PM Memory Changes", "", ...rows, ""].join("\n");
}

function statusMarkdown(o: MemoryStatusOutcome): string {
  const rows = [
    `- Status: ${o.status}`,
    `- Project: \`${o.projectId}\``,
    `- Snapshots: ${o.snapshotCount}`,
    `- Evidence: ${o.evidenceCount}`,
    `- Latest snapshot: ${o.latestSnapshotId !== null ? `\`${o.latestSnapshotId}\`` : "none"}`,
    `- Store format: ${o.storeFormatVersion ?? "n/a"}`,
    `- Schema: ${o.projectBrainSchemaVersion ?? "n/a"}`,
  ];
  if (o.issues.length > 0) rows.push(`- Issues: ${o.issues.join(", ")}`);
  return ["# OH MY PM Memory Status", "", ...rows, ""].join("\n");
}

function historyMarkdown(o: MemoryHistoryOutcome): string {
  const lines = [
    "# OH MY PM Memory History",
    "",
    `- Project: \`${o.projectId}\``,
    `- Shown: ${o.records.length} of ${o.snapshotCount}`,
    ...(o.chronologyOrigin !== undefined ? [`- Chronology: ${o.chronologyOrigin}`] : []),
    "",
    "## Snapshots",
    "",
  ];
  if (o.records.length === 0) {
    lines.push("- none");
  } else {
    for (const record of o.records) {
      lines.push(
        `- #${record.sequence} \`${record.snapshotId}\` @ ${record.capturedAt}${record.isLatest ? " (latest)" : ""}`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function exportMarkdown(o: MemoryExportOutcome): string {
  const rows = [
    `- Mode: ${o.mode}`,
    o.mode === "preview"
      ? `- Would export: ${o.wouldExport ? "yes" : "no"}`
      : `- Exported: ${o.exported ? "yes" : "no"}`,
    `- Project: \`${o.projectId}\``,
    `- Destination: \`${o.destination}\``,
    `- Snapshots: ${o.snapshotCount}`,
    `- Evidence: ${o.evidenceCount}`,
  ];
  return ["# OH MY PM Memory Export", "", ...rows, ""].join("\n");
}

/**
 * Group events by capture (sequence + capture timestamp) under fixed headings.
 * No summary is invented: every line restates recorded, allow-listed fields.
 */
function timelineMarkdown(o: MemoryTimelineOutcome): string {
  const lines = [
    "# OH MY PM Memory Timeline",
    "",
    `- Project: \`${o.projectId}\``,
    `- Events: ${o.eventCount}`,
    `- Limit: ${o.limit}`,
    ...(o.category !== undefined ? [`- Category: ${o.category}`] : []),
    ...(o.kind !== undefined ? [`- Kind: ${o.kind}`] : []),
    `- More: ${o.hasMore ? "yes" : "no"}`,
    ...(o.nextBeforeSequence !== undefined
      ? [`- Next before sequence: ${o.nextBeforeSequence}`]
      : []),
    "",
    "## Captures",
    "",
  ];
  if (o.events.length === 0) {
    lines.push("- none");
    lines.push("");
    return lines.join("\n");
  }
  // The events arrive newest-capture-first and grouped by capture already; walk
  // them in order and open a heading at each capture boundary.
  let currentSequence: number | null = null;
  for (const event of o.events) {
    if (event.captureSequence !== currentSequence) {
      if (currentSequence !== null) lines.push("");
      currentSequence = event.captureSequence;
      lines.push(`### Capture #${event.captureSequence} — ${event.capturedAt}`);
      lines.push("");
      lines.push(`- Snapshot: \`${event.snapshotId}\``);
    }
    const detail = [
      event.status !== undefined ? `status: ${event.status}` : "",
      event.severity !== undefined ? `severity: ${event.severity}` : "",
      event.dueDate !== undefined ? `due: ${event.dueDate}` : "",
      `evidence: ${event.evidenceCount}`,
    ]
      .filter((part) => part !== "")
      .join(", ");
    lines.push(
      `- ${event.category} ${event.kind} \`${event.subjectId}\`` +
        `${event.title !== undefined ? ` — ${event.title}` : ""} (${detail})`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function deleteMarkdown(o: MemoryDeleteOutcome): string {
  const rows = [
    `- Mode: ${o.mode}`,
    `- Project: \`${o.projectId}\``,
    `- Store exists: ${o.storeExists ? "yes" : "no"}`,
  ];
  if (o.mode === "preview") {
    rows.push(`- Would delete: ${o.wouldDelete ? "yes" : "no"}`);
    if (o.snapshotCount !== undefined) rows.push(`- Snapshots: ${o.snapshotCount}`);
    if (o.evidenceCount !== undefined) rows.push(`- Evidence: ${o.evidenceCount}`);
  } else {
    rows.push(`- Deleted: ${o.deleted ? "yes" : "no"}`);
  }
  return ["# OH MY PM Memory Delete", "", ...rows, ""].join("\n");
}
