import { z } from "zod";
import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchTaskById } from "../connectors/clickup/tasks.js";
import { extractDeliveryTags } from "../connectors/clickup/formatters.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { baseResponse } from "../utils/formatting.js";

export const clickupSummarizeTaskSchema = {
  task_id: z.string().min(1).describe("The ClickUp task ID to summarize."),
};

export async function clickupSummarizeTask(params: { task_id: string }) {
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

  const client = new ClickUpClient(config);
  const { task, error } = await fetchTaskById(client, params.task_id);

  if (error) return error;
  if (!task) {
    return {
      status: "error" as const,
      error_code: "resource_not_found",
      message: `Task ${params.task_id} not found or not accessible.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "clickup" as const,
    task: {
      id: task.id,
      name: task.name,
      status: task.status,
      assignees: task.assignees,
      priority: task.priority,
      due_date: task.due_date,
      date_updated: task.date_updated,
      delivery_tags: extractDeliveryTags(task),
      description_excerpt: task.description_excerpt,
      url: task.url,
    },
  };
}
