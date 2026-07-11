// Deterministic validation for controlled execution inputs. Each reason
// appears at most once, in first-encounter order over the plan operations.

import type {
  FilesystemEntry,
  InstallExecutionInput,
  InstallPlan,
  PlannedFileOperation,
} from "./types.js";
import { normalizeInstallerPath } from "./paths.js";
import { isNonEmptyString, validatePackageManifest } from "./validate.js";

function pushOnce(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

/** Validate an install plan before execution; empty result means valid. */
export function validateExecutionPlan(plan: InstallPlan): string[] {
  const reasons: string[] = [];
  if (!isNonEmptyString(plan.root)) {
    pushOnce(reasons, "install_plan_root_missing");
  }
  if (validatePackageManifest(plan.packageManifest).length > 0) {
    pushOnce(reasons, "install_plan_package_invalid");
  }
  if (plan.operations.length === 0) {
    pushOnce(reasons, "install_plan_operations_empty");
  }
  const normalizedRoot = normalizeInstallerPath(plan.root);
  for (const operation of plan.operations) {
    const path = normalizeInstallerPath(operation.path);
    const underRoot =
      isNonEmptyString(plan.root) && path.startsWith(`${normalizedRoot}/`);
    if (path.length === 0 || (isNonEmptyString(plan.root) && !underRoot)) {
      pushOnce(reasons, "install_plan_operation_path_invalid");
    }
  }
  return reasons;
}

/** Validate that execution has content for every create/replace operation. */
export function validateExecutionFiles(input: InstallExecutionInput): string[] {
  const reasons: string[] = [];
  for (const operation of input.plan.operations) {
    const file = fileForOperation(operation, input.files);
    if (operation.kind === "create" && file === undefined) {
      pushOnce(reasons, "missing_file_for_create");
    }
    if (operation.kind === "replace" && file === undefined) {
      pushOnce(reasons, "missing_file_for_replace");
    }
    if (
      operation.checksum !== undefined &&
      file !== undefined &&
      file.checksum !== operation.checksum
    ) {
      pushOnce(reasons, "checksum_mismatch");
    }
  }
  return reasons;
}

/** First file matching the operation path after normalization. */
export function fileForOperation(
  operation: PlannedFileOperation,
  files: readonly FilesystemEntry[],
): FilesystemEntry | undefined {
  const path = normalizeInstallerPath(operation.path);
  return files.find((file) => normalizeInstallerPath(file.path) === path);
}
