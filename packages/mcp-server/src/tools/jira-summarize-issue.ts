import { z } from "zod";
import { loadJiraConfig } from "../connectors/jira/config.js";
import { JiraClient } from "../connectors/jira/client.js";
import { fetchIssueByKey } from "../connectors/jira/issues.js";
import { extractDeliveryTags } from "../connectors/jira/formatters.js";
import { makeDegradedNoToken } from "../connectors/jira/errors.js";
import { baseResponse } from "../utils/formatting.js";

export const jiraSummarizeIssueSchema = {
  issue_key: z.string().min(1).describe("The Jira issue key to summarize (e.g. PROJ-123)."),
};

export async function jiraSummarizeIssue(params: { issue_key: string }) {
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
  const { issue, error } = await fetchIssueByKey(client, params.issue_key);

  if (error) return error;
  if (!issue) {
    return {
      status: "error" as const,
      error_code: "resource_not_found",
      message: `Issue ${params.issue_key} not found or not accessible.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "jira" as const,
    issue: {
      key: issue.key,
      summary: issue.summary,
      status: issue.status_name,
      assignee: issue.assignee,
      priority: issue.priority,
      story_points: issue.story_points,
      sprint: issue.sprint_name,
      labels: issue.labels,
      delivery_tags: extractDeliveryTags(issue),
      due_date: issue.due_date,
      updated_at: issue.updated_at,
      description_excerpt: issue.description_excerpt,
      url: issue.url,
    },
  };
}
