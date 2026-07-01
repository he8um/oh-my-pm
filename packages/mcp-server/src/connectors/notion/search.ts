import type { NotionClient } from "./client.js";
import type { NotionSearchResultItem } from "./types.js";
import { clampMaxItems } from "./limits.js";

interface RawNotionTitleProperty {
  title?: { plain_text: string }[];
}

interface RawNotionSearchResult {
  id: string;
  object: "page" | "database";
  url: string;
  properties?: Record<string, unknown>;
  title?: { plain_text: string }[];
}

interface SearchResponse {
  results: RawNotionSearchResult[];
}

function extractResultTitle(item: RawNotionSearchResult): string {
  if (Array.isArray(item.title) && item.title.length > 0) {
    return item.title.map((t) => t.plain_text).join("");
  }
  for (const value of Object.values(item.properties ?? {})) {
    const prop = value as RawNotionTitleProperty;
    if (Array.isArray(prop?.title) && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

// Calls Notion's POST /search endpoint — read-only despite the HTTP method;
// the request body carries query/filter/sort parameters, not a write payload.
export async function searchPages(
  client: NotionClient,
  query: string | undefined,
  maxItems?: number
): Promise<{ results: NotionSearchResultItem[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const result = await client.postQuery<SearchResponse>("/search", {
    ...(query ? { query } : {}),
    page_size: limit,
  });

  if (result.error) return { results: null, error: result.error };

  const raw = result.data?.results ?? [];
  const results = raw.slice(0, limit).map((r) => ({
    id: r.id,
    object: r.object,
    title: extractResultTitle(r),
    url: r.url,
  }));

  return { results, error: null };
}
