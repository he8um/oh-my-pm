// The explicit Node filesystem adapter — the ONLY module in this package that
// performs real filesystem I/O. It implements the FileSystem port using Node 20
// built-ins (node:fs/promises, node:path, node:os, node:process) with durable
// temp-then-rename writes, POSIX 0700/0600 modes, symlink-aware reads, and
// exclusive lock creation. A thin resolver wrapper reads process.platform,
// process.env, and os.homedir() FOR PATH RESOLUTION ONLY; it never reads
// provider tokens, and the resolved absolute data-root path is never persisted.

import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, platform as osPlatform } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { resolveDataRoot } from "./data-location.js";
import type { DirEntry, FileSystem, LockCreateResult } from "./filesystem.js";
import { DependencyInjectedStore } from "./store.js";
import { defaultMigrationRegistry } from "./migrations.js";
import type { MigrationRegistry } from "./migrations.js";
import type { ProjectMemoryStore } from "./types.js";

/** POSIX directory mode (owner-only). Ignored on Windows. */
const DIR_MODE = 0o700;
/** POSIX file mode (owner-only). Ignored on Windows. */
const FILE_MODE = 0o600;

/** True on POSIX platforms where owner-only modes are meaningful. */
const IS_POSIX = process.platform !== "win32";

/**
 * Options for the injected clock and liveness probe. Production leaves these
 * undefined to use a wall clock and process.kill(pid, 0); tests inject both.
 */
export interface NodeFileSystemOptions {
  /** Injected RFC3339 "now". Falls back to a wall clock read at call time. */
  readonly now?: () => string;
  /** Injected liveness probe. Falls back to process.kill(pid, 0). */
  readonly isProcessAlive?: (pid: number) => boolean;
}

/** The Node implementation of the FileSystem port. */
export class NodeFileSystem implements FileSystem {
  private readonly nowFn: () => string;
  private readonly aliveFn: (pid: number) => boolean;

  constructor(options: NodeFileSystemOptions = {}) {
    this.nowFn = options.now ?? (() => new Date().toISOString());
    this.aliveFn = options.isProcessAlive ?? defaultIsProcessAlive;
  }

  async readFileIfExists(path: string): Promise<string | null> {
    try {
      // Refuse to follow a symlink at the leaf: read only regular files.
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) return null;
      return await readFile(path, "utf8");
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (err) {
      if (isEnoent(err)) return false;
      throw err;
    }
  }

  async statKind(path: string): Promise<DirEntry | null> {
    try {
      const stat = await lstat(path);
      return {
        name: path,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        isSymbolicLink: stat.isSymbolicLink(),
      };
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  async readDir(path: string): Promise<DirEntry[]> {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymbolicLink: entry.isSymbolicLink(),
    }));
  }

  async mkdirp(path: string): Promise<void> {
    await mkdir(path, { recursive: true, ...(IS_POSIX ? { mode: DIR_MODE } : {}) });
  }

  async writeFileAtomic(path: string, contents: string, tmpName: string): Promise<void> {
    const dir = dirname(path);
    const tmpPath = join(dir, tmpName);
    // Write the temp file, fsync its data, then atomically rename over target.
    const handle = await open(tmpPath, "w", FILE_MODE);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, path);
  }

  async moveFile(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async syncDir(path: string): Promise<void> {
    // Best-effort directory fsync; unsupported on some platforms (e.g. Windows).
    try {
      const handle = await open(path, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch {
      // Directory fsync is a durability optimization; a platform that refuses it
      // (EISDIR/EPERM/unsupported) does not compromise the rename commit point.
    }
  }

  async removeDir(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  async moveDir(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async copyFileTo(from: string, to: string): Promise<void> {
    await mkdir(dirname(to), { recursive: true, ...(IS_POSIX ? { mode: DIR_MODE } : {}) });
    // COPYFILE_FICLONE is a best-effort hint; falls back to a full copy.
    await copyFile(from, to);
  }

  async createLockExclusive(path: string, contents: string): Promise<LockCreateResult> {
    try {
      const handle = await open(path, "wx", FILE_MODE);
      try {
        await handle.writeFile(contents, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return { acquired: true };
    } catch (err) {
      if (isEexist(err)) return { acquired: false };
      throw err;
    }
  }

  async readLock(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  async removeLock(path: string): Promise<void> {
    await rm(path, { force: true });
  }

  referenceNow(): string {
    return this.nowFn();
  }

  isProcessAlive(pid: number): boolean {
    return this.aliveFn(pid);
  }

  currentPid(): number {
    return process.pid;
  }
}

/** Default liveness probe: signal 0 tests for an existing, permitted process. */
function defaultIsProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by another user (still alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function isEexist(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "EEXIST";
}

/** Options for building the Node-backed project memory store. */
export interface NodeProjectMemoryStoreOptions {
  /** Explicit data-root override; wins over all platform rules. */
  readonly dataRootOverride?: string;
  /** Optional migration registry (empty by default: no production migrations). */
  readonly migrations?: MigrationRegistry;
  /** Filesystem clock/liveness injection (tests only). */
  readonly filesystem?: NodeFileSystemOptions;
}

/**
 * Resolve the application-data root using only process.platform, process.env,
 * and os.homedir() FOR PATH RESOLUTION. The resolved absolute path is returned
 * to the caller for immediate use and is never persisted by this package.
 */
export function resolveNodeDataRoot(override?: string): string {
  const home = safeHomedir();
  return resolveDataRoot({
    platform: osPlatform(),
    env: process.env,
    ...(home !== undefined ? { homedir: home } : {}),
    ...(override !== undefined ? { override } : {}),
  });
}

function safeHomedir(): string | undefined {
  try {
    const home = homedir();
    return home.length > 0 ? home : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Construct a Node-backed ProjectMemoryStore. This is the single explicit entry
 * point that binds the pure store to the real filesystem. No public CLI command,
 * MCP tool, or Runtime path invokes it in Phase 2.
 */
export function createNodeProjectMemoryStore(
  options: NodeProjectMemoryStoreOptions = {},
): ProjectMemoryStore {
  const dataRoot = resolveNodeDataRoot(options.dataRootOverride);
  const fs = new NodeFileSystem(options.filesystem ?? {});
  // A real v1 store on disk must be migratable to v2 (Phase 4.1). Wire the
  // default production migration registry (the `1 -> 2` chronology recovery)
  // unless the caller injected its own. Registering the registry does NOT
  // migrate anything — migration is always explicit and never triggered by a
  // read.
  const migrations = options.migrations ?? defaultMigrationRegistry();
  return new DependencyInjectedStore({ fs, dataRoot, migrations });
}

/** Export constants for callers that need the resolved-root semantics in tests. */
export { resolveDataRoot };

/** Re-exported so consumers can construct a store directly against a port. */
export { DependencyInjectedStore };
