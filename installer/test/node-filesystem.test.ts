// Tests for the read-only Node filesystem adapter. Only test code touches
// the real filesystem, always inside a temporary directory with try/finally
// cleanup.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KernelApi } from "@oh-my-pm/kernel";
import { describe, expect, it } from "vitest";
import {
  createInstaller,
  createNodeFilesystemAdapter,
  describeNodeFilesystemAdapter,
  normalizeInstallerPath,
} from "../src/index.js";

function withTempRoot<T>(run: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-node-adapter-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

const fakeKernel: KernelApi = {
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
};

describe("describeNodeFilesystemAdapter", () => {
  it("reports the resolved root, sha256, and read-only mode", () => {
    withTempRoot((root) => {
      expect(describeNodeFilesystemAdapter({ root: `${root}//` })).toEqual({
        root: normalizeInstallerPath(root),
        checksumAlgorithm: "sha256",
        readOnly: true,
      });
    });
  });
});

describe("exists", () => {
  it("distinguishes files, directories, missing, and escaping paths", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "binary", "utf8");
      const adapter = createNodeFilesystemAdapter({ root });

      expect(adapter.exists(`${root}/bin/oh-my-pm`)).toBe(true);
      expect(adapter.exists("bin/oh-my-pm")).toBe(true);
      expect(adapter.exists(`${root}/bin`)).toBe(false);
      expect(adapter.exists(`${root}/missing`)).toBe(false);
      expect(adapter.exists("/etc/hosts")).toBe(false);
      expect(adapter.exists(`${root}/bin/../../escape`)).toBe(false);
      expect(adapter.exists("../escape")).toBe(false);
    });
  });
});

describe("read", () => {
  it("returns content, checksum, and the normalized path", () => {
    withTempRoot((root) => {
      writeFileSync(join(root, "README.md"), "hello adapter", "utf8");
      const adapter = createNodeFilesystemAdapter({ root });

      expect(adapter.read(`${root}/README.md`)).toEqual({
        path: normalizeInstallerPath(`${root}/README.md`),
        content: "hello adapter",
        checksum: sha256("hello adapter"),
      });
    });
  });

  it("returns undefined for missing and outside-root paths", () => {
    withTempRoot((root) => {
      const adapter = createNodeFilesystemAdapter({ root });
      expect(adapter.read(`${root}/missing`)).toBeUndefined();
      expect(adapter.read("/etc/hosts")).toBeUndefined();
      expect(adapter.read(root)).toBeUndefined();
    });
  });
});

describe("list", () => {
  it("recursively lists regular files sorted by path, skipping symlinks", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "nested", "deep"), { recursive: true });
      writeFileSync(join(root, "z.txt"), "z", "utf8");
      writeFileSync(join(root, "nested", "b.txt"), "b", "utf8");
      writeFileSync(join(root, "nested", "deep", "c.txt"), "c", "utf8");
      let symlinkSupported = true;
      try {
        symlinkSync(join(root, "z.txt"), join(root, "link.txt"));
      } catch {
        symlinkSupported = false;
      }

      const adapter = createNodeFilesystemAdapter({ root });
      const snapshot = adapter.list(root);
      expect(snapshot.entries.map((entry) => entry.path)).toEqual([
        normalizeInstallerPath(`${root}/nested/b.txt`),
        normalizeInstallerPath(`${root}/nested/deep/c.txt`),
        normalizeInstallerPath(`${root}/z.txt`),
      ]);
      expect(snapshot.entries.map((entry) => entry.content)).toEqual(["b", "c", "z"]);
      if (symlinkSupported) {
        expect(snapshot.entries.some((entry) => entry.path.endsWith("link.txt"))).toBe(false);
      }
    });
  });

  it("returns empty snapshots for missing, file, and outside-root roots", () => {
    withTempRoot((root) => {
      writeFileSync(join(root, "a.txt"), "a", "utf8");
      const adapter = createNodeFilesystemAdapter({ root });
      expect(adapter.list(`${root}/missing`)).toEqual({ entries: [] });
      expect(adapter.list(`${root}/a.txt`)).toEqual({ entries: [] });
      expect(adapter.list("/")).toEqual({ entries: [] });
      expect(adapter.list(tmpdir())).toEqual({ entries: [] });
    });
  });
});

describe("installer planning with the node adapter", () => {
  it("plans replace for existing files and create for missing files", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");

      const installer = createInstaller({ kernel: fakeKernel });
      const report = installer.planInstall(
        {
          packageManifest: {
            name: "oh-my-pm-local",
            version: "2.0.0-alpha.0",
            checksum: "sha256:package",
            files: ["bin/oh-my-pm", "docs/new.md"],
          },
          root,
          installedAt: "2026-01-01T00:00:00.000Z",
        },
        { filesystem: createNodeFilesystemAdapter({ root }) },
      );

      expect(report).toMatchObject({
        ok: true,
        plan: {
          operations: [
            { kind: "replace", path: normalizeInstallerPath(`${root}/bin/oh-my-pm`) },
            { kind: "create", path: normalizeInstallerPath(`${root}/docs/new.md`) },
          ],
        },
      });
      expect(installer.snapshot()).toEqual({ rollbacks: [], appliedUpdates: [] });
    });
  });
});

describe("read-only guarantee", () => {
  it("adapter source contains no write or mutation APIs", () => {
    const adapterSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "src", "node-filesystem.ts"),
      "utf8",
    );
    for (const forbidden of [
      "writeFile",
      "rmSync",
      "unlink",
      "mkdir",
      "rmdir",
      "rename",
      "appendFile",
    ]) {
      expect(adapterSource, `adapter must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
