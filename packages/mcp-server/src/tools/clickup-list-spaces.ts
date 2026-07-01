import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchSpaces } from "../connectors/clickup/hierarchy.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function clickupListSpaces() {
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
  const { spaces, error } = await fetchSpaces(client, config.workspaceId);

  if (error) return error;

  const all = spaces ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "clickup" as const,
    workspace_id: config.workspaceId,
    spaces: all.map((s) => ({ id: s.id, name: s.name, archived: s.archived })),
    total_returned: all.length,
  };
}
