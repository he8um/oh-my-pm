import type { NotionClient } from "./client.js";
import type { NotionBlockTextExcerpt } from "./types.js";
import { excerptText, clampMaxItems } from "./limits.js";

interface RawNotionRichText {
  plain_text: string;
}

interface RawNotionBlock {
  type: string;
  [key: string]: unknown;
}

function extractBlockText(block: RawNotionBlock): string | null {
  const content = block[block.type] as { rich_text?: RawNotionRichText[] } | undefined;
  const richText = content?.rich_text;
  if (!Array.isArray(richText) || richText.length === 0) return null;
  return richText.map((t) => t.plain_text).join("");
}

interface ListBlockChildrenResponse {
  results: RawNotionBlock[];
}

// Fetches only the first level of block children — nested children are not
// recursively expanded, to keep output bounded and token-efficient.
export async function fetchBlockChildrenText(
  client: NotionClient,
  blockId: string,
  maxItems?: number
): Promise<{ blocks: NotionBlockTextExcerpt[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const result = await client.get<ListBlockChildrenResponse>(
    `/blocks/${blockId}/children?page_size=${limit}`
  );

  if (result.error) return { blocks: null, error: result.error };

  const raw = result.data?.results ?? [];
  const blocks = raw.slice(0, limit).map((b) => ({
    type: b.type,
    text_excerpt: excerptText(extractBlockText(b)),
  }));

  return { blocks, error: null };
}
