import { z } from "zod";
import { loadLinearConfig } from "../connectors/linear/config.js";
import { LinearClient } from "../connectors/linear/client.js";
import { fetchOpenIssuesInTeam } from "../connectors/linear/issues.js";
import { extractDeliveryTags } from "../connectors/linear/formatters.js";
import { makeDegradedNoToken } from "../connectors/linear/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { DEFAULT_MAX_ISSUES } from "../connectors/linear/limits.js";

export const linearListIssuesSchema = {
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum issues to return. Default ${DEFAULT_MAX_ISSUES}, hard max 100.`),
};

export async function linearListIssues(params: { max_items?: number }) {
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
  const { issues, error } = await fetchOpenIssuesInTeam(client, config.teamId, params.max_items);

  if (error) return error;

  const all = issues ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "linear" as const,
    team_id: config.teamId,
    issues: all.map((i) => ({
      identifier: i.identifier,
      title: i.title,
      state: i.state_name,
      assignee: i.assignee,
      priority: i.priority_label,
      estimate: i.estimate,
      delivery_tags: extractDeliveryTags(i),
      url: i.url,
    })),
    total_returned: all.length,
    assumptions: [
      "Showing issues not in a completed or canceled state.",
      "Comments and sub-issue trees are not fetched.",
      "Description content is truncated to 500 characters.",
    ],
  };
}
