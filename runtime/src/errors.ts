import type { KernelError, RuntimeResponse } from "@oh-my-pm/contracts";
import type { RuntimeFailureInput } from "./types.js";

export const OMP_R_VALIDATION_FAILED = "OMP-R-2001";
export const OMP_R_UNSUPPORTED_REQUEST_KIND = "OMP-R-2002";
export const OMP_R_HANDLER_FAILED = "OMP-R-2003";

export function runtimeError(code: string, message: string): KernelError {
  return {
    code,
    message,
    blocking: true,
  };
}

export function failureResponse(input: RuntimeFailureInput): RuntimeResponse {
  const response: RuntimeResponse = {
    id: input.requestId,
    ok: false,
    data: input.data ?? { code: input.code, message: input.message },
    error: runtimeError(input.code, input.message),
    trace: input.trace,
  };

  if (input.warnings && input.warnings.length > 0) {
    response.warnings = input.warnings;
  }

  return response;
}
