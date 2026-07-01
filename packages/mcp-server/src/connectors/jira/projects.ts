import type { JiraClient } from "./client.js";
import type { JiraProject } from "./types.js";
import { clampMaxItems } from "./limits.js";

interface RawJiraProject {
  id: string;
  key: string;
  name: string;
}

interface ListProjectsResponse {
  values: RawJiraProject[];
}

export async function fetchProjects(
  client: JiraClient,
  maxItems?: number
): Promise<{ projects: JiraProject[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const result = await client.get<ListProjectsResponse>(
    `/rest/api/3/project/search?maxResults=${limit}`
  );

  if (result.error) return { projects: null, error: result.error };

  const raw = result.data?.values ?? [];
  const projects = raw.map((p) => ({ id: p.id, key: p.key, name: p.name }));

  return { projects, error: null };
}
