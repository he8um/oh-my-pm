import type { InstallManifest } from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";
import { describe, expect, it } from "vitest";
import {
  createInstaller,
  examplePackageManifest,
  exampleRollbackManifest,
  exampleUpdatePlan,
  INSTALL_SCHEMA_VERSION,
} from "../src/index.js";
import type { InstallerFailure } from "../src/index.js";

function fakeKernel(overrides: Partial<KernelApi> = {}): KernelApi {
  return {
    version: () => "2.0.0-alpha.0",
    validateJson: (target) => ({ target, passed: true, errors: [], warnings: [] }),
    checkUpdatePlan: (plan) => ({
      status: "allowed",
      planId: plan.id,
      planHash: `fake:${plan.id}`,
      reasons: [],
    }),
    decideTransition: (input) => ({
      from: input.from,
      to: input.to,
      allowed: true,
      reason: "allowed",
    }),
    ...overrides,
  };
}

const installInput = () => ({
  packageManifest: examplePackageManifest(),
  root: "/opt/oh-my-pm",
  installedAt: "2026-01-01T00:00:00.000Z",
});

const installedManifest: InstallManifest = {
  schemaVersion: INSTALL_SCHEMA_VERSION,
  version: "2.0.0-alpha.0",
  installedAt: "2026-01-01T00:00:00.000Z",
  root: "/opt/oh-my-pm",
};

describe("install", () => {
  it("stores the manifest and returns a successful report", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const report = installer.install(installInput());
    expect(report).toEqual({ ok: true, manifest: installedManifest });
    expect(installer.snapshot().manifest).toEqual(installedManifest);
  });

  it("rejects an invalid package manifest with OMP-I-6001", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const result = installer.install({
      ...installInput(),
      packageManifest: { name: "", version: "", checksum: "", files: [] },
    }) as InstallerFailure;
    expect(result.ok).toBe(false);
    expect(result.code).toBe("OMP-I-6001");
    expect(result.message).toBe(
      "invalid package manifest: missing_package_name, missing_package_version, missing_package_checksum, package_files_must_not_be_empty",
    );
    expect(result.warnings).toHaveLength(1);
    expect(installer.snapshot().manifest).toBeUndefined();
  });

  it("rejects missing root and installedAt with OMP-I-6002", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const result = installer.install({
      ...installInput(),
      root: " ",
      installedAt: "",
    }) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6002");
    expect(result.message).toBe("invalid install input: missing_root, missing_installed_at");
  });

  it("fails with OMP-I-6005 when the Kernel rejects the install manifest", () => {
    const kernel = fakeKernel({
      validateJson: (target) => ({
        target,
        passed: false,
        errors: [{ code: "OMP-K-1002", message: "rejected", path: "", blocking: true }],
        warnings: [],
      }),
    });
    const installer = createInstaller({ kernel });
    const result = installer.install(installInput()) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6005");
    expect(result.message).toBe("install manifest failed kernel validation");
    expect(installer.snapshot().manifest).toBeUndefined();
  });
});

describe("applyUpdate", () => {
  it("stores the report and updates the manifest version", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    installer.install(installInput());
    const report = installer.applyUpdate({
      currentManifest: installedManifest,
      plan: exampleUpdatePlan(),
    });
    expect(report).toEqual({
      ok: true,
      planId: "update-1",
      appliedSteps: ["replace:bin/oh-my-pm"],
    });
    const snapshot = installer.snapshot();
    expect(snapshot.appliedUpdates).toEqual([report]);
    expect(snapshot.manifest).toEqual({
      ...installedManifest,
      version: "2.0.0-alpha.1",
    });
  });

  it("falls back to the supplied current manifest when state has none", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    installer.applyUpdate({
      currentManifest: installedManifest,
      plan: exampleUpdatePlan(),
    });
    const snapshot = installer.snapshot();
    expect(snapshot.manifest).toEqual({
      schemaVersion: INSTALL_SCHEMA_VERSION,
      version: "2.0.0-alpha.1",
      installedAt: installedManifest.installedAt,
      root: installedManifest.root,
    });
  });

  it("fails with OMP-I-6003 when the Kernel blocks the plan", () => {
    const kernel = fakeKernel({
      checkUpdatePlan: (plan) => ({
        status: "blocked",
        planId: plan.id,
        planHash: `fake:${plan.id}`,
        reasons: ["same_version", "missing_steps"],
      }),
    });
    const installer = createInstaller({ kernel });
    const result = installer.applyUpdate({
      currentManifest: installedManifest,
      plan: exampleUpdatePlan(),
    }) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6003");
    expect(result.message).toBe("update blocked: same_version, missing_steps");
    expect(installer.snapshot().appliedUpdates).toEqual([]);
  });
});

describe("rollback", () => {
  it("stores a rollback manifest once and returns the report", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const first = installer.rollback({ rollback: exampleRollbackManifest() });
    const second = installer.rollback({ rollback: exampleRollbackManifest() });
    expect(first).toEqual({
      ok: true,
      rollbackId: "rollback-1",
      restoredPaths: ["bin/oh-my-pm"],
    });
    expect(second).toEqual(first);
    expect(installer.snapshot().rollbacks).toEqual([exampleRollbackManifest()]);
  });

  it("rejects an invalid rollback manifest with OMP-I-6004", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const result = installer.rollback({
      rollback: { id: "", paths: [], createdAt: "" },
    }) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6004");
    expect(result.message).toBe(
      "invalid rollback manifest: missing_rollback_id, rollback_paths_must_not_be_empty, missing_rollback_created_at",
    );
    expect(installer.snapshot().rollbacks).toEqual([]);
  });
});

describe("snapshot", () => {
  it("returns clones detached from internal state and inputs", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const input = installInput();
    installer.install(input);
    installer.rollback({ rollback: exampleRollbackManifest() });

    input.packageManifest.version = "mutated";
    const snapshot = installer.snapshot();
    expect(snapshot.manifest?.version).toBe("2.0.0-alpha.0");

    snapshot.manifest!.version = "mutated";
    snapshot.rollbacks.push(exampleRollbackManifest());
    snapshot.appliedUpdates.push({ ok: true, planId: "x", appliedSteps: [] });

    const fresh = installer.snapshot();
    expect(fresh.manifest?.version).toBe("2.0.0-alpha.0");
    expect(fresh.rollbacks).toHaveLength(1);
    expect(fresh.appliedUpdates).toHaveLength(0);
  });

  it("clones initial state instead of referencing it", () => {
    const initialRollbacks = [exampleRollbackManifest()];
    const installer = createInstaller({ kernel: fakeKernel() }, { rollbacks: initialRollbacks });
    initialRollbacks[0].id = "mutated";
    expect(installer.snapshot().rollbacks[0].id).toBe("rollback-1");
  });
});
