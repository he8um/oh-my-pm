// Controlled, stable error codes and a single error type for the local project
// memory adapter. Errors never carry tokens, payloads, raw observed content, or
// full absolute project/data paths. Recovery hints are short, sanitized strings.

/** Stable internal error codes for local project memory operations. */
export const PROJECT_MEMORY_ERROR_CODES = {
  invalidInput: "OMP-MEM-1001",
  pathEscape: "OMP-MEM-1002",
  storeLocked: "OMP-MEM-1003",
  corruption: "OMP-MEM-1004",
  integrityMismatch: "OMP-MEM-1005",
  unsupportedStoreVersion: "OMP-MEM-1006",
  migrationRequired: "OMP-MEM-1007",
  recordConflict: "OMP-MEM-1008",
  missingReferencedRecord: "OMP-MEM-1009",
  limitExceeded: "OMP-MEM-1010",
  atomicCommitFailure: "OMP-MEM-1011",
  exportConflict: "OMP-MEM-1012",
  deleteConfirmationMismatch: "OMP-MEM-1013",
} as const;

/** The set of valid error code values. */
export type ProjectMemoryErrorCode =
  (typeof PROJECT_MEMORY_ERROR_CODES)[keyof typeof PROJECT_MEMORY_ERROR_CODES];

/** A single, sanitized error for every failure mode of the memory adapter. */
export class ProjectMemoryError extends Error {
  readonly code: ProjectMemoryErrorCode;
  /** Short, sanitized recovery hint. Never contains a path, token, or payload. */
  readonly recoveryHint?: string;

  constructor(code: ProjectMemoryErrorCode, message: string, recoveryHint?: string) {
    super(message);
    this.name = "ProjectMemoryError";
    this.code = code;
    if (recoveryHint !== undefined) this.recoveryHint = recoveryHint;
    // Preserve the prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, ProjectMemoryError.prototype);
  }
}

/** Construct an invalid-input error (OMP-MEM-1001). */
export function invalidInput(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.invalidInput, message, recoveryHint);
}

/** Construct a path-escape / project-collision error (OMP-MEM-1002). */
export function pathEscape(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.pathEscape, message, recoveryHint);
}

/** Construct a store-locked error (OMP-MEM-1003). */
export function storeLocked(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.storeLocked, message, recoveryHint);
}

/** Construct a corruption error (OMP-MEM-1004). */
export function corruption(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.corruption, message, recoveryHint);
}

/** Construct an integrity-mismatch error (OMP-MEM-1005). */
export function integrityMismatch(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.integrityMismatch, message, recoveryHint);
}

/** Construct an unsupported-store-version error (OMP-MEM-1006). */
export function unsupportedStoreVersion(
  message: string,
  recoveryHint?: string,
): ProjectMemoryError {
  return new ProjectMemoryError(
    PROJECT_MEMORY_ERROR_CODES.unsupportedStoreVersion,
    message,
    recoveryHint,
  );
}

/** Construct a migration-required error (OMP-MEM-1007). */
export function migrationRequired(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.migrationRequired, message, recoveryHint);
}

/** Construct a record-conflict error (OMP-MEM-1008). */
export function recordConflict(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.recordConflict, message, recoveryHint);
}

/** Construct a missing-referenced-record error (OMP-MEM-1009). */
export function missingReferencedRecord(
  message: string,
  recoveryHint?: string,
): ProjectMemoryError {
  return new ProjectMemoryError(
    PROJECT_MEMORY_ERROR_CODES.missingReferencedRecord,
    message,
    recoveryHint,
  );
}

/** Construct a limit-exceeded error (OMP-MEM-1010). */
export function limitExceeded(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.limitExceeded, message, recoveryHint);
}

/** Construct an atomic-commit-failure error (OMP-MEM-1011). */
export function atomicCommitFailure(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(
    PROJECT_MEMORY_ERROR_CODES.atomicCommitFailure,
    message,
    recoveryHint,
  );
}

/** Construct an export-conflict error (OMP-MEM-1012). */
export function exportConflict(message: string, recoveryHint?: string): ProjectMemoryError {
  return new ProjectMemoryError(PROJECT_MEMORY_ERROR_CODES.exportConflict, message, recoveryHint);
}

/** Construct a delete-confirmation-mismatch error (OMP-MEM-1013). */
export function deleteConfirmationMismatch(
  message: string,
  recoveryHint?: string,
): ProjectMemoryError {
  return new ProjectMemoryError(
    PROJECT_MEMORY_ERROR_CODES.deleteConfirmationMismatch,
    message,
    recoveryHint,
  );
}
