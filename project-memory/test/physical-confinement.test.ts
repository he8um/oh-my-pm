// G4 -- physical path confinement at the Node write boundary, proven against a
// REAL filesystem with REAL links.
//
// path-safety.test.ts proves the pure path arithmetic: traversal is rejected,
// `isSameOrInside` uses `relative()` rather than a prefix test, and the
// project/data-root separation holds both ways. All of that is lexical. It cannot
// see the filesystem, so it cannot distinguish `<root>/projects` the directory
// from `<root>/projects` the symlink that points at /etc.
//
// This suite proves the filesystem-aware half: every mutating call on the Node
// adapter is validated against the physical layout before it touches disk. The
// links here are created with node:fs symlink/junction against real temporary
// directories -- proving this with MemoryFileSystem would prove nothing, because
// an in-memory map has no physical layer to escape from.

import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import {
  NodeFileSystem,
  nodePhysicalProbe,
  PLATFORM_CASE_INSENSITIVE,
} from "../src/node-adapter.js";
import {
  assertPhysicallyConfined,
  canonicalizeRoot,
  isPhysicallyInside,
} from "../src/physical-confinement.js";

const IS_WINDOWS = process.platform === "win32";

let root: string;
/** The governed store root. */
let storeRoot: string;
/** A directory OUTSIDE the store root; every escape test aims here. */
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "omp-confine-"));
  storeRoot = join(root, "store");
  outside = join(root, "outside");
  await mkdir(storeRoot, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "secret.txt"), "must not be overwritten\n", "utf8");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A guarded adapter: every mutating call is confined below the store root. */
function guarded(): NodeFileSystem {
  return new NodeFileSystem({ governedRoot: storeRoot });
}

/** The canonical store root, as the guard computes it. */
function canonicalRoot(): Promise<string> {
  return canonicalizeRoot(storeRoot, { probe: nodePhysicalProbe });
}

/**
 * The confinement options the guarded adapter uses.
 *
 * `rootAliases` carries the configured (pre-canonical) spelling of the store
 * root. It matters on macOS, where the system temp directory lives under `/var`
 * but canonicalizes to `/private/var`: a symlink created inside the store records
 * its target with the configured spelling, and without the alias that legitimate
 * inside-the-root link would be misread as an escape. Tests that call the
 * confinement functions directly pass the same options the adapter does, so both
 * paths are exercised identically.
 */
function confineOptions() {
  // The pure confinement module performs no I/O and reads no platform, so the
  // probe and the case rule come from the adapter -- exactly what production
  // supplies -- rather than from a test-local imitation.
  return {
    rootAliases: [storeRoot],
    probe: nodePhysicalProbe,
    caseInsensitive: PLATFORM_CASE_INSENSITIVE,
  };
}

/** Assert a promise rejects with the stable sanitized path-escape error. */
async function expectEscape(operation: Promise<unknown>, forbidden: readonly string[] = []) {
  const error = await operation.then(
    () => null,
    (err: unknown) => err as { code?: string; message?: string; recoveryHint?: string },
  );
  expect(error, "expected the operation to be refused").not.toBeNull();
  expect(error?.code).toBe(PROJECT_MEMORY_ERROR_CODES.pathEscape);
  // The public error must never disclose the escaped absolute location.
  const text = `${error?.message ?? ""} ${error?.recoveryHint ?? ""}`;
  for (const secret of [outside, ...forbidden]) {
    expect(text).not.toContain(secret);
  }
  return error;
}

