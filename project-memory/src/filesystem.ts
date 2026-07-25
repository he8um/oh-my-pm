// The filesystem port: the narrow, abstract I/O surface the store depends on.
// The store contains NO direct node:fs import; every byte of real I/O flows
// through an implementation of this interface. The single production
// implementation lives in node-adapter.ts (the explicit Node boundary); tests
// supply an in-memory implementation with failure injection.

/** Ordered points at which a commit may be told to fail, for crash simulation. */
export type CommitFailurePoint =
  | "afterLock"
  | "afterStagingCreated"
  | "afterFirstRecordWritten"
  | "afterRecordsMoved"
  | "beforeManifestRename"
  | "afterManifestRename"
  | "beforeCleanup";

/** A directory entry as reported by the filesystem port. */
export interface DirEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  /** True when the entry is a symbolic link (never followed by the store). */
  readonly isSymbolicLink: boolean;
}

/** Options for an exclusive lock-file create. */
export interface LockCreateResult {
  /** True when this call created the lock; false when it already existed. */
  readonly acquired: boolean;
}

/**
 * The abstract filesystem the store uses. All methods operate on absolute paths
 * already confined by path-safety. Implementations must reject symlinks on the
 * managed read paths (the store never follows a symlink inside its store).
 */
export interface FileSystem {
  /** Read a UTF-8 file, or return null when it does not exist. */
  readFileIfExists(path: string): Promise<string | null>;
  /** True when a path exists (file or directory), without following symlinks. */
  exists(path: string): Promise<boolean>;
  /** Lstat-based entry kind, or null when the path does not exist. */
  statKind(path: string): Promise<DirEntry | null>;
  /** List directory entries (lstat-based, symlink-aware), or [] when missing. */
  readDir(path: string): Promise<DirEntry[]>;

  /** Recursively create a directory (mode 0o700 on POSIX). */
  mkdirp(path: string): Promise<void>;
  /**
   * Write a file durably via same-filesystem temp-then-rename, fsync'ing the
   * temp file before rename (mode 0o600 on POSIX). The tmpName is caller-chosen
   * from validated operation id + pid, never from content.
   */
  writeFileAtomic(path: string, contents: string, tmpName: string): Promise<void>;
  /** Move a file within the same filesystem (rename). */
  moveFile(from: string, to: string): Promise<void>;
  /** fsync a directory where the platform supports it; a no-op otherwise. */
  syncDir(path: string): Promise<void>;
  /** Remove a directory tree (used for staging, backups, tombstones). */
  removeDir(path: string): Promise<void>;
  /** Rename a directory (used to move a project dir to a sibling tombstone). */
  moveDir(from: string, to: string): Promise<void>;
  /** Recursively copy a file to a destination (used by export). */
  copyFileTo(from: string, to: string): Promise<void>;

  /**
   * Exclusively create a lock file (open with "wx"), writing its contents.
   * Returns acquired=false when the file already exists rather than throwing.
   */
  createLockExclusive(path: string, contents: string): Promise<LockCreateResult>;
  /** Read a lock file's contents, or null when it does not exist. */
  readLock(path: string): Promise<string | null>;
  /** Remove a lock file (idempotent: missing file is not an error). */
  removeLock(path: string): Promise<void>;

  /** Injected reference time (RFC3339). Never reads a system clock directly. */
  referenceNow(): string;
  /** Injected probe: is the given PID a live process on this host? */
  isProcessAlive(pid: number): boolean;
  /** The current process id, for lock ownership metadata. */
  currentPid(): number;

  /**
   * Test-only hook. When set, the store calls this at each labeled commit point;
   * an implementation may throw to simulate a crash. Production adapters leave
   * this undefined.
   */
  readonly failAt?: CommitFailurePoint | undefined;
}
