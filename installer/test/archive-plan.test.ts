import { describe, expect, it } from "vitest";
import type { ArchivePlanInput } from "../src/index.js";
import {
  archiveExtension,
  createArchiveDryRun,
  createArchiveDryRunFromAssembly,
  createArchiveName,
  createArchivePlan,
  createArchivePlanEntry,
  createMemoryFilesystem,
  createPackageAssemblyDryRun,
  exampleArchivePlanInput,
  exampleFilesystemEntries,
  examplePackageAssemblyInput,
  validateArchiveFormat,
} from "../src/index.js";

const input = (overrides: Partial<ArchivePlanInput> = {}): ArchivePlanInput => ({
  ...exampleArchivePlanInput(),
  ...overrides,
});

describe("archive format and name", () => {
  it("accepts only zip and tar", () => {
    expect(validateArchiveFormat("zip")).toBe(true);
    expect(validateArchiveFormat("tar")).toBe(true);
    expect(validateArchiveFormat("tgz")).toBe(false);
    expect(validateArchiveFormat("rar")).toBe(false);
    expect(validateArchiveFormat("")).toBe(false);
  });

  it("returns deterministic extensions", () => {
    expect(archiveExtension("zip")).toBe("zip");
    expect(archiveExtension("tar")).toBe("tar");
  });

  it("composes the planned archive name", () => {
    expect(
      createArchiveName({ packageName: "oh-my-pm-local", packageVersion: "2.0.0-alpha.0", format: "zip" }),
    ).toBe("oh-my-pm-local-2.0.0-alpha.0.zip");
    expect(
      createArchiveName({ packageName: "p", packageVersion: "1", format: "tar" }),
    ).toBe("p-1.tar");
  });
});

describe("createArchivePlanEntry", () => {
  it("computes sizeBytes as the UTF-8 byte length", () => {
    expect(
      createArchivePlanEntry({ path: "a", content: "héllo", checksum: "sha256:a" }),
    ).toEqual({ path: "a", checksum: "sha256:a", sizeBytes: 6 });
  });
});

describe("createArchivePlan", () => {
  it("preserves input order and derives a deterministic checksum", () => {
    const plan = createArchivePlan(input());
    expect(plan.archiveName).toBe("oh-my-pm-local-2.0.0-alpha.0.zip");
    expect(plan.entries.map((entry) => entry.path)).toEqual(["bin/oh-my-pm", "README.md"]);
    expect(plan.checksum).toBe(
      "archive:zip:oh-my-pm-local:2.0.0-alpha.0:" +
        "bin/oh-my-pm=sha256:old:10|README.md=sha256:old-readme:10",
    );
    expect(createArchivePlan(input())).toEqual(plan);
  });

  it("exposes no output or artifact path fields", () => {
    const plan = createArchivePlan(input());
    expect(Object.keys(plan).sort()).toEqual([
      "archiveName",
      "checksum",
      "entries",
      "format",
      "packageName",
      "packageVersion",
    ]);
  });
});

describe("createArchiveDryRun", () => {
  it("returns ok true for valid input", () => {
    const report = createArchiveDryRun(input());
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
  });

  it("reports missing package name and version in order", () => {
    const report = createArchiveDryRun(input({ packageName: "", packageVersion: " " }));
    expect(report.ok).toBe(false);
    expect(report.warnings?.map((warning) => warning.message)).toEqual([
      "archive_package_name_missing",
      "archive_package_version_missing",
    ]);
    expect(report.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
  });

  it("reports empty files", () => {
    const report = createArchiveDryRun(input({ files: [] }));
    expect(report.warnings?.map((warning) => warning.message)).toEqual([
      "archive_files_must_not_be_empty",
    ]);
  });

  it("reports empty paths, empty checksums, and duplicates once", () => {
    const report = createArchiveDryRun(
      input({
        files: [
          { path: " ", content: "a", checksum: "" },
          { path: " ", content: "b", checksum: "" },
        ],
      }),
    );
    expect(report.warnings?.map((warning) => warning.message)).toEqual([
      "archive_file_path_must_not_be_empty",
      "archive_file_checksum_must_not_be_empty",
      "duplicate_archive_file_path",
    ]);
  });

  it("still returns a deterministic plan when invalid", () => {
    const first = createArchiveDryRun(input({ packageName: "" }));
    const second = createArchiveDryRun(input({ packageName: "" }));
    expect(first.ok).toBe(false);
    expect(first.plan).toEqual(second.plan);
    expect(first.plan.entries).toHaveLength(2);
  });
});

describe("createArchiveDryRunFromAssembly", () => {
  const assembly = () =>
    createPackageAssemblyDryRun(
      examplePackageAssemblyInput(),
      createMemoryFilesystem(exampleFilesystemEntries()),
    );

  it("uses the assembly manifest name and version", () => {
    const report = createArchiveDryRunFromAssembly(assembly(), "zip");
    expect(report.ok).toBe(true);
    expect(report.plan.packageName).toBe("oh-my-pm-local");
    expect(report.plan.packageVersion).toBe("2.0.0-alpha.0");
    expect(report.plan.archiveName).toBe("oh-my-pm-local-2.0.0-alpha.0.zip");
    expect(report.plan.entries).toHaveLength(2);
  });

  it("carries assembly warnings after archive warnings", () => {
    const failed = createPackageAssemblyDryRun(
      { ...examplePackageAssemblyInput(), include: ["bin/oh-my-pm", "missing.txt"] },
      createMemoryFilesystem(exampleFilesystemEntries()),
    );
    const report = createArchiveDryRunFromAssembly(failed, "tar");
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([
      { code: "OMP-I-6001", message: "assembly_include_file_missing" },
    ]);
  });

  it("does not mutate the assembly report", () => {
    const source = assembly();
    const snapshot = JSON.parse(JSON.stringify(source));
    createArchiveDryRunFromAssembly(source, "zip");
    expect(source).toEqual(snapshot);
  });
});

describe("exampleArchivePlanInput", () => {
  it("is deterministic and dry-runs ok", () => {
    expect(exampleArchivePlanInput()).toEqual(exampleArchivePlanInput());
    expect(createArchiveDryRun(exampleArchivePlanInput()).ok).toBe(true);
  });
});
