import { describe, expect, it } from "vitest";
import {
  createMemoryFilesystem,
  examplePackageManifest,
  exampleFilesystemEntries,
  planInstallOperations,
  planRollbackCapture,
} from "../src/index.js";

const root = "/tmp/oh-my-pm";

const installInput = () => ({
  packageManifest: examplePackageManifest(),
  root,
  installedAt: "2026-01-01T00:00:00.000Z",
});

describe("planInstallOperations", () => {
  it("plans create operations when files are missing", () => {
    const plan = planInstallOperations(installInput(), createMemoryFilesystem());
    expect(plan.root).toBe(root);
    expect(plan.operations).toEqual([
      { kind: "create", path: "/tmp/oh-my-pm/bin/oh-my-pm", checksum: "sha256:example" },
      { kind: "create", path: "/tmp/oh-my-pm/README.md", checksum: "sha256:example" },
    ]);
  });

  it("plans replace operations for existing files", () => {
    const plan = planInstallOperations(
      installInput(),
      createMemoryFilesystem(exampleFilesystemEntries()),
    );
    expect(plan.operations.map((op) => op.kind)).toEqual(["replace", "replace"]);
  });

  it("preserves package file order and mixes kinds", () => {
    const input = installInput();
    input.packageManifest.files = ["README.md", "bin/oh-my-pm", "docs/new.md"];
    const plan = planInstallOperations(
      input,
      createMemoryFilesystem(exampleFilesystemEntries()),
    );
    expect(plan.operations).toEqual([
      { kind: "replace", path: "/tmp/oh-my-pm/README.md", checksum: "sha256:example" },
      { kind: "replace", path: "/tmp/oh-my-pm/bin/oh-my-pm", checksum: "sha256:example" },
      { kind: "create", path: "/tmp/oh-my-pm/docs/new.md", checksum: "sha256:example" },
    ]);
  });

  it("clones the package manifest into the plan", () => {
    const input = installInput();
    const plan = planInstallOperations(input, createMemoryFilesystem());
    input.packageManifest.files.push("mutated");
    expect(plan.packageManifest.files).toEqual(["bin/oh-my-pm", "README.md"]);
  });
});

describe("planRollbackCapture", () => {
  const captureInput = (paths: string[]) => ({
    id: "rollback-1",
    root,
    paths,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  it("plans backup for existing paths and remove for missing paths", () => {
    const plan = planRollbackCapture(
      captureInput(["bin/oh-my-pm", "docs/new.md"]),
      createMemoryFilesystem(exampleFilesystemEntries()),
    );
    expect(plan.operations).toEqual([
      { kind: "backup", path: "/tmp/oh-my-pm/bin/oh-my-pm" },
      { kind: "remove", path: "/tmp/oh-my-pm/docs/new.md" },
    ]);
  });

  it("preserves input path order and clones paths into the manifest", () => {
    const paths = ["z/last", "a/first"];
    const plan = planRollbackCapture(
      captureInput(paths),
      createMemoryFilesystem(),
    );
    expect(plan.operations.map((op) => op.path)).toEqual([
      "/tmp/oh-my-pm/z/last",
      "/tmp/oh-my-pm/a/first",
    ]);
    paths.push("mutated");
    expect(plan.rollback).toEqual({
      id: "rollback-1",
      paths: ["z/last", "a/first"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
