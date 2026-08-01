// v0.4 — the pure, strict projector for `project_timeline`.
//
// Projects a Kernel TimelineResult into the bounded, sanitized public MCP
// result. Pure: no I/O, no clock, no randomness. The projection is an
// ALLOWLIST — it copies only the allow-listed event fields and drops (never
// partially emits) any event whose required identifiers are unsafe.

import type { TimelineEvent, TimelineResult } from "@oh-my-pm/contracts";
import {
  CHANGE_COUNT_ORDER,
  MAX_DUE_DATE_BYTES,
  MAX_ITEM_ID_BYTES,
  MAX_PROJECT_ID_BYTES,
  MAX_SEVERITY_BYTES,
  MAX_SNAPSHOT_ID_BYTES,
  MAX_STATUS_BYTES,
  MAX_TITLE_BYTES,
  safeOptionalDisplay,
  safeRequiredId,
} from "./project-changes-projector.js";
import type { McpChangeCategory, McpChangeItemKind } from "./project-changes-types.js";
import type {
  McpProjectedTimelineEvent,
  McpProjectTimelineResult,
} from "./project-timeline-types.js";

// --- Central projection bounds ---------------------------------------------

/** A derived event id: `event:sha256:<64 hex>` is 77 bytes; bound generously. */
export const MAX_EVENT_ID_BYTES = 256;
export const MAX_CAPTURED_AT_BYTES = 64;

/** Default / min / max for the timeline page size. Mirrors the Kernel bounds. */
export const DEFAULT_TIMELINE_LIMIT = 20;
export const MIN_TIMELINE_LIMIT = 1;
export const MAX_TIMELINE_LIMIT = 100;

/** The largest capture sequence a caller may page before. */
export const MAX_BEFORE_SEQUENCE = Number.MAX_SAFE_INTEGER;

const VALID_CATEGORIES = new Set<string>(CHANGE_COUNT_ORDER);
const VALID_ITEM_KINDS = new Set<string>([
  "milestone",
  "task",
  "risk",
  "decision",
  "dependency",
  "blocker",
]);

/** Whether a value is a safe non-negative integer ordinal. */
function safeOrdinal(value: unknown, minimum: number): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < minimum) return null;
  return value;
}

/**
 * Project one Kernel TimelineEvent to the bounded public event, or null when a
 * required field is unsafe. A dropped event is never partially emitted.
 *
 * secretSentinels are unique planted values a caller (test) wants scrubbed from
 * optional display fields.
 */
