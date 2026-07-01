export type AirtableErrorCode =
  | "config_missing"
  | "auth_required"
  | "auth_failed"
  | "permission_denied"
  | "resource_not_found"
  | "invalid_request"
  | "rate_limited"
  | "network_error"
  | "api_error";

export interface AirtableErrorResponse {
  status: "error" | "degraded";
  error_code: AirtableErrorCode;
  message: string;
  rate_limit_hint?: string;
}

export function makeAirtableError(
  error_code: AirtableErrorCode,
  message: string,
  extra?: Partial<AirtableErrorResponse>
): AirtableErrorResponse {
  return { status: "error", error_code, message, ...extra };
}

// Safe HTTP status -> error code mapping. Never exposes token or internal detail.
export function httpStatusToError(status: number): AirtableErrorResponse {
  if (status === 401) {
    return makeAirtableError(
      "auth_failed",
      "Airtable returned 401. Check that OH_MY_PM_AIRTABLE_TOKEN is valid."
    );
  }
  if (status === 403) {
    return makeAirtableError(
      "permission_denied",
      "Airtable returned 403. The token may lack access to this base/table."
    );
  }
  if (status === 404) {
    return makeAirtableError(
      "resource_not_found",
      "Airtable returned 404. Check the configured base/table ID or name."
    );
  }
  if (status === 422) {
    return makeAirtableError(
      "invalid_request",
      "Airtable returned 422. Check the requested field, view, or record ID."
    );
  }
  if (status === 429) {
    return makeAirtableError("rate_limited", "Airtable rate limit reached.", {
      rate_limit_hint: "Wait before retrying (Airtable allows 5 requests/second per base).",
    });
  }
  return makeAirtableError("api_error", `Airtable API returned HTTP ${status}.`);
}

// Airtable requires a token for all useful endpoints — returns a degraded
// (not error) response so the agent can continue without crashing.
export function makeDegradedNoToken(): AirtableErrorResponse {
  return {
    status: "degraded",
    error_code: "auth_required",
    message:
      "OH_MY_PM_AIRTABLE_TOKEN is not set. " +
      "Airtable requires a personal access token for all read operations. " +
      "Set OH_MY_PM_AIRTABLE_TOKEN to enable the Airtable connector.",
  };
}
