import { describe, expect, it } from "vitest";
import type { ReleaseMetadata } from "../src/index.js";
import {
  attachPlaceholderSignature,
  createArchivePlan,
  createPlaceholderReleaseSignature,
  createReleaseMetadataDryRun,
  createReleaseSigningPayload,
  createUnsignedReleaseMetadata,
  exampleArchivePlanInput,
  exampleReleaseMetadataInput,
  PLACEHOLDER_SIGNATURE_ALGORITHM,
  RELEASE_METADATA_SCHEMA_VERSION,
  validateReleaseMetadata,
} from "../src/index.js";

const unsigned = (): ReleaseMetadata =>
  createUnsignedReleaseMetadata({
    archive: createArchivePlan(exampleArchivePlanInput()),
    createdAt: "2026-01-01T00:00:00.000Z",
  });

const signed = (): ReleaseMetadata => {
  const metadata = unsigned();
  return attachPlaceholderSignature(
    metadata,
    createPlaceholderReleaseSignature({
      keyId: "example-key",
      signingPayload: createReleaseSigningPayload(metadata),
    }),
  );
};

describe("createUnsignedReleaseMetadata", () => {
  it("copies archive fields under schema version 1 without a signature", () => {
    const archive = createArchivePlan(exampleArchivePlanInput());
    const metadata = unsigned();
    expect(metadata.schemaVersion).toBe(RELEASE_METADATA_SCHEMA_VERSION);
    expect(metadata.packageName).toBe("oh-my-pm-local");
    expect(metadata.packageVersion).toBe("2.0.0-alpha.0");
    expect(metadata.archiveName).toBe(archive.archiveName);
    expect(metadata.archiveFormat).toBe("zip");
    expect(metadata.archiveChecksum).toBe(archive.checksum);
    expect(metadata.archiveEntries).toEqual(archive.entries);
    expect("signature" in metadata).toBe(false);
  });

  it("clones archive entries", () => {
    const archive = createArchivePlan(exampleArchivePlanInput());
    const metadata = createUnsignedReleaseMetadata({
      archive,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    archive.entries[0].checksum = "mutated";
    expect(metadata.archiveEntries[0].checksum).toBe("sha256:old");
  });
});

describe("createReleaseSigningPayload", () => {
  it("is deterministic, ordered, and starts with release:", () => {
    const payload = createReleaseSigningPayload(unsigned());
    expect(payload.startsWith("release:1:oh-my-pm-local:2.0.0-alpha.0:")).toBe(true);
    expect(payload.endsWith("bin/oh-my-pm=sha256:old:10|README.md=sha256:old-readme:10")).toBe(
      true,
    );
    expect(payload).toBe(createReleaseSigningPayload(unsigned()));
  });

  it("ignores an attached signature", () => {
    expect(createReleaseSigningPayload(signed())).toBe(createReleaseSigningPayload(unsigned()));
  });
});

describe("placeholder signature", () => {
  it("builds a deterministic placeholder value", () => {
    const signature = createPlaceholderReleaseSignature({
      keyId: "example-key",
      signingPayload: "release:x",
    });
    expect(signature).toEqual({
      algorithm: "deterministic-placeholder",
      keyId: "example-key",
      value: "placeholder:example-key:release:x",
    });
  });

  it("attach returns a clone and leaves the original unsigned", () => {
    const metadata = unsigned();
    const attached = attachPlaceholderSignature(
      metadata,
      createPlaceholderReleaseSignature({ keyId: "example-key", signingPayload: "p" }),
    );
    expect(attached.signature?.keyId).toBe("example-key");
    expect("signature" in metadata).toBe(false);
    attached.archiveEntries[0].checksum = "mutated";
    expect(metadata.archiveEntries[0].checksum).toBe("sha256:old");
  });
});

describe("validateReleaseMetadata", () => {
  it("passes valid unsigned and signed metadata", () => {
    expect(validateReleaseMetadata(unsigned())).toEqual({ ok: true, reasons: [] });
    expect(validateReleaseMetadata(signed())).toEqual({ ok: true, reasons: [] });
  });

  it("reports missing top-level fields in order", () => {
    const report = validateReleaseMetadata({
      ...unsigned(),
      packageName: "",
      packageVersion: " ",
      archiveName: "",
      archiveChecksum: "",
      createdAt: "",
    });
    expect(report.ok).toBe(false);
    expect(report.reasons).toEqual([
      "release_package_name_missing",
      "release_package_version_missing",
      "release_archive_name_missing",
      "release_archive_checksum_missing",
      "release_created_at_missing",
    ]);
  });

  it("reports empty and invalid archive entries once each", () => {
    expect(validateReleaseMetadata({ ...unsigned(), archiveEntries: [] }).reasons).toEqual([
      "release_archive_entries_must_not_be_empty",
    ]);
    const report = validateReleaseMetadata({
      ...unsigned(),
      archiveEntries: [
        { path: " ", checksum: "", sizeBytes: -1 },
        { path: "", checksum: " ", sizeBytes: -2 },
      ],
    });
    expect(report.reasons).toEqual([
      "release_archive_entry_path_missing",
      "release_archive_entry_checksum_missing",
      "release_archive_entry_size_invalid",
    ]);
  });

  it("validates the signature only when present", () => {
    const broken = {
      ...unsigned(),
      signature: { algorithm: "other" as never, keyId: "", value: " " },
    };
    expect(validateReleaseMetadata(broken).reasons).toEqual([
      "release_signature_key_missing",
      "release_signature_value_missing",
      "release_signature_algorithm_invalid",
    ]);
  });
});

describe("createReleaseMetadataDryRun", () => {
  it("returns unsigned metadata without a keyId", () => {
    const report = createReleaseMetadataDryRun({
      archive: createArchivePlan(exampleArchivePlanInput()),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
    expect("signature" in report.metadata).toBe(false);
    expect(report.signingPayload.startsWith("release:")).toBe(true);
  });

  it("attaches the placeholder signature when a keyId is supplied", () => {
    const report = createReleaseMetadataDryRun(exampleReleaseMetadataInput());
    expect(report.ok).toBe(true);
    expect(report.metadata.signature?.algorithm).toBe(PLACEHOLDER_SIGNATURE_ALGORITHM);
    expect(report.metadata.signature?.keyId).toBe("example-key");
    expect(report.metadata.signature?.value).toBe(
      `placeholder:example-key:${report.signingPayload}`,
    );
  });

  it("returns ok false with warnings for invalid archive input", () => {
    const report = createReleaseMetadataDryRun({
      archive: createArchivePlan({ ...exampleArchivePlanInput(), packageName: "", files: [] }),
      createdAt: "",
      keyId: "example-key",
    });
    expect(report.ok).toBe(false);
    expect(report.validation.reasons).toEqual([
      "release_package_name_missing",
      "release_created_at_missing",
      "release_archive_entries_must_not_be_empty",
    ]);
    expect(report.warnings?.map((warning) => warning.code)).toEqual([
      "OMP-I-6001",
      "OMP-I-6001",
      "OMP-I-6001",
    ]);
  });
});

describe("exampleReleaseMetadataInput", () => {
  it("is deterministic and dry-runs ok", () => {
    expect(exampleReleaseMetadataInput()).toEqual(exampleReleaseMetadataInput());
    const report = createReleaseMetadataDryRun(exampleReleaseMetadataInput());
    expect(report.ok).toBe(true);
    expect(report.metadata.signature?.keyId).toBe("example-key");
  });
});
