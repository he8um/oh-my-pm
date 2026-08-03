// The explicit Node filesystem adapter — the ONLY module in this package that
// performs real filesystem I/O. It implements the FileSystem port using Node 20
// built-ins (node:fs/promises, node:path, node:os, node:process) with durable
// temp-then-rename writes, POSIX 0700/0600 modes, symlink-aware reads, and
// exclusive lock creation. A thin resolver wrapper reads process.platform,
// process.env, and os.homedir() FOR PATH RESOLUTION ONLY; it never reads
// provider tokens, and the resolved absolute data-root path is never persisted.

import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { homedir, platform as osPlatform } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { performAtomicWrite } from "./atomic-write.js";
import type { AtomicWritePrimitives, TempFileHandle } from "./atomic-write.js";
import { resolveDataRoot } from "./data-location.js";
import { assertPhysicallyConfined, canonicalizeRoot } from "./physical-confinement.js";
import type { PhysicalConfinementOptions, PhysicalProbe } from "./physical-confinement.js";
import type { DirEntry, FileSystem, LockCreateResult } from "./filesystem.js";
import { DependencyInjectedStore } from "./store.js";
import { defaultMigrationRegistry } from "./migrations.js";
import type { MigrationRegistry } from "./migrations.js";
import type { ProjectMemoryStore } from "./types.js";

/**
 * The real filesystem probe for physical confinement.
 *
 * physical-confinement.ts is pure and imports no Node module, so the primitives
 * it needs are supplied here -- this is the package's only filesystem boundary.
 * `readOneLink` deliberately reads a SINGLE link level (`lstat` + `readlink`)
 * rather than collapsing a chain: on Windows that reports junctions and other
 * reparse points as links too, so they are resolved and re-checked exactly like a
 * POSIX symlink instead of being mistaken for ordinary directories.
 */
const nodePhysicalProbe: PhysicalProbe = {
  realpath: (path: string) => realpath(path),
  readOneLink: async (path: string): Promise<string | null> => {
    const info = await lstat(path);
    if (!info.isSymbolicLink()) return null;
    return readlink(path);
  },
};

/**
 * True on platforms whose filesystems are case-insensitive by default: macOS
 * (APFS/HFS+) and Windows (NTFS). Read here because this module is the package's
 * platform boundary. Treating a case variant as an escape on those platforms would
 * reject ordinary use, since `STORE` and `store` are the same directory.
 */
const PLATFORM_CASE_INSENSITIVE = process.platform === "darwin" || process.platform === "win32";

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
  /**
   * The governed store root. When set, EVERY mutating call is validated to be
   * physically confined below this root's canonical location before it touches
   * the filesystem (see physical-confinement.ts). Left undefined only by callers
   * that construct the adapter without a store -- the store factory always sets
   * it, so the production write path is always guarded.
   */
  readonly governedRoot?: string;
  /** Case-sensitivity override for confinement comparisons (tests). */
  readonly caseInsensitive?: boolean;
  /** Injected physical probe (tests). Defaults to node:fs realpath. */
  readonly physicalProbe?: PhysicalProbe;
}

/** The Node implementation of the FileSystem port. */
export class NodeFileSystem implements FileSystem {
  private readonly nowFn: () => string;
  private readonly aliveFn: (pid: number) => boolean;
  private readonly governedRoot: string | undefined;
  private readonly confinementOptions: PhysicalConfinementOptions;
  /** Memoized canonical root. Re-resolved if the root is later replaced. */
  private canonicalRootPromise: Promise<string> | undefined;

  constructor(options: NodeFileSystemOptions = {}) {
    this.nowFn = options.now ?? (() => new Date().toISOString());
    this.aliveFn = options.isProcessAlive ?? defaultIsProcessAlive;
    this.governedRoot = options.governedRoot;
    this.confinementOptions = {
      // The pure confinement module performs no I/O and reads no platform, so the
      // adapter supplies both. Tests may override either.
      caseInsensitive: options.caseInsensitive ?? PLATFORM_CASE_INSENSITIVE,
      probe: options.physicalProbe ?? nodePhysicalProbe,
    };
  }

  /**
   * Validate that a path this call is about to MUTATE is physically confined
   * below the governed store root, and return the path to use.
   *
   * Called immediately before the mutating syscall, so the window between check
   * and use is as small as Node allows. Reads are not routed through here: the
   * read path already refuses to follow a symlink at the leaf, and a read that
   * resolved outside the store returns data rather than writing it, so the write
   * boundary is where confinement must be enforced.
   *
   * When no governed root is configured the adapter is unguarded and behaves
   * exactly as it did before -- callers that construct a store always configure
   * one.
   */
  private async guardWrite(path: string): Promise<string> {
    const governedRoot = this.governedRoot;
    if (governedRoot === undefined) return path;
    this.canonicalRootPromise ??= canonicalizeRoot(governedRoot, this.confinementOptions);
    const canonicalRoot = await this.canonicalRootPromise;
    return assertPhysicallyConfined(canonicalRoot, path, {
      ...this.confinementOptions,
      // The configured root is an accepted spelling of the canonical root: on
      // macOS the store is configured with `/var/...` while its canonical form is
      // `/private/var/...`, and a link recorded with the former is not an escape.
      rootAliases: [governedRoot],
    });
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
    // A directory create is a mutation: an escaped ancestor would have this
    // materialize a store directory outside the governed root.
    await this.guardWrite(path);
    await mkdir(path, { recursive: true, ...(IS_POSIX ? { mode: DIR_MODE } : {}) });
  }

