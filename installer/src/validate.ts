// Deterministic manifest validation helpers. Each reason appears at most
// once, in a fixed documented order.

import type {
  InstallManifest,
  PackageManifest,
  RollbackManifest,
} from "@oh-my-pm/contracts";
import { validatePackageFileEntries } from "./package-manifest.js";

/** Whether a string has non-whitespace content. */
export function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

/** Validate an installable package manifest; empty result means valid. */
export function validatePackageManifest(manifest: PackageManifest): string[] {
  const reasons: string[] = [];
  if (!isNonEmptyString(manifest.name)) {
    reasons.push("missing_package_name");
  }
  if (!isNonEmptyString(manifest.version)) {
    reasons.push("missing_package_version");
  }
  if (!isNonEmptyString(manifest.checksum)) {
    reasons.push("missing_package_checksum");
  }
  if (manifest.files.length === 0) {
    reasons.push("package_files_must_not_be_empty");
  }
  if (manifest.files.some((file) => !isNonEmptyString(file))) {
    reasons.push("package_file_path_must_not_be_empty");
  }
  if (new Set(manifest.files).size !== manifest.files.length) {
    reasons.push("duplicate_package_file_path");
  }
  reasons.push(...validatePackageFileEntries(manifest));
  return reasons;
}

/** Validate an install manifest; empty result means valid. */
export function validateInstallManifest(manifest: InstallManifest): string[] {
  const reasons: string[] = [];
  if (!isNonEmptyString(manifest.schemaVersion)) {
    reasons.push("missing_schema_version");
  }
  if (!isNonEmptyString(manifest.version)) {
    reasons.push("missing_version");
  }
  if (!isNonEmptyString(manifest.installedAt)) {
    reasons.push("missing_installed_at");
  }
  if (!isNonEmptyString(manifest.root)) {
    reasons.push("missing_root");
  }
  return reasons;
}

/** Validate a rollback manifest; empty result means valid. */
export function validateRollbackManifest(manifest: RollbackManifest): string[] {
  const reasons: string[] = [];
  if (!isNonEmptyString(manifest.id)) {
    reasons.push("missing_rollback_id");
  }
  if (manifest.paths.length === 0) {
    reasons.push("rollback_paths_must_not_be_empty");
  }
  if (manifest.paths.some((path) => !isNonEmptyString(path))) {
    reasons.push("rollback_path_must_not_be_empty");
  }
  if (!isNonEmptyString(manifest.createdAt)) {
    reasons.push("missing_rollback_created_at");
  }
  return reasons;
}
