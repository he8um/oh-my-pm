import { describe, expect, it } from "vitest";
import type { ReleaseIntegrityVerificationInput } from "../src/index.js";
import {
  createReleaseIntegrityDryRun,
  createReleaseSigningPayload,
  expectedPlaceholderSignatureValue,
  exampleReleaseIntegrityVerificationInput,
  verifyPlaceholderSignature,
  verifyReleaseIntegrity,
  verifyReleaseMetadataAgainstArchive,
} from "../src/index.js";

const input = (): ReleaseIntegrityVerificationInput =>
  exampleReleaseIntegrityVerificationInput();

describe("expectedPlaceholderSignatureValue", () => {
  it("is deterministic and matches the placeholder format", () => {
    expect(
      expectedPlaceholderSignatureValue({ keyId: "example-key", signingPayload: "release:x" }),
    ).toBe("placeholder:example-key:release:x");
  });
});

describe("verifyPlaceholderSignature", () => {
  const payload = () => createReleaseSigningPayload(input().metadata);

  it("accepts a matching placeholder signature", () => {
    expect(
      verifyPlaceholderSignature({
        signature: input().metadata.signature,
        signingPayload: payload(),
      }),
    ).toEqual([]);
  });

  it("reports only a missing signature when undefined", () => {
    expect(verifyPlaceholderSignature({ signature: undefined, signingPayload: "p" })).toEqual([
      "release_signature_missing",
    ]);
  });

  it("reports algorithm, key, and value problems in order, once each", () => {
    const reasons = verifyPlaceholderSignature({
      signature: { algorithm: "other" as never, keyId: " ", value: "wrong" },
      signingPayload: payload(),
    });
    expect(reasons).toEqual([
      "release_signature_algorithm_invalid",
      "release_signature_key_missing",
      "release_signature_value_mismatch",
    ]);
  });

  it("reports a value mismatch alone for a tampered value", () => {
    const signature = { ...input().metadata.signature!, value: "placeholder:tampered" };
    expect(verifyPlaceholderSignature({ signature, signingPayload: payload() })).toEqual([
      "release_signature_value_mismatch",
    ]);
  });
});

describe("verifyReleaseMetadataAgainstArchive", () => {
  it("accepts matching metadata and archive", () => {
    expect(verifyReleaseMetadataAgainstArchive(input())).toEqual([]);
  });

  it("reports each field mismatch in the documented order", () => {
    const broken = input();
    broken.metadata = {
      ...broken.metadata,
      packageName: "other",
      packageVersion: "9",
      archiveName: "other.zip",
      archiveFormat: "tar",
      archiveChecksum: "archive:other",
    };
    expect(verifyReleaseMetadataAgainstArchive(broken)).toEqual([
      "release_package_name_mismatch",
      "release_package_version_mismatch",
      "release_archive_name_mismatch",
      "release_archive_format_mismatch",
      "release_archive_checksum_mismatch",
    ]);
  });

  it("reports entry mismatches for length, order, and field changes", () => {
    for (const mutate of [
      (i: ReleaseIntegrityVerificationInput) => i.metadata.archiveEntries.pop(),
      (i: ReleaseIntegrityVerificationInput) => i.metadata.archiveEntries.reverse(),
      (i: ReleaseIntegrityVerificationInput) => (i.metadata.archiveEntries[0].path = "other"),
      (i: ReleaseIntegrityVerificationInput) =>
        (i.metadata.archiveEntries[0].checksum = "sha256:other"),
      (i: ReleaseIntegrityVerificationInput) => (i.metadata.archiveEntries[0].sizeBytes = 999),
    ]) {
      const broken = input();
      mutate(broken);
      expect(verifyReleaseMetadataAgainstArchive(broken)).toEqual([
        "release_archive_entries_mismatch",
      ]);
    }
  });
});

describe("verifyReleaseIntegrity", () => {
  it("accepts the example input", () => {
    const report = verifyReleaseIntegrity(input());
    expect(report.ok).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.metadataValidation.ok).toBe(true);
  });

  it("orders validation reasons before archive and signature reasons", () => {
    const broken = input();
    broken.metadata = {
      ...broken.metadata,
      createdAt: "",
      packageName: "other",
      signature: undefined as never,
    };
    delete (broken.metadata as { signature?: unknown }).signature;
    const report = verifyReleaseIntegrity(broken);
    expect(report.reasons).toEqual([
      "release_created_at_missing",
      "release_package_name_mismatch",
      "release_signature_missing",
    ]);
  });

  it("fails for a tampered signature value", () => {
    const broken = input();
    broken.metadata = {
      ...broken.metadata,
      signature: { ...broken.metadata.signature!, value: "placeholder:tampered" },
    };
    const report = verifyReleaseIntegrity(broken);
    expect(report.ok).toBe(false);
    expect(report.reasons).toEqual(["release_signature_value_mismatch"]);
  });

  it("does not mutate metadata or archive", () => {
    const source = input();
    const snapshot = JSON.parse(JSON.stringify(source));
    verifyReleaseIntegrity(source);
    expect(source).toEqual(snapshot);
  });
});

describe("createReleaseIntegrityDryRun", () => {
  it("returns ok true without warnings for valid input", () => {
    const report = createReleaseIntegrityDryRun(input());
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for invalid input", () => {
    const broken = input();
    broken.metadata = { ...broken.metadata, packageName: "other" };
    const report = createReleaseIntegrityDryRun(broken);
    expect(report.ok).toBe(false);
    expect(report.warnings?.length).toBeGreaterThan(0);
    expect(report.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
  });
});

describe("exampleReleaseIntegrityVerificationInput", () => {
  it("is deterministic and verifies ok", () => {
    expect(exampleReleaseIntegrityVerificationInput()).toEqual(
      exampleReleaseIntegrityVerificationInput(),
    );
    expect(verifyReleaseIntegrity(exampleReleaseIntegrityVerificationInput()).ok).toBe(true);
  });
});
