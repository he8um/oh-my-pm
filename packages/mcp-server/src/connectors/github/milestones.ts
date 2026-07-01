import type { GitHubClient } from "./client.js";
import type { GitHubMilestone } from "./types.js";

interface RawGitHubMilestone {
  number: number;
  title: string;
  state: string;
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
  html_url: string;
}

export async function fetchOpenMilestones(
  client: GitHubClient
): Promise<{ milestones: GitHubMilestone[] | null; error: unknown | null }> {
  const result = await client.get<RawGitHubMilestone[]>(
    `/repos/${client.owner}/${client.repo}/milestones?state=open&per_page=25`
  );

  if (result.error) return { milestones: null, error: result.error };

  const raw = result.data ?? [];
  const milestones: GitHubMilestone[] = raw.map((m) => {
    const total = m.open_issues + m.closed_issues;
    const completion_pct = total > 0 ? Math.round((m.closed_issues / total) * 100) : 0;
    return {
      number: m.number,
      title: m.title,
      state: m.state === "closed" ? "closed" : "open",
      due_on: m.due_on,
      open_issues: m.open_issues,
      closed_issues: m.closed_issues,
      completion_pct,
      url: m.html_url,
    };
  });

  return { milestones, error: null };
}
