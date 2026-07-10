// Read-only Node filesystem adapter for planning and inspection.
//
// This is the only installer source file allowed to touch Node filesystem,
// path, and crypto APIs. It never writes, deletes, or mutates anything, it
// refuses paths outside the configured root, and it does not follow
// symlinks. Real installation execution remains out of scope.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import type {
  FilesystemAdapter,
  FilesystemEntry,
  FilesystemSnapshot,
  NodeFilesystemAdapterInfo,
  NodeFilesystemAdapterOptions,
} from "./types.js";
import { isSafeRelativePath, normalizeInstallerPath } from "./paths.js";

function checksum(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

/** Describe an adapter configuration without touching the filesystem. */
export function describeNodeFilesystemAdapter(
  options: NodeFilesystemAdapterOptions,
): NodeFilesystemAdapterInfo {
  return {
    root: normalizeInstallerPath(resolve(options.root)),
    checksumAlgorithm: "sha256",
    readOnly: true,
  };
}

/**
 * Create a read-only filesystem adapter over a resolved root. Every unsafe,
 * missing, or outside-root request fails closed: `exists` returns false,
 * `read` returns undefined, and `list` returns an empty snapshot.
 */
export function createNodeFilesystemAdapter(
  options: NodeFilesystemAdapterOptions,
): FilesystemAdapter {
  const realRoot = resolve(options.root);
  const adapterRoot = normalizeInstallerPath(realRoot);

  function toAdapterPath(realPath: string): string {
    return normalizeInstallerPath(realPath);
  }

  // Map a requested installer path to a real path inside the root, or null
  // when the request is unsafe or escapes the root.
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

    if (relativePart !== "" && !isSafeRelativePath(relativePart)) {
      return null;
    }

    const candidate =
      relativePart === "" ? realRoot : join(realRoot, ...relativePart.split("/"));
    const containment = relative(realRoot, candidate);
    if (containment.startsWith("..") || containment.split(sep).includes("..")) {
      return null;
    }
    return candidate;
  }

  function walkFiles(realDir: string): string[] {
    const files: string[] = [];
    for (const name of readdirSync(realDir).sort()) {
      const full = join(realDir, name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        files.push(...walkFiles(full));
      } else if (stat.isFile()) {
        files.push(full);
      }
    }
    return files;
  }

  function readEntry(realPath: string): FilesystemEntry {
    const content = readFileSync(realPath, "utf8");
    return { path: toAdapterPath(realPath), content, checksum: checksum(content) };
  }

  return {
    list(root): FilesystemSnapshot {
      const realPath = toRealPath(root);
      if (realPath === null || !existsSync(realPath) || !lstatSync(realPath).isDirectory()) {
        return { entries: [] };
      }
      const entries = walkFiles(realPath)
        .map(readEntry)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { entries };
    },
    read(path): FilesystemEntry | undefined {
      const realPath = toRealPath(path);
      if (realPath === null || !existsSync(realPath) || !lstatSync(realPath).isFile()) {
        return undefined;
      }
      return readEntry(realPath);
    },
    exists(path): boolean {
      const realPath = toRealPath(path);
      return realPath !== null && existsSync(realPath) && lstatSync(realPath).isFile();
    },
  };
}
