import { z } from "zod";
import { loadNotionConfig } from "../connectors/notion/config.js";
import { NotionClient } from "../connectors/notion/client.js";
import { fetchPage } from "../connectors/notion/pages.js";
import { fetchBlockChildrenText } from "../connectors/notion/blocks.js";
import { makeDegradedNoToken } from "../connectors/notion/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { DEFAULT_MAX_ITEMS } from "../connectors/notion/limits.js";

export const notionGetPageContextSchema = {
  page_id: z
    .string()
    .optional()
    .describe("Notion page ID to read. Defaults to OH_MY_PM_NOTION_PAGE_ID if not set."),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum top-level content blocks to return. Default ${DEFAULT_MAX_ITEMS}, hard max 100.`),
};

export async function notionGetPageContext(params: { page_id?: string; max_items?: number }) {
  const { config } = loadNotionConfig();

  if (!config?.token) {
    return makeDegradedNoToken();
  }

  const pageId = params.page_id ?? config.pageId;
  if (!pageId) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message:
        "No page_id provided and OH_MY_PM_NOTION_PAGE_ID is not set. " +
        "Pass page_id or configure OH_MY_PM_NOTION_PAGE_ID.",
    };
  }

  const client = new NotionClient(config);
  const { page, error: pageError } = await fetchPage(client, pageId);
  if (pageError) return pageError;
  if (!page) {
    return {
      status: "error" as const,
      error_code: "resource_not_found",
      message: `Page ${pageId} not found, or the integration has not been shared with it.`,
    };
  }

  const { blocks, error: blocksError } = await fetchBlockChildrenText(
    client,
    pageId,
    params.max_items
  );
  if (blocksError) return blocksError;

  return {
    ...baseResponse("ok"),
    data_source: "notion" as const,
    page: {
      id: page.id,
      title: page.title,
      last_edited_time: page.last_edited_time,
      url: page.url,
    },
    content_blocks: (blocks ?? []).map((b) => ({ type: b.type, text_excerpt: b.text_excerpt })),
    assumptions: [
      "Only the first level of block children is fetched — nested children are not recursively expanded.",
      "Block content is truncated to 500 characters per block.",
      "Rich text formatting/annotations are dropped — only plain text is extracted.",
    ],
  };
}
