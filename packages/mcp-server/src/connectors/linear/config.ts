export interface LinearConfig {
  token: string | null;
  teamId: string;
  workspaceId: string | null;
  projectId: string | null;
  apiBaseUrl: string;
}

export interface LinearConfigResult {
  config: LinearConfig | null;
  error: string | null;
}

export function loadLinearConfig(): LinearConfigResult {
  const teamId = process.env["OH_MY_PM_LINEAR_TEAM_ID"] ?? "";
  const token = process.env["OH_MY_PM_LINEAR_TOKEN"] ?? null;
  const workspaceId = process.env["OH_MY_PM_LINEAR_WORKSPACE_ID"] ?? null;
  const projectId = process.env["OH_MY_PM_LINEAR_PROJECT_ID"] ?? null;
  const apiBaseUrl =
    process.env["OH_MY_PM_LINEAR_API_BASE_URL"] ?? "https://api.linear.app/graphql";

  if (!teamId) {
    return {
      config: null,
      error:
        "OH_MY_PM_LINEAR_TEAM_ID must be set. " +
        "Example: OH_MY_PM_LINEAR_TEAM_ID=1234abcd-1234-abcd-1234-abcd1234abcd",
    };
  }

  return {
    config: { token, teamId, workspaceId, projectId, apiBaseUrl },
    error: null,
  };
}
