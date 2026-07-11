import type { InstallManifest } from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";
import { describe, expect, it } from "vitest";
import {
  createInstaller,
  createMemoryFilesystem,
  createMemoryWriteFilesystem,
  exampleFilesystemEntries,
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

describe("planInstall", () => {
  const plannerDeps = () => ({
    filesystem: createMemoryFilesystem(exampleFilesystemEntries()),
  });

  it("returns a dry-run plan without mutating state", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const input = { ...installInput(), root: "/tmp/oh-my-pm" };
    const report = installer.planInstall(input, plannerDeps());
    expect(report).toEqual({
      ok: true,
      plan: {
        root: "/tmp/oh-my-pm",
        packageManifest: examplePackageManifest(),
        operations: [
          { kind: "replace", path: "/tmp/oh-my-pm/bin/oh-my-pm", checksum: "sha256:example" },
          { kind: "replace", path: "/tmp/oh-my-pm/README.md", checksum: "sha256:example" },
        ],
      },
    });
    expect(installer.snapshot()).toEqual({ rollbacks: [], appliedUpdates: [] });
  });

  it("rejects an invalid package manifest with OMP-I-6001", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const result = installer.planInstall(
      { ...installInput(), packageManifest: { name: "", version: "", checksum: "", files: [] } },
      plannerDeps(),
    ) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6001");
  });

  it("rejects unsafe package file paths with OMP-I-6001", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const input = installInput();
    input.packageManifest.files = ["../outside"];
    const result = installer.planInstall(input, plannerDeps()) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6001");
    expect(result.message).toBe("invalid package manifest: unsafe_package_file_path");
  });

  it("rejects missing root/installedAt with OMP-I-6002", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const result = installer.planInstall(
      { ...installInput(), root: "", installedAt: " " },
      plannerDeps(),
    ) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6002");
    expect(result.message).toBe("invalid install input: missing_root, missing_installed_at");
  });
});

describe("planRollbackCapture", () => {
  const plannerDeps = () => ({
    filesystem: createMemoryFilesystem(exampleFilesystemEntries()),
  });

  const captureInput = () => ({
    id: "rollback-1",
    root: "/tmp/oh-my-pm",
    paths: ["bin/oh-my-pm", "docs/new.md"],
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  it("returns a capture plan without mutating state", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const plan = installer.planRollbackCapture(captureInput(), plannerDeps());
    expect(plan).toEqual({
      rollback: {
        id: "rollback-1",
        paths: ["bin/oh-my-pm", "docs/new.md"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      operations: [
        { kind: "backup", path: "/tmp/oh-my-pm/bin/oh-my-pm" },
        { kind: "remove", path: "/tmp/oh-my-pm/docs/new.md" },
      ],
    });
    expect(installer.snapshot()).toEqual({ rollbacks: [], appliedUpdates: [] });
  });

  it("rejects unsafe rollback paths with OMP-I-6004", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const result = installer.planRollbackCapture(
      { ...captureInput(), paths: ["../outside"] },
      plannerDeps(),
    ) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6004");
    expect(result.message).toBe("invalid rollback capture input: unsafe_rollback_path");
  });

  it("rejects missing capture fields with OMP-I-6004", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const result = installer.planRollbackCapture(
      { id: "", root: " ", paths: [], createdAt: "" },
      plannerDeps(),
    ) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6004");
    expect(result.message).toBe(
      "invalid rollback capture input: missing_rollback_id, missing_root, missing_rollback_created_at, rollback_paths_must_not_be_empty",
    );
  });
});

describe("executeInstall", () => {
  const executionInput = () => ({
    input: installInput(),
    plan: {
      root: "/opt/oh-my-pm",
      packageManifest: examplePackageManifest(),
      operations: [
        { kind: "create" as const, path: "/opt/oh-my-pm/bin/oh-my-pm" },
        { kind: "create" as const, path: "/opt/oh-my-pm/README.md" },
      ],
    },
    files: [
      { path: "/opt/oh-my-pm/bin/oh-my-pm", content: "binary", checksum: "sha256:bin" },
      { path: "/opt/oh-my-pm/README.md", content: "readme", checksum: "sha256:readme" },
    ],
  });

  it("updates manifest state only on successful execution", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const writer = createMemoryWriteFilesystem();
    const report = installer.executeInstall(executionInput(), {
      filesystem: createMemoryFilesystem(),
      writer,
    });
    expect(report).toMatchObject({ ok: true, root: "/opt/oh-my-pm" });
    expect(installer.snapshot().manifest).toEqual(installedManifest);
    expect(writer.snapshot().entries).toHaveLength(2);
  });

  it("does not update state when an operation fails", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const input = executionInput();
    input.plan.operations = [
      { kind: "remove" as const, path: "/opt/oh-my-pm/missing.txt" },
      ...input.plan.operations,
    ];
    const report = installer.executeInstall(input, {
      filesystem: createMemoryFilesystem(),
      writer: createMemoryWriteFilesystem(),
    });
    expect(report).toMatchObject({ ok: false });
    expect(installer.snapshot().manifest).toBeUndefined();
  });

  it("returns the kernel failure when the manifest is rejected after execution", () => {
    const kernel = fakeKernel({
      validateJson: (target) => ({
        target,
        passed: false,
        errors: [{ code: "OMP-K-1002", message: "rejected", path: "", blocking: true }],
        warnings: [],
      }),
    });
    const installer = createInstaller({ kernel });
    const result = installer.executeInstall(executionInput(), {
      filesystem: createMemoryFilesystem(),
      writer: createMemoryWriteFilesystem(),
    }) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6005");
    expect(installer.snapshot().manifest).toBeUndefined();
  });
});

describe("executeRollback", () => {
  it("stores the rollback only on successful execution", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const writer = createMemoryWriteFilesystem([
      { path: "bin/oh-my-pm", content: "binary", checksum: "sha256:bin" },
    ]);
    const report = installer.executeRollback(
      { rollback: exampleRollbackManifest() },
      { filesystem: createMemoryFilesystem(), writer },
    );
    expect(report).toMatchObject({ ok: true, rollbackId: "rollback-1" });
    expect(installer.snapshot().rollbacks).toEqual([exampleRollbackManifest()]);
    expect(writer.backups().entries.map((entry) => entry.path)).toEqual([
      "rollback-1:bin/oh-my-pm",
    ]);
  });

  it("does not store the rollback when a backup fails", () => {
    const installer = createInstaller({ kernel: fakeKernel() });
    const report = installer.executeRollback(
      { rollback: exampleRollbackManifest() },
      { filesystem: createMemoryFilesystem(), writer: createMemoryWriteFilesystem() },
    );
    expect(report).toMatchObject({ ok: false });
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
