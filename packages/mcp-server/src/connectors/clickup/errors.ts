export type ClickUpErrorCode =
  | "config_missing"
  | "auth_required"
  | "auth_failed"
  | "permission_denied"
  | "resource_not_found"
  | "rate_limited"
  | "network_error"
  | "api_error";

export interface ClickUpErrorResponse {
  status: "error" | "degraded";
  error_code: ClickUpErrorCode;
  message: string;
  rate_limit_hint?: string;
}

export function makeClickUpError(
  error_code: ClickUpErrorCode,
  message: string,
  extra?: Partial<ClickUpErrorResponse>
): ClickUpErrorResponse {
  return { status: "error", error_code, message, ...extra };
}

// Safe HTTP status -> error code mapping. Never exposes token or internal detail.
export function httpStatusToError(status: number): ClickUpErrorResponse {
  if (status === 401) {
    return makeClickUpError(
      "auth_failed",
      "ClickUp returned 401. Check that OH_MY_PM_CLICKUP_TOKEN is valid."
    );
  }
  if (status === 403) {
    return makeClickUpError(
      "permission_denied",
      "ClickUp returned 403. The token may lack access to this workspace/space/list."
    );
  }
  if (status === 404) {
    return makeClickUpError(
      "resource_not_found",
      "ClickUp returned 404. Check the configured workspace/space/folder/list ID."
    );
  }
  if (status === 429) {
    return makeClickUpError("rate_limited", "ClickUp rate limit reached.", {
      rate_limit_hint: "Wait before retrying.",
    });
  }
  return makeClickUpError("api_error", `ClickUp API returned HTTP ${status}.`);
}

// ClickUp requires a token for all useful endpoints — returns a degraded
// (not error) response so the agent can continue without crashing.
export function makeDegradedNoToken(): ClickUpErrorResponse {
  return {
    status: "degraded",
    error_code: "auth_required",
    message:
      "OH_MY_PM_CLICKUP_TOKEN is not set. " +
      "ClickUp requires an API token for all read operations. " +
      "Set OH_MY_PM_CLICKUP_TOKEN to enable the ClickUp connector.",
  };
}
