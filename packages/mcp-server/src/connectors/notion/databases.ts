import type { NotionClient } from "./client.js";
import type { NotionDatabaseItem, NotionDatabaseSchema } from "./types.js";
import { clampMaxItems } from "./limits.js";

interface RawNotionTitleProperty {
  title?: { plain_text: string }[];
}

interface RawNotionPropertySchema {
  id: string;
  name: string;
  type: string;
}

interface RawNotionDatabase {
  id: string;
  title: { plain_text: string }[];
  properties: Record<string, RawNotionPropertySchema>;
}

function extractDatabaseTitle(title: { plain_text: string }[]): string {
  if (!Array.isArray(title) || title.length === 0) return "Untitled";
  return title.map((t) => t.plain_text).join("");
}

export async function fetchDatabaseSchema(
  client: NotionClient,
  databaseId: string
): Promise<{ schema: NotionDatabaseSchema | null; error: unknown | null }> {
  const result = await client.get<RawNotionDatabase>(`/databases/${databaseId}`);

  if (result.error) return { schema: null, error: result.error };
  if (!result.data) return { schema: null, error: null };

  const d = result.data;
  return {
    schema: {
      id: d.id,
      title: extractDatabaseTitle(d.title),
      properties: Object.values(d.properties ?? {}).map((p) => ({
        name: p.name,
        type: p.type,
      })),
    },
    error: null,
  };
}

interface RawNotionDatabaseItem {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
}

interface QueryDatabaseResponse {
  results: RawNotionDatabaseItem[];
}

function extractItemTitle(properties: Record<string, unknown>): string {
  for (const value of Object.values(properties)) {
    const prop = value as RawNotionTitleProperty;
    if (Array.isArray(prop?.title) && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

// Calls Notion's POST /databases/{id}/query endpoint — read-only despite the
// HTTP method; the request body carries filter/sort parameters, not a write payload.
export async function queryDatabase(
  client: NotionClient,
  databaseId: string,
  statusFilter: { property: string; value: string } | undefined,
  maxItems?: number
): Promise<{ items: NotionDatabaseItem[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const body: Record<string, unknown> = { page_size: limit };
  if (statusFilter) {
    body["filter"] = {
      property: statusFilter.property,
      status: { equals: statusFilter.value },
    };
  }

  const result = await client.postQuery<QueryDatabaseResponse>(
    `/databases/${databaseId}/query`,
    body
  );

  if (result.error) return { items: null, error: result.error };

  const raw = result.data?.results ?? [];
  const items = raw.slice(0, limit).map((i) => ({
    id: i.id,
    title: extractItemTitle(i.properties ?? {}),
    url: i.url,
    last_edited_time: i.last_edited_time ?? null,
    properties: i.properties ?? {},
  }));

  return { items, error: null };
}
