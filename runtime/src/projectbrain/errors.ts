// Controlled Project Brain Runtime errors (v0.3 Phase 3). Stable codes; messages
// never expose raw provider messages, payloads, tokens, content, salts, root
// tokens, or full filesystem paths.

/** Stable Project Brain Runtime error codes. */
export const PROJECT_BRAIN_RUNTIME_ERROR_CODES = {
  invalidInput: "OMP-R-PB-6001",
  dependencyUnavailable: "OMP-R-PB-6002",
  kernelFailed: "OMP-R-PB-6003",
  requiredObservationFailed: "OMP-R-PB-6004",
  derivationFailed: "OMP-R-PB-6005",
  persistenceCommitFailed: "OMP-R-PB-6006",
  noPriorMemory: "OMP-R-PB-6007",
  insufficientHistory: "OMP-R-PB-6008",
  storedRecordReadFailed: "OMP-R-PB-6009",
  compareFailed: "OMP-R-PB-6010",
  limitExceeded: "OMP-R-PB-6011",
} as const;

export type ProjectBrainRuntimeErrorCode =
  (typeof PROJECT_BRAIN_RUNTIME_ERROR_CODES)[keyof typeof PROJECT_BRAIN_RUNTIME_ERROR_CODES];

/** A sanitized Project Brain Runtime error. */
export class ProjectBrainRuntimeError extends Error {
  readonly code: ProjectBrainRuntimeErrorCode;

  constructor(code: ProjectBrainRuntimeErrorCode, message: string) {
    super(message);
    this.name = "ProjectBrainRuntimeError";
    this.code = code;
    Object.setPrototypeOf(this, ProjectBrainRuntimeError.prototype);
  }
}

/** A sanitized error envelope carried in results. */
export interface ProjectBrainRuntimeErrorEnvelope {
  readonly code: ProjectBrainRuntimeErrorCode;
  readonly message: string;
}

/** Build a sanitized error envelope. */
export function errorEnvelope(
  code: ProjectBrainRuntimeErrorCode,
  message: string,
): ProjectBrainRuntimeErrorEnvelope {
  return { code, message };
}

export function invalidInput(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(PROJECT_BRAIN_RUNTIME_ERROR_CODES.invalidInput, message);
}
export function dependencyUnavailable(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(
    PROJECT_BRAIN_RUNTIME_ERROR_CODES.dependencyUnavailable,
    message,
  );
}
export function kernelFailed(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(PROJECT_BRAIN_RUNTIME_ERROR_CODES.kernelFailed, message);
}
export function limitExceeded(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(PROJECT_BRAIN_RUNTIME_ERROR_CODES.limitExceeded, message);
}
export function derivationFailed(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(PROJECT_BRAIN_RUNTIME_ERROR_CODES.derivationFailed, message);
}
export function persistenceCommitFailed(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(
    PROJECT_BRAIN_RUNTIME_ERROR_CODES.persistenceCommitFailed,
    message,
  );
}
export function storedRecordReadFailed(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(
    PROJECT_BRAIN_RUNTIME_ERROR_CODES.storedRecordReadFailed,
    message,
  );
}
export function compareFailed(message: string): ProjectBrainRuntimeError {
  return new ProjectBrainRuntimeError(PROJECT_BRAIN_RUNTIME_ERROR_CODES.compareFailed, message);
}

/**
 * A required-observation-failure error. The sanitized message names only the
 * sanitized sourceIdentity and a stable failure code — never a raw provider
 * message or payload.
 */
export function requiredObservationFailedError(
  sourceIdentity: string,
  failureCode?: string,
): ProjectBrainRuntimeError {
  const code = failureCode ?? "observation_failed";
  return new ProjectBrainRuntimeError(
    PROJECT_BRAIN_RUNTIME_ERROR_CODES.requiredObservationFailed,
    `required observation failed for source "${sourceIdentity}" (${code})`,
  );
}

/** True when a thrown value is a ProjectBrainRuntimeError. */
export function isProjectBrainRuntimeError(err: unknown): err is ProjectBrainRuntimeError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code !== undefined &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("OMP-R-PB-")
  );
}
