import type { InstallManifest, PackageManifest, RollbackManifest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  isNonEmptyString,
  validateInstallManifest,
  validatePackageManifest,
  validateRollbackManifest,
} from "../src/index.js";

const validPackage: PackageManifest = {
  name: "oh-my-pm-local",
  version: "2.0.0-alpha.0",
  checksum: "sha256:example",
  files: ["bin/oh-my-pm", "README.md"],
};

const validInstall: InstallManifest = {
  schemaVersion: "1",
  version: "2.0.0-alpha.0",
  installedAt: "2026-01-01T00:00:00.000Z",
  root: "/opt/oh-my-pm",
};

const validRollback: RollbackManifest = {
  id: "rollback-1",
  paths: ["bin/oh-my-pm"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("isNonEmptyString", () => {
  it("accepts content and rejects blank strings", () => {
    expect(isNonEmptyString("x")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
  });
});

describe("validatePackageManifest", () => {
  it("returns no reasons for a valid manifest", () => {
    expect(validatePackageManifest(validPackage)).toEqual([]);
  });

  it("returns every reason once, in documented order", () => {
    const reasons = validatePackageManifest({
      name: " ",
      version: "",
      checksum: "",
      files: ["", ""],
    });
    expect(reasons).toEqual([
      "missing_package_name",
      "missing_package_version",
      "missing_package_checksum",
      "package_file_path_must_not_be_empty",
      "duplicate_package_file_path",
    ]);
  });

  it("reports empty file lists", () => {
    expect(validatePackageManifest({ ...validPackage, files: [] })).toEqual([
      "package_files_must_not_be_empty",
    ]);
  });

  it("dedupes repeated file problems", () => {
    const reasons = validatePackageManifest({
      ...validPackage,
      files: ["a", "a", "b", "b", " ", " "],
    });
    expect(reasons).toEqual([
      "package_file_path_must_not_be_empty",
      "duplicate_package_file_path",
    ]);
  });

  it("accepts matching rich file entries", () => {
    const reasons = validatePackageManifest({
      ...validPackage,
      fileEntries: [
        { path: "bin/oh-my-pm", checksum: "sha256:bin", sizeBytes: 1 },
        { path: "README.md", checksum: "sha256:readme", sizeBytes: 2 },
      ],
    });
    expect(reasons).toEqual([]);
  });

  it("appends file-entry reasons after the existing reasons", () => {
    const reasons = validatePackageManifest({
      ...validPackage,
      name: "",
      fileEntries: [
        { path: "other", checksum: " ", sizeBytes: -1 },
        { path: "other", checksum: "c", sizeBytes: 1 },
      ],
    });
    expect(reasons).toEqual([
      "missing_package_name",
      "package_file_entries_path_mismatch",
      "package_file_entry_checksum_must_not_be_empty",
      "package_file_entry_size_must_be_non_negative",
      "duplicate_package_file_entry_path",
    ]);
  });
});

describe("validateInstallManifest", () => {
  it("returns no reasons for a valid manifest", () => {
    expect(validateInstallManifest(validInstall)).toEqual([]);
  });

  it("returns every reason in documented order", () => {
    const reasons = validateInstallManifest({
      schemaVersion: "",
      version: " ",
      installedAt: "",
      root: "",
    });
    expect(reasons).toEqual([
      "missing_schema_version",
      "missing_version",
      "missing_installed_at",
      "missing_root",
    ]);
  });
});

describe("validateRollbackManifest", () => {
  it("returns no reasons for a valid manifest", () => {
    expect(validateRollbackManifest(validRollback)).toEqual([]);
  });

  it("returns every reason once, in documented order", () => {
    const reasons = validateRollbackManifest({
      id: "",
      paths: [" ", " "],
      createdAt: "",
    });
    expect(reasons).toEqual([
      "missing_rollback_id",
      "rollback_path_must_not_be_empty",
      "missing_rollback_created_at",
    ]);
  });

  it("reports empty path lists", () => {
    expect(validateRollbackManifest({ ...validRollback, paths: [] })).toEqual([
      "rollback_paths_must_not_be_empty",
    ]);
  });
});
