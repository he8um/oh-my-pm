import type { GitHubClient } from "./client.js";
import type { GitHubRepositoryContext } from "./types.js";

interface RawGitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  open_issues_count: number;
  private: boolean;
  html_url: string;
}

export async function fetchRepositoryContext(
  client: GitHubClient
): Promise<{ repo: GitHubRepositoryContext | null; error: unknown | null }> {
  const result = await client.get<RawGitHubRepo>(
    `/repos/${client.owner}/${client.repo}`
  );

  if (result.error) return { repo: null, error: result.error };
  if (!result.data) return { repo: null, error: null };

  const r = result.data;
  return {
    repo: {
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      default_branch: r.default_branch,
      open_issues_count: r.open_issues_count,
      is_private: r.private,
      url: r.html_url,
    },
    error: null,
  };
}
