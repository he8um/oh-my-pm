// Demonstrates combining example package data with the real root-confined
// Node adapters. Node filesystem usage lives in this test only; examples
// source stays in-memory.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInstaller,
  createNodeFilesystemAdapter,
  createNodeWriteFilesystemAdapter,
  examplePackageManifest,
} from "@oh-my-pm/installer";
import { describe, expect, it } from "vitest";
import { createExampleKernelApi } from "../src/index.js";

describe("installer example data with the real node adapters", () => {
  it("plans and executes an install inside a temp root", () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-examples-install-"));
    try {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      writeFileSync(join(root, "README.md"), "old readme", "utf8");

      const installer = createInstaller({ kernel: createExampleKernelApi() });
      const filesystem = createNodeFilesystemAdapter({ root });
      const writer = createNodeWriteFilesystemAdapter({ root });
      const packageManifest = examplePackageManifest();
      const input = {
        packageManifest,
        root,
        installedAt: "2026-01-01T00:00:00.000Z",
      };

      const dryRun = installer.planInstall(input, { filesystem });
      if ("code" in dryRun) {
        throw new Error(`unexpected planning failure: ${dryRun.message}`);
      }
      expect(dryRun.plan.operations.map((operation) => operation.kind)).toEqual([
        "replace",
        "replace",
      ]);

      const files = dryRun.plan.operations.map((operation) => ({
        path: operation.path,
        content: operation.path.endsWith("README.md") ? "new readme" : "new binary",
        checksum: packageManifest.checksum,
      }));
      const execution = installer.executeInstall(
        { input, plan: dryRun.plan, files },
        { filesystem, writer },
      );
      if ("code" in execution) {
        throw new Error(`unexpected execution failure: ${execution.message}`);
      }

      expect(execution.ok).toBe(true);
      expect(readFileSync(join(root, "bin", "oh-my-pm"), "utf8")).toBe("new binary");
      expect(readFileSync(join(root, "README.md"), "utf8")).toBe("new readme");
      expect(installer.snapshot().manifest?.version).toBe("2.0.0-alpha.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
