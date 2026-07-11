// Signed release metadata design. This models the metadata shape, the
// deterministic signing payload, and validation only. The signature is a
// deterministic placeholder: no keys are generated, read, or stored, no
// cryptography runs, and nothing is written, uploaded, or published.

import type {
  ReleaseMetadata,
  ReleaseMetadataDryRunReport,
  ReleaseMetadataInput,
  ReleaseMetadataValidationReport,
  ReleaseSignature,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { isNonEmptyString } from "./validate.js";

export const RELEASE_METADATA_SCHEMA_VERSION = "1";
export const PLACEHOLDER_SIGNATURE_ALGORITHM = "deterministic-placeholder";

/** Build unsigned metadata from an archive plan; entries are cloned. */
export function createUnsignedReleaseMetadata(input: ReleaseMetadataInput): ReleaseMetadata {
  return {
    schemaVersion: RELEASE_METADATA_SCHEMA_VERSION,
    packageName: input.archive.packageName,
    packageVersion: input.archive.packageVersion,
    archiveName: input.archive.archiveName,
    archiveFormat: input.archive.format,
    archiveChecksum: input.archive.checksum,
    archiveEntries: input.archive.entries.map((entry) => ({ ...entry })),
    createdAt: input.createdAt,
  };
}

/**
 * Deterministic payload a future signer would sign. Always derived from the
 * unsigned fields; an attached signature is ignored.
 */
export function createReleaseSigningPayload(metadata: ReleaseMetadata): string {
  const parts = metadata.archiveEntries
    .map((entry) => `${entry.path}=${entry.checksum}:${entry.sizeBytes}`)
    .join("|");
  return [
    "release",
    metadata.schemaVersion,
    metadata.packageName,
    metadata.packageVersion,
    metadata.archiveName,
    metadata.archiveFormat,
    metadata.archiveChecksum,
    metadata.createdAt,
    parts,
  ].join(":");
}

/** Deterministic placeholder signature; explicitly not cryptographic. */
export function createPlaceholderReleaseSignature(input: {
  keyId: string;
  signingPayload: string;
}): ReleaseSignature {
  return {
    algorithm: PLACEHOLDER_SIGNATURE_ALGORITHM,
    keyId: input.keyId,
    value: `placeholder:${input.keyId}:${input.signingPayload}`,
  };
}

/** Return cloned metadata with the placeholder signature attached. */
export function attachPlaceholderSignature(
  metadata: ReleaseMetadata,
  signature: ReleaseSignature,
): ReleaseMetadata {
  if (signature.algorithm !== PLACEHOLDER_SIGNATURE_ALGORITHM) {
    throw new Error("only the deterministic placeholder algorithm is supported in this phase");
  }
  return {
    ...metadata,
    archiveEntries: metadata.archiveEntries.map((entry) => ({ ...entry })),
    signature: { ...signature },
  };
}

/** Validate release metadata; reasons appear at most once, in fixed order. */
export function validateReleaseMetadata(
  metadata: ReleaseMetadata,
): ReleaseMetadataValidationReport {
  const reasons: string[] = [];
  if (!isNonEmptyString(metadata.packageName)) {
    reasons.push("release_package_name_missing");
  }
  if (!isNonEmptyString(metadata.packageVersion)) {
    reasons.push("release_package_version_missing");
  }
  if (!isNonEmptyString(metadata.archiveName)) {
    reasons.push("release_archive_name_missing");
  }
  if (!isNonEmptyString(metadata.archiveChecksum)) {
    reasons.push("release_archive_checksum_missing");
  }
  if (!isNonEmptyString(metadata.createdAt)) {
    reasons.push("release_created_at_missing");
  }
  if (metadata.archiveEntries.length === 0) {
    reasons.push("release_archive_entries_must_not_be_empty");
  }
  if (metadata.archiveEntries.some((entry) => !isNonEmptyString(entry.path))) {
    reasons.push("release_archive_entry_path_missing");
  }
  if (metadata.archiveEntries.some((entry) => !isNonEmptyString(entry.checksum))) {
    reasons.push("release_archive_entry_checksum_missing");
  }
  if (metadata.archiveEntries.some((entry) => entry.sizeBytes < 0)) {
    reasons.push("release_archive_entry_size_invalid");
  }
  if (metadata.signature !== undefined) {
    if (!isNonEmptyString(metadata.signature.keyId)) {
      reasons.push("release_signature_key_missing");
    }
    if (!isNonEmptyString(metadata.signature.value)) {
      reasons.push("release_signature_value_missing");
    }
    if (metadata.signature.algorithm !== PLACEHOLDER_SIGNATURE_ALGORITHM) {
      reasons.push("release_signature_algorithm_invalid");
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Build a metadata dry run: unsigned metadata, its signing payload, an
 * optional attached placeholder signature, and a validation verdict.
 */
export function createReleaseMetadataDryRun(
  input: ReleaseMetadataInput,
): ReleaseMetadataDryRunReport {
  let metadata = createUnsignedReleaseMetadata(input);
  const signingPayload = createReleaseSigningPayload(metadata);
  if (input.keyId !== undefined) {
    metadata = attachPlaceholderSignature(
      metadata,
      createPlaceholderReleaseSignature({ keyId: input.keyId, signingPayload }),
    );
  }

  const validation = validateReleaseMetadata(metadata);
  if (validation.ok) {
    return { ok: true, metadata, signingPayload, validation };
  }
  return {
    ok: false,
    metadata,
    signingPayload,
    validation,
    warnings: validation.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
