import { z } from "zod";
import { loadJiraConfig } from "../connectors/jira/config.js";
import { JiraClient } from "../connectors/jira/client.js";
import { fetchOpenIssuesInProject } from "../connectors/jira/issues.js";
import { extractDeliveryTags } from "../connectors/jira/formatters.js";
import { makeDegradedNoToken } from "../connectors/jira/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { DEFAULT_MAX_ISSUES } from "../connectors/jira/limits.js";

export const jiraListIssuesSchema = {
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum issues to return. Default ${DEFAULT_MAX_ISSUES}, hard max 100.`),
};

export async function jiraListIssues(params: { max_items?: number }) {
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
  const { issues, error } = await fetchOpenIssuesInProject(
    client,
    config.projectKey,
    params.max_items
  );

  if (error) return error;

  const all = issues ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "jira" as const,
    project_key: config.projectKey,
    issues: all.map((i) => ({
      key: i.key,
      summary: i.summary,
      status: i.status_name,
      assignee: i.assignee,
      priority: i.priority,
      story_points: i.story_points,
      delivery_tags: extractDeliveryTags(i),
      url: i.url,
    })),
    total_returned: all.length,
    assumptions: [
      "Showing issues whose status category is not Done.",
      "Story point estimate is read from a common Agile-API custom field fallback and may not match every Jira instance's configuration.",
      "Comments and full custom field sets are not fetched.",
      "Description content is truncated to 500 characters.",
    ],
  };
}
