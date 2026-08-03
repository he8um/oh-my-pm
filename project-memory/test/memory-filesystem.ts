// An in-memory FileSystem implementation for deterministic store tests. It
// supports the full port surface, exclusive lock semantics, symlink-aware
// entries, injected clock/liveness, and a single commit-point failure injection.
// It is test-only and never shipped.

import { performAtomicWrite } from "../src/atomic-write.js";
import type {
  AtomicWritePrimitives,
  AtomicWriteStage,
  TempFileHandle,
} from "../src/atomic-write.js";
import type {
  CommitFailurePoint,
  DirEntry,
  FileSystem,
  LockCreateResult,
} from "../src/filesystem.js";

interface Node {
  kind: "file" | "dir" | "symlink";
  content?: string;
  /** For symlink nodes, the (unfollowed) target string. */
  target?: string;
}

const SEP = "/";

/**
 * Split on BOTH separators.
 *
 * The store builds its paths with `node:path`, so on Windows every managed path
 * arrives spelled with backslashes -- `\\data\\oh-my-pm\\project-brain\\v1`. This
 * in-memory filesystem keys its nodes with "/", so a backslash path used to match
 * nothing at all: every suite that drives the store through this port failed on
 * Windows, which is exactly what the first Windows run of the integrity matrix
 * exposed. Accepting both separators here makes the fake behave like the real
 * filesystem, where both are valid on Windows.
 */
const SEGMENT_SPLIT = /[\\/]+/;

function normalize(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split(SEGMENT_SPLIT)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return SEP + parts.join(SEP);
}

function parent(path: string): string {
  const norm = normalize(path);
  const idx = norm.lastIndexOf(SEP);
  return idx <= 0 ? SEP : norm.slice(0, idx);
}

function base(path: string): string {
  const norm = normalize(path);
  return norm.slice(norm.lastIndexOf(SEP) + 1);
}

export interface MemoryFsOptions {
  readonly now?: () => string;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly pid?: number;
  readonly failAt?: CommitFailurePoint;
  readonly atomicFailAt?: AtomicWriteStage;
}

/** A hook that throws at one named atomic-write stage. */
function failAtStage(stage: AtomicWriteStage) {
  return (current: AtomicWriteStage): void => {
    if (current === stage) {
      throw new Error(`injected atomic-write failure at ${stage}`);
    }
  };
}

export class MemoryFileSystem implements FileSystem {
  readonly nodes = new Map<string, Node>();
  /**
   * The stage at which the next operation should fail, or undefined for normal
   * operation.
   *
   * Mutable on the test double even though the `FileSystem` port declares it
   * readonly, so a crash can be simulated and then STOPPED while every byte of
   * on-disk state survives. That is what a real crash-and-restart looks like:
   * the process dies, the filesystem keeps whatever it had.
   *
   * Before this was mutable, a recovery test had no way to retry against the
   * damaged store and instead constructed a pristine MemoryFileSystem -- which
   * has no lock file, no staging residue, and no partial records, so it proved
   * nothing about recovery. Use `simulateRestart()` rather than assigning here.
   */
  failAt: CommitFailurePoint | undefined;
  /** Stage at which an atomic write should fail, for internal fault injection. */
  atomicFailAt: AtomicWriteStage | undefined;
  /** When set, an atomic write's temp file receives only this many characters. */
  atomicPartialWriteLimit: number | undefined;
  /** Directories fsync'd by atomic writes, in order. */
  readonly syncedDirs: string[] = [];
  private readonly nowFn: () => string;
  private readonly aliveFn: (pid: number) => boolean;
  private readonly pid: number;

  constructor(options: MemoryFsOptions = {}) {
    this.nowFn = options.now ?? (() => "2026-01-01T00:00:00.000Z");
    this.aliveFn = options.isProcessAlive ?? (() => true);
    this.pid = options.pid ?? 4242;
    this.failAt = options.failAt;
    this.atomicFailAt = options.atomicFailAt;
    this.nodes.set(SEP, { kind: "dir" });
  }

  /**
   * Stop injecting failures while keeping all persisted state.
   *
   * Models the process restarting after a crash: the same bytes are still on
   * disk -- including any lock file and staging residue the dead writer left --
   * but nothing is injecting failures any more.
   */
  simulateRestart(): void {
    this.failAt = undefined;
    this.atomicFailAt = undefined;
    this.atomicPartialWriteLimit = undefined;
  }

