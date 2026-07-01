import { loadJiraConfig } from "../connectors/jira/config.js";
import { JiraClient } from "../connectors/jira/client.js";
import { fetchBoardsForProject } from "../connectors/jira/boards.js";
import { makeDegradedNoToken } from "../connectors/jira/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function jiraListBoards() {
  const { config, error: configError } = loadJiraConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "Jira connector is not configured.",
    };
  }

  if (!config.email || !config.token) {
    return makeDegradedNoToken();
  }

  const client = new JiraClient(config);
  const { boards, error } = await fetchBoardsForProject(client, config.projectKey);

  if (error) return error;

  const all = boards ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "jira" as const,
    project_key: config.projectKey,
    boards: all.map((b) => ({ id: b.id, name: b.name, type: b.type })),
    total_returned: all.length,
  };
}
