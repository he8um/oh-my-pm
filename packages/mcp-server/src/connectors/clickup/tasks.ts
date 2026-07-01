import type { ClickUpClient } from "./client.js";
import type { ClickUpTask } from "./types.js";
import { excerptDescription, clampMaxItems } from "./limits.js";
import { classifyStatusType } from "./formatters.js";

interface RawClickUpTask {
  id: string;
  name: string;
  status: { status: string };
  assignees: { username: string }[];
  priority: { priority: string } | null;
  due_date: string | null;
  date_updated: string | null;
  description: string | null;
  url: string;
}

function toClickUpTask(t: RawClickUpTask): ClickUpTask {
  const statusName = t.status?.status ?? "unknown";
  return {
    id: t.id,
    name: t.name,
    status: statusName,
    status_type: classifyStatusType(statusName),
    assignees: (t.assignees ?? []).map((a) => a.username),
    priority: t.priority?.priority ?? null,
    due_date: t.due_date ? new Date(parseInt(t.due_date, 10)).toISOString() : null,
    date_updated: t.date_updated
      ? new Date(parseInt(t.date_updated, 10)).toISOString()
      : null,
    description_excerpt: excerptDescription(t.description),
    url: t.url,
  };
}

export async function fetchOpenTasksInList(
  client: ClickUpClient,
  listId: string,
  maxItems?: number
): Promise<{ tasks: ClickUpTask[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const result = await client.get<{ tasks: RawClickUpTask[] }>(
    `/list/${listId}/task?archived=false&include_closed=false&page=0`
  );

  if (result.error) return { tasks: null, error: result.error };

  const raw = result.data?.tasks ?? [];
  const tasks = raw.slice(0, limit).map(toClickUpTask);

  return { tasks, error: null };
}

export async function fetchTaskById(
  client: ClickUpClient,
  taskId: string
): Promise<{ task: ClickUpTask | null; error: unknown | null }> {
  const result = await client.get<RawClickUpTask>(`/task/${taskId}`);

  if (result.error) return { task: null, error: result.error };
  if (!result.data) return { task: null, error: null };

  return { task: toClickUpTask(result.data), error: null };
}
