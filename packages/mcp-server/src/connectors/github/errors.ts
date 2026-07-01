export type GitHubErrorCode =
  | "config_missing"
  | "auth_required"
  | "auth_failed"
  | "permission_denied"
  | "repo_not_found"
  | "rate_limited"
  | "network_error"
  | "api_error";

export interface GitHubErrorResponse {
  status: "error" | "degraded";
  error_code: GitHubErrorCode;
  message: string;
  rate_limit_hint?: string;
}

export function makeGitHubError(
  error_code: GitHubErrorCode,
  message: string,
  extra?: Partial<GitHubErrorResponse>
): GitHubErrorResponse {
  return { status: "error", error_code, message, ...extra };
}

// Safe HTTP status → error code mapping. Never exposes token or internal detail.
export function httpStatusToError(
  status: number,
  hasToken: boolean
): GitHubErrorResponse {
  if (status === 401) {
    return makeGitHubError(
      "auth_failed",
      "GitHub returned 401. Check that OH_MY_PM_GITHUB_TOKEN is valid."
    );
  }
  if (status === 403) {
    return makeGitHubError(
      "permission_denied",
      "GitHub returned 403. The token may lack required scopes (repo:read)."
    );
  }
  if (status === 404) {
    return makeGitHubError(
      "repo_not_found",
      "GitHub returned 404. Check OH_MY_PM_GITHUB_OWNER and OH_MY_PM_GITHUB_REPO."
    );
  }
  if (status === 429) {
    return makeGitHubError("rate_limited", "GitHub rate limit reached.", {
      rate_limit_hint: "Wait before retrying, or provide a token to increase rate limits.",
    });
  }
  return makeGitHubError("api_error", `GitHub API returned HTTP ${status}.`);
}

// Returns a degraded (not error) response for missing token on public repos.
export function makeDegradedNoToken(): GitHubErrorResponse {
  return {
    status: "degraded",
    error_code: "auth_required",
    message:
      "OH_MY_PM_GITHUB_TOKEN is not set. " +
      "For private repositories, the token is required. " +
      "For public repositories, unauthenticated requests have a lower rate limit (60/hour).",
  };
}
