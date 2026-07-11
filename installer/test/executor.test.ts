import { describe, expect, it } from "vitest";
import type { InstallExecutionInput, InstallerFailure } from "../src/index.js";
import {
  createMemoryFilesystem,
  createMemoryWriteFilesystem,
  examplePackageManifest,
  executeInstallPlan,
  executeRollbackPlan,
} from "../src/index.js";

const root = "/tmp/oh-my-pm";

function executionInput(overrides: Partial<InstallExecutionInput> = {}): InstallExecutionInput {
  return {
    input: {
      packageManifest: examplePackageManifest(),
      root,
      installedAt: "2026-01-01T00:00:00.000Z",
    },
    plan: {
      root,
      packageManifest: examplePackageManifest(),
      operations: [
        { kind: "create", path: `${root}/bin/oh-my-pm` },
        { kind: "replace", path: `${root}/README.md` },
        { kind: "remove", path: `${root}/old.txt` },
      ],
    },
    files: [
      { path: `${root}/bin/oh-my-pm`, content: "binary", checksum: "sha256:bin" },
      { path: `${root}/README.md`, content: "readme", checksum: "sha256:readme" },
    ],
    ...overrides,
  };
}

function deps(writer = createMemoryWriteFilesystem()) {
  return { filesystem: createMemoryFilesystem(), writer };
}

describe("executeInstallPlan", () => {
  it("runs create, replace, and remove operations in plan order", () => {
    const writer = createMemoryWriteFilesystem([
      { path: `${root}/README.md`, content: "old readme", checksum: "sha256:old" },
      { path: `${root}/old.txt`, content: "old", checksum: "sha256:old" },
    ]);
    const report = executeInstallPlan(executionInput(), deps(writer));
    expect(report).toEqual({
      ok: true,
      root,
      operations: [
        { kind: "create", path: `${root}/bin/oh-my-pm`, ok: true, checksum: "sha256:bin" },
        { kind: "replace", path: `${root}/README.md`, ok: true, checksum: "sha256:readme" },
        { kind: "remove", path: `${root}/old.txt`, ok: true },
      ],
    });
    expect(writer.snapshot().entries.map((entry) => entry.path)).toEqual([
      `${root}/README.md`,
      `${root}/bin/oh-my-pm`,
    ]);
  });

  it("stops on the first failed operation", () => {
    const input = executionInput();
    input.plan.operations = [
      { kind: "remove", path: `${root}/missing.txt` },
      { kind: "create", path: `${root}/bin/oh-my-pm` },
    ];
    const writer = createMemoryWriteFilesystem();
    const report = executeInstallPlan(input, deps(writer));
    expect(report).toEqual({
      ok: false,
      root,
      operations: [
        { kind: "remove", path: `${root}/missing.txt`, ok: false, message: "file_missing" },
      ],
    });
    expect(writer.snapshot().entries).toEqual([]);
  });

  it("fails with OMP-I-6001 for invalid execution input", () => {
    const input = executionInput({ files: [] });
    const result = executeInstallPlan(input, deps()) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6001");
    expect(result.message).toBe(
      "invalid install execution input: missing_file_for_create, missing_file_for_replace",
    );
  });
});

describe("executeRollbackPlan", () => {
  it("fails with OMP-I-6004 for an invalid rollback manifest", () => {
    const result = executeRollbackPlan(
      { rollback: { id: "", paths: [], createdAt: "" } },
      deps(),
    ) as InstallerFailure;
    expect(result.code).toBe("OMP-I-6004");
    expect(result.message).toBe(
      "invalid rollback execution input: missing_rollback_id, rollback_paths_must_not_be_empty, missing_rollback_created_at",
    );
  });

  it("backs up rollback paths in order", () => {
    const writer = createMemoryWriteFilesystem([
      { path: `${root}/b.txt`, content: "b", checksum: "sha256:b" },
      { path: `${root}/a.txt`, content: "a", checksum: "sha256:a" },
    ]);
    const report = executeRollbackPlan(
      {
        rollback: {
          id: "rb-1",
          paths: [`${root}/b.txt`, `${root}/a.txt`],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      deps(writer),
    );
    expect(report).toEqual({
      ok: true,
      rollbackId: "rb-1",
      operations: [
        { kind: "backup", path: `${root}/b.txt`, ok: true, checksum: "sha256:b" },
        { kind: "backup", path: `${root}/a.txt`, ok: true, checksum: "sha256:a" },
      ],
    });
    expect(writer.backups().entries.map((entry) => entry.path)).toEqual([
      `rb-1:${root}/a.txt`,
      `rb-1:${root}/b.txt`,
    ]);
  });

  it("stops on the first failed backup", () => {
    const writer = createMemoryWriteFilesystem();
    const report = executeRollbackPlan(
      {
        rollback: {
          id: "rb-1",
          paths: [`${root}/missing.txt`, `${root}/never-reached.txt`],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      deps(writer),
    );
    expect(report).toMatchObject({ ok: false, rollbackId: "rb-1" });
    expect((report as { operations: unknown[] }).operations).toHaveLength(1);
  });
});
