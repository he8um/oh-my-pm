// Controlled execution of previously planned operations. Execution goes
// through injected adapters only; this module never touches Node APIs and
// never retrieves remote artifacts — file contents arrive with the input.

import type {
  ExecutedFileOperation,
  FilesystemExecutorDeps,
  InstallExecutionInput,
  InstallExecutionReport,
  InstallerFailure,
  RollbackExecutionInput,
  RollbackExecutionReport,
} from "./types.js";
import { installerFailure, OMP_I_INVALID_PACKAGE, OMP_I_ROLLBACK_INVALID } from "./errors.js";
import {
  fileForOperation,
  validateExecutionFiles,
  validateExecutionPlan,
} from "./execution-validate.js";
import { validateRollbackManifest } from "./validate.js";

/** Execute an install plan in order, stopping at the first failed operation. */
export function executeInstallPlan(
  input: InstallExecutionInput,
  deps: FilesystemExecutorDeps,
): InstallExecutionReport | InstallerFailure {
  const reasons = [...validateExecutionPlan(input.plan), ...validateExecutionFiles(input)];
  if (reasons.length > 0) {
    return installerFailure(
      OMP_I_INVALID_PACKAGE,
      `invalid install execution input: ${reasons.join(", ")}`,
    );
  }

  const operations: ExecutedFileOperation[] = [];
  let ok = true;
  for (const operation of input.plan.operations) {
    let executed: ExecutedFileOperation;
    if (operation.kind === "create" || operation.kind === "replace") {
      const file = fileForOperation(operation, input.files);
      if (file === undefined) {
        executed = { kind: operation.kind, path: operation.path, ok: false, message: "file_missing" };
      } else {
        executed = deps.writer.writeFile({
          path: operation.path,
          content: file.content,
          checksum: file.checksum,
        });
      }
    } else if (operation.kind === "remove") {
      executed = deps.writer.removeFile(operation.path);
    } else {
      executed = deps.writer.backupFile({ path: operation.path, rollbackId: "install" });
    }
    operations.push(executed);
    if (!executed.ok) {
      ok = false;
      break;
    }
  }

  return { ok, root: input.plan.root, operations };
}

/** Execute a rollback capture in path order, stopping at the first failure. */
export function executeRollbackPlan(
  input: RollbackExecutionInput,
  deps: FilesystemExecutorDeps,
): RollbackExecutionReport | InstallerFailure {
  const reasons = validateRollbackManifest(input.rollback);
  if (reasons.length > 0) {
    return installerFailure(
      OMP_I_ROLLBACK_INVALID,
      `invalid rollback execution input: ${reasons.join(", ")}`,
    );
  }

  const operations: ExecutedFileOperation[] = [];
  let ok = true;
  for (const path of input.rollback.paths) {
    const executed = deps.writer.backupFile({ path, rollbackId: input.rollback.id });
    operations.push(executed);
    if (!executed.ok) {
      ok = false;
      break;
    }
  }

  return { ok, rollbackId: input.rollback.id, operations };
}
