import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchWorkspaceContext } from "../connectors/clickup/hierarchy.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function clickupGetWorkspaceContext() {
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
  const { workspace, error } = await fetchWorkspaceContext(client, config.workspaceId);

  if (error) return error;
  if (!workspace) {
    return {
      status: "error" as const,
      error_code: "resource_not_found",
      message: `Workspace ${config.workspaceId} not found or not accessible.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "clickup" as const,
    workspace,
  };
}
