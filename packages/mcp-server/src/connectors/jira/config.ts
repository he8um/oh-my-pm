export interface JiraConfig {
  baseUrl: string;
  email: string | null;
  token: string | null;
  projectKey: string;
  boardId: string | null;
}

export interface JiraConfigResult {
  config: JiraConfig | null;
  error: string | null;
}

export function loadJiraConfig(): JiraConfigResult {
  const baseUrl = process.env["OH_MY_PM_JIRA_BASE_URL"] ?? "";
  const email = process.env["OH_MY_PM_JIRA_EMAIL"] ?? null;
  const token = process.env["OH_MY_PM_JIRA_TOKEN"] ?? null;
  const projectKey = process.env["OH_MY_PM_JIRA_PROJECT_KEY"] ?? "";
  const boardId = process.env["OH_MY_PM_JIRA_BOARD_ID"] ?? null;

  if (!baseUrl) {
    return {
      config: null,
      error:
        "OH_MY_PM_JIRA_BASE_URL must be set. " +
        "Example: OH_MY_PM_JIRA_BASE_URL=https://yourorg.atlassian.net",
    };
  }

  if (!projectKey) {
    return {
      config: null,
      error:
        "OH_MY_PM_JIRA_PROJECT_KEY must be set. " +
        "Example: OH_MY_PM_JIRA_PROJECT_KEY=PROJ",
    };
  }

  return {
    config: { baseUrl, email, token, projectKey, boardId },
    error: null,
  };
}
