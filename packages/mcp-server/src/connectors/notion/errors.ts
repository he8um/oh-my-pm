export type NotionErrorCode =
  | "config_missing"
  | "auth_required"
  | "auth_failed"
  | "permission_denied"
  | "resource_not_found"
  | "rate_limited"
  | "network_error"
  | "api_error";

export interface NotionErrorResponse {
  status: "error" | "degraded";
  error_code: NotionErrorCode;
  message: string;
  rate_limit_hint?: string;
}

export function makeNotionError(
  error_code: NotionErrorCode,
  message: string,
  extra?: Partial<NotionErrorResponse>
): NotionErrorResponse {
  return { status: "error", error_code, message, ...extra };
}

// Safe HTTP status -> error code mapping. Never exposes token.
export function httpStatusToError(status: number, retryAfter: string | null): NotionErrorResponse {
  if (status === 401) {
    return makeNotionError(
      "auth_failed",
      "Notion returned 401. Check that OH_MY_PM_NOTION_TOKEN is valid."
    );
  }
  if (status === 403) {
    return makeNotionError(
      "permission_denied",
      "Notion returned 403. The integration may lack access to this page/database."
    );
  }
  if (status === 404) {
    return makeNotionError(
      "resource_not_found",
      "Notion returned 404. Check the configured page/database ID, and confirm the " +
        "integration has been shared with that page or database."
    );
  }
  if (status === 429) {
    return makeNotionError("rate_limited", "Notion rate limit reached.", {
      rate_limit_hint: retryAfter
        ? `Wait at least ${retryAfter} seconds before retrying.`
        : "Wait before retrying.",
    });
  }
  return makeNotionError("api_error", `Notion API returned HTTP ${status}.`);
}

// Notion requires a token for all useful endpoints — returns a degraded
// (not error) response so the agent can continue without crashing.
export function makeDegradedNoToken(): NotionErrorResponse {
  return {
    status: "degraded",
    error_code: "auth_required",
    message:
      "OH_MY_PM_NOTION_TOKEN is not set. " +
      "Notion requires an integration token for all read operations. " +
      "Set OH_MY_PM_NOTION_TOKEN to enable the Notion connector.",
  };
}
