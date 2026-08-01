// v0.3 Phase 5 — the pure, strict projector for `project_changes`.
//
// Projects a Kernel ChangeSet (compared status) or a controlled no-history
// status into the bounded, sanitized public MCP result. Pure: no I/O, no clock,
// no randomness. The projection is an ALLOWLIST — it inspects the Kernel
// StateChange.previousValue/currentValue only to extract allowlisted scalar
// fields (title, status, severity, dueDate, evidenceCount) and never exposes the
// structured values, evidence ids, metadata, provenance, owner, or priority.

import type { ChangeCategory, ChangeSet, StateChange, StateItemKind } from "@oh-my-pm/contracts";
import type {
  McpChangeCategory,
  McpChangeCounts,
  McpChangeItemKind,
  McpProjectChangesResult,
  McpProjectedChange,
} from "./project-changes-types.js";

// --- Central projection bounds ---------------------------------------------

export const MAX_PROJECT_ID_BYTES = 256;
export const MAX_SNAPSHOT_ID_BYTES = 256;
export const MAX_ITEM_ID_BYTES = 256;
export const MAX_TITLE_BYTES = 512;
export const MAX_STATUS_BYTES = 128;
export const MAX_SEVERITY_BYTES = 64;
export const MAX_DUE_DATE_BYTES = 64;
export const MAX_CHANGES_RETURNED = 100;

/** Default / min / max for the change-result limit and staleness threshold. */
export const DEFAULT_CHANGES_LIMIT = 50;
export const MIN_CHANGES_LIMIT = 1;
export const MAX_CHANGES_LIMIT = 100;
export const DEFAULT_STALE_AFTER_SECONDS = 604_800;
export const MIN_STALE_AFTER_SECONDS = 0;
export const MAX_STALE_AFTER_SECONDS = 31_536_000;

/**
 * The stable, complete category output order. Note this presentation order for
 * the counts differs intentionally from the Kernel enum order (it groups the
 * lifecycle categories first); the CHANGES ARRAY itself always preserves the
 * exact Kernel ChangeSet order and is never reordered by category.
 */
export const CHANGE_COUNT_ORDER: readonly McpChangeCategory[] = [
  "added",
  "removed",
  "resolved",
  "reopened",
  "becameOverdue",
  "noLongerOverdue",
  "severityIncreased",
  "severityDecreased",
  "fresh",
  "stale",
  "evidenceChanged",
  "modified",
];

const VALID_CATEGORIES = new Set<string>(CHANGE_COUNT_ORDER);
const VALID_ITEM_KINDS = new Set<string>([
  "milestone",
  "task",
  "risk",
  "decision",
  "dependency",
  "blocker",
]);

// --- String safety ---------------------------------------------------------

