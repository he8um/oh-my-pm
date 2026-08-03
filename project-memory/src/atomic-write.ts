// The shared atomic-write algorithm.
//
// Why this module exists
// ----------------------
// `writeFileAtomic` is the commit point of the whole store: temp file → fsync →
// rename. The algorithm was correct, but it lived inside the Node adapter as one
// opaque step, so fault injection could only wrap it from the outside. Four of
// the nine crash stages the release must prove -- before temp create, during temp
// write, after flush, before directory sync -- were unreachable by any test.
//
// The sequence now lives here once, parameterized over its primitives. Production
// passes real Node primitives and no hook; tests pass deterministic primitives
// and a hook that throws at a named stage. Both run THIS ordering logic, so a
// test cannot pass against an imitation whose steps happen to differ from
// production.
//
// What this module is not: a second write path. The Node adapter's
// `writeFileAtomic` delegates here and adds nothing.
//
// Durability note, stated because it is easy to overclaim: injecting a stage
// failure proves the algorithm's RECOVERY contract -- which states are reachable
// and whether a retry reconciles them. It does not prove real power-loss
// durability, which remains bounded by the platform's own fsync semantics and
// cannot be established by a simulated filesystem on any operating system.

/**
 * The ordered, exhaustive stages of one atomic write.
 *
 * Stable names: they appear in test failure messages and in the recovery
 * documentation, so renaming one is a documentation change too.
 */
export type AtomicWriteStage =
  | "before-temp-create"
  | "after-temp-create"
  | "during-temp-write"
  | "after-temp-write"
  | "after-temp-flush"
  | "before-rename"
  | "after-rename"
  | "before-directory-sync"
  | "after-directory-sync";

/** Every stage in execution order. Exported so tests cannot miss one. */
export const ATOMIC_WRITE_STAGES: readonly AtomicWriteStage[] = [
  "before-temp-create",
  "after-temp-create",
  "during-temp-write",
  "after-temp-write",
  "after-temp-flush",
  "before-rename",
  "after-rename",
  "before-directory-sync",
  "after-directory-sync",
] as const;

/**
 * An open temp file being written.
 *
 * Deliberately minimal: the algorithm needs to write, flush, and close, and
 * nothing else. `write` may be called more than once so a fault-capable
 * implementation can model a PARTIAL write -- a failure after some bytes landed
 * is a different reachable state from a failure before any did.
 */
export interface TempFileHandle {
  write(chunk: string): Promise<void>;
  /** fsync the file's data. */
  flush(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The low-level primitives the algorithm composes.
 *
 * Every one is a single filesystem syscall's worth of behaviour, so the ordering
 * below is the only place the protocol is expressed.
 */
export interface AtomicWritePrimitives {
  /** Create and open the temp file for writing, failing if it already exists. */
  createTemp(path: string): Promise<TempFileHandle>;
  /** Rename the temp file over the target. The commit point. */
  rename(from: string, to: string): Promise<void>;
  /** fsync the containing directory. Best-effort by contract; see syncDir. */
  syncDir(path: string): Promise<void>;
  /** Remove a file if present. Used only to clean up this operation's own temp. */
  removeFileIfExists(path: string): Promise<void>;
  /** Join a directory and a file name using the implementation's separator. */
  joinPath(dir: string, name: string): string;
  /** The directory portion of a path. */
  dirName(path: string): string;
}

/**
 * Optional stage observer.
 *
 * Called immediately before or after the named step. An implementation may throw
 * to simulate a crash at that exact point. Absent in production: the parameter is
 * optional and the adapter never supplies one, so an unused hook cannot change
 * successful behaviour.
 */
export type AtomicWriteHook = (stage: AtomicWriteStage) => void | Promise<void>;

/**
 * Write `contents` to `path` atomically: temp file → flush → rename → dir sync.
 *
 * Guarantees, per stage, against the persisted state:
 *
 *   * a failure at or before `before-rename` leaves the OLD authoritative file
 *     untouched -- the rename has not happened, so the target is whatever it was;
 *   * a failure at `after-rename` or later leaves the NEW authoritative file in
 *     place -- the rename is the commit point and is never rolled back;
 *   * no stage can produce a partially-written authoritative file, because the
 *     target is only ever replaced by an already-flushed complete temp file.
 *
 * Temp cleanup is scoped to the exact temp path this call created. It never scans
 * or sweeps the directory, so a concurrent writer's temp file (which carries a
 * different operation id and pid) can never be removed by this operation.
 */
export async function performAtomicWrite(
  primitives: AtomicWritePrimitives,
  path: string,
  contents: string,
  tmpName: string,
  hook?: AtomicWriteHook,
): Promise<void> {
  const dir = primitives.dirName(path);
  const tmpPath = primitives.joinPath(dir, tmpName);

  const at = async (stage: AtomicWriteStage): Promise<void> => {
    if (hook !== undefined) await hook(stage);
  };

  await at("before-temp-create");
  const handle = await primitives.createTemp(tmpPath);

  // Everything from here until the rename must clean up its own temp file. The
  // write and the rename are deliberately inside ONE try: a failure anywhere
  // before the rename commits leaves a temp file that nothing else will ever
  // claim, because the name encodes this operation's id and pid. Scoping cleanup
  // to only the rename step would leak that file on every mid-write failure.
  let renamed = false;
  try {
    try {
      await at("after-temp-create");
      // The hook fires between create and write so a fault models a crash with
      // an empty-but-existing temp file, and again after the write for a
      // partially-written one. Those are genuinely different residue states.
      await at("during-temp-write");
      await handle.write(contents);
      await at("after-temp-write");
      await handle.flush();
      await at("after-temp-flush");
    } finally {
      // Close before renaming: Windows refuses to rename a file with an open
      // handle, so the close must not be deferred to the outer finally.
      await handle.close();
    }

    await at("before-rename");
    await primitives.rename(tmpPath, path);
    renamed = true;
    await at("after-rename");
  } finally {
    // Clean up only when the rename did NOT happen. After a successful rename
    // the temp path no longer exists, and removing anything at that path would
    // mean deleting a file some other writer had since created there.
    if (!renamed) {
      await primitives.removeFileIfExists(tmpPath);
    }
  }

  await at("before-directory-sync");
  await primitives.syncDir(dir);
  await at("after-directory-sync");
}
