// Deterministic constructors for installer failures and warnings.

import type { KernelWarning } from "@oh-my-pm/contracts";
import type { InstallerErrorCode, InstallerFailure } from "./types.js";

export const OMP_I_INVALID_PACKAGE = "OMP-I-6001";
export const OMP_I_INVALID_INSTALL_INPUT = "OMP-I-6002";
export const OMP_I_UPDATE_BLOCKED = "OMP-I-6003";
export const OMP_I_ROLLBACK_INVALID = "OMP-I-6004";
export const OMP_I_MANIFEST_VALIDATION_FAILED = "OMP-I-6005";

/** Build a warning carrying an installer error code. */
export function installerWarning(code: string, message: string): KernelWarning {
  return { code, message };
}

/** Build a structured installer failure; never thrown. */
export function installerFailure(
  code: InstallerErrorCode,
  message: string,
): InstallerFailure {
  return {
    ok: false,
    code,
    message,
    warnings: [installerWarning(code, message)],
  };
}
