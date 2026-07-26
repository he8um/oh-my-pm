import type { StateChange } from "@oh-my-pm/contracts";
import type { CompareProjectResult } from "@oh-my-pm/runtime";
import { z } from "zod";
import {
  MCP_PROJECT_CHANGE_CATEGORIES,
  type McpProjectChangeCategory,
  type McpProjectChangesResult,
  type McpProjectedChange,
} from "./types.js";

export const MAX_PROJECT_ID_BYTES = 256;
export const MAX_SNAPSHOT_ID_BYTES = 256;
export const MAX_ITEM_ID_BYTES = 256;
export const MAX_TITLE_BYTES = 512;
export const MAX_STATUS_BYTES = 128;
export const MAX_SEVERITY_BYTES = 64;
export const MAX_DUE_DATE_BYTES = 64;
export const MAX_CHANGES_RETURNED = 100;
export const DEFAULT_CHANGES_RETURNED = 50;
export const DEFAULT_STALE_AFTER_SECONDS = 604_800;
export const MAX_STALE_AFTER_SECONDS = 31_536_000;

const textEncoder = new TextEncoder();
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const absolutePathLike = /^(?:\/|\\\\|[A-Za-z]:[\\/])/u;
const snapshotIdPattern = /^snapshot:[0-9a-f]{64}$/u;

export function utf8Bytes(value: string): number {
  return textEncoder.encode(value).byteLength;
}

export function isValidProjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    utf8Bytes(value) >= 1 &&
    utf8Bytes(value) <= MAX_PROJECT_ID_BYTES &&
    !controls.test(value) &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !absolutePathLike.test(value)
  );
}

export function isValidSnapshotId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    utf8Bytes(value) <= MAX_SNAPSHOT_ID_BYTES &&
    !controls.test(value) &&
    snapshotIdPattern.test(value)
  );
}

function safeRequiredIdentifier(
  value: unknown,
  maxBytes: number,
  forbiddenValues: readonly string[],
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    utf8Bytes(value) <= maxBytes &&
    !controls.test(value) &&
    !absolutePathLike.test(value) &&
    !forbiddenValues.some((sentinel) => sentinel.length > 0 && value.includes(sentinel))
  );
}

function safeOptionalString(
  value: unknown,
  maxBytes: number,
  forbiddenValues: readonly string[],
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8Bytes(value) > maxBytes ||
    controls.test(value) ||
    absolutePathLike.test(value) ||
    forbiddenValues.some((sentinel) => sentinel.length > 0 && value.includes(sentinel))
  ) {
    return undefined;
  }
  return value;
}

const categorySchema = z.enum(MCP_PROJECT_CHANGE_CATEGORIES);
const itemKindSchema = z.enum([
  "milestone",
  "task",
  "risk",
  "decision",
  "dependency",
  "blocker",
]);

function safePublicStringSchema(maxBytes: number): z.ZodType<string> {
  return z
    .string()
    .min(1)
    .refine((value) => utf8Bytes(value) <= maxBytes)
    .refine((value) => !controls.test(value))
    .refine((value) => !absolutePathLike.test(value));
}

const projectedChangeSchema = z
  .object({
    category: categorySchema,
    itemKind: itemKindSchema,
    itemId: safePublicStringSchema(MAX_ITEM_ID_BYTES),
    title: safePublicStringSchema(MAX_TITLE_BYTES).optional(),
    previousStatus: safePublicStringSchema(MAX_STATUS_BYTES).optional(),
    currentStatus: safePublicStringSchema(MAX_STATUS_BYTES).optional(),
    previousSeverity: safePublicStringSchema(MAX_SEVERITY_BYTES).optional(),
    currentSeverity: safePublicStringSchema(MAX_SEVERITY_BYTES).optional(),
    previousDueDate: safePublicStringSchema(MAX_DUE_DATE_BYTES).optional(),
    currentDueDate: safePublicStringSchema(MAX_DUE_DATE_BYTES).optional(),
    evidenceCount: z.number().int().nonnegative(),
  })
  .strict();

