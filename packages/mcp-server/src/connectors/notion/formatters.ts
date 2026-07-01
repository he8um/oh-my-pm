import { STALE_DAYS_THRESHOLD } from "./limits.js";

const OWNER_PROPERTY_PATTERN = /owner|assignee|person/i;
const STATUS_PROPERTY_PATTERN = /status|state/i;
const DUE_PROPERTY_PATTERN = /due|deadline/i;

function findPropertyByPattern(
  properties: Record<string, unknown>,
  pattern: RegExp
): { key: string; value: unknown } | null {
  const key = Object.keys(properties).find((k) => pattern.test(k));
  if (key === undefined) return null;
  return { key, value: properties[key] };
}

function isEmptyPropertyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    // Notion property values are wrapped objects, e.g. { people: [] } or
    // { select: null } or { rich_text: [] } or { date: null }.
    const inner = Object.values(record)[0];
    if (inner === null || inner === undefined) return true;
    if (Array.isArray(inner)) return inner.length === 0;
    if (typeof inner === "object") return Object.keys(inner as object).length === 0;
    return false;
  }
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

// Heuristic data-quality tag extraction. Notion database schemas are
// user-defined — this matches common property name patterns rather than
// assuming a fixed schema.
export function extractDataQualityTags(
  item: { properties: Record<string, unknown>; last_edited_time: string | null },
  now: Date = new Date()
): string[] {
  const tags: string[] = [];
  const properties = item.properties;

  const owner = findPropertyByPattern(properties, OWNER_PROPERTY_PATTERN);
  if (owner && isEmptyPropertyValue(owner.value)) tags.push("missing_owner");

  const status = findPropertyByPattern(properties, STATUS_PROPERTY_PATTERN);
  if (!status || isEmptyPropertyValue(status.value)) tags.push("missing_status");

  const due = findPropertyByPattern(properties, DUE_PROPERTY_PATTERN);
  if (due && isEmptyPropertyValue(due.value)) tags.push("missing_due_date");

  if (item.last_edited_time) {
    const edited = new Date(item.last_edited_time);
    if (!isNaN(edited.getTime())) {
      const diffDays = (now.getTime() - edited.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > STALE_DAYS_THRESHOLD) tags.push("stale");
    }
  }

  return tags;
}
