export type JiraErrorCode =
  | "config_missing"
  | "auth_required"
  | "auth_failed"
  | "permission_denied"
  | "resource_not_found"
  | "rate_limited"
  | "network_error"
  | "api_error";

export interface JiraErrorResponse {
  status: "error" | "degraded";
  error_code: JiraErrorCode;
  message: string;
  rate_limit_hint?: string;
}

export function makeJiraError(
  error_code: JiraErrorCode,
  message: string,
  extra?: Partial<JiraErrorResponse>
): JiraErrorResponse {
  return { status: "error", error_code, message, ...extra };
}

// Safe HTTP status -> error code mapping. Never exposes token or email.
export function httpStatusToError(status: number, retryAfter: string | null): JiraErrorResponse {
  if (status === 401) {
    return makeJiraError(
      "auth_failed",
      "Jira returned 401. Check that OH_MY_PM_JIRA_EMAIL and OH_MY_PM_JIRA_TOKEN are valid."
    );
  }
  if (status === 403) {
    return makeJiraError(
      "permission_denied",
      "Jira returned 403. The account may lack access to this project/board."
    );
  }
  if (status === 404) {
    return makeJiraError(
      "resource_not_found",
      "Jira returned 404. Check the configured project key, board ID, or issue key."
    );
  }
  if (status === 429) {
    return makeJiraError("rate_limited", "Jira rate limit reached.", {
      rate_limit_hint: retryAfter
        ? `Wait at least ${retryAfter} seconds before retrying.`
        : "Wait before retrying.",
    });
  }
  return makeJiraError("api_error", `Jira API returned HTTP ${status}.`);
}

// Jira requires an email + token for all useful endpoints — returns a
// degraded (not error) response so the agent can continue without crashing.
export function makeDegradedNoToken(): JiraErrorResponse {
  return {
    status: "degraded",
    error_code: "auth_required",
    message:
      "OH_MY_PM_JIRA_EMAIL and/or OH_MY_PM_JIRA_TOKEN are not set. " +
      "Jira requires an account email and API token for all read operations. " +
      "Set both to enable the Jira connector.",
  };
}
