import type { JsonValue, SkillId, SkillInputEnvelope, SkillOutputEnvelope } from "@oh-my-pm/contracts";
import { NORMALIZED_ITEM_TYPE_VALUES, PROVIDER_ID_VALUES } from "@oh-my-pm/contracts";
import type { NormalizedItemType, ProviderId } from "@oh-my-pm/contracts";
import type { SkillFailureCode, SkillInputObject, TextItem } from "./types.js";

export const OMP_S_UNKNOWN_SKILL = "OMP-S-5001";
export const OMP_S_SKILL_MISMATCH = "OMP-S-5002";
export const OMP_S_INVALID_INPUT = "OMP-S-5003";

export function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trim, lowercase, and collapse internal whitespace to single spaces. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Trimmed string, or undefined for non-strings and empty strings. */
export function textFrom(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Trimmed non-empty string entries only. */
export function stringArrayFrom(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of value) {
    const text = textFrom(entry);
    if (text !== undefined) {
      result.push(text);
    }
  }
  return result;
}

/** Positive safe integer, or undefined. */
function positiveIntegerFrom(value: JsonValue | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

/**
 * Build a TextItem from structured input, carrying only the selected fields.
 * Unknown and raw fields are dropped; the input object is never mutated.
 */
function textItemFrom(value: JsonValue): TextItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = textFrom(value["id"]);
  const title = textFrom(value["title"]);
  if (id === undefined || title === undefined) {
    return null;
  }
  const item: TextItem = { id, title };
  const body = textFrom(value["body"]);
  if (body !== undefined) item.body = body;
  const status = textFrom(value["status"]);
  if (status !== undefined) item.status = status;
  const owner = textFrom(value["owner"]);
  if (owner !== undefined) item.owner = owner;
  const due = textFrom(value["due"]);
  if (due !== undefined) item.due = due;
  if (Array.isArray(value["tags"])) {
    item.tags = stringArrayFrom(value["tags"]);
  }

  // Selected provider provenance (validated; unknown values dropped).
  const source = textFrom(value["source"]);
  if (source !== undefined && (PROVIDER_ID_VALUES as readonly string[]).includes(source)) {
    item.source = source as ProviderId;
  }
  const type = textFrom(value["type"]);
  if (type !== undefined && (NORMALIZED_ITEM_TYPE_VALUES as readonly string[]).includes(type)) {
    item.type = type as NormalizedItemType;
  }
  const url = textFrom(value["url"]);
  if (url !== undefined) item.url = url;
  const repository = textFrom(value["repository"]);
  if (repository !== undefined) item.repository = repository;
  const number = positiveIntegerFrom(value["number"]);
  if (number !== undefined) item.number = number;
  const kind = textFrom(value["kind"]);
  if (kind !== undefined) item.kind = kind;
  if (Array.isArray(value["labels"])) item.labels = stringArrayFrom(value["labels"]);
  if (Array.isArray(value["assignees"])) item.assignees = stringArrayFrom(value["assignees"]);
  const author = textFrom(value["author"]);
  if (author !== undefined) item.author = author;
  const milestone = textFrom(value["milestone"]);
  if (milestone !== undefined) item.milestone = milestone;
  const createdAt = textFrom(value["createdAt"]);
  if (createdAt !== undefined) item.createdAt = createdAt;
  const updatedAt = textFrom(value["updatedAt"]);
  if (updatedAt !== undefined) item.updatedAt = updatedAt;
  const closedAt = textFrom(value["closedAt"]);
  if (closedAt !== undefined) item.closedAt = closedAt;
  const mergedAt = textFrom(value["mergedAt"]);
  if (mergedAt !== undefined) item.mergedAt = mergedAt;
  if (Array.isArray(value["requestedReviewers"])) {
    item.requestedReviewers = stringArrayFrom(value["requestedReviewers"]);
  }
  return item;
}

/** Valid text items in input order; invalid entries are skipped, not fatal. */
export function textItemsFrom(value: JsonValue | undefined): TextItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: TextItem[] = [];
  for (const entry of value) {
    const item = textItemFrom(entry);
    if (item !== null) {
      items.push(item);
    }
  }
  return items;
}

/** Parse the supported structured skill input; null when input is not an object. */
export function skillInputObject(input: SkillInputEnvelope): SkillInputObject | null {
  const raw = input.input;
  if (!isRecord(raw)) {
    return null;
  }
  const parsed: SkillInputObject = {};
  const title = textFrom(raw["title"]);
  if (title !== undefined) parsed.title = title;
  const summary = textFrom(raw["summary"]);
  if (summary !== undefined) parsed.summary = summary;
  if (raw["notes"] !== undefined) parsed.notes = stringArrayFrom(raw["notes"]);
  if (raw["items"] !== undefined) parsed.items = textItemsFrom(raw["items"]);
  if (raw["changes"] !== undefined) parsed.changes = textItemsFrom(raw["changes"]);
  if (raw["risks"] !== undefined) parsed.risks = textItemsFrom(raw["risks"]);
  if (raw["decisions"] !== undefined) parsed.decisions = textItemsFrom(raw["decisions"]);
  if (raw["tasks"] !== undefined) parsed.tasks = textItemsFrom(raw["tasks"]);
  if (raw["context"] !== undefined) parsed.context = raw["context"];
  return parsed;
}

export function okSkillOutput(skillId: SkillId, output: JsonValue): SkillOutputEnvelope {
  return { skillId, ok: true, output };
}

export function failSkillOutput(
  skillId: SkillId,
  code: SkillFailureCode,
  message: string,
): SkillOutputEnvelope {
  return {
    skillId,
    ok: false,
    output: { code, message },
    warnings: [{ code, message }],
  };
}

/** Searchable normalized text for an item: title, body, status, and tags. */
export function itemSearchText(item: TextItem): string {
  return normalizeText(
    [item.title, item.body ?? "", item.status ?? "", (item.tags ?? []).join(" ")].join(" "),
  );
}

const DONE_STATUSES = new Set([
  "done",
  "closed",
  "complete",
  "completed",
  "merged",
  "resolved",
  "cancelled",
  "canceled",
]);

const BLOCKED_STATUSES = new Set([
  "blocked",
  "blocker",
  "waiting",
  "on-hold",
  "on hold",
  "waiting-on",
]);

/** An item is done when its normalized status is an exact terminal status. */
export function isDoneItem(item: TextItem): boolean {
  return DONE_STATUSES.has(normalizeText(item.status ?? ""));
}

/**
 * An item is blocked when its normalized status, or any normalized tag, is an
 * exact blocked status. Exact matching only — never `includes("blocked")`, so
 * "unblocked" never matches.
 */
export function isBlockedItem(item: TextItem): boolean {
  if (BLOCKED_STATUSES.has(normalizeText(item.status ?? ""))) {
    return true;
  }
  return (item.tags ?? []).some((tag) => BLOCKED_STATUSES.has(normalizeText(tag)));
}