describe("containment arithmetic on canonical paths", () => {
  it("rejects a directory-prefix collision rather than accepting a string prefix", () => {
    // The classic bug: "/data/store-evil".startsWith("/data/store") is true.
    expect(isPhysicallyInside("/data/store", "/data/store-evil", false)).toBe(false);
    expect(isPhysicallyInside("/data/store", "/data/store", false)).toBe(true);
    expect(isPhysicallyInside("/data/store", "/data/store/a/b", false)).toBe(true);
    expect(isPhysicallyInside("/data/store", "/data", false)).toBe(false);
    expect(isPhysicallyInside("/data/store", "/data/other", false)).toBe(false);
  });

  it("rejects traversal that climbs out of the root", () => {
    expect(isPhysicallyInside("/data/store", "/data/store/../store-evil", false)).toBe(false);
    expect(isPhysicallyInside("/data/store", "/data/store/../../etc", false)).toBe(false);
    // Traversal that stays inside is fine once normalized.
    expect(isPhysicallyInside("/data/store", "/data/store/a/../b", false)).toBe(true);
  });

  it("honors case sensitivity explicitly in both directions", () => {
    // Case-insensitive: the same directory reached through a different case is
    // NOT an escape, which is the real behaviour on macOS and Windows.
    expect(isPhysicallyInside("/data/Store", "/data/store/a", true)).toBe(true);
    // Case-sensitive: they are genuinely different directories.
    expect(isPhysicallyInside("/data/Store", "/data/store/a", false)).toBe(false);
    // A prefix collision must stay rejected under case folding too.
    expect(isPhysicallyInside("/data/store", "/data/STORE-evil", true)).toBe(false);
  });
});

describe("ordinary safe paths are accepted", () => {
  it("accepts an existing path inside the store", async () => {
    const target = join(storeRoot, "projects", "abc");
    await mkdir(target, { recursive: true });
    await expect(
      assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()),
    ).resolves.toBeTruthy();
  });

  it("accepts a nonexistent leaf below a safe existing parent", async () => {
    const parent = join(storeRoot, "projects", "abc");
    await mkdir(parent, { recursive: true });
    const leaf = join(parent, "manifest.json");
    await expect(
      assertPhysicallyConfined(await canonicalRoot(), leaf, confineOptions()),
    ).resolves.toBeTruthy();
  });

  it("accepts a deep nonexistent chain below the store root", async () => {
    const deep = join(storeRoot, "a", "b", "c", "d", "manifest.json");
    await expect(
      assertPhysicallyConfined(await canonicalRoot(), deep, confineOptions()),
    ).resolves.toBeTruthy();
  });

  it("accepts the store root itself", async () => {
    const canonical = await canonicalRoot();
    await expect(
      assertPhysicallyConfined(canonical, storeRoot, confineOptions()),
    ).resolves.toBeTruthy();
  });

  it("canonicalizes a root that does not exist yet, through its nearest existing parent", async () => {
    // The store creates its own data root on first commit, so a missing root
    // must canonicalize rather than throw.
    const missing = join(root, "not-created-yet", "data");
    await expect(canonicalizeRoot(missing, { probe: nodePhysicalProbe })).resolves.toContain(
      "not-created-yet",
    );
  });
});

describe("lexical escapes are refused", () => {
  it("refuses `..` traversal out of the store", async () => {
    const escape = join(storeRoot, "..", "outside", "planted.txt");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), escape, confineOptions()));
  });

  it("refuses an absolute path injected outside the store", async () => {
    await expectEscape(
      assertPhysicallyConfined(await canonicalRoot(), join(outside, "x.txt"), confineOptions()),
    );
  });

  it("refuses a sibling whose name merely shares the root's prefix", async () => {
    const collision = `${storeRoot}-evil`;
    await mkdir(collision, { recursive: true });
    await expectEscape(
      assertPhysicallyConfined(await canonicalRoot(), join(collision, "x.txt"), confineOptions()),
      [collision],
    );
  });

  it("refuses a relative path outright", async () => {
    await expect(
      assertPhysicallyConfined(await canonicalRoot(), "relative/path", confineOptions()),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.pathEscape });
  });
});

