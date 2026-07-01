import type { LinearClient } from "./client.js";
import type { LinearProject } from "./types.js";

interface RawLinearProject {
  id: string;
  name: string;
  state: string;
  targetDate: string | null;
}

const LIST_PROJECTS_QUERY = `
  query ListTeamProjects($teamId: String!, $first: Int!) {
    team(id: $teamId) {
      projects(first: $first) {
        nodes { id name state targetDate }
      }
    }
  }
`;

interface ListProjectsResponse {
  team: { projects: { nodes: RawLinearProject[] } } | null;
}

export async function fetchProjectsInTeam(
  client: LinearClient,
  teamId: string,
  maxItems: number = 25
): Promise<{ projects: LinearProject[] | null; error: unknown | null }> {
  const result = await client.query<ListProjectsResponse>(LIST_PROJECTS_QUERY, {
    teamId,
    first: maxItems,
  });

  if (result.error) return { projects: null, error: result.error };

  const raw = result.data?.team?.projects.nodes ?? [];
  const projects = raw.map((p) => ({
    id: p.id,
    name: p.name,
    state: p.state,
    target_date: p.targetDate,
  }));

  return { projects, error: null };
}
