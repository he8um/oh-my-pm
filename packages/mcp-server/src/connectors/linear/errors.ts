export type LinearErrorCode =
  | "config_missing"
  | "auth_required"
  | "auth_failed"
  | "permission_denied"
  | "resource_not_found"
  | "rate_limited"
  | "network_error"
  | "api_error";

export interface LinearErrorResponse {
  status: "error" | "degraded";
  error_code: LinearErrorCode;
  message: string;
  rate_limit_hint?: string;
}

export function makeLinearError(
  error_code: LinearErrorCode,
  message: string,
  extra?: Partial<LinearErrorResponse>
): LinearErrorResponse {
  return { status: "error", error_code, message, ...extra };
}

// Safe HTTP status -> error code mapping. Never exposes token or internal detail.
export function httpStatusToError(status: number): LinearErrorResponse {
  if (status === 401) {
    return makeLinearError(
      "auth_failed",
      "Linear returned 401. Check that OH_MY_PM_LINEAR_TOKEN is valid."
    );
  }
  if (status === 403) {
    return makeLinearError(
      "permission_denied",
      "Linear returned 403. The token may lack access to this team/workspace."
    );
  }
  if (status === 404) {
    return makeLinearError(
      "resource_not_found",
      "Linear returned 404. Check the configured team/project/issue identifier."
    );
  }
  if (status === 429) {
    return makeLinearError("rate_limited", "Linear rate limit reached.", {
      rate_limit_hint: "Wait before retrying.",
    });
  }
  return makeLinearError("api_error", `Linear API returned HTTP ${status}.`);
}

// Maps a GraphQL top-level "errors" entry to a safe error response.
// Never exposes token or raw GraphQL error internals beyond a safe summary.
export function graphqlErrorToError(message: string): LinearErrorResponse {
  if (/authent|unauthoriz/i.test(message)) {
    return makeLinearError(
      "auth_failed",
      "Linear returned an authentication error. Check that OH_MY_PM_LINEAR_TOKEN is valid."
    );
  }
  if (/not found/i.test(message)) {
    return makeLinearError(
      "resource_not_found",
      "Linear could not find the requested team/project/issue."
    );
  }
  return makeLinearError(
    "api_error",
    "Linear GraphQL API returned an error. Check the configured team/project/issue identifiers."
  );
}

// Linear requires a token for all useful queries — returns a degraded
// (not error) response so the agent can continue without crashing.
export function makeDegradedNoToken(): LinearErrorResponse {
  return {
    status: "degraded",
    error_code: "auth_required",
    message:
      "OH_MY_PM_LINEAR_TOKEN is not set. " +
      "Linear requires an API key for all read operations. " +
      "Set OH_MY_PM_LINEAR_TOKEN to enable the Linear connector.",
  };
}
