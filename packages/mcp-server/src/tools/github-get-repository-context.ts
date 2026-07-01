import { loadGitHubConfig } from "../connectors/github/config.js";
import { GitHubClient } from "../connectors/github/client.js";
import { fetchRepositoryContext } from "../connectors/github/repository.js";
import { baseResponse } from "../utils/formatting.js";

export async function githubGetRepositoryContext() {
  const { config, error: configError } = loadGitHubConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "GitHub connector is not configured.",
    };
  }

  const client = new GitHubClient(config);
  const { repo, error } = await fetchRepositoryContext(client);

  if (error) return error;
  if (!repo) {
    return {
      status: "error" as const,
      error_code: "repo_not_found",
      message: `Repository ${config.owner}/${config.repo} not found or not accessible.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "github" as const,
    repository: repo,
  };
}