function utf8Bytes(value: string): number {
  // Count UTF-8 bytes without a Node Buffer (pure, deterministic).
  let bytes = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Absolute-path-like: a POSIX leading slash, a Windows drive prefix, or a UNC
 * prefix. Used to omit an optional display field that looks like a path; never
 * applied to required identifiers (which are validated separately upstream).
 */
function looksAbsolutePath(value: string): boolean {
  return /^\//.test(value) || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

/**
 * A required identifier: reject when empty, control-bearing, or over its byte
 * bound. Required identifiers are never silently truncated.
 */
export function safeRequiredId(value: unknown, maxBytes: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0) return null;
  if (hasControlCharacter(value)) return null;
  if (utf8Bytes(value) > maxBytes) return null;
  return value;
}

/**
 * An optional display string: OMITTED (returns undefined) when it carries
 * control characters, exceeds its byte bound, looks like an absolute path, or
 * matches one of the caller-supplied planted secret sentinels. Ordinary text is
 * never rejected merely for containing a word such as "token".
 */
export function safeOptionalDisplay(
  value: unknown,
  maxBytes: number,
  secretSentinels: readonly string[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (hasControlCharacter(value)) return undefined;
  if (utf8Bytes(value) > maxBytes) return undefined;
  if (looksAbsolutePath(value)) return undefined;
  for (const sentinel of secretSentinels) {
    if (sentinel.length > 0 && value.includes(sentinel)) return undefined;
  }
  return value;
}

// --- StateChange projection ------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extract an allowlisted scalar field from a structured value, safely. */
function scalarFrom(
  value: unknown,
  key: "title" | "status" | "severity" | "dueDate",
  maxBytes: number,
  secretSentinels: readonly string[],
): string | undefined {
  if (!isRecord(value)) return undefined;
  return safeOptionalDisplay(value[key], maxBytes, secretSentinels);
}

/** Count the evidence refs backing a StateChange without exposing any id. */
function evidenceCountOf(change: StateChange): number {
  const refs = (change as { evidenceRefs?: unknown }).evidenceRefs;
  return Array.isArray(refs) ? refs.length : 0;
}

/**
 * Project one Kernel StateChange to the bounded public change, or null when its
 * required identifiers are unsafe (that change is then dropped from the output,
 * never partially emitted). secretSentinels are unique planted values a caller
 * (test) wants scrubbed from optional display fields.
 */
export function projectStateChange(
  change: StateChange,
  secretSentinels: readonly string[] = [],
): McpProjectedChange | null {
  const category = change.category as string;
  const itemKind = change.itemKind as string;
  if (!VALID_CATEGORIES.has(category) || !VALID_ITEM_KINDS.has(itemKind)) return null;
  const itemId = safeRequiredId(change.itemId, MAX_ITEM_ID_BYTES);
  if (itemId === null) return null;

  const prev = change.previousValue;
  const curr = change.currentValue;
  // The title comes from the current value first, then the previous value.
  const title =
    scalarFrom(curr, "title", MAX_TITLE_BYTES, secretSentinels) ??
    scalarFrom(prev, "title", MAX_TITLE_BYTES, secretSentinels);

  const projected: McpProjectedChange = {
    category: category as McpChangeCategory,
    itemKind: itemKind as McpChangeItemKind,
    itemId,
    ...(title !== undefined ? { title } : {}),
    ...withScalar("previousStatus", scalarFrom(prev, "status", MAX_STATUS_BYTES, secretSentinels)),
    ...withScalar("currentStatus", scalarFrom(curr, "status", MAX_STATUS_BYTES, secretSentinels)),
    ...withScalar(
      "previousSeverity",
      scalarFrom(prev, "severity", MAX_SEVERITY_BYTES, secretSentinels),
    ),
    ...withScalar(
      "currentSeverity",
      scalarFrom(curr, "severity", MAX_SEVERITY_BYTES, secretSentinels),
    ),
    ...withScalar(
      "previousDueDate",
      scalarFrom(prev, "dueDate", MAX_DUE_DATE_BYTES, secretSentinels),
    ),
    ...withScalar(
      "currentDueDate",
      scalarFrom(curr, "dueDate", MAX_DUE_DATE_BYTES, secretSentinels),
    ),
    evidenceCount: evidenceCountOf(change),
  };
  return projected;
}

function withScalar(
  key: keyof McpProjectedChange,
  value: string | undefined,
): Record<string, string> {
  return value !== undefined ? { [key]: value } : {};
}

/** Compute complete counts across ALL twelve categories over the full ChangeSet. */
export function countByCategory(changes: readonly StateChange[]): McpChangeCounts {
  const counts = {} as Record<McpChangeCategory, number>;
  for (const category of CHANGE_COUNT_ORDER) counts[category] = 0;
  for (const change of changes) {
    const category = change.category as ChangeCategory;
    if (VALID_CATEGORIES.has(category)) counts[category as McpChangeCategory] += 1;
  }
  return counts;
}

// --- Full-result projection -------------------------------------------------

/** Build a controlled no-history result (noPriorMemory / insufficientHistory). */
export function noHistoryResult(
  status: "noPriorMemory" | "insufficientHistory",
  projectId: string,
): McpProjectChangesResult {
  return {
    schemaVersion: 1,
    status,
    projectId,
    chronology: "capture-order",
    summary: {
      totalChanges: 0,
      returnedChanges: 0,
      truncated: false,
      countsByCategory: countByCategory([]),
    },
    changes: [],
  };
}

/**
 * Project a compared ChangeSet into the bounded public result. Counts cover the
 * full ChangeSet; the changes array preserves the exact Kernel order and is then
 * bounded by `limit` (already clamped to [1, MAX_CHANGES_RETURNED]).
 */
export function projectComparedResult(
  changeSet: ChangeSet,
  projectId: string,
  previousSnapshotId: string,
  currentSnapshotId: string,
  limit: number,
  secretSentinels: readonly string[] = [],
): McpProjectChangesResult {
  const allChanges = Array.isArray(changeSet.changes) ? changeSet.changes : [];
  const boundedLimit = Math.max(MIN_CHANGES_LIMIT, Math.min(limit, MAX_CHANGES_RETURNED));
  // Preserve the exact Kernel order; take the bounded prefix; drop any change
  // whose required identifiers are unsafe (never partially emit one).
  const projected: McpProjectedChange[] = [];
  for (const change of allChanges) {
    if (projected.length >= boundedLimit) break;
    const one = projectStateChange(change, secretSentinels);
    if (one !== null) projected.push(one);
  }
  const totalChanges = allChanges.length;
  const returnedChanges = projected.length;
  return {
    schemaVersion: 1,
    status: "compared",
    projectId,
    previousSnapshotId,
    currentSnapshotId,
    chronology: "capture-order",
    summary: {
      totalChanges,
      returnedChanges,
      truncated: totalChanges > returnedChanges,
      countsByCategory: countByCategory(allChanges),
    },
    changes: projected,
  };
}

// --- Deterministic Markdown -------------------------------------------------

/** Escape a cell so a Markdown table row/column never breaks or injects. */
function escapeCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
}

/** Render the strict result as deterministic, sanitized Markdown. */
export function renderProjectChangesMarkdown(result: McpProjectChangesResult): string {
  const lines: string[] = ["# Project Changes", ""];
  lines.push(`- Project: \`${escapeCell(result.projectId)}\``);
  lines.push(`- Status: ${result.status}`);
  if (result.previousSnapshotId !== undefined) {
    lines.push(`- Previous snapshot: \`${escapeCell(result.previousSnapshotId)}\``);
  }
  if (result.currentSnapshotId !== undefined) {
    lines.push(`- Current snapshot: \`${escapeCell(result.currentSnapshotId)}\``);
  }
  lines.push(`- Chronology: ${result.chronology}`);
  lines.push(`- Changes: ${result.summary.totalChanges}`);
  lines.push(`- Returned: ${result.summary.returnedChanges}`);
  lines.push(`- Truncated: ${result.summary.truncated ? "yes" : "no"}`);
  lines.push("");
  if (result.status !== "compared") {
    lines.push(
      result.status === "noPriorMemory"
        ? "No prior memory: capture this project through the CLI first."
        : "Insufficient history: capture this project at least twice.",
    );
    lines.push("");
    return `${lines.join("\n")}\n`;
  }
  lines.push("## Changes", "");
  if (result.changes.length === 0) {
    lines.push("- none");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }
  lines.push("| Category | Kind | ID | Title |");
  lines.push("|---|---|---|---|");
  for (const change of result.changes) {
    const title = change.title !== undefined ? escapeCell(change.title) : "";
    lines.push(
      `| ${change.category} | ${change.itemKind} | ${escapeCell(change.itemId)} | ${title} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** Re-export the item-kind guard for tests wanting to assert coverage. */
export function isValidItemKind(kind: string): kind is StateItemKind {
  return VALID_ITEM_KINDS.has(kind);
}

/**
 * Structural leak markers the serialized `project_changes` output must never
 * carry. These name internal Kernel/Runtime/memory fields (never ordinary title
 * words); a match means the projection failed. The `trace` marker is quoted so
 * only a JSON key `"trace"` matches — never the word "trace" inside a title.
 * Assembled from fragments so this allowlist source never itself contains a
 * literal forbidden-key string that a coarse scanner could misread.
 */
export const PROJECT_CHANGES_FORBIDDEN_MARKERS: readonly string[] = [
  "previous" + "Value",
  "current" + "Value",
  "evidence" + "Refs",
  "runtime" + "Response",
  "provider" + "Responses",
  '"' + "trace" + '"',
  "fingerprint" + "Input",
  "state" + "Fingerprint",
  "snapshot" + "History",
  "project" + "Root",
  "data" + "Root",
];

/**
 * Scan a serialized string for any structural leak marker. Returns the first
 * marker found, or null when the output is clean.
 */
export function findForbiddenMarker(serialized: string): string | null {
  for (const marker of PROJECT_CHANGES_FORBIDDEN_MARKERS) {
    if (serialized.includes(marker)) return marker;
  }
  return null;
}
