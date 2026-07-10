import { describe, expect, it } from "vitest";
import {
  createInstallManifest,
  createInstallReport,
  createRollbackManifest,
  createRollbackReport,
  createUpdateApplyReport,
  examplePackageManifest,
  exampleUpdatePlan,
  INSTALL_SCHEMA_VERSION,
} from "../src/index.js";

describe("createInstallManifest", () => {
  it("maps schema version, package version, root, and installedAt", () => {
    const manifest = createInstallManifest({
      packageManifest: examplePackageManifest(),
      root: "/opt/oh-my-pm",
      installedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(manifest).toEqual({
      schemaVersion: INSTALL_SCHEMA_VERSION,
      version: "2.0.0-alpha.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      root: "/opt/oh-my-pm",
    });
  });
});

describe("createInstallReport", () => {
  it("wraps the manifest in a successful report", () => {
    const manifest = createInstallManifest({
      packageManifest: examplePackageManifest(),
      root: "/opt/oh-my-pm",
      installedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(createInstallReport(manifest)).toEqual({ ok: true, manifest });
  });
});

describe("createRollbackManifest", () => {
  it("clones the supplied paths", () => {
    const paths = ["bin/oh-my-pm"];
    const rollback = createRollbackManifest({
      id: "rollback-1",
      paths,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    paths.push("mutated");
    expect(rollback.paths).toEqual(["bin/oh-my-pm"]);
  });
});

describe("createRollbackReport", () => {
  it("reports the rollback id and cloned restored paths", () => {
    const rollback = createRollbackManifest({
      id: "rollback-1",
      paths: ["bin/oh-my-pm"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const report = createRollbackReport(rollback);
    expect(report).toEqual({
      ok: true,
      rollbackId: "rollback-1",
      restoredPaths: ["bin/oh-my-pm"],
    });
    rollback.paths.push("mutated");
    expect(report.restoredPaths).toEqual(["bin/oh-my-pm"]);
  });
});

describe("createUpdateApplyReport", () => {
  it("describes applied steps as kind:path in plan order", () => {
    const report = createUpdateApplyReport(exampleUpdatePlan());
    expect(report).toEqual({
      ok: true,
      planId: "update-1",
      appliedSteps: ["replace:bin/oh-my-pm"],
    });
  });

  it("preserves multi-step order", () => {
    const plan = exampleUpdatePlan();
    plan.steps = [
      { kind: "verify", path: "bin/oh-my-pm" },
      { kind: "replace", path: "bin/oh-my-pm", checksum: "sha256:next" },
      { kind: "delete", path: "bin/old" },
    ];
    expect(createUpdateApplyReport(plan).appliedSteps).toEqual([
      "verify:bin/oh-my-pm",
      "replace:bin/oh-my-pm",
      "delete:bin/old",
    ]);
  });
});
