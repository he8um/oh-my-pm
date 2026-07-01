export interface GitHubConfig {
  token: string | null;
  owner: string;
  repo: string;
  apiBaseUrl: string;
}

export interface GitHubConfigResult {
  config: GitHubConfig | null;
  error: string | null;
}

export function loadGitHubConfig(): GitHubConfigResult {
  const owner = process.env["OH_MY_PM_GITHUB_OWNER"] ?? "";
  const repo = process.env["OH_MY_PM_GITHUB_REPO"] ?? "";
  const token = process.env["OH_MY_PM_GITHUB_TOKEN"] ?? null;
  const apiBaseUrl =
    process.env["OH_MY_PM_GITHUB_API_BASE_URL"] ?? "https://api.github.com";

  if (!owner || !repo) {
    return {
      config: null,
      error:
        "OH_MY_PM_GITHUB_OWNER and OH_MY_PM_GITHUB_REPO must be set. " +
        "Example: OH_MY_PM_GITHUB_OWNER=myorg OH_MY_PM_GITHUB_REPO=my-project",
    };
  }

  return { config: { token, owner, repo, apiBaseUrl }, error: null };
}
