import type { KernelWarning, NormalizedProviderResponse, ProviderId } from "@oh-my-pm/contracts";
import type { ProviderFailureCode, ProviderResult } from "./types.js";

export const OMP_P_UNKNOWN_PROVIDER = "OMP-P-4001";
export const OMP_P_UNSUPPORTED_ACTION = "OMP-P-4002";
export const OMP_P_INVALID_REQUEST = "OMP-P-4003";
export const OMP_P_AUTHENTICATION_FAILED = "OMP-P-4004";
export const OMP_P_ACCESS_FORBIDDEN = "OMP-P-4005";
export const OMP_P_RESOURCE_NOT_FOUND = "OMP-P-4006";
export const OMP_P_RATE_LIMITED = "OMP-P-4007";
export const OMP_P_TRANSPORT_FAILED = "OMP-P-4008";
export const OMP_P_INVALID_RESPONSE = "OMP-P-4009";

/** Stable, user-facing default message for each provider failure code. */
export const PROVIDER_FAILURE_MESSAGE: Readonly<Record<ProviderFailureCode, string>> = {
  "OMP-P-4001": "unknown provider",
  "OMP-P-4002": "unsupported provider action",
  "OMP-P-4003": "invalid provider request",
  "OMP-P-4004": "provider authentication failed",
  "OMP-P-4005": "provider access is forbidden",
  "OMP-P-4006": "provider resource was not found",
  "OMP-P-4007": "provider rate limit reached",
  "OMP-P-4008": "provider transport failed",
  "OMP-P-4009": "provider returned an invalid response",
};

export function providerWarning(code: string, message: string): KernelWarning {
  return { code, message };
}

export function emptyProviderResponse(
  providerId: ProviderId,
  warnings?: KernelWarning[],
): NormalizedProviderResponse {
  const response: NormalizedProviderResponse = { providerId, items: [] };
  if (warnings && warnings.length > 0) {
    response.warnings = warnings;
  }
  return response;
}

/**
 * Build a sanitized provider failure. The message is a stable, user-facing
 * string that never carries raw response bodies, headers, tokens, or stack
 * traces. Failures always use an empty normalized response with exactly one
 * sanitized warning.
 */
export function providerFailure(
  providerId: ProviderId,
  code: ProviderFailureCode,
  message?: string,
): ProviderResult {
  const safeMessage = message ?? PROVIDER_FAILURE_MESSAGE[code];
  return {
    ok: false,
    code,
    message: safeMessage,
    response: emptyProviderResponse(providerId, [providerWarning(code, safeMessage)]),
  };
}
