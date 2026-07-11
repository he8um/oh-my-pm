// Release integrity verification design. These are deterministic
// consistency checks between release metadata, an archive plan, and the
// placeholder signature shape. Nothing here verifies cryptographic
// authenticity: no keys, no crypto, no downloads, no publishing.

import type {
  ReleaseIntegrityDryRunReport,
  ReleaseIntegrityVerificationInput,
  ReleaseIntegrityVerificationReport,
  ReleaseSignature,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import {
  createReleaseSigningPayload,
  PLACEHOLDER_SIGNATURE_ALGORITHM,
  validateReleaseMetadata,
} from "./release-metadata.js";
import { isNonEmptyString } from "./validate.js";

/** The exact placeholder value a matching signature must carry. */
export function expectedPlaceholderSignatureValue(input: {
  keyId: string;
  signingPayload: string;
}): string {
  return `placeholder:${input.keyId}:${input.signingPayload}`;
}

/** Check the placeholder signature shape; empty result means consistent. */
export function verifyPlaceholderSignature(input: {
  signature: ReleaseSignature | undefined;
  signingPayload: string;
}): string[] {
  if (input.signature === undefined) {
    return ["release_signature_missing"];
  }

  const reasons: string[] = [];
  if (input.signature.algorithm !== PLACEHOLDER_SIGNATURE_ALGORITHM) {
    reasons.push("release_signature_algorithm_invalid");
  }
  if (!isNonEmptyString(input.signature.keyId)) {
    reasons.push("release_signature_key_missing");
  }
  const expected = expectedPlaceholderSignatureValue({
    keyId: input.signature.keyId,
    signingPayload: input.signingPayload,
  });
  if (input.signature.value !== expected) {
    reasons.push("release_signature_value_mismatch");
  }
  return reasons;
}

/** Compare metadata fields with an archive plan; empty result means match. */
export function verifyReleaseMetadataAgainstArchive(
  input: ReleaseIntegrityVerificationInput,
): string[] {
  const { metadata, archive } = input;
  const reasons: string[] = [];
  if (metadata.packageName !== archive.packageName) {
    reasons.push("release_package_name_mismatch");
  }
  if (metadata.packageVersion !== archive.packageVersion) {
    reasons.push("release_package_version_mismatch");
  }
  if (metadata.archiveName !== archive.archiveName) {
    reasons.push("release_archive_name_mismatch");
  }
  if (metadata.archiveFormat !== archive.format) {
    reasons.push("release_archive_format_mismatch");
  }
  if (metadata.archiveChecksum !== archive.checksum) {
    reasons.push("release_archive_checksum_mismatch");
  }
  const entriesMatch =
    metadata.archiveEntries.length === archive.entries.length &&
    metadata.archiveEntries.every((entry, index) => {
      const other = archive.entries[index];
      return (
        other !== undefined &&
        entry.path === other.path &&
        entry.checksum === other.checksum &&
        entry.sizeBytes === other.sizeBytes
      );
    });
  if (!entriesMatch) {
    reasons.push("release_archive_entries_mismatch");
  }
  return reasons;
}

/**
 * Full consistency verification: metadata validation first, then archive
 * comparison, then placeholder signature shape.
 */
export function verifyReleaseIntegrity(
  input: ReleaseIntegrityVerificationInput,
): ReleaseIntegrityVerificationReport {
  const metadataValidation = validateReleaseMetadata(input.metadata);
  const archiveReasons = verifyReleaseMetadataAgainstArchive(input);
  const signingPayload = createReleaseSigningPayload(input.metadata);
  const signatureReasons = verifyPlaceholderSignature({
    signature: input.metadata.signature,
    signingPayload,
  });

  const reasons = [...metadataValidation.reasons, ...archiveReasons, ...signatureReasons];
  return { ok: reasons.length === 0, reasons, metadataValidation };
}

/** Wrap verification in a dry-run report with OMP-I-6001 warnings. */
export function createReleaseIntegrityDryRun(
  input: ReleaseIntegrityVerificationInput,
): ReleaseIntegrityDryRunReport {
  const verification = verifyReleaseIntegrity(input);
  if (verification.ok) {
    return { ok: true, verification };
  }
  return {
    ok: false,
    verification,
    warnings: verification.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
