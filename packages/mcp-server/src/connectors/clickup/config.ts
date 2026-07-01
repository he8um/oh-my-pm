export interface ClickUpConfig {
  token: string | null;
  workspaceId: string;
  spaceId: string | null;
  folderId: string | null;
  listId: string | null;
  apiBaseUrl: string;
}

export interface ClickUpConfigResult {
  config: ClickUpConfig | null;
  error: string | null;
}

export function loadClickUpConfig(): ClickUpConfigResult {
  const workspaceId = process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"] ?? "";
  const token = process.env["OH_MY_PM_CLICKUP_TOKEN"] ?? null;
  const spaceId = process.env["OH_MY_PM_CLICKUP_SPACE_ID"] ?? null;
  const folderId = process.env["OH_MY_PM_CLICKUP_FOLDER_ID"] ?? null;
  const listId = process.env["OH_MY_PM_CLICKUP_LIST_ID"] ?? null;
  const apiBaseUrl =
    process.env["OH_MY_PM_CLICKUP_API_BASE_URL"] ?? "https://api.clickup.com/api/v2";

  if (!workspaceId) {
    return {
      config: null,
      error:
        "OH_MY_PM_CLICKUP_WORKSPACE_ID must be set. " +
        "Example: OH_MY_PM_CLICKUP_WORKSPACE_ID=1234567",
    };
  }

  return {
    config: { token, workspaceId, spaceId, folderId, listId, apiBaseUrl },
    error: null,
  };
}
