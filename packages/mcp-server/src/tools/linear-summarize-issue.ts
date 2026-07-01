import { z } from "zod";
import { loadLinearConfig } from "../connectors/linear/config.js";
import { LinearClient } from "../connectors/linear/client.js";
import { fetchIssueByIdentifier } from "../connectors/linear/issues.js";
import { extractDeliveryTags } from "../connectors/linear/formatters.js";
import { makeDegradedNoToken } from "../connectors/linear/errors.js";
import { baseResponse } from "../utils/formatting.js";

export const linearSummarizeIssueSchema = {
  issue_id: z
    .string()
    .min(1)
    .describe("The Linear issue identifier (e.g. ENG-123) or internal ID to summarize."),
};

export async function linearSummarizeIssue(params: { issue_id: string }) {
  const { config, error: configError } = loadLinearConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "Linear connector is not configured.",
    };
  }

  if (!config.token) {
    return makeDegradedNoToken();
  }

  const client = new LinearClient(config);
  const { issue, error } = await fetchIssueByIdentifier(client, params.issue_id);

  if (error) return error;
  if (!issue) {
    return {
      status: "error" as const,
      error_code: "resource_not_found",
      message: `Issue ${params.issue_id} not found or not accessible.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "linear" as const,
    issue: {
      identifier: issue.identifier,
      title: issue.title,
      state: issue.state_name,
      assignee: issue.assignee,
      priority: issue.priority_label,
      estimate: issue.estimate,
      cycle: issue.cycle_name,
      labels: issue.labels,
      delivery_tags: extractDeliveryTags(issue),
      updated_at: issue.updated_at,
      description_excerpt: issue.description_excerpt,
      url: issue.url,
    },
  };
}
