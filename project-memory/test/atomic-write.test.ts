// Fault injection inside the atomic write.
//
// These tests drive `performAtomicWrite` -- the exact sequence the Node adapter
// runs -- with deterministic primitives and a hook that throws at one named
// stage. Because production and these tests share the ordering logic, a test
// cannot pass against an imitation whose steps differ from the real thing.
//
// The property under test at every stage is the same: the authoritative file is
// either its OLD complete value or its NEW complete value, never a partial or
// mixed one, and a retry against the same persisted state converges.
//
// What these tests do NOT prove: real power-loss durability. Injecting a failure
// establishes which states the algorithm can reach and whether recovery works.
// Whether a flushed byte truly survives an unplanned reboot is a property of the
// platform's fsync implementation and cannot be demonstrated by a simulated
// filesystem on any operating system.

import { describe, expect, it } from "vitest";

import { ATOMIC_WRITE_STAGES, performAtomicWrite } from "../src/atomic-write.js";
import type {
  AtomicWritePrimitives,
  AtomicWriteStage,
  TempFileHandle,
} from "../src/atomic-write.js";

const TARGET = "/store/manifest.json";
const TMP = "manifest.json.op-1.4242.tmp";
const TMP_PATH = "/store/manifest.json.op-1.4242.tmp";
const OLD = '{"version":1,"value":"old"}';
const NEW = '{"version":2,"value":"new"}';

/**
 * A deterministic filesystem just large enough to run the real algorithm.
 *
 * Records every primitive call in order, so a test can assert on the SEQUENCE
 * (flush before rename, sync after rename) and not merely the end state.
 */
class FaultFs implements AtomicWritePrimitives {
  readonly files = new Map<string, string>();
  readonly calls: string[] = [];
  syncedDirs: string[] = [];
  /** When set, model a write that lands only this many characters. */
  partialWriteLimit: number | undefined;

  constructor(initial?: Record<string, string>) {
    for (const [path, contents] of Object.entries(initial ?? {})) {
      this.files.set(path, contents);
    }
  }

  async createTemp(path: string): Promise<TempFileHandle> {
    this.calls.push(`createTemp:${path}`);
    // Creating the temp file makes it exist immediately and empty, exactly as
    // open(path,"w") does.
    this.files.set(path, "");
    const limit = this.partialWriteLimit;
    return {
      write: async (chunk: string) => {
        this.calls.push("write");
        this.files.set(path, limit === undefined ? chunk : chunk.slice(0, limit));
      },
      flush: async () => {
        this.calls.push("flush");
      },
      close: async () => {
        this.calls.push("close");
      },
    };
  }

  async rename(from: string, to: string): Promise<void> {
    this.calls.push(`rename:${from}->${to}`);
    const contents = this.files.get(from);
    if (contents === undefined) throw new Error(`ENOENT ${from}`);
    this.files.delete(from);
    this.files.set(to, contents);
  }

  async syncDir(path: string): Promise<void> {
    this.calls.push(`syncDir:${path}`);
    this.syncedDirs.push(path);
  }

  async removeFileIfExists(path: string): Promise<void> {
    this.calls.push(`remove:${path}`);
    this.files.delete(path);
  }

  joinPath(dir: string, name: string): string {
    return `${dir}/${name}`;
  }

  dirName(path: string): string {
    const index = path.lastIndexOf("/");
    return index <= 0 ? "/" : path.slice(0, index);
  }
}

/** A hook that throws once at `stage`, tagged so the test can identify it. */
function failAt(stage: AtomicWriteStage) {
  return (current: AtomicWriteStage) => {
    if (current === stage) throw new Error(`injected:${stage}`);
  };
}

/** Stages that occur strictly before the rename commits. */
const PRE_COMMIT: AtomicWriteStage[] = [
  "before-temp-create",
  "after-temp-create",
  "during-temp-write",
  "after-temp-write",
  "after-temp-flush",
  "before-rename",
];

/** Stages that occur once the rename has already committed. */
const POST_COMMIT: AtomicWriteStage[] = [
  "after-rename",
  "before-directory-sync",
  "after-directory-sync",
];

describe("the successful path", () => {
  it("flushes before renaming and syncs the directory after", async () => {
    const fs = new FaultFs({ [TARGET]: OLD });
    await performAtomicWrite(fs, TARGET, NEW, TMP);

    expect(fs.files.get(TARGET)).toBe(NEW);
    expect(fs.files.has(TMP_PATH)).toBe(false);

    // The ordering IS the guarantee: a rename before the flush could commit
    // unflushed bytes, and a directory sync before the rename would sync the
    // wrong state.
    const flush = fs.calls.indexOf("flush");
    const rename = fs.calls.findIndex((c) => c.startsWith("rename:"));
    const sync = fs.calls.findIndex((c) => c.startsWith("syncDir:"));
    expect(flush).toBeGreaterThanOrEqual(0);
    expect(flush).toBeLessThan(rename);
    expect(rename).toBeLessThan(sync);
  });

  it("never sweeps the directory: cleanup names only its own temp file", async () => {
    // A broad cleanup would delete a concurrent writer's temp file. The only
    // removal this algorithm may perform is of the exact path it created.
    const fs = new FaultFs({ [TARGET]: OLD, "/store/other.op-2.9999.tmp": "someone else" });
    await performAtomicWrite(fs, TARGET, NEW, TMP);
    expect(fs.files.get("/store/other.op-2.9999.tmp")).toBe("someone else");
    expect(fs.calls.filter((c) => c.startsWith("remove:"))).toEqual([]);
  });

  it("declares every stage exactly once, in order", async () => {
    const seen: AtomicWriteStage[] = [];
    const fs = new FaultFs({ [TARGET]: OLD });
    await performAtomicWrite(fs, TARGET, NEW, TMP, (stage) => {
      seen.push(stage);
    });
    expect(seen).toEqual([...ATOMIC_WRITE_STAGES]);
  });
});

