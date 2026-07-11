import { describe, expect, it } from "vitest";
import * as examples from "../src/index.js";
import {
  runInstallerArchivePlanExample,
  runInstallerControlledExecutionExample,
  runInstallerDryRunExample,
  runInstallerPackageAssemblyDryRunExample,
  runInstallerRollbackExample,
  runInstallerUpdateExample,
} from "../src/index.js";

describe("runInstallerDryRunExample", () => {
  it("returns a passing dry-run with planned operations only", () => {
    const result = runInstallerDryRunExample();
    expect(result.dryRun.ok).toBe(true);
    expect(result.dryRun.plan.operations.length).toBeGreaterThan(0);
    expect(
      result.dryRun.plan.operations.some(
        (operation) => operation.kind === "replace" || operation.kind === "create",
      ),
    ).toBe(true);
    expect(Object.keys(result)).toEqual(["dryRun"]);
    expect(result.dryRun).not.toHaveProperty("manifest");
  });
});

describe("runInstallerControlledExecutionExample", () => {
  it("plans and executes through the in-memory writer", () => {
    const result = runInstallerControlledExecutionExample();
    expect(result.dryRun.ok).toBe(true);
    expect(result.execution.ok).toBe(true);
    expect(result.execution.operations.length).toBeGreaterThan(0);
    expect(result.snapshotVersion).toBe("2.0.0-alpha.0");
  });
});

describe("runInstallerRollbackExample", () => {
  it("plans a capture and executes rollback backups", () => {
    const result = runInstallerRollbackExample();
    expect(result.capturePlan.rollback.id).toBe("rollback-1");
    expect(result.capturePlan.operations.length).toBeGreaterThan(0);
    expect(result.execution.ok).toBe(true);
    expect(result.execution.operations.length).toBeGreaterThan(0);
    expect(result.execution.operations.every((operation) => operation.kind === "backup")).toBe(
      true,
    );
  });
});

describe("runInstallerUpdateExample", () => {
  it("installs and applies the example update plan", () => {
    const result = runInstallerUpdateExample();
    expect(result.ok).toBe(true);
    expect(result.planId).toBe("update-1");
    expect(result.appliedSteps).toContain("replace:bin/oh-my-pm");
    expect(result.snapshotVersion).toBe("2.0.0-alpha.1");
  });
});

describe("runInstallerPackageAssemblyDryRunExample", () => {
  it("assembles the example package without archive or output fields", () => {
    const result = runInstallerPackageAssemblyDryRunExample();
    expect(result.assembly.ok).toBe(true);
    expect(result.assembly.manifest.fileEntries?.length).toBeGreaterThan(0);
    expect(result.assembly.manifest.files).toEqual(["bin/oh-my-pm", "README.md"]);
    expect(Object.keys(result.assembly).sort()).toEqual(["manifest", "ok", "plan"]);
    for (const key of Object.keys(result.assembly.plan)) {
      expect(key).not.toMatch(/archive|output|target/i);
    }
  });
});

describe("runInstallerArchivePlanExample", () => {
  it("plans a zip archive without creating any file", () => {
    const result = runInstallerArchivePlanExample();
    expect(result.archive.ok).toBe(true);
    expect(result.archive.plan.archiveName.endsWith(".zip")).toBe(true);
    expect(result.archive.plan.entries.length).toBeGreaterThan(0);
    expect(Object.keys(result.archive).sort()).toEqual(["ok", "plan"]);
    for (const key of Object.keys(result.archive.plan)) {
      expect(key).not.toMatch(/output|target|directory|writtenTo/i);
    }
  });
});

describe("examples index", () => {
  it("exports the installer example functions", () => {
    expect(typeof examples.runInstallerDryRunExample).toBe("function");
    expect(typeof examples.runInstallerControlledExecutionExample).toBe("function");
    expect(typeof examples.runInstallerRollbackExample).toBe("function");
    expect(typeof examples.runInstallerUpdateExample).toBe("function");
    expect(typeof examples.runInstallerPackageAssemblyDryRunExample).toBe("function");
    expect(typeof examples.runInstallerArchivePlanExample).toBe("function");
  });
});
