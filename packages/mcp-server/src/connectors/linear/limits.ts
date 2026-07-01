export const DEFAULT_MAX_ISSUES = 25;
export const HARD_MAX_ISSUES = 100;
export const DESCRIPTION_EXCERPT_LENGTH = 500;
export const RATE_LIMIT_WARNING_THRESHOLD = 10;
export const STALE_DAYS_THRESHOLD = 14;

export function clampMaxItems(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_MAX_ISSUES;
  return Math.min(Math.max(1, requested), HARD_MAX_ISSUES);
}

export function excerptDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= DESCRIPTION_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, DESCRIPTION_EXCERPT_LENGTH) + " [truncated]";
}
