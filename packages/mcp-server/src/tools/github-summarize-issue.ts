import { z } from "zod";
import { loadGitHubConfig } from "../connectors/github/config.js";
import { GitHubClient } from "../connectors/github/client.js";
import { fetchIssueByNumber } from "../connectors/github/issues.js";
import { extractDeliveryTags } from "../connectors/github/formatters.js";
import { baseResponse } from "../utils/formatting.js";

export const githubSummarizeIssueSchema = {
  issue_number: z
    .number()
    .int()
    .min(1)
    .describe("The GitHub issue number to summarize."),
};

export async function githubSummarizeIssue(params: { issue_number: number }) {
  const { config, error: configError } = loadGitHubConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "GitHub connector is not configured.",
    };
  }

  const client = new GitHubClient(config);
  const { issue, error } = await fetchIssueByNumber(client, params.issue_number);

  if (error) return error;
  if (!issue) {
    return {
      status: "error" as const,
      error_code: "repo_not_found",
      message: `Issue #${params.issue_number} not found in ${config.owner}/${config.repo}.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "github" as const,
    repository: `${config.owner}/${config.repo}`,
    issue: {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      assignees: issue.assignees,
      labels: issue.labels,
      delivery_tags: extractDeliveryTags(issue.labels),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      body_excerpt: issue.body_excerpt,
      url: issue.url,
    },
  };
}
