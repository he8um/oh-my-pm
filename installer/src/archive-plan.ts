// Archive plan design: deterministic descriptions of future archives.
// Planning only — nothing here creates, writes, streams, compresses,
// uploads, or publishes anything.

import type {
  ArchiveDryRunReport,
  ArchiveFormat,
  ArchivePlan,
  ArchivePlanEntry,
  ArchivePlanInput,
  FilesystemEntry,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { isNonEmptyString } from "./validate.js";

const ARCHIVE_FORMATS: readonly ArchiveFormat[] = ["zip", "tar"];

/** Whether a string names a supported planned archive format. */
export function validateArchiveFormat(format: string): format is ArchiveFormat {
  return (ARCHIVE_FORMATS as readonly string[]).includes(format);
}

/** File extension for a planned format. */
export function archiveExtension(format: ArchiveFormat): string {
  return format;
}

/** Deterministic planned archive name: `<name>-<version>.<extension>`. */
export function createArchiveName(input: {
  packageName: string;
  packageVersion: string;
  format: ArchiveFormat;
}): string {
  return `${input.packageName}-${input.packageVersion}.${archiveExtension(input.format)}`;
}

/** Plan one file into a future archive; size is the UTF-8 byte length. */
export function createArchivePlanEntry(file: FilesystemEntry): ArchivePlanEntry {
  return {
    path: file.path,
    checksum: file.checksum,
    sizeBytes: new TextEncoder().encode(file.content).length,
  };
}

/** Build a deterministic archive plan; entries preserve input file order. */
export function createArchivePlan(input: ArchivePlanInput): ArchivePlan {
  const entries = input.files.map(createArchivePlanEntry);
  const parts = entries
    .map((entry) => `${entry.path}=${entry.checksum}:${entry.sizeBytes}`)
    .join("|");
  return {
    format: input.format,
    archiveName: createArchiveName({
      packageName: input.packageName,
      packageVersion: input.packageVersion,
      format: input.format,
    }),
    packageName: input.packageName,
    packageVersion: input.packageVersion,
    checksum: `archive:${input.format}:${input.packageName}:${input.packageVersion}:${parts}`,
    entries,
  };
}

/**
 * Validate archive input and return a dry-run report. A deterministic plan
 * is returned even when the input is invalid; invalid input only adds
 * warnings and flips `ok` to false.
 */
export function createArchiveDryRun(input: ArchivePlanInput): ArchiveDryRunReport {
  const reasons: string[] = [];
  if (!isNonEmptyString(input.packageName)) {
    reasons.push("archive_package_name_missing");
  }
  if (!isNonEmptyString(input.packageVersion)) {
    reasons.push("archive_package_version_missing");
  }
  if (input.files.length === 0) {
    reasons.push("archive_files_must_not_be_empty");
  }
  if (input.files.some((file) => !isNonEmptyString(file.path))) {
    reasons.push("archive_file_path_must_not_be_empty");
  }
  if (input.files.some((file) => !isNonEmptyString(file.checksum))) {
    reasons.push("archive_file_checksum_must_not_be_empty");
  }
  if (new Set(input.files.map((file) => file.path)).size !== input.files.length) {
    reasons.push("duplicate_archive_file_path");
  }

  const plan = createArchivePlan(input);
  if (reasons.length > 0) {
    return {
      ok: false,
      plan,
      warnings: reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
    };
  }
  return { ok: true, plan };
}
