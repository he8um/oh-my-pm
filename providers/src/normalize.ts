import type { NormalizedProviderItem, ProviderId } from "@oh-my-pm/contracts";
import type { LocalProviderItemInput } from "./types.js";

/** Trim, lowercase, and collapse internal whitespace to single spaces. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Build a normalized item from local input with deterministic defaults. */
export function normalizeLocalItem(
  providerId: ProviderId,
  input: LocalProviderItemInput,
): NormalizedProviderItem {
  const item: NormalizedProviderItem = {
    id: input.id,
    type: input.type ?? "unknown",
    title: input.title,
    source: providerId,
    data: input.data ?? {},
  };
  if (input.url !== undefined) {
    item.url = input.url;
  }
  return item;
}

/** Case-insensitive match of a query against an item's title or id. */
export function matchesQuery(item: NormalizedProviderItem, query: string): boolean {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery === "") {
    return true;
  }
  return (
    normalizeText(item.title).includes(normalizedQuery) ||
    normalizeText(item.id).includes(normalizedQuery)
  );
}
