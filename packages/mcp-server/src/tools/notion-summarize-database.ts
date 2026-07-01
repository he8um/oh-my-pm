import { z } from "zod";
import { loadNotionConfig } from "../connectors/notion/config.js";
import { NotionClient } from "../connectors/notion/client.js";
import { queryDatabase } from "../connectors/notion/databases.js";
import { extractDataQualityTags } from "../connectors/notion/formatters.js";
import { makeDegradedNoToken } from "../connectors/notion/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { HARD_MAX_ITEMS } from "../connectors/notion/limits.js";

export const notionSummarizeDatabaseSchema = {
  database_id: z
    .string()
    .optional()
    .describe(
      "Notion database ID to summarize. Defaults to OH_MY_PM_NOTION_DATABASE_ID if not set."
    ),
};

export async function notionSummarizeDatabase(params: { database_id?: string }) {
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

  const client = new NotionClient(config);
  const { items, error } = await queryDatabase(client, databaseId, undefined, HARD_MAX_ITEMS);

  if (error) return error;

  const all = items ?? [];
  const tagged = all.map((i) => ({ item: i, tags: extractDataQualityTags(i) }));

  const missingOwner = tagged.filter((t) => t.tags.includes("missing_owner"));
  const missingStatus = tagged.filter((t) => t.tags.includes("missing_status"));
  const missingDueDate = tagged.filter((t) => t.tags.includes("missing_due_date"));
  const stale = tagged.filter((t) => t.tags.includes("stale"));

  const nextActionCandidates = [...stale, ...missingStatus]
    .filter((t, i, arr) => arr.findIndex((x) => x.item.id === t.item.id) === i)
    .slice(0, 5)
    .map((t) => ({ id: t.item.id, title: t.item.title, tags: t.tags }));

  return {
    ...baseResponse("ok"),
    data_source: "notion" as const,
    database_id: databaseId,
    summary: {
      item_count: all.length,
      missing_owner: missingOwner.length,
      missing_status: missingStatus.length,
      missing_due_date: missingDueDate.length,
      stale: stale.length,
    },
    handoff_gaps: missingOwner
      .filter((t) => missingDueDate.some((m) => m.item.id === t.item.id))
      .map((t) => ({ id: t.item.id, title: t.item.title })),
    recommended_next_actions: nextActionCandidates,
    assumptions: [
      `Reading up to ${HARD_MAX_ITEMS} items for this summary.`,
      "Owner, status, and due-date detection is heuristic — matched by property name pattern, not a fixed schema.",
      "Stale means no edit signal in more than 14 days.",
    ],
    limitations: [
      "Single database scope only — cross-database source-of-truth ambiguity is not computed.",
      "Relation/backlink fields are not resolved — unlinked/orphaned pages are not detected.",
    ],
  };
}
