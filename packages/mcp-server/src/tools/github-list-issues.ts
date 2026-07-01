import { z } from "zod";
import { loadGitHubConfig } from "../connectors/github/config.js";
import { GitHubClient } from "../connectors/github/client.js";
import { fetchOpenIssues } from "../connectors/github/issues.js";
import { parseRateLimitHeaders, extractDeliveryTags } from "../connectors/github/formatters.js";
import { baseResponse, now } from "../utils/formatting.js";
import { DEFAULT_MAX_ISSUES } from "../connectors/github/limits.js";

export const githubListIssuesSchema = {
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum issues to return. Default ${DEFAULT_MAX_ISSUES}, hard max 100.`),
  label_filter: z
    .string()
    .optional()
    .describe("Optional label name to filter issues by."),
};

export async function githubListIssues(
  params: { max_items?: number; label_filter?: string }
) {
  const { config, error: configError } = loadGitHubConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "GitHub connector is not configured.",
    };
  }

  const client = new GitHubClient(config);
  const { issues, error } = await fetchOpenIssues(client, params.max_items);

  if (error) return error;

  const allIssues = issues ?? [];
  const filtered = params.label_filter
    ? allIssues.filter((i) =>
        i.labels.some(
          (l) => l.toLowerCase() === params.label_filter!.toLowerCase()
        )
      )
    : allIssues;

  return {
    ...baseResponse("ok"),
    data_source: "github" as const,
    repository: `${config.owner}/${config.repo}`,
    issues: filtered.map((i) => ({
      number: i.number,
      title: i.title,
      assignees: i.assignees,
      labels: i.labels,
      delivery_tags: extractDeliveryTags(i.labels),
      updated_at: i.updated_at,
      url: i.url,
    })),
    total_returned: filtered.length,
    assumptions: [
      "Showing open issues only.",
      "Pull requests are excluded.",
      "Body content is truncated to 500 characters.",
    ],
  };
}
