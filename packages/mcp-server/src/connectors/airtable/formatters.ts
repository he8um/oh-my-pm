import type { AirtableRecord } from "./types.js";
import { STALE_DAYS_THRESHOLD } from "./limits.js";

const OWNER_FIELD_PATTERN = /owner|assignee|assigned/i;
const STATUS_FIELD_PATTERN = /status|state/i;
const DUE_FIELD_PATTERN = /due|deadline/i;
const CLOSED_STATUS_VALUE_PATTERN = /closed|complete|done/i;

function findFieldByPattern(
  fields: Record<string, unknown>,
  pattern: RegExp
): { key: string; value: unknown } | null {
  const key = Object.keys(fields).find((k) => pattern.test(k));
  if (key === undefined) return null;
  return { key, value: fields[key] };
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Heuristic data-quality tag extraction. Airtable schemas are user-defined —
// this matches common field name patterns rather than assuming a fixed schema.
export function extractDataQualityTags(
  record: AirtableRecord,
  requiredFields: string[] = [],
  now: Date = new Date()
): string[] {
  const tags: string[] = [];
  const fields = record.fields;

  const owner = findFieldByPattern(fields, OWNER_FIELD_PATTERN);
  if (owner && isEmpty(owner.value)) tags.push("missing_owner");

  const status = findFieldByPattern(fields, STATUS_FIELD_PATTERN);
  if (status) {
    const value = String(status.value ?? "");
    if (value.length > 0 && !CLOSED_STATUS_VALUE_PATTERN.test(value)) {
      tags.push("open");
    }
  }

  const due = findFieldByPattern(fields, DUE_FIELD_PATTERN);
  if (due && isEmpty(due.value)) tags.push("missing_due_date");

  for (const required of requiredFields) {
    if (isEmpty(fields[required])) tags.push("missing_required_field");
  }

  const statusIsOpen = status ? !CLOSED_STATUS_VALUE_PATTERN.test(String(status.value ?? "")) : false;
  const created = new Date(record.created_time);
  if (!isNaN(created.getTime()) && statusIsOpen) {
    const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > STALE_DAYS_THRESHOLD) tags.push("stale");
  }

  return tags;
}