describe("failure before the rename leaves the old state authoritative", () => {
  for (const stage of PRE_COMMIT) {
    it(`${stage}: target keeps its old complete value`, async () => {
      const fs = new FaultFs({ [TARGET]: OLD });
      await expect(performAtomicWrite(fs, TARGET, NEW, TMP, failAt(stage))).rejects.toThrow(
        `injected:${stage}`,
      );

      // The authoritative file is untouched and still complete.
      expect(fs.files.get(TARGET)).toBe(OLD);

      // Temp residue is cleaned by the failure path, so a pre-commit crash
      // leaves nothing behind for this operation.
      expect(fs.files.has(TMP_PATH)).toBe(false);

      // The directory was never synced, because the commit never happened.
      expect(fs.syncedDirs).toEqual([]);

      // Retry against the SAME persisted state succeeds and converges.
      await performAtomicWrite(fs, TARGET, NEW, TMP);
      expect(fs.files.get(TARGET)).toBe(NEW);
      expect(fs.files.has(TMP_PATH)).toBe(false);
    });
  }

  it("a partially written temp file never becomes authoritative", async () => {
    // The distinct case the audit called out: a failure AFTER some bytes landed
    // is not the same as one before any did.
    const fs = new FaultFs({ [TARGET]: OLD });
    fs.partialWriteLimit = 5;
    await expect(
      performAtomicWrite(fs, TARGET, NEW, TMP, failAt("after-temp-write")),
    ).rejects.toThrow("injected:after-temp-write");

    // The target never saw the truncated bytes.
    expect(fs.files.get(TARGET)).toBe(OLD);
    expect(fs.files.has(TMP_PATH)).toBe(false);

    // A clean retry replaces the target with the whole value.
    fs.partialWriteLimit = undefined;
    await performAtomicWrite(fs, TARGET, NEW, TMP);
    expect(fs.files.get(TARGET)).toBe(NEW);
  });

  it("a complete flushed temp file is still not authoritative until renamed", async () => {
    // At after-temp-flush the new content exists in full, but the reader must
    // still see the old value: visibility belongs to the rename alone.
    const observed: string[] = [];
    const fs = new FaultFs({ [TARGET]: OLD });
    await expect(
      performAtomicWrite(fs, TARGET, NEW, TMP, (stage) => {
        if (stage === "after-temp-flush") {
          observed.push(fs.files.get(TMP_PATH) ?? "<missing>");
          observed.push(fs.files.get(TARGET) ?? "<missing>");
          throw new Error("injected:after-temp-flush");
        }
      }),
    ).rejects.toThrow();
    expect(observed).toEqual([NEW, OLD]);
  });

  it("writes a new file without clobbering anything when the target is absent", async () => {
    const fs = new FaultFs();
    await expect(
      performAtomicWrite(fs, TARGET, NEW, TMP, failAt("before-rename")),
    ).rejects.toThrow();
    expect(fs.files.has(TARGET)).toBe(false);
    await performAtomicWrite(fs, TARGET, NEW, TMP);
    expect(fs.files.get(TARGET)).toBe(NEW);
  });
});

describe("failure at or after the rename leaves the new state authoritative", () => {
  for (const stage of POST_COMMIT) {
    it(`${stage}: target holds the new complete value and never rolls back`, async () => {
      const fs = new FaultFs({ [TARGET]: OLD });
      await expect(performAtomicWrite(fs, TARGET, NEW, TMP, failAt(stage))).rejects.toThrow(
        `injected:${stage}`,
      );

      // The rename is the commit point: it is never undone by a later failure.
      expect(fs.files.get(TARGET)).toBe(NEW);

      // The temp path is gone because the rename consumed it -- and crucially the
      // failure path did NOT remove anything at that path afterwards, which would
      // have deleted a file another writer might have created there.
      expect(fs.files.has(TMP_PATH)).toBe(false);
      expect(fs.calls.filter((c) => c === `remove:${TMP_PATH}`)).toEqual([]);

      // Retry is idempotent: the value is already correct and stays correct.
      await performAtomicWrite(fs, TARGET, NEW, TMP);
      expect(fs.files.get(TARGET)).toBe(NEW);
      expect(fs.files.has(TMP_PATH)).toBe(false);
    });
  }

  it("a failed directory sync reports failure without discarding the commit", async () => {
    // The distinction this release documents:
    //   logical commit visibility != confirmed crash durability.
    // The rename already made the new content visible, so the file must NOT be
    // reverted. The call still fails, because durability could not be confirmed.
    const fs = new FaultFs({ [TARGET]: OLD });
    await expect(
      performAtomicWrite(fs, TARGET, NEW, TMP, failAt("before-directory-sync")),
    ).rejects.toThrow();

    expect(fs.files.get(TARGET)).toBe(NEW);
    expect(fs.syncedDirs).toEqual([]);

    // A retry both reconciles the visible state and completes the sync.
    await performAtomicWrite(fs, TARGET, NEW, TMP);
    expect(fs.files.get(TARGET)).toBe(NEW);
    expect(fs.syncedDirs).toEqual(["/store"]);
  });
});

describe("the stage vocabulary stays exhaustive", () => {
  it("covers every declared stage in one of the two commit classes", () => {
    // A new stage added to the algorithm without a test class would otherwise
    // slip through untested.
    expect([...PRE_COMMIT, ...POST_COMMIT].sort()).toEqual([...ATOMIC_WRITE_STAGES].sort());
  });
});
