// In-memory filesystem adapter for deterministic tests and examples.
// Entries live only in memory; nothing here touches a real disk.

import type { FilesystemAdapter, FilesystemEntry, FilesystemSnapshot } from "./types.js";
import { normalizeInstallerPath } from "./paths.js";

function cloneEntry(entry: FilesystemEntry): FilesystemEntry {
  return { path: entry.path, content: entry.content, checksum: entry.checksum };
}

/** Deep-clone a snapshot so callers never share entry references. */
export function cloneFilesystemSnapshot(snapshot: FilesystemSnapshot): FilesystemSnapshot {
  return { entries: snapshot.entries.map(cloneEntry) };
}

/**
 * Create an in-memory read-only filesystem adapter. Paths are normalized and
 * the first entry wins when the same path appears twice.
 */
export function createMemoryFilesystem(
  entries: readonly FilesystemEntry[] = [],
): FilesystemAdapter {
  const byPath = new Map<string, FilesystemEntry>();
  for (const entry of entries) {
    const path = normalizeInstallerPath(entry.path);
    if (!byPath.has(path)) {
      byPath.set(path, { path, content: entry.content, checksum: entry.checksum });
    }
  }

  return {
    list(root): FilesystemSnapshot {
      const normalizedRoot = normalizeInstallerPath(root);
      const prefix = normalizedRoot === "/" ? "/" : `${normalizedRoot}/`;
      const listed = [...byPath.values()]
        .filter((entry) => entry.path === normalizedRoot || entry.path.startsWith(prefix))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(cloneEntry);
      return { entries: listed };
    },
    read(path): FilesystemEntry | undefined {
      const entry = byPath.get(normalizeInstallerPath(path));
      return entry === undefined ? undefined : cloneEntry(entry);
    },
    exists(path): boolean {
      return byPath.has(normalizeInstallerPath(path));
    },
  };
}
