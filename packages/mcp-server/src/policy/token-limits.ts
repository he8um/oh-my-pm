// Response size bounds to keep MCP tool responses token-efficient.

export const MAX_LIST_ITEMS = 50;
export const MAX_HANDOFF_WORDS = 300;
export const MAX_SUMMARY_LINES = 40;

// Truncates a list to MAX_LIST_ITEMS and appends a note if truncated.
export function boundedList<T>(items: T[]): { items: T[]; truncated: boolean; total: number } {
  const truncated = items.length > MAX_LIST_ITEMS;
  return {
    items: items.slice(0, MAX_LIST_ITEMS),
    truncated,
    total: items.length,
  };
}
