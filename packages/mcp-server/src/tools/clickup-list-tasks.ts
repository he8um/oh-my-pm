import { z } from "zod";
import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchOpenTasksInList } from "../connectors/clickup/tasks.js";
import { extractDeliveryTags } from "../connectors/clickup/formatters.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { DEFAULT_MAX_TASKS } from "../connectors/clickup/limits.js";

export const clickupListTasksSchema = {
  list_id: z
    .string()
    .optional()
    .describe(
      "ClickUp list ID to read tasks from. Defaults to OH_MY_PM_CLICKUP_LIST_ID if not set."
    ),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum tasks to return. Default ${DEFAULT_MAX_TASKS}, hard max 100.`),
};

export async function clickupListTasks(
  params: { list_id?: string; max_items?: number }
) {
  const { config, error: configError } = loadClickUpConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "ClickUp connector is not configured.",
    };
  }

  if (!config.token) {
    return makeDegradedNoToken();
  }

  const listId = params.list_id ?? config.listId;
  if (!listId) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message:
        "No list_id provided and OH_MY_PM_CLICKUP_LIST_ID is not set. " +
        "Pass list_id or configure OH_MY_PM_CLICKUP_LIST_ID.",
    };
  }

  const client = new ClickUpClient(config);
  const { tasks, error } = await fetchOpenTasksInList(client, listId, params.max_items);

  if (error) return error;

  const all = tasks ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "clickup" as const,
    list_id: listId,
    tasks: all.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      assignees: t.assignees,
      priority: t.priority,
      due_date: t.due_date,
      delivery_tags: extractDeliveryTags(t),
      url: t.url,
    })),
    total_returned: all.length,
    assumptions: [
      "Showing non-archived, non-closed tasks only.",
      "Comments and custom fields are not fetched.",
      "Description content is truncated to 500 characters.",
    ],
  };
}
