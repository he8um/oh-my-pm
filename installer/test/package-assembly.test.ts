import { describe, expect, it } from "vitest";
import type { PackageAssemblyInput } from "../src/index.js";
import {
  createMemoryFilesystem,
  createPackageAssemblyDryRun,
  exampleFilesystemEntries,
  examplePackageAssemblyInput,
  planPackageAssembly,
  validatePackageAssemblyInput,
} from "../src/index.js";

const input = (overrides: Partial<PackageAssemblyInput> = {}): PackageAssemblyInput => ({
  ...examplePackageAssemblyInput(),
  ...overrides,
});

const seededFilesystem = () => createMemoryFilesystem(exampleFilesystemEntries());

describe("validatePackageAssemblyInput", () => {
  it("accepts valid input", () => {
    expect(validatePackageAssemblyInput(input())).toEqual([]);
  });

  it("reports missing name, version, and root in order", () => {
    expect(validatePackageAssemblyInput(input({ name: "", version: " ", root: "" }))).toEqual([
      "missing_package_name",
      "missing_package_version",
      "missing_root",
    ]);
  });

  it("reports an empty include list", () => {
    expect(validatePackageAssemblyInput(input({ include: [] }))).toEqual([
      "assembly_include_must_not_be_empty",
    ]);
  });

  it("reports unsafe include paths once", () => {
    expect(validatePackageAssemblyInput(input({ include: ["../a", "/etc/b"] }))).toEqual([
      "assembly_include_path_must_be_safe",
    ]);
  });

  it("reports duplicate include paths after normalization", () => {
    expect(
      validatePackageAssemblyInput(input({ include: ["bin/oh-my-pm", "bin//oh-my-pm"] })),
    ).toEqual(["duplicate_assembly_include_path"]);
  });
});

describe("planPackageAssembly", () => {
  it("reads included files in include order", () => {
    const plan = planPackageAssembly(
      input({ include: ["README.md", "bin/oh-my-pm"] }),
      seededFilesystem(),
    );
    expect(plan.files.map((file) => file.path)).toEqual([
      "/tmp/oh-my-pm/README.md",
      "/tmp/oh-my-pm/bin/oh-my-pm",
    ]);
    expect(plan.files.map((file) => file.content)).toEqual(["old readme", "old binary"]);
  });

  it("skips missing files without throwing", () => {
    const plan = planPackageAssembly(
      input({ include: ["missing.txt", "README.md"] }),
      seededFilesystem(),
    );
    expect(plan.include).toEqual(["missing.txt", "README.md"]);
    expect(plan.files.map((file) => file.path)).toEqual(["/tmp/oh-my-pm/README.md"]);
  });

  it("does not mutate the input", () => {
    const assemblyInput = input();
    const plan = planPackageAssembly(assemblyInput, seededFilesystem());
    plan.include.push("mutated");
    expect(assemblyInput.include).toEqual(["bin/oh-my-pm", "README.md"]);
  });
});

describe("createPackageAssemblyDryRun", () => {
  it("returns a rich manifest with relative paths for valid input", () => {
    const report = createPackageAssemblyDryRun(input(), seededFilesystem());
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
    expect(report.manifest.files).toEqual(["bin/oh-my-pm", "README.md"]);
    expect(report.manifest.fileEntries).toEqual([
      { path: "bin/oh-my-pm", checksum: "sha256:old", sizeBytes: 10 },
      { path: "README.md", checksum: "sha256:old-readme", sizeBytes: 10 },
    ]);
    expect(report.manifest.platform).toBe("linux");
    expect(report.manifest.architecture).toBe("x64");
    expect(report.manifest.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("fails with warnings for invalid input", () => {
    const report = createPackageAssemblyDryRun(input({ name: "", include: [] }), seededFilesystem());
    expect(report.ok).toBe(false);
    expect(report.plan.files).toEqual([]);
    expect(report.manifest.files).toEqual([]);
    expect(report.warnings).toEqual([
      { code: "OMP-I-6001", message: "missing_package_name" },
      { code: "OMP-I-6001", message: "assembly_include_must_not_be_empty" },
    ]);
  });

  it("fails but keeps found files when an include path is missing", () => {
    const report = createPackageAssemblyDryRun(
      input({ include: ["bin/oh-my-pm", "missing.txt"] }),
      seededFilesystem(),
    );
    expect(report.ok).toBe(false);
    expect(report.warnings).toEqual([
      { code: "OMP-I-6001", message: "assembly_include_file_missing" },
    ]);
    expect(report.manifest.files).toEqual(["bin/oh-my-pm"]);
    expect(report.plan.files.map((file) => file.path)).toEqual(["/tmp/oh-my-pm/bin/oh-my-pm"]);
  });

  it("exposes no archive or output fields", () => {
    const report = createPackageAssemblyDryRun(input(), seededFilesystem());
    expect(Object.keys(report).sort()).toEqual(["manifest", "ok", "plan"]);
    expect(Object.keys(report.plan).sort()).toEqual(["files", "include", "root"]);
    for (const key of Object.keys(report.manifest)) {
      expect(key).not.toMatch(/archive|output|target/i);
    }
  });

  it("is deterministic across calls", () => {
    expect(createPackageAssemblyDryRun(input(), seededFilesystem())).toEqual(
      createPackageAssemblyDryRun(input(), seededFilesystem()),
    );
  });
});

describe("examplePackageAssemblyInput", () => {
  it("is deterministic and documented", () => {
    expect(examplePackageAssemblyInput()).toEqual(examplePackageAssemblyInput());
    expect(examplePackageAssemblyInput()).toEqual({
      name: "oh-my-pm-local",
      version: "2.0.0-alpha.0",
      root: "/tmp/oh-my-pm",
      include: ["bin/oh-my-pm", "README.md"],
      platform: "linux",
      architecture: "x64",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
