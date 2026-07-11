// Root-confined Node write adapter for controlled installer execution.
//
// This is the only installer source file allowed to mutate the real
// filesystem. Every operation stays inside the resolved root, refuses
// symlinks, and fails closed with a structured result instead of throwing.
// No release packaging, downloads, or install command live here.

import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import type {
  BackupFileInput,
  ExecutedFileOperation,
  FilesystemWriteAdapter,
  NodeFilesystemAdapterOptions,
  WriteFileInput,
} from "./types.js";
import { isSafeRelativePath, normalizeInstallerPath } from "./paths.js";

const BACKUP_DIR = ".oh-my-pm-backups";

type LstatResult = NonNullable<ReturnType<typeof lstatSync>> | null;

/**
 * Create a write adapter confined to a resolved root. Unsafe or
 * outside-root paths fail with `unsafe_path`; symlinks fail with
 * `symlink_refused`; non-file targets fail with `not_a_file`.
 */
export function createNodeWriteFilesystemAdapter(
  options: NodeFilesystemAdapterOptions,
): FilesystemWriteAdapter {
  const realRoot = resolve(options.root);
  const adapterRoot = normalizeInstallerPath(realRoot);

  // Same containment semantics as the read-only adapter in
  // node-filesystem.ts: absolute paths must sit under the root and relative
  // paths must be safe package-relative paths.
  function toRealPath(requestedPath: string): string | null {
    const normalized = normalizeInstallerPath(requestedPath);

    let relativePart: string;
    if (normalized === adapterRoot) {
      relativePart = "";
    } else if (normalized.startsWith(`${adapterRoot}/`)) {
      relativePart = normalized.slice(adapterRoot.length + 1);
    } else if (!normalized.startsWith("/") && !/^[A-Za-z]:/.test(normalized)) {
      relativePart = normalized;
    } else {
      return null;
    }

    if (relativePart === "" || !isSafeRelativePath(relativePart)) {
      return null;
    }

    const candidate = join(realRoot, ...relativePart.split("/"));
    const containment = relative(realRoot, candidate);
    if (containment.startsWith("..") || containment.split(sep).includes("..")) {
      return null;
    }
    return candidate;
  }

  function statOrNull(realPath: string): LstatResult {
    return existsSync(realPath) || isDanglingSymlink(realPath) ? lstatSync(realPath) : null;
  }

  // existsSync follows symlinks, so a dangling symlink reports missing even
  // though an entry is present; lstat inside try/catch closes that gap.
  function isDanglingSymlink(realPath: string): boolean {
    try {
      return lstatSync(realPath).isSymbolicLink();
    } catch {
      return false;
    }
  }

  function failed(
    kind: ExecutedFileOperation["kind"],
    path: string,
    message: string,
  ): ExecutedFileOperation {
    return { kind, path: normalizeInstallerPath(path), ok: false, message };
  }

  return {
    writeFile(input: WriteFileInput): ExecutedFileOperation {
      const realPath = toRealPath(input.path);
      if (realPath === null) {
        return failed("create", input.path, "unsafe_path");
      }
      const stat = statOrNull(realPath);
      if (stat !== null && stat.isSymbolicLink()) {
        return failed("replace", input.path, "symlink_refused");
      }
      if (stat !== null && !stat.isFile()) {
        return failed("replace", input.path, "not_a_file");
      }
      const kind = stat === null ? "create" : "replace";
      try {
        mkdirSync(dirname(realPath), { recursive: true });
        writeFileSync(realPath, input.content, "utf8");
      } catch {
        return failed(kind, input.path, "write_failed");
      }
      return {
        kind,
        path: normalizeInstallerPath(realPath),
        ok: true,
        checksum: input.checksum,
      };
    },
    removeFile(path: string): ExecutedFileOperation {
      const realPath = toRealPath(path);
      if (realPath === null) {
        return failed("remove", path, "unsafe_path");
      }
      const stat = statOrNull(realPath);
      if (stat === null) {
        return failed("remove", path, "file_missing");
      }
      if (stat.isSymbolicLink()) {
        return failed("remove", path, "symlink_refused");
      }
      if (!stat.isFile()) {
        return failed("remove", path, "not_a_file");
      }
      try {
        rmSync(realPath);
      } catch {
        return failed("remove", path, "remove_failed");
      }
      return { kind: "remove", path: normalizeInstallerPath(realPath), ok: true };
    },
    backupFile(input: BackupFileInput): ExecutedFileOperation {
      const realPath = toRealPath(input.path);
      if (realPath === null || !isSafeRelativePath(input.rollbackId)) {
        return failed("backup", input.path, "unsafe_path");
      }
      const stat = statOrNull(realPath);
      if (stat === null) {
        return failed("backup", input.path, "file_missing");
      }
      if (stat.isSymbolicLink()) {
        return failed("backup", input.path, "symlink_refused");
      }
      if (!stat.isFile()) {
        return failed("backup", input.path, "not_a_file");
      }
      const relativePart = relative(realRoot, realPath).split(sep);
      const backupPath = join(realRoot, BACKUP_DIR, input.rollbackId, ...relativePart);
      try {
        mkdirSync(dirname(backupPath), { recursive: true });
        copyFileSync(realPath, backupPath);
      } catch {
        return failed("backup", input.path, "backup_failed");
      }
      return { kind: "backup", path: normalizeInstallerPath(realPath), ok: true };
    },
  };
}
