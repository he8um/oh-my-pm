// Tests for the root-confined Node write adapter. Only test code prepares
// and removes temporary directories, always with try/finally cleanup.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeWriteFilesystemAdapter, normalizeInstallerPath } from "../src/index.js";

function withTempRoot<T>(run: (root: string) => T): T {
  const parent = mkdtempSync(join(tmpdir(), "oh-my-pm-write-adapter-"));
  const root = join(parent, "root");
  mkdirSync(root);
  try {
    return run(root);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

describe("writeFile", () => {
  it("creates parent directories and the file", () => {
    withTempRoot((root) => {
      const adapter = createNodeWriteFilesystemAdapter({ root });
      const result = adapter.writeFile({
        path: "nested/deep/file.txt",
        content: "fresh",
        checksum: "sha256:fresh",
      });
      expect(result).toEqual({
        kind: "create",
        path: normalizeInstallerPath(join(root, "nested", "deep", "file.txt")),
        ok: true,
        checksum: "sha256:fresh",
      });
      expect(readFileSync(join(root, "nested", "deep", "file.txt"), "utf8")).toBe("fresh");
    });
  });

  it("replaces an existing regular file", () => {
    withTempRoot((root) => {
      writeFileSync(join(root, "a.txt"), "old", "utf8");
      const adapter = createNodeWriteFilesystemAdapter({ root });
      const result = adapter.writeFile({ path: "a.txt", content: "new", checksum: "sha256:new" });
      expect(result.kind).toBe("replace");
      expect(result.ok).toBe(true);
      expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("new");
    });
  });

  it("fails for a directory target", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "dir"));
      const adapter = createNodeWriteFilesystemAdapter({ root });
      const result = adapter.writeFile({ path: "dir", content: "x", checksum: "sha256:x" });
      expect(result.ok).toBe(false);
      expect(result.message).toBe("not_a_file");
    });
  });

  it("never writes outside the configured root", () => {
    withTempRoot((root) => {
      const adapter = createNodeWriteFilesystemAdapter({ root });
      for (const path of ["../escape.txt", "/etc/oh-my-pm-escape", `${root}/../escape.txt`]) {
        const result = adapter.writeFile({ path, content: "x", checksum: "sha256:x" });
        expect(result.ok).toBe(false);
        expect(result.message).toBe("unsafe_path");
      }
      expect(existsSync(join(root, "..", "escape.txt"))).toBe(false);
    });
  });
});

describe("removeFile", () => {
  it("removes a regular file and fails for missing files", () => {
    withTempRoot((root) => {
      writeFileSync(join(root, "a.txt"), "content", "utf8");
      const adapter = createNodeWriteFilesystemAdapter({ root });
      expect(adapter.removeFile("a.txt")).toEqual({
        kind: "remove",
        path: normalizeInstallerPath(join(root, "a.txt")),
        ok: true,
      });
      expect(existsSync(join(root, "a.txt"))).toBe(false);
      const missing = adapter.removeFile("a.txt");
      expect(missing.ok).toBe(false);
      expect(missing.message).toBe("file_missing");
    });
  });

  it("fails for a directory target", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "dir"));
      const adapter = createNodeWriteFilesystemAdapter({ root });
      const result = adapter.removeFile("dir");
      expect(result.ok).toBe(false);
      expect(result.message).toBe("not_a_file");
      expect(existsSync(join(root, "dir"))).toBe(true);
    });
  });
});

describe("backupFile", () => {
  it("copies a regular file under .oh-my-pm-backups/<rollbackId>/", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "tool"), "binary", "utf8");
      const adapter = createNodeWriteFilesystemAdapter({ root });
      const result = adapter.backupFile({ path: "bin/tool", rollbackId: "rb-1" });
      expect(result).toEqual({
        kind: "backup",
        path: normalizeInstallerPath(join(root, "bin", "tool")),
        ok: true,
      });
      const backupPath = join(root, ".oh-my-pm-backups", "rb-1", "bin", "tool");
      expect(readFileSync(backupPath, "utf8")).toBe("binary");
      expect(readFileSync(join(root, "bin", "tool"), "utf8")).toBe("binary");
    });
  });

  it("fails for missing files and unsafe rollback ids", () => {
    withTempRoot((root) => {
      const adapter = createNodeWriteFilesystemAdapter({ root });
      const missing = adapter.backupFile({ path: "missing.txt", rollbackId: "rb-1" });
      expect(missing.ok).toBe(false);
      expect(missing.message).toBe("file_missing");

      writeFileSync(join(root, "a.txt"), "content", "utf8");
      const unsafe = adapter.backupFile({ path: "a.txt", rollbackId: "../rb-escape" });
      expect(unsafe.ok).toBe(false);
      expect(unsafe.message).toBe("unsafe_path");
    });
  });
});

describe("symlink handling", () => {
  it("refuses symlink targets when the platform supports symlinks", () => {
    withTempRoot((root) => {
      writeFileSync(join(root, "target.txt"), "target", "utf8");
      let symlinkSupported = true;
      try {
        symlinkSync(join(root, "target.txt"), join(root, "link.txt"));
      } catch {
        symlinkSupported = false;
      }
      if (!symlinkSupported) {
        return;
      }
      const adapter = createNodeWriteFilesystemAdapter({ root });
      for (const result of [
        adapter.writeFile({ path: "link.txt", content: "x", checksum: "sha256:x" }),
        adapter.removeFile("link.txt"),
        adapter.backupFile({ path: "link.txt", rollbackId: "rb-1" }),
      ]) {
        expect(result.ok).toBe(false);
        expect(result.message).toBe("symlink_refused");
      }
      expect(readFileSync(join(root, "target.txt"), "utf8")).toBe("target");
    });
  });
});
