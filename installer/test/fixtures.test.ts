import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { describe, expect, it } from "vitest";
import {
  exampleFilesystemEntries,
  examplePackageManifest,
  exampleRollbackManifest,
  exampleUpdatePlan,
} from "../src/index.js";

describe("installer fixtures", () => {
  it("are deterministic across calls", () => {
    expect(examplePackageManifest()).toEqual(examplePackageManifest());
    expect(exampleRollbackManifest()).toEqual(exampleRollbackManifest());
    expect(exampleUpdatePlan()).toEqual(exampleUpdatePlan());
    expect(exampleFilesystemEntries()).toEqual(exampleFilesystemEntries());
  });

  it("return fresh objects, not shared references", () => {
    const first = examplePackageManifest();
    first.files.push("mutated");
    expect(examplePackageManifest().files).toEqual(["bin/oh-my-pm", "README.md"]);
  });

  it("filesystem entries use the documented fixed values", () => {
    expect(exampleFilesystemEntries()).toEqual([
      {
        path: "/tmp/oh-my-pm/bin/oh-my-pm",
        content: "old binary",
        checksum: "sha256:old",
      },
      {
        path: "/tmp/oh-my-pm/README.md",
        content: "old readme",
        checksum: "sha256:old-readme",
      },
    ]);
  });

  it("use the documented fixed values", () => {
    expect(examplePackageManifest()).toEqual({
      name: "oh-my-pm-local",
      version: "2.0.0-alpha.0",
      checksum: "sha256:example",
      files: ["bin/oh-my-pm", "README.md"],
    });
    expect(exampleRollbackManifest()).toEqual({
      id: "rollback-1",
      paths: ["bin/oh-my-pm"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(exampleUpdatePlan()).toEqual({
      id: "update-1",
      fromVersion: "2.0.0-alpha.0",
      toVersion: "2.0.0-alpha.1",
      steps: [{ kind: "replace", path: "bin/oh-my-pm", checksum: "sha256:next" }],
      rollback: {
        id: "rollback-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        paths: ["bin/oh-my-pm"],
      },
    });
  });

  it("example update plan is allowed by the real WASM Kernel update guard", () => {
    const decision = createNodeWasmKernelApi().checkUpdatePlan(exampleUpdatePlan());
    expect(decision.status).toBe("allowed");
    expect(decision.planId).toBe("update-1");
    expect(decision.reasons).toEqual([]);
  });
});
