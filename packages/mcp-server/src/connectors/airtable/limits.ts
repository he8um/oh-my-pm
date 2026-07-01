export const DEFAULT_MAX_RECORDS = 25;
export const HARD_MAX_RECORDS = 100;
export const FIELD_VALUE_EXCERPT_LENGTH = 500;
export const STALE_DAYS_THRESHOLD = 14;

export function clampMaxItems(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_MAX_RECORDS;
  return Math.min(Math.max(1, requested), HARD_MAX_RECORDS);
}

export function excerptFieldValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  if (trimmed.length <= FIELD_VALUE_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, FIELD_VALUE_EXCERPT_LENGTH) + " [truncated]";
}
