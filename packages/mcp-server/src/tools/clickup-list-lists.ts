import { z } from "zod";
import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchListsInFolder, fetchFolderlessLists } from "../connectors/clickup/hierarchy.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { baseResponse } from "../utils/formatting.js";

export const clickupListListsSchema = {
  folder_id: z
    .string()
    .optional()
    .describe(
      "ClickUp folder ID to list lists from. Defaults to OH_MY_PM_CLICKUP_FOLDER_ID if not set."
    ),
  space_id: z
    .string()
    .optional()
    .describe(
      "ClickUp space ID to list folderless lists from, used when no folder_id is available. " +
        "Defaults to OH_MY_PM_CLICKUP_SPACE_ID if not set."
    ),
};

export async function clickupListLists(params: { folder_id?: string; space_id?: string }) {
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

  const folderId = params.folder_id ?? config.folderId;
  const spaceId = params.space_id ?? config.spaceId;

  if (!folderId && !spaceId) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message:
        "No folder_id or space_id provided, and neither " +
        "OH_MY_PM_CLICKUP_FOLDER_ID nor OH_MY_PM_CLICKUP_SPACE_ID is set.",
    };
  }

  const client = new ClickUpClient(config);
  const { lists, error } = folderId
    ? await fetchListsInFolder(client, folderId)
    : await fetchFolderlessLists(client, spaceId!);

  if (error) return error;

  const all = lists ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "clickup" as const,
    ...(folderId ? { folder_id: folderId } : { space_id: spaceId }),
    lists: all.map((l) => ({
      id: l.id,
      name: l.name,
      archived: l.archived,
      task_count: l.task_count,
    })),
    total_returned: all.length,
  };
}
