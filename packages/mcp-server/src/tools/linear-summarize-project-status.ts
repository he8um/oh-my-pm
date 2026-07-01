import { z } from "zod";
import { loadLinearConfig } from "../connectors/linear/config.js";
import { LinearClient } from "../connectors/linear/client.js";
import { fetchOpenIssuesInTeam } from "../connectors/linear/issues.js";
import { extractDeliveryTags } from "../connectors/linear/formatters.js";
import { makeDegradedNoToken } from "../connectors/linear/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { HARD_MAX_ISSUES } from "../connectors/linear/limits.js";

export const linearSummarizeProjectStatusSchema = {
  project_id: z
    .string()
    .optional()
    .describe(
      "Linear project ID to summarize context for. Defaults to OH_MY_PM_LINEAR_PROJECT_ID if not set. " +
        "Note: v0.11.0 summarizes team-wide open issues; project_id is informational context only."
    ),
};

export async function linearSummarizeProjectStatus(params: { project_id?: string }) {
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

  const projectId = params.project_id ?? config.projectId;

  const client = new LinearClient(config);
  const { issues, error } = await fetchOpenIssuesInTeam(client, config.teamId, HARD_MAX_ISSUES);

  if (error) return error;

  const all = issues ?? [];
  const tagged = all.map((i) => ({ issue: i, tags: extractDeliveryTags(i) }));

  const blocked = tagged.filter((t) => t.tags.includes("blocked"));
  const unassigned = tagged.filter((t) => t.tags.includes("unassigned"));
  const missingEstimate = tagged.filter((t) => t.tags.includes("missing_estimate"));
  const missingCycle = tagged.filter((t) => t.tags.includes("missing_cycle"));
  const stale = tagged.filter((t) => t.tags.includes("stale"));

  const nextActionCandidates = [...unassigned, ...stale]
    .filter((t, i, arr) => arr.findIndex((x) => x.issue.id === t.issue.id) === i)
    .slice(0, 5)
    .map((t) => ({ identifier: t.issue.identifier, title: t.issue.title, tags: t.tags }));

  return {
    ...baseResponse("ok"),
    data_source: "linear" as const,
    team_id: config.teamId,
    project_id: projectId,
    summary: {
      open_issue_count: all.length,
      blockers: blocked.length,
      unassigned: unassigned.length,
      missing_estimates: missingEstimate.length,
      missing_cycles: missingCycle.length,
      stale: stale.length,
    },
    blockers: blocked.map((t) => ({ identifier: t.issue.identifier, title: t.issue.title })),
    handoff_gaps: unassigned
      .filter((t) => missingEstimate.some((m) => m.issue.id === t.issue.id))
      .map((t) => ({ identifier: t.issue.identifier, title: t.issue.title })),
    recommended_next_actions: nextActionCandidates,
    assumptions: [
      `Reading up to ${HARD_MAX_ISSUES} open team issues for this summary.`,
      "Stale means no update in more than 14 days.",
      "project_id is informational context only in v0.11.0 — the summary covers all open team issues, not just one project.",
    ],
    limitations: [
      "Issue relations (blocks/blocked-by/related) are not read — dependency risk is not computed.",
      "Project target date is not compared against issue completion rate — overdue project risk is not computed.",
    ],
  };
}
