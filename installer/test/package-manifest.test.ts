import type { PackageManifest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  createPackageFileEntry,
  createPackageManifest,
  PACKAGE_MANIFEST_SCHEMA_VERSION,
  packageManifestFiles,
  validatePackageFileEntries,
} from "../src/index.js";

const files = [
  { path: "bin/oh-my-pm", content: "example binary", checksum: "sha256:example-bin" },
  { path: "README.md", content: "example readme", checksum: "sha256:example-readme" },
];

const baseInput = {
  name: "oh-my-pm-local",
  version: "2.0.0-alpha.0",
  files,
};

describe("createPackageFileEntry", () => {
  it("computes sizeBytes as the UTF-8 byte length", () => {
    expect(createPackageFileEntry(files[0])).toEqual({
      path: "bin/oh-my-pm",
      checksum: "sha256:example-bin",
      sizeBytes: 14,
    });
    expect(createPackageFileEntry({ path: "u", content: "héllo", checksum: "c" }).sizeBytes).toBe(
      6,
    );
  });
});

describe("createPackageManifest", () => {
  it("derives files and a deterministic aggregate checksum from entries", () => {
    const manifest = createPackageManifest(baseInput);
    expect(manifest.files).toEqual(["bin/oh-my-pm", "README.md"]);
    expect(manifest.schemaVersion).toBe(PACKAGE_MANIFEST_SCHEMA_VERSION);
    expect(manifest.checksum).toBe(
      "manifest:oh-my-pm-local:2.0.0-alpha.0:" +
        "bin/oh-my-pm=sha256:example-bin:14|README.md=sha256:example-readme:14",
    );
    expect(manifest.fileEntries).toEqual([
      { path: "bin/oh-my-pm", checksum: "sha256:example-bin", sizeBytes: 14 },
      { path: "README.md", checksum: "sha256:example-readme", sizeBytes: 14 },
    ]);
    expect(createPackageManifest(baseInput)).toEqual(manifest);
  });

  it("omits optional platform/architecture/createdAt when not supplied", () => {
    const manifest = createPackageManifest(baseInput);
    expect("platform" in manifest).toBe(false);
    expect("architecture" in manifest).toBe(false);
    expect("createdAt" in manifest).toBe(false);
  });

  it("includes optional fields when supplied", () => {
    const manifest = createPackageManifest({
      ...baseInput,
      platform: "linux",
      architecture: "x64",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(manifest.platform).toBe("linux");
    expect(manifest.architecture).toBe("x64");
    expect(manifest.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("packageManifestFiles", () => {
  it("prefers fileEntries over the plain files list", () => {
    const manifest: PackageManifest = {
      name: "p",
      version: "1",
      checksum: "c",
      files: ["a", "b"],
      fileEntries: [{ path: "b", checksum: "cb", sizeBytes: 1 }],
    };
    expect(packageManifestFiles(manifest)).toEqual(["b"]);
  });

  it("returns cloned files when entries are absent or empty", () => {
    const manifest: PackageManifest = {
      name: "p",
      version: "1",
      checksum: "c",
      files: ["a", "b"],
    };
    const listed = packageManifestFiles(manifest);
    expect(listed).toEqual(["a", "b"]);
    listed.push("mutated");
    expect(manifest.files).toEqual(["a", "b"]);
    expect(packageManifestFiles({ ...manifest, fileEntries: [] })).toEqual(["a", "b"]);
  });
});

describe("validatePackageFileEntries", () => {
  const manifest = (entries: PackageManifest["fileEntries"]): PackageManifest => ({
    name: "p",
    version: "1",
    checksum: "c",
    files: ["a", "b"],
    ...(entries === undefined ? {} : { fileEntries: entries }),
  });

  it("returns empty for absent entries", () => {
    expect(validatePackageFileEntries(manifest(undefined))).toEqual([]);
  });

  it("accepts entries matching the files list in order", () => {
    expect(
      validatePackageFileEntries(
        manifest([
          { path: "a", checksum: "ca", sizeBytes: 1 },
          { path: "b", checksum: "cb", sizeBytes: 0 },
        ]),
      ),
    ).toEqual([]);
  });

  it("detects path mismatches, including order changes", () => {
    expect(
      validatePackageFileEntries(
        manifest([
          { path: "b", checksum: "cb", sizeBytes: 1 },
          { path: "a", checksum: "ca", sizeBytes: 1 },
        ]),
      ),
    ).toEqual(["package_file_entries_path_mismatch"]);
  });

  it("detects empty path and checksum", () => {
    expect(
      validatePackageFileEntries(
        manifest([
          { path: " ", checksum: "", sizeBytes: 1 },
          { path: "b", checksum: "cb", sizeBytes: 1 },
        ]),
      ),
    ).toEqual([
      "package_file_entries_path_mismatch",
      "package_file_entry_path_must_not_be_empty",
      "package_file_entry_checksum_must_not_be_empty",
    ]);
  });

  it("detects negative sizes and duplicate paths, each once", () => {
    expect(
      validatePackageFileEntries(
        manifest([
          { path: "a", checksum: "ca", sizeBytes: -1 },
          { path: "a", checksum: "ca", sizeBytes: -2 },
        ]),
      ),
    ).toEqual([
      "package_file_entries_path_mismatch",
      "package_file_entry_size_must_be_non_negative",
      "duplicate_package_file_entry_path",
    ]);
  });
});