export function projectTimelineEvent(
  event: TimelineEvent,
  secretSentinels: readonly string[] = [],
): McpProjectedTimelineEvent | null {
  const category = event.category as string;
  const kind = event.kind as string;
  if (!VALID_CATEGORIES.has(category) || !VALID_ITEM_KINDS.has(kind)) return null;

  const eventId = safeRequiredId(event.eventId, MAX_EVENT_ID_BYTES);
  const snapshotId = safeRequiredId(event.snapshotId, MAX_SNAPSHOT_ID_BYTES);
  const subjectId = safeRequiredId(event.subjectId, MAX_ITEM_ID_BYTES);
  const capturedAt = safeRequiredId(event.capturedAt, MAX_CAPTURED_AT_BYTES);
  if (eventId === null || snapshotId === null || subjectId === null || capturedAt === null) {
    return null;
  }
  const captureSequence = safeOrdinal(event.captureSequence, 1);
  const eventSequence = safeOrdinal(event.eventSequence, 0);
  const evidenceCount = safeOrdinal(event.evidenceCount, 0);
  if (captureSequence === null || eventSequence === null || evidenceCount === null) {
    return null;
  }

  const title = safeOptionalDisplay(event.title, MAX_TITLE_BYTES, secretSentinels);
  const status = safeOptionalDisplay(event.status, MAX_STATUS_BYTES, secretSentinels);
  const severity = safeOptionalDisplay(event.severity, MAX_SEVERITY_BYTES, secretSentinels);
  const dueDate = safeOptionalDisplay(event.dueDate, MAX_DUE_DATE_BYTES, secretSentinels);

  return {
    eventId,
    snapshotId,
    captureSequence,
    eventSequence,
    capturedAt,
    category: category as McpChangeCategory,
    kind: kind as McpChangeItemKind,
    subjectId,
    ...(title !== undefined ? { title } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(severity !== undefined ? { severity } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    evidenceCount,
  };
}

/**
 * Build the bounded, sanitized public result from a Kernel TimelineResult.
 *
 * The Kernel has ALREADY applied the validated limit with capture-boundary
 * semantics (a page never splits a capture, so a single over-limit capture is
 * returned whole and reported truthfully). This projection therefore sanitizes
 * and must NOT re-truncate the page: trimming here would drop events from the
 * middle of a capture while the pagination cursor advanced past the whole
 * capture, silently skipping them.
 *
 * The `limit` is still accepted and enforced as a defensive ceiling against a
 * Kernel that returned more than the caller could ever have asked for — but the
 * ceiling is applied at a CAPTURE boundary, never inside one.
 */
export function projectTimelineResult(
  timeline: TimelineResult,
  projectId: string,
  limit: number,
  secretSentinels: readonly string[] = [],
): McpProjectTimelineResult {
  const boundedLimit = Math.max(MIN_TIMELINE_LIMIT, Math.min(limit, MAX_TIMELINE_LIMIT));
  const source = Array.isArray(timeline.events) ? timeline.events : [];

  // Sanitize every event first. An event whose required identifiers are unsafe
  // is dropped, never partially emitted.
  const sanitized: McpProjectedTimelineEvent[] = [];
  let dropped = 0;
  for (const event of source) {
    const one = projectTimelineEvent(event, secretSentinels);
    if (one !== null) sanitized.push(one);
    else dropped += 1;
  }

  // Defensive capture-boundary ceiling: consume whole captures until the next
  // one would exceed the limit. The first capture is always taken, matching the
  // Kernel's own rule.
  const events: McpProjectedTimelineEvent[] = [];
  let index = 0;
  let truncatedHere = false;
  while (index < sanitized.length) {
    const captureSequence = sanitized[index]!.captureSequence;
    const capture: McpProjectedTimelineEvent[] = [];
    while (index < sanitized.length && sanitized[index]!.captureSequence === captureSequence) {
      capture.push(sanitized[index]!);
      index += 1;
    }
    if (events.length > 0 && events.length + capture.length > boundedLimit) {
      truncatedHere = true;
      break;
    }
    events.push(...capture);
  }

  // hasMore stays truthful: the Kernel's own verdict, OR-ed with the fact that
  // this projection dropped an unsafe event or applied its own ceiling.
  const hasMore = timeline.hasMore === true || truncatedHere || dropped > 0;
  // When this projection did the bounding, the cursor must reflect the lowest
  // capture actually returned, not the Kernel's cursor for a longer page.
  const nextBeforeSequence =
    truncatedHere || dropped > 0
      ? lowestCaptureSequence(events)
      : safeOrdinal(timeline.nextBeforeSequence, 0);

  return {
    schemaVersion: 1,
    projectId,
    eventCount: events.length,
    hasMore,
    ...(hasMore && nextBeforeSequence !== null && nextBeforeSequence !== undefined
      ? { nextBeforeSequence }
      : {}),
    chronology: "capture-order",
    events,
  };
}

/** The lowest capture sequence present in a projected page, or null if empty. */
function lowestCaptureSequence(events: readonly McpProjectedTimelineEvent[]): number | null {
  let lowest: number | null = null;
  for (const event of events) {
    if (lowest === null || event.captureSequence < lowest) lowest = event.captureSequence;
  }
  return lowest;
}

/** Build an empty, valid result (no prior memory or no comparable history). */
export function emptyTimelineResult(projectId: string): McpProjectTimelineResult {
  return {
    schemaVersion: 1,
    projectId,
    eventCount: 0,
    hasMore: false,
    chronology: "capture-order",
    events: [],
  };
}

/** Validate a public project id defensively (mirrors the changes runner). */
export function safeProjectId(value: unknown): string | null {
  return safeRequiredId(value, MAX_PROJECT_ID_BYTES);
}

// --- Deterministic Markdown -------------------------------------------------

/** Escape a cell so a Markdown table row/column never breaks or injects. */
function escapeCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
}

/**
 * Render the strict result as deterministic, sanitized Markdown, grouped by
 * capture. No summary is invented: every line restates recorded fields.
 */
export function renderProjectTimelineMarkdown(result: McpProjectTimelineResult): string {
  const lines: string[] = ["# Project Timeline", ""];
  lines.push(`- Project: \`${escapeCell(result.projectId)}\``);
  lines.push(`- Chronology: ${result.chronology}`);
  lines.push(`- Events: ${result.eventCount}`);
  lines.push(`- More: ${result.hasMore ? "yes" : "no"}`);
  if (result.nextBeforeSequence !== undefined) {
    lines.push(`- Next before sequence: ${result.nextBeforeSequence}`);
  }
  lines.push("");
  if (result.events.length === 0) {
    lines.push("No timeline events: capture this project at least twice through the CLI first.");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }
  lines.push("## Captures", "");
  let currentSequence: number | null = null;
  for (const event of result.events) {
    if (event.captureSequence !== currentSequence) {
      if (currentSequence !== null) lines.push("");
      currentSequence = event.captureSequence;
      lines.push(
        `### Capture #${event.captureSequence} — ${escapeCell(event.capturedAt)}`,
        "",
        `- Snapshot: \`${escapeCell(event.snapshotId)}\``,
        "",
        "| Category | Kind | Subject | Title |",
        "|---|---|---|---|",
      );
    }
    const title = event.title !== undefined ? escapeCell(event.title) : "";
    lines.push(`| ${event.category} | ${event.kind} | ${escapeCell(event.subjectId)} | ${title} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