const countsShape = Object.fromEntries(
  MCP_PROJECT_CHANGE_CATEGORIES.map((category) => [category, z.number().int().nonnegative()]),
) as Record<McpProjectChangeCategory, z.ZodNumber>;

export const projectChangesResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["compared", "noPriorMemory", "insufficientHistory"]),
    projectId: z.string().refine(isValidProjectId),
    previousSnapshotId: z.string().refine(isValidSnapshotId).optional(),
    currentSnapshotId: z.string().refine(isValidSnapshotId).optional(),
    chronology: z.literal("capture-order"),
    summary: z
      .object({
        totalChanges: z.number().int().nonnegative(),
        returnedChanges: z.number().int().nonnegative(),
        truncated: z.boolean(),
        countsByCategory: z.object(countsShape).strict(),
      })
      .strict(),
    changes: z.array(projectedChangeSchema).max(MAX_CHANGES_RETURNED),
  })
  .strict();

export const projectChangesOutputShape = projectChangesResultSchema.shape;

export function emptyCategoryCounts(): Record<McpProjectChangeCategory, number> {
  return Object.fromEntries(
    MCP_PROJECT_CHANGE_CATEGORIES.map((category) => [category, 0]),
  ) as Record<McpProjectChangeCategory, number>;
}

function projectChange(
  change: StateChange,
  forbiddenValues: readonly string[],
): McpProjectedChange | null {
  if (
    !MCP_PROJECT_CHANGE_CATEGORIES.includes(change.category) ||
    !itemKindSchema.safeParse(change.itemKind).success ||
    !safeRequiredIdentifier(change.itemId, MAX_ITEM_ID_BYTES, forbiddenValues)
  ) {
    return null;
  }
  const previous = change.previousValue;
  const current = change.currentValue;
  const title = safeOptionalString(current?.title ?? previous?.title, MAX_TITLE_BYTES, forbiddenValues);
  const previousStatus = safeOptionalString(previous?.status, MAX_STATUS_BYTES, forbiddenValues);
  const currentStatus = safeOptionalString(current?.status, MAX_STATUS_BYTES, forbiddenValues);
  const previousSeverity = safeOptionalString(
    previous?.severity,
    MAX_SEVERITY_BYTES,
    forbiddenValues,
  );
  const currentSeverity = safeOptionalString(
    current?.severity,
    MAX_SEVERITY_BYTES,
    forbiddenValues,
  );
  const previousDueDate = safeOptionalString(
    previous?.dueDate,
    MAX_DUE_DATE_BYTES,
    forbiddenValues,
  );
  const currentDueDate = safeOptionalString(
    current?.dueDate,
    MAX_DUE_DATE_BYTES,
    forbiddenValues,
  );
  return {
    category: change.category,
    itemKind: change.itemKind,
    itemId: change.itemId,
    ...(title !== undefined ? { title } : {}),
    ...(previousStatus !== undefined ? { previousStatus } : {}),
    ...(currentStatus !== undefined ? { currentStatus } : {}),
    ...(previousSeverity !== undefined ? { previousSeverity } : {}),
    ...(currentSeverity !== undefined ? { currentSeverity } : {}),
    ...(previousDueDate !== undefined ? { previousDueDate } : {}),
    ...(currentDueDate !== undefined ? { currentDueDate } : {}),
    evidenceCount: new Set(change.evidenceRefs).size,
  };
}

