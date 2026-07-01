import type { ClickUpClient } from "./client.js";
import type {
  ClickUpFolder,
  ClickUpList,
  ClickUpSpace,
  ClickUpWorkspaceContext,
} from "./types.js";

interface RawClickUpSpace {
  id: string;
  name: string;
  archived: boolean;
}

interface RawClickUpFolder {
  id: string;
  name: string;
  archived: boolean;
  lists: { id: string }[];
}

interface RawClickUpList {
  id: string;
  name: string;
  archived: boolean;
  task_count: number | null;
  folder?: { id: string };
  space?: { id: string };
}

interface RawClickUpTeam {
  id: string;
  name: string;
}

export async function fetchWorkspaceContext(
  client: ClickUpClient,
  workspaceId: string
): Promise<{ workspace: ClickUpWorkspaceContext | null; error: unknown | null }> {
  const teamsResult = await client.get<{ teams: RawClickUpTeam[] }>("/team");
  if (teamsResult.error) return { workspace: null, error: teamsResult.error };

  const team = (teamsResult.data?.teams ?? []).find((t) => t.id === workspaceId);
  if (!team) return { workspace: null, error: null };

  const spacesResult = await fetchSpaces(client, workspaceId);
  if (spacesResult.error) return { workspace: null, error: spacesResult.error };

  return {
    workspace: {
      id: team.id,
      name: team.name,
      space_count: spacesResult.spaces?.length ?? 0,
    },
    error: null,
  };
}

export async function fetchSpaces(
  client: ClickUpClient,
  workspaceId: string
): Promise<{ spaces: ClickUpSpace[] | null; error: unknown | null }> {
  const result = await client.get<{ spaces: RawClickUpSpace[] }>(
    `/team/${workspaceId}/space?archived=false`
  );

  if (result.error) return { spaces: null, error: result.error };

  const spaces = (result.data?.spaces ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    archived: s.archived,
  }));

  return { spaces, error: null };
}

export async function fetchFolders(
  client: ClickUpClient,
  spaceId: string
): Promise<{ folders: ClickUpFolder[] | null; error: unknown | null }> {
  const result = await client.get<{ folders: RawClickUpFolder[] }>(
    `/space/${spaceId}/folder?archived=false`
  );

  if (result.error) return { folders: null, error: result.error };

  const folders = (result.data?.folders ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    space_id: spaceId,
    archived: f.archived,
    list_count: f.lists?.length ?? 0,
  }));

  return { folders, error: null };
}

export async function fetchListsInFolder(
  client: ClickUpClient,
  folderId: string
): Promise<{ lists: ClickUpList[] | null; error: unknown | null }> {
  const result = await client.get<{ lists: RawClickUpList[] }>(
    `/folder/${folderId}/list?archived=false`
  );

  if (result.error) return { lists: null, error: result.error };

  const lists = (result.data?.lists ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    folder_id: folderId,
    space_id: l.space?.id ?? null,
    archived: l.archived,
    task_count: l.task_count ?? null,
  }));

  return { lists, error: null };
}

export async function fetchFolderlessLists(
  client: ClickUpClient,
  spaceId: string
): Promise<{ lists: ClickUpList[] | null; error: unknown | null }> {
  const result = await client.get<{ lists: RawClickUpList[] }>(
    `/space/${spaceId}/list?archived=false`
  );

  if (result.error) return { lists: null, error: result.error };

  const lists = (result.data?.lists ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    folder_id: null,
    space_id: spaceId,
    archived: l.archived,
    task_count: l.task_count ?? null,
  }));

  return { lists, error: null };
}
