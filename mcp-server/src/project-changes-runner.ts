import {
  createNodeWasmProjectBrainKernelApi,
  isNodeWasmKernelAvailable,
} from "@oh-my-pm/kernel";
import {
  createNodeProjectMemoryStore,
  PROJECT_MEMORY_ERROR_CODES,
  ProjectMemoryError,
  type ProjectMemoryStore,
} from "@oh-my-pm/project-memory";
import {
  createProjectBrainRuntime,
  PROJECT_BRAIN_RUNTIME_ERROR_CODES,
  type ProjectBrainRuntime,
} from "@oh-my-pm/runtime";
import {
  DEFAULT_CHANGES_RETURNED,
  DEFAULT_STALE_AFTER_SECONDS,
  MAX_CHANGES_RETURNED,
  MAX_STALE_AFTER_SECONDS,
  isValidProjectId,
  isValidSnapshotId,
  projectCompareResult,
  renderProjectChangesMarkdown,
} from "./project-changes-projector.js";
import type {
  McpProjectChangesExecution,
  McpProjectChangesFailure,
  McpProjectChangesInput,
} from "./types.js";

export type ProjectChangesRunnerOptions = {
  clock: () => string;
  dataRootOverride?: string;
  store?: ProjectMemoryStore;
  runtime?: ProjectBrainRuntime;
  kernelAvailable?: () => boolean;
  forbiddenValues?: readonly string[];
};

function failure(
  code: McpProjectChangesFailure["code"],
  message: string,
): McpProjectChangesFailure {
  return { ok: false, code, message };
}

function validInput(input: McpProjectChangesInput): boolean {
  if (!isValidProjectId(input.projectId)) return false;
  const hasPrevious = input.previousSnapshotId !== undefined;
  const hasCurrent = input.currentSnapshotId !== undefined;
  if (hasPrevious !== hasCurrent) return false;
  if (
    hasPrevious &&
    hasCurrent &&
    (!isValidSnapshotId(input.previousSnapshotId) ||
      !isValidSnapshotId(input.currentSnapshotId) ||
      input.previousSnapshotId === input.currentSnapshotId)
  ) {
    return false;
  }
  const stale = input.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const limit = input.limit ?? DEFAULT_CHANGES_RETURNED;
  return (
    Number.isInteger(stale) &&
    stale >= 0 &&
    stale <= MAX_STALE_AFTER_SECONDS &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= MAX_CHANGES_RETURNED
  );
}

function inertRuntime(store: ProjectMemoryStore, kernelAvailable: () => boolean): ProjectBrainRuntime {
  if (!kernelAvailable()) {
    throw new Error("kernel unavailable");
  }
  return createProjectBrainRuntime({
    kernel: createNodeWasmProjectBrainKernelApi(),
    // The persistence package exposes finalized JSON-object record aliases
    // while Runtime exposes the generated contract shapes. Phase 3 already
    // qualifies their wire compatibility; this is the same narrow binding.
    memory: store as never,
    observation: {
      observe: async () => {
        throw new Error("project_changes must not observe project files or providers");
      },
    },
    deriver: {
      derive: () => {
        throw new Error("project_changes must not derive live project state");
      },
    },
  });
}

function mapMemoryError(error: ProjectMemoryError): McpProjectChangesFailure {
  switch (error.code) {
    case PROJECT_MEMORY_ERROR_CODES.storeLocked:
      return failure("project_changes_store_locked", "project memory is locked; retry later");
    case PROJECT_MEMORY_ERROR_CODES.migrationRequired:
      return failure(
        "project_changes_migration_required",
        "project memory requires migration; run explicit CLI capture --migrate-store",
      );
    case PROJECT_MEMORY_ERROR_CODES.unsupportedStoreVersion:
      return failure(
        "project_changes_unsupported_store",
        "project memory is newer than this installation; upgrade OH MY PM",
      );
    case PROJECT_MEMORY_ERROR_CODES.corruption:
    case PROJECT_MEMORY_ERROR_CODES.integrityMismatch:
    case PROJECT_MEMORY_ERROR_CODES.missingReferencedRecord:
      return failure(
        "project_changes_store_corrupt",
        "project memory could not be verified; inspect memory through the CLI",
      );
    default:
      return failure("project_changes_read_failed", "project memory could not be read");
  }
}

