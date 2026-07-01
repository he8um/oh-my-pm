import { loadGitHubConfig } from "../connectors/github/config.js";
import { GitHubClient } from "../connectors/github/client.js";
import { fetchOpenMilestones } from "../connectors/github/milestones.js";
import { baseResponse } from "../utils/formatting.js";

export async function githubListMilestones() {
  const { config, error: configError } = loadGitHubConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "GitHub connector is not configured.",
    };
  }

  const client = new GitHubClient(config);
  const { milestones, error } = await fetchOpenMilestones(client);

  if (error) return error;

  const all = milestones ?? [];
  const overdue = all.filter(
    (m) => m.due_on && new Date(m.due_on) < new Date()
  );

  return {
    ...baseResponse("ok"),
    data_source: "github" as const,
    repository: `${config.owner}/${config.repo}`,
    milestones: all.map((m) => ({
      number: m.number,
      title: m.title,
      due_on: m.due_on,
      open_issues: m.open_issues,
      completion_pct: m.completion_pct,
      is_overdue: m.due_on ? new Date(m.due_on) < new Date() : false,
      url: m.url,
    })),
    overdue_count: overdue.length,
    total_returned: all.length,
  };
}
