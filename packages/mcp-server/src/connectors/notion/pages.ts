import type { NotionClient } from "./client.js";
import type { NotionPageSummary } from "./types.js";

interface RawNotionTitleProperty {
  title?: { plain_text: string }[];
}

interface RawNotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
}

function extractTitle(properties: Record<string, unknown>): string {
  for (const value of Object.values(properties)) {
    const prop = value as RawNotionTitleProperty;
    if (Array.isArray(prop?.title) && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

export async function fetchPage(
  client: NotionClient,
  pageId: string
): Promise<{ page: NotionPageSummary | null; error: unknown | null }> {
  const result = await client.get<RawNotionPage>(`/pages/${pageId}`);

  if (result.error) return { page: null, error: result.error };
  if (!result.data) return { page: null, error: null };

  const p = result.data;
  return {
    page: {
      id: p.id,
      title: extractTitle(p.properties ?? {}),
      url: p.url,
      last_edited_time: p.last_edited_time ?? null,
      properties: p.properties ?? {},
    },
    error: null,
  };
}
