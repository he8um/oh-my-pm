import type { JiraClient } from "./client.js";
import type { JiraBoard, JiraSprint } from "./types.js";

interface RawJiraBoard {
  id: number;
  name: string;
  type: string;
}

interface ListBoardsResponse {
  values: RawJiraBoard[];
}

export async function fetchBoardsForProject(
  client: JiraClient,
  projectKeyOrId: string
): Promise<{ boards: JiraBoard[] | null; error: unknown | null }> {
  const result = await client.get<ListBoardsResponse>(
    `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKeyOrId)}`
  );

  if (result.error) return { boards: null, error: result.error };

  const raw = result.data?.values ?? [];
  const boards = raw.map((b) => ({ id: b.id, name: b.name, type: b.type }));

  return { boards, error: null };
}

interface RawJiraSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
}

interface ListSprintsResponse {
  values: RawJiraSprint[];
}

// Returns the active sprint for a board, or null if none is currently active.
// A missing active sprint is expected (not every board runs sprints
// continuously) and is not treated as an error by callers.
export async function fetchActiveSprint(
  client: JiraClient,
  boardId: string
): Promise<{ sprint: JiraSprint | null; error: unknown | null }> {
  const result = await client.get<ListSprintsResponse>(
    `/rest/agile/1.0/board/${boardId}/sprint?state=active`
  );

  if (result.error) return { sprint: null, error: result.error };

  const active = (result.data?.values ?? [])[0];
  if (!active) return { sprint: null, error: null };

  return {
    sprint: {
      id: active.id,
      name: active.name,
      state: active.state,
      start_date: active.startDate ?? null,
      end_date: active.endDate ?? null,
    },
    error: null,
  };
}

interface SprintIssueCountsResponse {
  issues: { fields: { status: { statusCategory: { key: string } } } }[];
}

export async function fetchSprintIssueCounts(
  client: JiraClient,
  sprintId: number
): Promise<{ total: number; done: number } | { error: unknown }> {
  const result = await client.get<SprintIssueCountsResponse>(
    `/rest/agile/1.0/sprint/${sprintId}/issue?fields=status&maxResults=100`
  );

  if (result.error) return { error: result.error };

  const issues = result.data?.issues ?? [];
  const done = issues.filter((i) => i.fields.status.statusCategory.key === "done").length;

  return { total: issues.length, done };
}
