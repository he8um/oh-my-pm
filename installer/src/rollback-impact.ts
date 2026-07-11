// Rollback impact preview: compare current files with rollback backup
// entries and classify what a rollback would change. This is a local,
// read-free comparison of provided data — nothing here restores files,
// removes files, writes backups, executes rollback, or retrieves anything.

import type {
  RollbackImpactDryRunReport,
  RollbackImpactOperation,
  RollbackImpactPreviewInput,
  RollbackImpactPreviewReport,
  RollbackImpactSummary,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { isSafeRelativePath, joinInstallerPath, normalizeInstallerPath } from "./paths.js";
import { isNonEmptyString } from "./validate.js";

/** Resolve a current/backup/rollback path to a normalized full path. */
export function normalizeRollbackImpactPath(root: string, path: string): string {
  const normalizedRoot = normalizeInstallerPath(root);
  const normalized = normalizeInstallerPath(path);
  if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized;
  }
  return joinInstallerPath(root, path);
}

function pushOnce(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function sized(entry: { content: string; checksum: string }): { checksum: string; sizeBytes: number } {
  return { checksum: entry.checksum, sizeBytes: new TextEncoder().encode(entry.content).length };
}

/**
 * Classify each path as restore/remove/missing/unchanged by comparing backup
 * entries against current files over the rollback paths. Current-only paths
 * outside the rollback set are ignored. Output is sorted; inputs untouched.
 */
export function createRollbackImpactOperations(
  input: RollbackImpactPreviewInput,
): RollbackImpactOperation[] {
  const current = new Map(
    input.currentFiles.map((file) => [
      normalizeRollbackImpactPath(input.root, file.path),
      sized(file),
    ]),
  );
  const backup = new Map(
    input.backupFiles.map((file) => [
      normalizeRollbackImpactPath(input.root, file.path),
      sized(file),
    ]),
  );
  const rollbackPaths = new Set(
    input.rollback.paths.map((path) => normalizeRollbackImpactPath(input.root, path)),
  );

  // Backup paths are always in play; current paths only matter when the
  // rollback set names them.
  const paths = new Set<string>([...backup.keys(), ...rollbackPaths]);
  for (const path of current.keys()) {
    if (rollbackPaths.has(path)) {
      paths.add(path);
    }
  }

  const operations: RollbackImpactOperation[] = [];
  for (const path of paths) {
    const before = current.get(path);
    const after = backup.get(path);

    let kind: RollbackImpactOperation["kind"];
    if (after !== undefined) {
      if (
        before !== undefined &&
        before.checksum === after.checksum &&
        before.sizeBytes === after.sizeBytes
      ) {
        kind = "unchanged";
      } else {
        kind = "restore";
      }
    } else if (before !== undefined) {
      kind = "remove";
    } else {
      kind = "missing";
    }

    const operation: RollbackImpactOperation = { kind, path };
    if (before !== undefined) {
      operation.beforeChecksum = before.checksum;
      operation.beforeSizeBytes = before.sizeBytes;
    }
    if (after !== undefined) {
      operation.afterChecksum = after.checksum;
      operation.afterSizeBytes = after.sizeBytes;
    }
    operations.push(operation);
  }

  return operations.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Count operations by kind and total before/after sizes. */
export function summarizeRollbackImpact(
  operations: readonly RollbackImpactOperation[],
): RollbackImpactSummary {
  const summary: RollbackImpactSummary = {
    restores: 0,
    removes: 0,
    missing: 0,
    unchanged: 0,
    beforeSizeBytes: 0,
    afterSizeBytes: 0,
  };
  for (const operation of operations) {
    if (operation.kind === "restore") summary.restores += 1;
    else if (operation.kind === "remove") summary.removes += 1;
    else if (operation.kind === "missing") summary.missing += 1;
    else summary.unchanged += 1;
    if (operation.beforeSizeBytes !== undefined) {
      summary.beforeSizeBytes += operation.beforeSizeBytes;
    }
    if (operation.afterSizeBytes !== undefined) {
      summary.afterSizeBytes += operation.afterSizeBytes;
    }
  }
  return summary;
}

/** Build a rollback impact preview; operations are always computed. */
export function createRollbackImpactPreview(
  input: RollbackImpactPreviewInput,
): RollbackImpactPreviewReport {
  const operations = createRollbackImpactOperations(input);
  const summary = summarizeRollbackImpact(operations);

  const reasons: string[] = [];
  if (!isNonEmptyString(input.root)) {
    pushOnce(reasons, "rollback_impact_root_missing");
  }
  if (!isNonEmptyString(input.rollback.id)) {
    pushOnce(reasons, "rollback_impact_id_missing");
  }
  if (input.rollback.paths.length === 0) {
    pushOnce(reasons, "rollback_impact_paths_empty");
  }
  if (input.rollback.paths.some((path) => !isSafeRelativePath(path))) {
    pushOnce(reasons, "rollback_impact_path_unsafe");
  }
  if (input.backupFiles.length === 0) {
    pushOnce(reasons, "rollback_impact_backup_files_empty");
  }

  return {
    ok: reasons.length === 0,
    root: input.root,
    rollbackId: input.rollback.id,
    operations,
    summary,
    reasons,
  };
}

/** Wrap the rollback impact preview in a dry-run report with OMP-I-6001 warnings. */
export function createRollbackImpactDryRun(
  input: RollbackImpactPreviewInput,
): RollbackImpactDryRunReport {
  const preview = createRollbackImpactPreview(input);
  if (preview.ok) {
    return { ok: true, preview };
  }
  return {
    ok: false,
    preview,
    warnings: preview.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}