export function projectCompareResult(
  comparison: CompareProjectResult,
  limit: number,
  forbiddenValues: readonly string[] = [],
): McpProjectChangesResult | null {
  if (!isValidProjectId(comparison.projectId)) return null;
  if (comparison.status === "noPriorMemory" || comparison.status === "insufficientHistory") {
    return {
      schemaVersion: 1,
      status: comparison.status,
      projectId: comparison.projectId,
      chronology: "capture-order",
      summary: {
        totalChanges: 0,
        returnedChanges: 0,
        truncated: false,
        countsByCategory: emptyCategoryCounts(),
      },
      changes: [],
    };
  }
  if (
    comparison.status !== "compared" ||
    comparison.changeSet === undefined ||
    !isValidSnapshotId(comparison.previousSnapshotId) ||
    !isValidSnapshotId(comparison.currentSnapshotId)
  ) {
    return null;
  }
  const counts = emptyCategoryCounts();
  const projected: McpProjectedChange[] = [];
  for (const change of comparison.changeSet.changes) {
    const category = change.category as McpProjectChangeCategory;
    if (!(category in counts)) return null;
    counts[category] += 1;
    const safe = projectChange(change, forbiddenValues);
    if (safe === null) return null;
    projected.push(safe);
  }
  const changes = projected.slice(0, limit);
  const result: McpProjectChangesResult = {
    schemaVersion: 1,
    status: "compared",
    projectId: comparison.projectId,
    previousSnapshotId: comparison.previousSnapshotId,
    currentSnapshotId: comparison.currentSnapshotId,
    chronology: "capture-order",
    summary: {
      totalChanges: projected.length,
      returnedChanges: changes.length,
      truncated: projected.length > changes.length,
      countsByCategory: counts,
    },
    changes,
  };
  return projectChangesResultSchema.safeParse(result).success ? result : null;
}

function markdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/gu, " ");
}

export function renderProjectChangesMarkdown(result: McpProjectChangesResult): string {
  const lines = [
    "# Project Changes",
    "",
    `- Project: \`${result.projectId}\``,
    `- Status: ${result.status}`,
  ];
  if (result.previousSnapshotId !== undefined) {
    lines.push(`- Previous snapshot: \`${result.previousSnapshotId}\``);
  }
  if (result.currentSnapshotId !== undefined) {
    lines.push(`- Current snapshot: \`${result.currentSnapshotId}\``);
  }
  lines.push(
    `- Changes: ${result.summary.totalChanges}`,
    `- Returned: ${result.summary.returnedChanges}`,
    `- Truncated: ${result.summary.truncated ? "yes" : "no"}`,
  );
  if (result.changes.length === 0) return `${lines.join("\n")}\n`;
  lines.push(
    "",
    "## Changes",
    "",
    "| Category | Kind | ID | Title |",
    "|---|---|---|---|",
  );
  for (const change of result.changes) {
    lines.push(
      `| ${change.category} | ${change.itemKind} | ${markdownCell(change.itemId)} | ${markdownCell(change.title ?? "")} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function hasForbiddenProjectChangesShape(value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return /"(?:previousValue|currentValue|evidenceRefs|metadata|provenance|owner|body|rawBody|diffHunk|trace|runtimeResponse|providerResponses|projectRoot|dataRoot)"\s*:/u.test(
    serialized,
  );
}

export function isConsistentProjectChangesResult(result: McpProjectChangesResult): boolean {
  const countTotal = MCP_PROJECT_CHANGE_CATEGORIES.reduce(
    (total, category) => total + result.summary.countsByCategory[category],
    0,
  );
  if (
    result.summary.returnedChanges !== result.changes.length ||
    result.summary.totalChanges < result.summary.returnedChanges ||
    result.summary.truncated !==
      (result.summary.totalChanges > result.summary.returnedChanges) ||
    countTotal !== result.summary.totalChanges
  ) {
    return false;
  }
  if (result.status !== "compared") {
    return (
      result.previousSnapshotId === undefined &&
      result.currentSnapshotId === undefined &&
      result.summary.totalChanges === 0 &&
      result.changes.length === 0
    );
  }
  return (
    result.previousSnapshotId !== undefined &&
    result.currentSnapshotId !== undefined &&
    result.previousSnapshotId !== result.currentSnapshotId
  );
}
