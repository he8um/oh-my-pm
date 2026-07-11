import { describe, expect, it } from "vitest";
import type { InstallExecutionInput, InstallPlan } from "../src/index.js";
import {
  examplePackageManifest,
  fileForOperation,
  validateExecutionFiles,
  validateExecutionPlan,
} from "../src/index.js";

const root = "/tmp/oh-my-pm";

function plan(overrides: Partial<InstallPlan> = {}): InstallPlan {
  return {
    root,
    packageManifest: examplePackageManifest(),
    operations: [
      { kind: "create", path: `${root}/bin/oh-my-pm`, checksum: "sha256:example" },
      { kind: "replace", path: `${root}/README.md`, checksum: "sha256:example" },
    ],
    ...overrides,
  };
}

function executionInput(overrides: Partial<InstallExecutionInput> = {}): InstallExecutionInput {
  return {
    input: {
      packageManifest: examplePackageManifest(),
      root,
      installedAt: "2026-01-01T00:00:00.000Z",
    },
    plan: plan(),
    files: [
      { path: `${root}/bin/oh-my-pm`, content: "binary", checksum: "sha256:example" },
      { path: `${root}/README.md`, content: "readme", checksum: "sha256:example" },
    ],
    ...overrides,
  };
}

describe("validateExecutionPlan", () => {
  it("accepts a valid plan", () => {
    expect(validateExecutionPlan(plan())).toEqual([]);
  });

  it("reports a missing root", () => {
    expect(validateExecutionPlan(plan({ root: " " }))).toEqual(["install_plan_root_missing"]);
  });

  it("reports an invalid package", () => {
    const invalid = plan({
      packageManifest: { name: "", version: "", checksum: "", files: [] },
    });
    expect(validateExecutionPlan(invalid)).toEqual(["install_plan_package_invalid"]);
  });

  it("reports empty operations", () => {
    expect(validateExecutionPlan(plan({ operations: [] }))).toEqual([
      "install_plan_operations_empty",
    ]);
  });

  it("reports operations outside the plan root, once", () => {
    const outside = plan({
      operations: [
        { kind: "create", path: "/elsewhere/a" },
        { kind: "create", path: "/elsewhere/b" },
      ],
    });
    expect(validateExecutionPlan(outside)).toEqual(["install_plan_operation_path_invalid"]);
  });
});

describe("validateExecutionFiles", () => {
  it("accepts matching files", () => {
    expect(validateExecutionFiles(executionInput())).toEqual([]);
  });

  it("reports a missing file for create", () => {
    const input = executionInput({ files: [] });
    input.plan.operations = [{ kind: "create", path: `${root}/bin/oh-my-pm` }];
    expect(validateExecutionFiles(input)).toEqual(["missing_file_for_create"]);
  });

  it("reports a missing file for replace", () => {
    const input = executionInput({ files: [] });
    input.plan.operations = [{ kind: "replace", path: `${root}/README.md` }];
    expect(validateExecutionFiles(input)).toEqual(["missing_file_for_replace"]);
  });

  it("does not require files for remove and backup", () => {
    const input = executionInput({ files: [] });
    input.plan.operations = [
      { kind: "remove", path: `${root}/old` },
      { kind: "backup", path: `${root}/old` },
    ];
    expect(validateExecutionFiles(input)).toEqual([]);
  });

  it("reports checksum mismatches", () => {
    const input = executionInput({
      files: [{ path: `${root}/bin/oh-my-pm`, content: "binary", checksum: "sha256:other" }],
    });
    input.plan.operations = [
      { kind: "create", path: `${root}/bin/oh-my-pm`, checksum: "sha256:example" },
    ];
    expect(validateExecutionFiles(input)).toEqual(["checksum_mismatch"]);
  });
});

describe("fileForOperation", () => {
  it("matches by normalized path and returns the first match", () => {
    const files = [
      { path: `${root}//bin//oh-my-pm/`, content: "first", checksum: "sha256:1" },
      { path: `${root}/bin/oh-my-pm`, content: "second", checksum: "sha256:2" },
    ];
    const match = fileForOperation(
      { kind: "create", path: `${root}/bin/oh-my-pm` },
      files,
    );
    expect(match?.content).toBe("first");
  });

  it("returns undefined when no file matches", () => {
    expect(fileForOperation({ kind: "create", path: `${root}/missing` }, [])).toBeUndefined();
  });
});