  /**
   * Write the temp file, fsync its data, then atomically rename over the target.
   *
   * The ordering lives in `performAtomicWrite` so tests exercise the exact
   * sequence production runs, rather than an imitation that might drift. This
   * method supplies the real Node primitives and NO stage hook, so behaviour is
   * unchanged from when the sequence was inlined here.
   */
  async writeFileAtomic(path: string, contents: string, tmpName: string): Promise<void> {
    // Guard the authoritative target. The temp file is created in the same
    // directory, so confining the target confines the temp path with it.
    const confined = await this.guardWrite(path);
    await performAtomicWrite(this.atomicPrimitives(), confined, contents, tmpName);
  }

  /** The real Node primitives the shared atomic-write algorithm composes. */
  private atomicPrimitives(): AtomicWritePrimitives {
    return {
      createTemp: async (tmpPath: string): Promise<TempFileHandle> => {
        // "w" matches the previous behaviour exactly. The temp name is derived
        // from a validated operation id and pid, so two concurrent writers
        // cannot choose the same path.
        const handle = await open(tmpPath, "w", FILE_MODE);
        return {
          write: (chunk) => handle.writeFile(chunk, "utf8"),
          flush: () => handle.sync(),
          close: () => handle.close(),
        };
      },
      rename: (from, to) => rename(from, to),
      syncDir: (dir) => this.syncDir(dir),
      removeFileIfExists: async (target) => {
        // force: true makes a missing file a no-op, which is what cleanup after
        // a failed create needs.
        await rm(target, { force: true });
      },
      joinPath: (dir, name) => join(dir, name),
      dirName: (target) => dirname(target),
    };
  }

  async moveFile(from: string, to: string): Promise<void> {
    // Both ends mutate: the source is unlinked and the destination is created.
    const source = await this.guardWrite(from);
    const target = await this.guardWrite(to);
    await rename(source, target);
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
    // A recursive delete is the most destructive operation here: an escaped
    // ancestor would delete a tree outside the governed root.
    const confined = await this.guardWrite(path);
    await rm(confined, { recursive: true, force: true });
  }

  async moveDir(from: string, to: string): Promise<void> {
    const source = await this.guardWrite(from);
    const target = await this.guardWrite(to);
    await rename(source, target);
  }

  /**
   * Export-destination mutations: deliberately NOT store-confined.
   *
   * An export writes outside the governed data root by design, so applying store
   * confinement here would reject every export. These paths are policed instead
   * by `assertExportDestinationSafe`, which the store calls before any of them
   * runs, refusing a destination inside the project root or inside the active
   * data root. They are separate methods precisely so that the store-governed
   * methods above can be confined unconditionally, with no per-call opt-out that
   * a future caller could reach for by mistake.
   */
  async mkdirpExportDestination(path: string): Promise<void> {
    await mkdir(path, { recursive: true, ...(IS_POSIX ? { mode: DIR_MODE } : {}) });
  }

  async removeExportDestination(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  async moveExportDestination(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async writeExportDestinationFileAtomic(
    path: string,
    contents: string,
    tmpName: string,
  ): Promise<void> {
    // Same durable algorithm as the store-governed write, without store
    // confinement: the destination is outside the data root by design.
    await performAtomicWrite(this.atomicPrimitives(), path, contents, tmpName);
  }

  async copyFileTo(from: string, to: string): Promise<void> {
    // Only the SOURCE is store-governed. The destination is an export target
    // that is deliberately OUTSIDE the store root, and is policed separately by
    // assertExportDestinationSafe -- guarding it here would reject every export.
    const source = await this.guardWrite(from);
    await mkdir(dirname(to), { recursive: true, ...(IS_POSIX ? { mode: DIR_MODE } : {}) });
    // COPYFILE_FICLONE is a best-effort hint; falls back to a full copy.
    await copyFile(source, to);
  }

  async createLockExclusive(path: string, contents: string): Promise<LockCreateResult> {
    const confined = await this.guardWrite(path);
    try {
      const handle = await open(confined, "wx", FILE_MODE);
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
    const confined = await this.guardWrite(path);
    await rm(confined, { force: true });
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
  // The governed root is ALWAYS configured on the production path, so every
  // mutating call is physically confined below the resolved data root before it
  // touches the filesystem. A caller may not opt out: `governedRoot` is set
  // after the caller's options, so an injected value cannot override it.
  const fs = new NodeFileSystem({ ...(options.filesystem ?? {}), governedRoot: dataRoot });
  // A real v1 store on disk must be migratable to v2 (Phase 4.1). Wire the
  // default production migration registry (the `1 -> 2` chronology recovery)
  // unless the caller injected its own. Registering the registry does NOT
  // migrate anything — migration is always explicit and never triggered by a
  // read.
  const migrations = options.migrations ?? defaultMigrationRegistry();
  return new DependencyInjectedStore({ fs, dataRoot, migrations });
}

/**
 * The real physical probe and the platform case rule, exported so tests can
 * exercise the pure confinement functions with exactly what production supplies.
 */
export { nodePhysicalProbe, PLATFORM_CASE_INSENSITIVE };

/** Export constants for callers that need the resolved-root semantics in tests. */
export { resolveDataRoot };

/** Re-exported so consumers can construct a store directly against a port. */
export { DependencyInjectedStore };