export function createProjectChangesExecutor(
  options: ProjectChangesRunnerOptions,
): (input: McpProjectChangesInput) => Promise<McpProjectChangesExecution> {
  return async (input) => {
    if (!validInput(input)) {
      return failure("project_changes_invalid_input", "project changes input is invalid");
    }

    // Exactly one caller-clock read per invocation, before any store operation.
    const comparedAt = options.clock();
    if (typeof comparedAt !== "string" || comparedAt.length === 0) {
      return failure("project_changes_invalid_input", "project changes clock is invalid");
    }

    let store: ProjectMemoryStore;
    try {
      store =
        options.store ??
        createNodeProjectMemoryStore({
          ...(options.dataRootOverride !== undefined
            ? { dataRootOverride: options.dataRootOverride }
            : {}),
        });
    } catch {
      return failure(
        "project_changes_memory_unavailable",
        "Project Brain memory location is unavailable",
      );
    }

    if (options.runtime === undefined) {
      try {
        const inspection = await store.inspect(input.projectId);
        if (inspection.versionState === "migrationRequired") {
          return failure(
            "project_changes_migration_required",
            "project memory requires migration; run explicit CLI capture --migrate-store",
          );
        }
        if (inspection.versionState === "unsupportedNewer") {
          return failure(
            "project_changes_unsupported_store",
            "project memory is newer than this installation; upgrade OH MY PM",
          );
        }
        if (inspection.versionState === "incompatibleSchema") {
          return failure(
            "project_changes_incompatible_schema",
            "project memory schema is incompatible with this installation",
          );
        }
        if (
          inspection.issues.some((issue) =>
            ["missingRecord", "integrityFailure", "unsupportedFormat"].includes(issue.kind),
          )
        ) {
          return failure(
            "project_changes_store_corrupt",
            "project memory could not be verified; inspect memory through the CLI",
          );
        }
      } catch (error) {
        if (error instanceof ProjectMemoryError) return mapMemoryError(error);
        return failure("project_changes_read_failed", "project memory could not be read");
      }
    }

    let runtime: ProjectBrainRuntime;
    try {
      runtime =
        options.runtime ??
        inertRuntime(store, options.kernelAvailable ?? isNodeWasmKernelAvailable);
    } catch {
      return failure(
        "project_changes_kernel_unavailable",
        "Project Brain Kernel is unavailable; use a qualified installation",
      );
    }

    try {
      const comparison = await runtime.compare({
        requestId: "mcp-project-changes",
        projectId: input.projectId,
        comparedAt,
        ...(input.previousSnapshotId !== undefined
          ? { previousSnapshotId: input.previousSnapshotId }
          : {}),
        ...(input.currentSnapshotId !== undefined
          ? { currentSnapshotId: input.currentSnapshotId }
          : {}),
        stalenessPolicy: {
          evidenceStaleAfterSeconds:
            input.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS,
          maxFutureSkewSeconds: 0,
        },
      });
      if (comparison.status === "failed") {
        if (comparison.error?.code === PROJECT_BRAIN_RUNTIME_ERROR_CODES.kernelFailed) {
          return failure(
            "project_changes_kernel_unavailable",
            "Project Brain Kernel is unavailable; use a qualified installation",
          );
        }
        if (
          comparison.error?.code === PROJECT_BRAIN_RUNTIME_ERROR_CODES.storedRecordReadFailed
        ) {
          return failure(
            "project_changes_read_failed",
            "project memory records could not be read",
          );
        }
        return failure("project_changes_compare_failed", "project memory comparison failed");
      }
      const result = projectCompareResult(
        comparison,
        input.limit ?? DEFAULT_CHANGES_RETURNED,
        options.forbiddenValues,
      );
      if (result === null) {
        return failure("project_changes_compare_failed", "project memory comparison failed");
      }
      return { ok: true, result, markdown: renderProjectChangesMarkdown(result) };
    } catch (error) {
      if (error instanceof ProjectMemoryError) return mapMemoryError(error);
      return failure("project_changes_read_failed", "project memory could not be read");
    }
  };
}
