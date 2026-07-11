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
import { packageManifestFiles } from "./package-manifest.js";
import { joinInstallerPath } from "./paths.js";

function clonePackageManifest(manifest: InstallInput["packageManifest"]) {
  return JSON.parse(JSON.stringify(manifest)) as InstallInput["packageManifest"];
}

/**
 * Plan the file operations installing a package under a root. Callers
 * validate the package and its paths before planning; this helper only maps
 * files to operations in package order. Rich fileEntries, when present, are
 * the source of truth for both paths and per-file checksums.
 */
export function planInstallOperations(
  input: InstallInput,
  filesystem: FilesystemAdapter,
): InstallPlan {
  const manifest = input.packageManifest;
  const checksumByPath = new Map(
    (manifest.fileEntries ?? []).map((entry) => [entry.path, entry.checksum]),
  );

  const operations: PlannedFileOperation[] = packageManifestFiles(manifest).map((file) => {
    const fullPath = joinInstallerPath(input.root, file);
    return {
      kind: filesystem.exists(fullPath) ? "replace" : "create",
      path: fullPath,
      checksum: checksumByPath.get(file) ?? manifest.checksum,
    };
  });

  return {
    root: input.root,
    packageManifest: clonePackageManifest(manifest),
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
