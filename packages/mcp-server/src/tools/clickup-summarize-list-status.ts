import { z } from "zod";
import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchOpenTasksInList } from "../connectors/clickup/tasks.js";
import { extractDeliveryTags } from "../connectors/clickup/formatters.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { HARD_MAX_TASKS } from "../connectors/clickup/limits.js";

export const clickupSummarizeListStatusSchema = {
  list_id: z
    .string()
    .optional()
    .describe(
      "ClickUp list ID to summarize. Defaults to OH_MY_PM_CLICKUP_LIST_ID if not set."
    ),
};

export async function clickupSummarizeListStatus(params: { list_id?: string }) {
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
  const { tasks, error } = await fetchOpenTasksInList(client, listId, HARD_MAX_TASKS);

  if (error) return error;

  const all = tasks ?? [];
  const taggedTasks = all.map((t) => ({ task: t, tags: extractDeliveryTags(t) }));

  const blocked = taggedTasks.filter((t) => t.tags.includes("blocked"));
  const unassigned = taggedTasks.filter((t) => t.tags.includes("unassigned"));
  const missingDueDate = taggedTasks.filter((t) => t.tags.includes("missing_due_date"));
  const overdue = taggedTasks.filter((t) => t.tags.includes("overdue"));
  const stale = taggedTasks.filter((t) => t.tags.includes("stale"));

  const nextActionCandidates = [...overdue, ...stale]
    .filter((t, i, arr) => arr.findIndex((x) => x.task.id === t.task.id) === i)
    .slice(0, 5)
    .map((t) => ({ id: t.task.id, name: t.task.name, tags: t.tags }));

  return {
    ...baseResponse("ok"),
    data_source: "clickup" as const,
    list_id: listId,
    summary: {
      open_task_count: all.length,
      blockers: blocked.length,
      stale: stale.length,
      unassigned: unassigned.length,
      missing_due_dates: missingDueDate.length,
      overdue: overdue.length,
    },
    blockers: blocked.map((t) => ({ id: t.task.id, name: t.task.name })),
    handoff_gaps: unassigned
      .filter((t) => missingDueDate.some((m) => m.task.id === t.task.id))
      .map((t) => ({ id: t.task.id, name: t.task.name })),
    recommended_next_actions: nextActionCandidates,
    assumptions: [
      `Reading up to ${HARD_MAX_TASKS} open tasks for this summary.`,
      "Stale means no update in more than 14 days.",
    ],
    limitations: [
      "Task dependency data is not read — dependency risk is not computed.",
    ],
  };
}
