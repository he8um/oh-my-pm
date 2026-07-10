import type { KernelWarning, NormalizedProviderResponse, ProviderId } from "@oh-my-pm/contracts";
import type { ProviderResult } from "./types.js";

export const OMP_P_UNKNOWN_PROVIDER = "OMP-P-4001";
export const OMP_P_UNSUPPORTED_ACTION = "OMP-P-4002";
export const OMP_P_INVALID_REQUEST = "OMP-P-4003";

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

export function providerFailure(
  providerId: ProviderId,
  code: "OMP-P-4001" | "OMP-P-4002" | "OMP-P-4003",
  message: string,
): ProviderResult {
  return {
    ok: false,
    code,
    message,
    response: emptyProviderResponse(providerId, [providerWarning(code, message)]),
  };
}
