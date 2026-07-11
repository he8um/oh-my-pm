// Release package manifest builders and validation. Everything here is pure
// data construction: no archives, no remote retrieval, no distribution, and no
// filesystem access. Real distribution arrives in a later phase.

import type { PackageFileEntry, PackageManifest } from "@oh-my-pm/contracts";
import type { FilesystemEntry } from "./types.js";

// Local blank-string check; validate.ts imports from this module, so pulling
// isNonEmptyString from there would create an import cycle.
function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export const PACKAGE_MANIFEST_SCHEMA_VERSION = "1";

/** Input for building a package manifest from in-memory file entries. */
export type PackageManifestInput = {
  name: string;
  version: string;
  platform?: string;
  architecture?: string;
  createdAt?: string;
  files: readonly FilesystemEntry[];
};

/** Build per-file metadata; size is the UTF-8 byte length of the content. */
export function createPackageFileEntry(entry: FilesystemEntry): PackageFileEntry {
  return {
    path: entry.path,
    checksum: entry.checksum,
    sizeBytes: new TextEncoder().encode(entry.content).length,
  };
}

// Deterministic aggregate over stable manifest fields. This binds a plan to
// the manifest content for planning purposes; it is not cryptographic.
function aggregateChecksum(
  name: string,
  version: string,
  entries: readonly PackageFileEntry[],
): string {
  const parts = entries
    .map((entry) => `${entry.path}=${entry.checksum}:${entry.sizeBytes}`)
    .join("|");
  return `manifest:${name}:${version}:${parts}`;
}

/** Build a package manifest with per-file metadata in input order. */
export function createPackageManifest(input: PackageManifestInput): PackageManifest {
  const fileEntries = input.files.map(createPackageFileEntry);
  const manifest: PackageManifest = {
    name: input.name,
    version: input.version,
    checksum: aggregateChecksum(input.name, input.version, fileEntries),
    files: fileEntries.map((entry) => entry.path),
    schemaVersion: PACKAGE_MANIFEST_SCHEMA_VERSION,
    fileEntries,
  };
  if (input.platform !== undefined) {
    manifest.platform = input.platform;
  }
  if (input.architecture !== undefined) {
    manifest.architecture = input.architecture;
  }
  if (input.createdAt !== undefined) {
    manifest.createdAt = input.createdAt;
  }
  return manifest;
}

/** Package file paths; rich fileEntries win over the plain files list. */
export function packageManifestFiles(manifest: PackageManifest): string[] {
  if (manifest.fileEntries !== undefined && manifest.fileEntries.length > 0) {
    return manifest.fileEntries.map((entry) => entry.path);
  }
  return [...manifest.files];
}

/**
 * Validate optional fileEntries against the manifest; empty result means
 * valid or absent entries. Each reason appears at most once.
 */
export function validatePackageFileEntries(manifest: PackageManifest): string[] {
  const entries = manifest.fileEntries;
  if (entries === undefined) {
    return [];
  }

  const reasons: string[] = [];
  const pathsMatch =
    entries.length === manifest.files.length &&
    entries.every((entry, index) => entry.path === manifest.files[index]);
  if (!pathsMatch) {
    reasons.push("package_file_entries_path_mismatch");
  }
  if (entries.some((entry) => isBlank(entry.path))) {
    reasons.push("package_file_entry_path_must_not_be_empty");
  }
  if (entries.some((entry) => isBlank(entry.checksum))) {
    reasons.push("package_file_entry_checksum_must_not_be_empty");
  }
  if (entries.some((entry) => entry.sizeBytes < 0)) {
    reasons.push("package_file_entry_size_must_be_non_negative");
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    reasons.push("duplicate_package_file_entry_path");
  }
  return reasons;
}
