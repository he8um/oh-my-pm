import { z } from "zod";
import { loadNotionConfig } from "../connectors/notion/config.js";
import { NotionClient } from "../connectors/notion/client.js";
import { searchPages } from "../connectors/notion/search.js";
import { makeDegradedNoToken } from "../connectors/notion/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { DEFAULT_MAX_ITEMS } from "../connectors/notion/limits.js";

export const notionSearchPagesSchema = {
  query: z.string().optional().describe("Optional search text to filter pages/databases by title."),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum results to return. Default ${DEFAULT_MAX_ITEMS}, hard max 100.`),
};

export async function notionSearchPages(params: { query?: string; max_items?: number }) {
  const { config } = loadNotionConfig();

  if (!config?.token) {
    return makeDegradedNoToken();
  }

  const client = new NotionClient(config);
  const { results, error } = await searchPages(client, params.query, params.max_items);

  if (error) return error;

  const all = results ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "notion" as const,
    results: all.map((r) => ({ id: r.id, object: r.object, title: r.title, url: r.url })),
    total_returned: all.length,
    assumptions: [
      "Search is scoped to pages and databases the configured integration has been shared with.",
    ],
  };
}