  /** Every persisted path, sorted. For asserting on residue after a crash. */
  pathsMatching(fragment: string): string[] {
    return [...this.nodes.keys()].filter((p) => p.includes(fragment)).sort();
  }

  /** Test helper: plant a symbolic link node at a path. */
  plantSymlink(path: string, target: string): void {
    const norm = normalize(path);
    this.ensureDir(parent(norm));
    this.nodes.set(norm, { kind: "symlink", target });
  }

  /** Test helper: read raw content directly (bypassing symlink guard). */
  peek(path: string): string | undefined {
    return this.nodes.get(normalize(path))?.content;
  }

  /** Test helper: overwrite raw content directly (to simulate tampering). */
  poke(path: string, content: string): void {
    const norm = normalize(path);
    this.ensureDir(parent(norm));
    this.nodes.set(norm, { kind: "file", content });
  }

  /**
   * Test helper: delete exactly one node, normalizing the path first.
   *
   * Exists because `fs.nodes.delete(p)` bypasses `normalize()`. The store builds
   * its paths with `node:path`, so on Windows a caller passes backslashes while the
   * map is keyed on "/" -- the raw delete silently matched nothing and the test
   * then asserted against an undamaged store. Every mutation from a test must go
   * through a normalizing helper.
   */
  remove(path: string): void {
    this.nodes.delete(normalize(path));
  }

  /** Test helper: every persisted path, normalized and sorted. */
  listPaths(): string[] {
    return [...this.nodes.keys()].sort();
  }

