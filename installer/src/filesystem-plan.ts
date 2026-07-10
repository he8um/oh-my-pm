// Deterministic filesystem planning. Planning only reads through the
// injected adapter and returns operation descriptions; nothing executes.

import type {
  FilesystemAdapter,
  InstallInput,
  InstallPlan,
  PlannedFileOperation,
  RollbackCaptureInput,
  RollbackCapturePlan,
} from "./types.js";
import { joinInstallerPath } from "./paths.js";

/**
 * Plan the file operations installing a package under a root. Callers
 * validate the package and its paths before planning; this helper only maps
 * files to operations in package order.
 */
export function planInstallOperations(
  input: InstallInput,
  filesystem: FilesystemAdapter,
): InstallPlan {
  const operations: PlannedFileOperation[] = input.packageManifest.files.map((file) => {
    const fullPath = joinInstallerPath(input.root, file);
    return {
      kind: filesystem.exists(fullPath) ? "replace" : "create",
      path: fullPath,
      checksum: input.packageManifest.checksum,
    };
  });

  return {
    root: input.root,
    packageManifest: {
      name: input.packageManifest.name,
      version: input.packageManifest.version,
      checksum: input.packageManifest.checksum,
      files: [...input.packageManifest.files],
    },
    operations,
  };
}

/**
 * Plan the capture operations backing a rollback point: existing paths are
 * backed up, missing paths are recorded for removal on restore.
 */
export function planRollbackCapture(
  input: RollbackCaptureInput,
  filesystem: FilesystemAdapter,
): RollbackCapturePlan {
  const operations: PlannedFileOperation[] = input.paths.map((path) => {
    const fullPath = joinInstallerPath(input.root, path);
    return {
      kind: filesystem.exists(fullPath) ? "backup" : "remove",
      path: fullPath,
    };
  });

  return {
    rollback: {
      id: input.id,
      paths: [...input.paths],
      createdAt: input.createdAt,
    },
    operations,
  };
}
