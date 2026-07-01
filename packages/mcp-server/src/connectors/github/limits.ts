export const DEFAULT_MAX_ISSUES = 25;
export const HARD_MAX_ISSUES = 100;
export const BODY_EXCERPT_LENGTH = 500;
export const RATE_LIMIT_WARNING_THRESHOLD = 10;

export function clampMaxItems(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_MAX_ISSUES;
  return Math.min(Math.max(1, requested), HARD_MAX_ISSUES);
}

export function excerptBody(body: string | null | undefined): string | null {
  if (!body) return null;
  const trimmed = body.trim();
  if (trimmed.length <= BODY_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, BODY_EXCERPT_LENGTH) + " [truncated]";
}
