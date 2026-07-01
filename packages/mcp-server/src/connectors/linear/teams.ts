import type { LinearClient } from "./client.js";
import type { LinearTeam, LinearWorkspaceContext } from "./types.js";

interface RawLinearTeam {
  id: string;
  key: string;
  name: string;
}

interface RawLinearOrganization {
  id: string;
  name: string;
  urlKey: string;
}

const LIST_TEAMS_QUERY = `
  query ListTeams($first: Int!) {
    teams(first: $first) {
      nodes { id key name }
    }
  }
`;

const WORKSPACE_CONTEXT_QUERY = `
  query WorkspaceContext {
    organization { id name urlKey }
  }
`;

interface ListTeamsResponse {
  teams: { nodes: RawLinearTeam[] };
}

interface WorkspaceContextResponse {
  organization: RawLinearOrganization | null;
}

export async function fetchTeams(
  client: LinearClient,
  maxItems: number = 25
): Promise<{ teams: LinearTeam[] | null; error: unknown | null }> {
  const result = await client.query<ListTeamsResponse>(LIST_TEAMS_QUERY, { first: maxItems });

  if (result.error) return { teams: null, error: result.error };

  const teams = (result.data?.teams.nodes ?? []).map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
  }));

  return { teams, error: null };
}

export async function fetchWorkspaceContext(
  client: LinearClient
): Promise<{ workspace: LinearWorkspaceContext | null; error: unknown | null }> {
  const result = await client.query<WorkspaceContextResponse>(WORKSPACE_CONTEXT_QUERY);

  if (result.error) return { workspace: null, error: result.error };
  if (!result.data?.organization) return { workspace: null, error: null };

  const org = result.data.organization;
  return {
    workspace: { id: org.id, name: org.name, url_key: org.urlKey },
    error: null,
  };
}
