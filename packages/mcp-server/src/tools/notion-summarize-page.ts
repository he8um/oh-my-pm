import { z } from "zod";
import { loadNotionConfig } from "../connectors/notion/config.js";
import { NotionClient } from "../connectors/notion/client.js";
import { fetchPage } from "../connectors/notion/pages.js";
import { makeDegradedNoToken } from "../connectors/notion/errors.js";
import { baseResponse } from "../utils/formatting.js";

export const notionSummarizePageSchema = {
  page_id: z
    .string()
    .optional()
    .describe("Notion page ID to summarize. Defaults to OH_MY_PM_NOTION_PAGE_ID if not set."),
};

export async function notionSummarizePage(params: { page_id?: string }) {
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
  const { page, error } = await fetchPage(client, pageId);

  if (error) return error;
  if (!page) {
    return {
      status: "error" as const,
      error_code: "resource_not_found",
      message: `Page ${pageId} not found, or the integration has not been shared with it.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "notion" as const,
    page: {
      id: page.id,
      title: page.title,
      last_edited_time: page.last_edited_time,
      properties: page.properties,
      url: page.url,
    },
    assumptions: ["Property values are returned as raw Notion property objects, not flattened."],
  };
}