describe("physical escapes through links are refused", () => {
  it("refuses a LEAF symlink pointing outside the store", async () => {
    const leaf = join(storeRoot, "escape.json");
    await symlink(join(outside, "secret.txt"), leaf);
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), leaf, confineOptions()));
  });

  it("refuses an ANCESTOR symlink pointing outside the store", async () => {
    // `<root>/projects` is a link to a directory outside the store. Every path
    // below it is lexically inside the root and physically outside it.
    await symlink(outside, join(storeRoot, "projects"), "dir");
    const target = join(storeRoot, "projects", "manifest.json");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()));
  });

  it("refuses a NESTED symlink several levels above the target", async () => {
    const deepOutside = join(outside, "deep", "nest");
    await mkdir(deepOutside, { recursive: true });
    await mkdir(join(storeRoot, "a", "b"), { recursive: true });
    await symlink(deepOutside, join(storeRoot, "a", "b", "c"), "dir");
    const target = join(storeRoot, "a", "b", "c", "d", "e", "manifest.json");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()));
  });

  it("refuses a SAFE-LOOKING leaf below an escaped parent", async () => {
    // The leaf name is entirely ordinary; only the parent escapes. This is the
    // case a leaf-only check misses.
    await symlink(outside, join(storeRoot, "projects"), "dir");
    const target = join(storeRoot, "projects", "manifest.json");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()));
  });

  it("refuses a NONEXISTENT leaf below an escaped parent", async () => {
    await symlink(outside, join(storeRoot, "projects"), "dir");
    const target = join(storeRoot, "projects", "does-not-exist-yet.json");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()));
  });

  it("refuses a deep NONEXISTENT chain below an escaped parent", async () => {
    await symlink(outside, join(storeRoot, "projects"), "dir");
    const target = join(storeRoot, "projects", "a", "b", "c", "new.json");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()));
  });

  it("refuses a chain that TRANSITS outside the root even though it lands back inside", async () => {
    // The case that per-ancestor inspection exists for, and that resolving only
    // the final target cannot catch.
    //
    //   <store>/hop      -> <outside>/back   (leaves the root)
    //   <outside>/back   -> <store>/real     (comes back in)
    //
    // `realpath(<store>/hop)` collapses the whole chain to `<store>/real`, which
    // IS inside the root -- so a check that only canonicalizes the target accepts
    // it. But the write travels through a directory outside the governed root,
    // where anything could redirect it, so it must be refused. Only inspecting
    // each ancestor in turn sees the excursion.
    const real = join(storeRoot, "real");
    await mkdir(real, { recursive: true });
    await symlink(real, join(outside, "back"), "dir");
    await symlink(join(outside, "back"), join(storeRoot, "hop"), "dir");

    // Sanity: the collapsed target really does land back inside the root, so this
    // test would pass vacuously if it were asserting the wrong thing.
    const collapsed = await realpath(join(storeRoot, "hop"));
    expect(isPhysicallyInside(await canonicalRoot(), collapsed, PLATFORM_CASE_INSENSITIVE)).toBe(
      true,
    );

    // And yet it is refused, because an ancestor escaped.
    await expectEscape(
      assertPhysicallyConfined(
        await canonicalRoot(),
        join(storeRoot, "hop", "file.json"),
        confineOptions(),
      ),
    );
    await expectEscape(
      guarded().writeFileAtomic(join(storeRoot, "hop", "file.json"), "{}\n", "tmp-hop"),
    );
  });

  it("accepts a symlink that stays INSIDE the store root", async () => {
    // Not every link is an escape. A link whose physical target is inside the
    // governed root is legitimate and must not be rejected.
    const real = join(storeRoot, "real");
    await mkdir(real, { recursive: true });
    await symlink(real, join(storeRoot, "alias"), "dir");
    await expect(
      assertPhysicallyConfined(
        await canonicalRoot(),
        join(storeRoot, "alias", "x.json"),
        confineOptions(),
      ),
    ).resolves.toBeTruthy();
  });

  it("refuses an ancestor REPLACED by an escaping link after being safe", async () => {
    // Unsafe ancestor replacement: the same path is accepted, then swapped for a
    // link, then refused. This is the check that must re-run per write rather
    // than being cached from an earlier verdict.
    const projects = join(storeRoot, "projects");
    await mkdir(projects, { recursive: true });
    const target = join(projects, "manifest.json");
    await expect(
      assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()),
    ).resolves.toBeTruthy();

    await rm(projects, { recursive: true, force: true });
    await symlink(outside, projects, "dir");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()));
  });
});

