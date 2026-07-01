import { z } from "zod";
import { loadJiraConfig } from "../connectors/jira/config.js";
import { JiraClient } from "../connectors/jira/client.js";
import { fetchOpenIssuesInProject } from "../connectors/jira/issues.js";
import { fetchActiveSprint, fetchSprintIssueCounts } from "../connectors/jira/boards.js";
import { extractDeliveryTags } from "../connectors/jira/formatters.js";
import { makeDegradedNoToken } from "../connectors/jira/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { HARD_MAX_ISSUES } from "../connectors/jira/limits.js";

export const jiraSummarizeProjectStatusSchema = {
  board_id: z
    .string()
    .optional()
    .describe(
      "Jira board ID to read active sprint status from. Defaults to OH_MY_PM_JIRA_BOARD_ID if not set. " +
        "If no board is available, the summary omits sprint data."
    ),
};

export async function jiraSummarizeProjectStatus(params: { board_id?: string }) {
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

  const boardId = params.board_id ?? config.boardId;

  const client = new JiraClient(config);
  const { issues, error } = await fetchOpenIssuesInProject(
    client,
    config.projectKey,
    HARD_MAX_ISSUES
  );

  if (error) return error;

  const all = issues ?? [];
  const tagged = all.map((i) => ({ issue: i, tags: extractDeliveryTags(i) }));

  const blocked = tagged.filter((t) => t.tags.includes("blocked"));
  const unassigned = tagged.filter((t) => t.tags.includes("unassigned"));
  const missingEstimate = tagged.filter((t) => t.tags.includes("missing_estimate"));
  const missingSprint = tagged.filter((t) => t.tags.includes("missing_sprint"));
  const overdue = tagged.filter((t) => t.tags.includes("overdue"));
  const stale = tagged.filter((t) => t.tags.includes("stale"));

  const nextActionCandidates = [...overdue, ...stale]
    .filter((t, i, arr) => arr.findIndex((x) => x.issue.id === t.issue.id) === i)
    .slice(0, 5)
    .map((t) => ({ key: t.issue.key, summary: t.issue.summary, tags: t.tags }));

  const limitations = [
    "Issue links (blocks/is blocked by/relates to) are not read — dependency risk is not computed.",
  ];

  let sprint: Record<string, unknown> | null = null;
  if (boardId) {
    const { sprint: activeSprint, error: sprintError } = await fetchActiveSprint(client, boardId);
    if (sprintError) {
      limitations.push("Active sprint lookup failed — sprint completion rate is unavailable for this response.");
    } else if (activeSprint) {
      const counts = await fetchSprintIssueCounts(client, activeSprint.id);
      sprint = {
        id: activeSprint.id,
        name: activeSprint.name,
        start_date: activeSprint.start_date,
        end_date: activeSprint.end_date,
        ...("error" in counts
          ? { completion_rate: null }
          : {
              issue_count: counts.total,
              done_count: counts.done,
              completion_rate:
                counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : null,
            }),
      };
    } else {
      limitations.push("No active sprint found on the configured board.");
    }
  } else {
    limitations.push("No board configured — sprint completion rate is not included in this response.");
  }

  return {
    ...baseResponse("ok"),
    data_source: "jira" as const,
    project_key: config.projectKey,
    board_id: boardId,
    summary: {
      open_issue_count: all.length,
      blockers: blocked.length,
      unassigned: unassigned.length,
      missing_estimates: missingEstimate.length,
      missing_sprint: missingSprint.length,
      overdue: overdue.length,
      stale: stale.length,
    },
    active_sprint: sprint,
    blockers: blocked.map((t) => ({ key: t.issue.key, summary: t.issue.summary })),
    handoff_gaps: unassigned
      .filter((t) => missingEstimate.some((m) => m.issue.id === t.issue.id))
      .map((t) => ({ key: t.issue.key, summary: t.issue.summary })),
    recommended_next_actions: nextActionCandidates,
    assumptions: [
      `Reading up to ${HARD_MAX_ISSUES} open project issues for this summary.`,
      "Stale means no update in more than 14 days.",
      "Story point estimate is read from a common Agile-API custom field fallback and may not match every Jira instance's configuration.",
    ],
    limitations,
  };
}
