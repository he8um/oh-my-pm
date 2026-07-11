// In-memory write adapter for deterministic tests and examples. All writes,
// removals, and backups happen in memory only; nothing touches a real disk.

import type {
  ExecutedFileOperation,
  FilesystemEntry,
  FilesystemSnapshot,
  FilesystemWriteAdapter,
} from "./types.js";
import { normalizeInstallerPath } from "./paths.js";

function cloneEntry(entry: FilesystemEntry): FilesystemEntry {
  return { path: entry.path, content: entry.content, checksum: entry.checksum };
}

function sortedSnapshot(store: Map<string, FilesystemEntry>): FilesystemSnapshot {
  const entries = [...store.values()]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(cloneEntry);
  return { entries };
}

/**
 * Create an in-memory write adapter. Paths are normalized, the first entry
 * wins on initialization, and backups are stored under `<rollbackId>:<path>`.
 */
export function createMemoryWriteFilesystem(
  entries: readonly FilesystemEntry[] = [],
): FilesystemWriteAdapter & {
  snapshot(): FilesystemSnapshot;
  backups(): FilesystemSnapshot;
} {
  const byPath = new Map<string, FilesystemEntry>();
  for (const entry of entries) {
    const path = normalizeInstallerPath(entry.path);
    if (!byPath.has(path)) {
      byPath.set(path, { path, content: entry.content, checksum: entry.checksum });
    }
  }
  const backupStore = new Map<string, FilesystemEntry>();

  return {
    writeFile(input): ExecutedFileOperation {
      const path = normalizeInstallerPath(input.path);
      const existed = byPath.has(path);
      byPath.set(path, { path, content: input.content, checksum: input.checksum });
      return {
        kind: existed ? "replace" : "create",
        path,
        ok: true,
        checksum: input.checksum,
      };
    },
    removeFile(path): ExecutedFileOperation {
      const normalized = normalizeInstallerPath(path);
      if (!byPath.has(normalized)) {
        return { kind: "remove", path: normalized, ok: false, message: "file_missing" };
      }
      byPath.delete(normalized);
      return { kind: "remove", path: normalized, ok: true };
    },
    backupFile(input): ExecutedFileOperation {
      const path = normalizeInstallerPath(input.path);
      const entry = byPath.get(path);
      if (entry === undefined) {
        return { kind: "backup", path, ok: false, message: "file_missing" };
      }
      const backupPath = `${input.rollbackId}:${path}`;
      backupStore.set(backupPath, {
        path: backupPath,
        content: entry.content,
        checksum: entry.checksum,
      });
      return { kind: "backup", path, ok: true, checksum: entry.checksum };
    },
    snapshot(): FilesystemSnapshot {
      return sortedSnapshot(byPath);
    },
    backups(): FilesystemSnapshot {
      return sortedSnapshot(backupStore);
    },
  };
}