describe.runIf(IS_WINDOWS)("Windows reparse points", () => {
  it("refuses a JUNCTION pointing outside the store", async () => {
    // A junction is a distinct reparse-point type from a symlink and is the
    // form Windows tooling most often creates. It must not be treated as an
    // ordinary directory.
    await symlink(outside, join(storeRoot, "projects"), "junction");
    const target = join(storeRoot, "projects", "manifest.json");
    await expectEscape(assertPhysicallyConfined(await canonicalRoot(), target, confineOptions()));
  });

  it("refuses a nonexistent leaf below an escaping junction", async () => {
    await symlink(outside, join(storeRoot, "projects"), "junction");
    await expectEscape(
      assertPhysicallyConfined(
        await canonicalRoot(),
        join(storeRoot, "projects", "new.json"),
        confineOptions(),
      ),
    );
  });

  it("refuses a write through an escaping junction at the adapter boundary", async () => {
    await symlink(outside, join(storeRoot, "projects"), "junction");
    await expectEscape(
      guarded().writeFileAtomic(join(storeRoot, "projects", "x.json"), "{}\n", "tmp-x"),
    );
    // The file outside the store was never created.
    await expect(stat(join(outside, "x.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts a case-variant path on a case-insensitive filesystem", async () => {
    // On Windows `STORE` and `store` are the same directory; treating the
    // variant as an escape would break ordinary use.
    const canonical = await canonicalRoot();
    const variant = join(storeRoot.toUpperCase(), "projects");
    await expect(
      assertPhysicallyConfined(canonical, variant, confineOptions()),
    ).resolves.toBeTruthy();
  });
});

describe("case-insensitive filesystems", () => {
  it("treats a case variant of the root as the same directory when folding case", async () => {
    // Pinned explicitly rather than depending on the host filesystem, so the
    // behaviour is asserted identically on all three platforms.
    const canonical = "/data/Store";
    expect(isPhysicallyInside(canonical, "/data/store/projects/a.json", true)).toBe(true);
    expect(isPhysicallyInside(canonical, "/data/store/projects/a.json", false)).toBe(false);
  });

  it("still refuses a prefix collision when folding case", () => {
    expect(isPhysicallyInside("/data/store", "/data/Store-evil/x", true)).toBe(false);
  });
});

describe("the Node write boundary enforces confinement on every mutating call", () => {
  it("refuses writeFileAtomic through an escaped ancestor and writes nothing outside", async () => {
    await symlink(outside, join(storeRoot, "projects"), "dir");
    await expectEscape(
      guarded().writeFileAtomic(join(storeRoot, "projects", "planted.json"), "{}\n", "tmp-1"),
    );
    // Nothing new appeared outside, and the pre-existing file is untouched.
    expect(await readdir(outside)).toEqual(["secret.txt"]);
    expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("must not be overwritten\n");
  });

  it("refuses mkdirp through an escaped ancestor", async () => {
    await symlink(outside, join(storeRoot, "projects"), "dir");
    await expectEscape(guarded().mkdirp(join(storeRoot, "projects", "new-dir")));
    expect(await readdir(outside)).toEqual(["secret.txt"]);
  });

  it("refuses removeDir through an escaped ancestor: no outside tree is deleted", async () => {
    // The most destructive case. A recursive delete through a link would erase a
    // tree the store does not own.
    const victim = join(outside, "victim");
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, "keep.txt"), "keep\n", "utf8");
    await symlink(outside, join(storeRoot, "projects"), "dir");

    await expectEscape(guarded().removeDir(join(storeRoot, "projects", "victim")));
    // Still there, byte-identical.
    expect(await readFile(join(victim, "keep.txt"), "utf8")).toBe("keep\n");
  });

  it("refuses moveFile when either end escapes", async () => {
    await mkdir(join(storeRoot, "inside"), { recursive: true });
    await writeFile(join(storeRoot, "inside", "a.json"), "{}\n", "utf8");
    await symlink(outside, join(storeRoot, "projects"), "dir");

    // Escaping destination.
    await expectEscape(
      guarded().moveFile(
        join(storeRoot, "inside", "a.json"),
        join(storeRoot, "projects", "a.json"),
      ),
    );
    // Escaping source.
    await expectEscape(
      guarded().moveFile(
        join(storeRoot, "projects", "secret.txt"),
        join(storeRoot, "inside", "b.json"),
      ),
    );
    // The source file is still where it was.
    expect(await readFile(join(storeRoot, "inside", "a.json"), "utf8")).toBe("{}\n");
  });

  it("refuses moveDir when either end escapes", async () => {
    await mkdir(join(storeRoot, "inside"), { recursive: true });
    await symlink(outside, join(storeRoot, "projects"), "dir");
    await expectEscape(
      guarded().moveDir(join(storeRoot, "inside"), join(storeRoot, "projects", "moved")),
    );
    expect(await readdir(outside)).toEqual(["secret.txt"]);
  });

  it("refuses createLockExclusive and removeLock through an escaped ancestor", async () => {
    await symlink(outside, join(storeRoot, "locks"), "dir");
    await expectEscape(guarded().createLockExclusive(join(storeRoot, "locks", "a.lock"), "{}\n"));
    await expectEscape(guarded().removeLock(join(storeRoot, "locks", "secret.txt")));
    // The outside file survives: removeLock never reached it.
    expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("must not be overwritten\n");
  });

  it("refuses copyFileTo when the SOURCE escapes the store", async () => {
    await symlink(outside, join(storeRoot, "projects"), "dir");
    const destination = join(root, "export-target", "copy.txt");
    await expectEscape(
      guarded().copyFileTo(join(storeRoot, "projects", "secret.txt"), destination),
    );
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("allows an ordinary guarded write inside the store", async () => {
    const fs = guarded();
    await fs.mkdirp(join(storeRoot, "projects", "abc"));
    await fs.writeFileAtomic(join(storeRoot, "projects", "abc", "m.json"), "{}\n", "tmp-ok");
    expect(await readFile(join(storeRoot, "projects", "abc", "m.json"), "utf8")).toBe("{}\n");
  });

  it("preserves SHA-derived managed paths", async () => {
    // A 64-char lowercase hex key is the managed directory name. Confinement must
    // not mangle or reject it.
    const key = "a".repeat(64);
    const fs = guarded();
    await fs.mkdirp(join(storeRoot, "project-brain", "v1", "projects", key));
    await fs.writeFileAtomic(
      join(storeRoot, "project-brain", "v1", "projects", key, "manifest.json"),
      "{}\n",
      "tmp-sha",
    );
    const written = await readFile(
      join(storeRoot, "project-brain", "v1", "projects", key, "manifest.json"),
      "utf8",
    );
    expect(written).toBe("{}\n");
  });
});

describe("read and write are asymmetric by design", () => {
  it("a read through a leaf symlink returns null while a write is refused", async () => {
    const fs = guarded();
    const leaf = join(storeRoot, "aliased.json");
    await symlink(join(outside, "secret.txt"), leaf);

    // The read path refuses to FOLLOW the link -- it returns null rather than the
    // outside file's contents, so nothing leaks.
    expect(await fs.readFileIfExists(leaf)).toBeNull();
    // The write path refuses outright, because a write would modify a file
    // outside the governed root.
    await expectEscape(fs.writeFileAtomic(leaf, "{}\n", "tmp-asym"));
    // The outside file is unchanged either way.
    expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("must not be overwritten\n");
  });
});

describe("errors are stable and disclose nothing", () => {
  it("every rejection reason produces the identical sanitized message", async () => {
    await symlink(outside, join(storeRoot, "projects"), "dir");
    const canonical = await canonicalRoot();
    // Thunks, not already-invoked promises. Every one of these rejects, and a
    // rejection that is not awaited in the same turn is reported as an unhandled
    // rejection -- which fails the run even though each assertion passes. Each
    // call is therefore created and awaited together.
    const reasons: readonly (() => Promise<unknown>)[] = [
      () =>
        assertPhysicallyConfined(
          canonical,
          join(storeRoot, "..", "outside", "a.txt"),
          confineOptions(),
        ),
      () => assertPhysicallyConfined(canonical, join(outside, "a.txt"), confineOptions()),
      () =>
        assertPhysicallyConfined(canonical, join(storeRoot, "projects", "a.txt"), confineOptions()),
      () =>
        assertPhysicallyConfined(
          canonical,
          join(storeRoot, "projects", "missing.txt"),
          confineOptions(),
        ),
    ];
    const messages = new Set<string>();
    for (const reason of reasons) {
      const error = await expectEscape(reason());
      messages.add(String(error?.message));
    }
    // One message for every reason: a caller cannot distinguish "escaped via
    // link" from "escaped via traversal", and so cannot probe the layout.
    expect(messages.size).toBe(1);
  });

  it("no error message contains the escaped absolute path or the store root", async () => {
    await symlink(outside, join(storeRoot, "projects"), "dir");
    const error = await expectEscape(
      guarded().writeFileAtomic(join(storeRoot, "projects", "x.json"), "{}\n", "tmp-x"),
      [storeRoot, root],
    );
    expect(error?.message).toBeTruthy();
  });
});
