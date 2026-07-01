import { z } from "zod";
import { loadNotionConfig } from "../connectors/notion/config.js";
import { NotionClient } from "../connectors/notion/client.js";
import { queryDatabase } from "../connectors/notion/databases.js";
import { extractDataQualityTags } from "../connectors/notion/formatters.js";
import { makeDegradedNoToken } from "../connectors/notion/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { DEFAULT_MAX_ITEMS } from "../connectors/notion/limits.js";

export const notionQueryDatabaseSchema = {
  database_id: z
    .string()
    .optional()
    .describe(
      "Notion database ID to query. Defaults to OH_MY_PM_NOTION_DATABASE_ID if not set."
    ),
  status_property: z
    .string()
    .optional()
    .describe("Optional status property name to filter by (used together with status_value)."),
  status_value: z
    .string()
    .optional()
    .describe("Optional status value to filter for (used together with status_property)."),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum items to return. Default ${DEFAULT_MAX_ITEMS}, hard max 100.`),
};

export async function notionQueryDatabase(params: {
  database_id?: string;
  status_property?: string;
  status_value?: string;
  max_items?: number;
}) {
  const { config } = loadNotionConfig();

  if (!config?.token) {
    return makeDegradedNoToken();
  }

  const databaseId = params.database_id ?? config.databaseId;
  if (!databaseId) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message:
        "No database_id provided and OH_MY_PM_NOTION_DATABASE_ID is not set. " +
        "Pass database_id or configure OH_MY_PM_NOTION_DATABASE_ID.",
    };
  }

  const statusFilter =
    params.status_property && params.status_value
      ? { property: params.status_property, value: params.status_value }
      : undefined;

  const client = new NotionClient(config);
  const { items, error } = await queryDatabase(client, databaseId, statusFilter, params.max_items);

  if (error) return error;

  const all = items ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "notion" as const,
    database_id: databaseId,
    items: all.map((i) => ({
      id: i.id,
      title: i.title,
      last_edited_time: i.last_edited_time,
      data_quality_tags: extractDataQualityTags(i),
      url: i.url,
    })),
    total_returned: all.length,
    assumptions: [
      "Owner, status, and due-date detection is heuristic — matched by property name pattern, not a fixed schema.",
      "Comments are not fetched.",
    ],
  };
}