  /** Test helper: snapshot of every file path -> content, for byte comparisons. */
  snapshot(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [path, node] of this.nodes) {
      if (node.kind === "file") out.set(path, node.content ?? "");
    }
    return out;
  }

  private ensureDir(path: string): void {
    const norm = normalize(path);
    if (norm === SEP) return;
    if (!this.nodes.has(norm)) {
      this.ensureDir(parent(norm));
      this.nodes.set(norm, { kind: "dir" });
    }
  }

  async readFileIfExists(path: string): Promise<string | null> {
    const node = this.nodes.get(normalize(path));
    if (node === undefined || node.kind !== "file") return null;
    return node.content ?? "";
  }

  async exists(path: string): Promise<boolean> {
    return this.nodes.has(normalize(path));
  }

  async statKind(path: string): Promise<DirEntry | null> {
    const node = this.nodes.get(normalize(path));
    if (node === undefined) return null;
    return {
      name: base(path),
      isDirectory: node.kind === "dir",
      isFile: node.kind === "file",
      isSymbolicLink: node.kind === "symlink",
    };
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const norm = normalize(path);
    if (!this.nodes.has(norm)) return [];
    const out: DirEntry[] = [];
    const prefix = norm === SEP ? SEP : norm + SEP;
    for (const [p, node] of this.nodes) {
      if (p === norm) continue;
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (rest.includes(SEP)) continue; // only direct children
      out.push({
        name: rest,
        isDirectory: node.kind === "dir",
        isFile: node.kind === "file",
        isSymbolicLink: node.kind === "symlink",
      });
    }
    return out;
  }

  async mkdirp(path: string): Promise<void> {
    this.ensureDir(normalize(path));
  }

  /**
   * Write through the SHARED atomic-write algorithm, not a shortcut.
   *
   * This used to set the target node directly, which meant every store-level
   * test exercised an imitation: no temp file, no flush, no rename, no directory
   * sync. A reordering bug in the real algorithm would have been invisible here.
   * Now the ordering logic is the same code production runs, and `atomicFailAt`
   * can inject a fault at any internal stage.
   */
  async writeFileAtomic(path: string, contents: string, tmpName: string): Promise<void> {
    const norm = normalize(path);
    this.ensureDir(parent(norm));
    await performAtomicWrite(
      this.atomicPrimitives(),
      norm,
      contents,
      tmpName,
      this.atomicFailAt === undefined ? undefined : failAtStage(this.atomicFailAt),
    );
  }

  /** In-memory primitives for the shared atomic-write algorithm. */
  private atomicPrimitives(): AtomicWritePrimitives {
    return {
      createTemp: async (tmpPath: string): Promise<TempFileHandle> => {
        const norm = normalize(tmpPath);
        this.ensureDir(parent(norm));
        this.nodes.set(norm, { kind: "file", content: "" });
        const limit = this.atomicPartialWriteLimit;
        return {
          write: async (chunk: string) => {
            this.nodes.set(norm, {
              kind: "file",
              content: limit === undefined ? chunk : chunk.slice(0, limit),
            });
          },
          flush: async () => {
            /* no durability to model in memory */
          },
          close: async () => {
            /* no handle to release in memory */
          },
        };
      },
      rename: async (from, to) => {
        await this.moveFile(from, to);
      },
      syncDir: async (dir) => {
        this.syncedDirs.push(normalize(dir));
      },
      removeFileIfExists: async (target) => {
        this.nodes.delete(normalize(target));
      },
      joinPath: (dir, name) => (dir.endsWith(SEP) ? `${dir}${name}` : `${dir}${SEP}${name}`),
      dirName: (target) => parent(normalize(target)),
    };
  }

  async moveFile(from: string, to: string): Promise<void> {
    const src = this.nodes.get(normalize(from));
    if (src === undefined) throw enoent(from);
    this.ensureDir(parent(normalize(to)));
    this.nodes.set(normalize(to), src);
    this.nodes.delete(normalize(from));
  }

  async syncDir(_path: string): Promise<void> {
    return Promise.resolve();
  }

  async removeDir(path: string): Promise<void> {
    const norm = normalize(path);
    const prefix = norm + SEP;
    for (const p of [...this.nodes.keys()]) {
      if (p === norm || p.startsWith(prefix)) this.nodes.delete(p);
    }
  }

  async removeFile(path: string): Promise<void> {
    // Single-file, idempotent: only the exact node, never a subtree.
    this.nodes.delete(normalize(path));
  }

  async moveDir(from: string, to: string): Promise<void> {
    const src = normalize(from);
    const dst = normalize(to);
    const prefix = src + SEP;
    const moves: [string, Node][] = [];
    for (const [p, node] of this.nodes) {
      if (p === src) moves.push([dst, node]);
      else if (p.startsWith(prefix)) moves.push([dst + p.slice(src.length), node]);
    }
    if (moves.length === 0) throw enoent(from);
    for (const p of [...this.nodes.keys()]) {
      if (p === src || p.startsWith(prefix)) this.nodes.delete(p);
    }
    this.ensureDir(parent(dst));
    for (const [p, node] of moves) this.nodes.set(p, node);
  }

  async copyFileTo(from: string, to: string): Promise<void> {
    const src = this.nodes.get(normalize(from));
    if (src === undefined || src.kind !== "file") throw enoent(from);
    this.ensureDir(parent(normalize(to)));
    this.nodes.set(normalize(to), { kind: "file", content: src.content ?? "" });
  }

  // Export-destination mutations. In this in-memory double they are the same
  // operations as their store-governed counterparts -- the distinction that
  // matters (store confinement applies to one set and not the other) lives in
  // the Node adapter, which is where the real filesystem is touched.
  async mkdirpExportDestination(path: string): Promise<void> {
    await this.mkdirp(path);
  }

  async removeExportDestination(path: string): Promise<void> {
    await this.removeDir(path);
  }

  async moveExportDestination(from: string, to: string): Promise<void> {
    await this.moveDir(from, to);
  }

  async writeExportDestinationFileAtomic(
    path: string,
    contents: string,
    tmpName: string,
  ): Promise<void> {
    await this.writeFileAtomic(path, contents, tmpName);
  }

  async createLockExclusive(path: string, contents: string): Promise<LockCreateResult> {
    const norm = normalize(path);
    if (this.nodes.has(norm)) return { acquired: false };
    this.ensureDir(parent(norm));
    this.nodes.set(norm, { kind: "file", content: contents });
    return { acquired: true };
  }

  async readLock(path: string): Promise<string | null> {
    return this.readFileIfExists(path);
  }

  async removeLock(path: string): Promise<void> {
    this.nodes.delete(normalize(path));
  }

  referenceNow(): string {
    return this.nowFn();
  }

  isProcessAlive(pid: number): boolean {
    return this.aliveFn(pid);
  }

  currentPid(): number {
    return this.pid;
  }
}

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
}
