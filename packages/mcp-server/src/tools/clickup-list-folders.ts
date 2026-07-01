import { z } from "zod";
import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchFolders } from "../connectors/clickup/hierarchy.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { baseResponse } from "../utils/formatting.js";

export const clickupListFoldersSchema = {
  space_id: z
    .string()
    .optional()
    .describe(
      "ClickUp space ID to list folders from. Defaults to OH_MY_PM_CLICKUP_SPACE_ID if not set."
    ),
};

export async function clickupListFolders(params: { space_id?: string }) {
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

  const spaceId = params.space_id ?? config.spaceId;
  if (!spaceId) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message:
        "No space_id provided and OH_MY_PM_CLICKUP_SPACE_ID is not set. " +
        "Pass space_id or configure OH_MY_PM_CLICKUP_SPACE_ID.",
    };
  }

  const client = new ClickUpClient(config);
  const { folders, error } = await fetchFolders(client, spaceId);

  if (error) return error;

  const all = folders ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "clickup" as const,
    space_id: spaceId,
    folders: all.map((f) => ({
      id: f.id,
      name: f.name,
      archived: f.archived,
      list_count: f.list_count,
    })),
    total_returned: all.length,
  };
}
