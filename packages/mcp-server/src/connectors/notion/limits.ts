export const DEFAULT_MAX_ITEMS = 25;
export const HARD_MAX_ITEMS = 100;
export const TEXT_EXCERPT_LENGTH = 500;
export const STALE_DAYS_THRESHOLD = 14;

export function clampMaxItems(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_MAX_ITEMS;
  return Math.min(Math.max(1, requested), HARD_MAX_ITEMS);
}

export function excerptText(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= TEXT_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, TEXT_EXCERPT_LENGTH) + " [truncated]";
}
