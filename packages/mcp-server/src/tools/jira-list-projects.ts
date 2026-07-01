import { loadJiraConfig } from "../connectors/jira/config.js";
import { JiraClient } from "../connectors/jira/client.js";
import { fetchProjects } from "../connectors/jira/projects.js";
import { makeDegradedNoToken } from "../connectors/jira/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function jiraListProjects() {
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
  const { projects, error } = await fetchProjects(client);

  if (error) return error;

  const all = projects ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "jira" as const,
    projects: all.map((p) => ({ id: p.id, key: p.key, name: p.name })),
    total_returned: all.length,
  };
}
