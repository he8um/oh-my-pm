// Tests for the explicit Node read-only CLI boundary. Temporary directories
// are created and removed only inside these tests; the loader under test must
// never mutate anything.

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
  loadMarkdownProjectDocuments,
} from "../src/index.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-docs-"));
  roots.push(root);
  return root;
}

function writeDoc(root: string, relativePath: string, content: string): void {
  const target = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

type TreeSnapshot = Map<string, { size: number; mtimeMs: number; content: string | null }>;

function snapshotTree(root: string): TreeSnapshot {
  const snapshot: TreeSnapshot = new Map();
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = prefix === "" ? name : `${prefix}/${name}`;
      const stat = statSync(abs, { throwIfNoEntry: true });
      if (stat.isDirectory()) {
        snapshot.set(rel, { size: 0, mtimeMs: 0, content: null });
        walk(abs, rel);
      } else {
        snapshot.set(rel, {
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          content: readFileSync(abs, "utf8"),
        });
      }
    }
  };
  walk(root, "");
  return snapshot;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("markdown project document loader", () => {
  it("exposes deterministic default limits", () => {
    expect(DEFAULT_PROJECT_DOCUMENT_MAX_FILES).toBe(200);
    expect(DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE).toBe(256 * 1024);
    expect(DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES).toBe(2 * 1024 * 1024);
  });

  it("loads .md and .markdown files with case-insensitive extensions", () => {
    const root = makeRoot();
    writeDoc(root, "a.md", "# A\n");
    writeDoc(root, "b.markdown", "# B\n");
    writeDoc(root, "c.MD", "# C\n");
    writeDoc(root, "d.Markdown", "# D\n");
    writeDoc(root, "e.txt", "not markdown\n");

    const result = loadMarkdownProjectDocuments(root);
    expect(result.ok).toBe(true);
    expect(result.filesLoaded).toBe(4);
    expect(result.items.map((item) => item.id)).toEqual([
      "a.md",
      "b.markdown",
      "c.MD",
      "d.Markdown",
    ]);
  });

  it("loads nested documents with relative POSIX ids sorted deterministically", () => {
    const root = makeRoot();
    writeDoc(root, "docs/status.md", "# Status\n");
    writeDoc(root, "docs/plans/spring.md", "# Spring\n");
    writeDoc(root, "README.md", "# Readme\n");

    const result = loadMarkdownProjectDocuments(root);
    expect(result.items.map((item) => item.id)).toEqual([
      "README.md",
      "docs/plans/spring.md",
      "docs/status.md",
    ]);
    for (const item of result.items) {
      expect(item.type).toBe("document");
      expect(item.data?.["path"]).toBe(item.id);
      expect(item.id).not.toContain("\\");
      expect(item.url).toBeUndefined();
    }
  });

  it("extracts the first markdown H1 as the title", () => {
    const root = makeRoot();
    writeDoc(root, "with-h1.md", "intro line\n\n## Section\n\n# The Real Title\ntext\n");
    writeDoc(root, "spaced.md", "#    Trimmed Title   \n");

    const result = loadMarkdownProjectDocuments(root);
    expect(result.items.map((item) => item.title)).toEqual(["Trimmed Title", "The Real Title"]);
  });

  it("falls back to the file name without extension when no H1 exists", () => {
    const root = makeRoot();
    writeDoc(root, "docs/release-notes.md", "no heading here\n## only a subheading\n");
    writeDoc(root, "empty.markdown", "");

    const result = loadMarkdownProjectDocuments(root);
    expect(result.items.map((item) => item.title)).toEqual(["release-notes", "empty"]);
  });

  it("reports utf-8 byte counts and totals", () => {
    const root = makeRoot();
    const content = "# Café\n";
    writeDoc(root, "cafe.md", content);

    const result = loadMarkdownProjectDocuments(root);
    const bytes = Buffer.byteLength(content, "utf8");
    expect(bytes).toBeGreaterThan(content.length - 1);
    expect(result.items[0]?.data?.["bytes"]).toBe(bytes);
    expect(result.items[0]?.data?.["content"]).toBe(content);
    expect(result.totalBytes).toBe(bytes);
  });

  it("ignores excluded directories anywhere in the tree", () => {
    const root = makeRoot();
    writeDoc(root, "keep.md", "# Keep\n");
    for (const dir of [
      ".git",
      ".hg",
      ".svn",
      "node_modules",
      "dist",
      "build",
      "coverage",
      "target",
      ".next",
      ".turbo",
      ".cache",
    ]) {
      writeDoc(root, `${dir}/skip.md`, "# Skip\n");
      writeDoc(root, `nested/${dir}/skip.md`, "# Skip\n");
    }

    const result = loadMarkdownProjectDocuments(root);
    expect(result.items.map((item) => item.id)).toEqual(["keep.md"]);
    expect(result.filesScanned).toBe(1);
  });

  it("does not follow symbolic links or traverse outside the root", () => {
    const outside = makeRoot();
    writeDoc(outside, "secret.md", "# Outside\n");
    const root = makeRoot();
    writeDoc(root, "inside.md", "# Inside\n");
    symlinkSync(join(outside, "secret.md"), join(root, "linked-file.md"));
    symlinkSync(outside, join(root, "linked-dir"));

    const result = loadMarkdownProjectDocuments(root);
    expect(result.items.map((item) => item.id)).toEqual(["inside.md"]);
    expect(JSON.stringify(result.items)).not.toContain("Outside");
  });

  it("skips oversized files with a warning", () => {
    const root = makeRoot();
    writeDoc(root, "big.md", `# Big\n${"x".repeat(64)}\n`);
    writeDoc(root, "small.md", "# Small\n");

    const result = loadMarkdownProjectDocuments(root, { maxBytesPerFile: 32 });
    expect(result.items.map((item) => item.id)).toEqual(["small.md"]);
    expect(result.filesScanned).toBe(2);
    expect(result.warnings).toEqual([
      { code: "project_document_skipped_too_large", path: "big.md" },
    ]);
  });

  it("applies the max file count deterministically", () => {
    const root = makeRoot();
    writeDoc(root, "a.md", "# A\n");
    writeDoc(root, "b.md", "# B\n");
    writeDoc(root, "c.md", "# C\n");

    const result = loadMarkdownProjectDocuments(root, { maxFiles: 2 });
    expect(result.items.map((item) => item.id)).toEqual(["a.md", "b.md"]);
    expect(result.filesLoaded).toBe(2);
    expect(result.warnings).toEqual([
      { code: "project_document_total_limit_reached", path: "c.md" },
    ]);
  });

  it("applies the total byte limit deterministically", () => {
    const root = makeRoot();
    writeDoc(root, "a.md", "# A\n");
    writeDoc(root, "b.md", "# B\n");
    const firstBytes = Buffer.byteLength("# A\n", "utf8");

    const result = loadMarkdownProjectDocuments(root, { maxTotalBytes: firstBytes });
    expect(result.items.map((item) => item.id)).toEqual(["a.md"]);
    expect(result.totalBytes).toBe(firstBytes);
    expect(result.warnings).toEqual([
      { code: "project_document_total_limit_reached", path: "b.md" },
    ]);
  });

  it("returns a structured failure for a missing root", () => {
    const root = join(makeRoot(), "does-not-exist");
    const result = loadMarkdownProjectDocuments(root);
    expect(result).toEqual({
      ok: false,
      root,
      items: [],
      filesScanned: 0,
      filesMatched: 0,
      filesExcluded: 0,
      filesLoaded: 0,
      totalBytes: 0,
      warnings: [{ code: "project_root_not_found", path: root }],
    });
  });

  it("returns a structured failure when the root is not a directory", () => {
    const base = makeRoot();
    const filePath = join(base, "file.md");
    writeFileSync(filePath, "# Not a directory\n", "utf8");
    const result = loadMarkdownProjectDocuments(filePath);
    expect(result.ok).toBe(false);
    expect(result.warnings).toEqual([
      { code: "project_root_not_directory", path: filePath },
    ]);
  });

  it("warns for an unreadable file where platform behavior permits", () => {
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      return; // root can read anything; the permission bit has no effect
    }
    const root = makeRoot();
    writeDoc(root, "open.md", "# Open\n");
    writeDoc(root, "locked.md", "# Locked\n");
    chmodSync(join(root, "locked.md"), 0o000);
    try {
      const result = loadMarkdownProjectDocuments(root);
      expect(result.ok).toBe(true);
      expect(result.items.map((item) => item.id)).toEqual(["open.md"]);
      expect(result.warnings).toEqual([
        { code: "project_document_read_failed", path: "locked.md" },
      ]);
    } finally {
      chmodSync(join(root, "locked.md"), 0o644);
    }
  });

  it("keeps default behavior identical when no include/exclude options are given", () => {
    const root = makeRoot();
    writeDoc(root, "a.md", "# A\n");
    writeDoc(root, "docs/b.markdown", "# B\n");

    const result = loadMarkdownProjectDocuments(root);
    expect(result.items.map((item) => item.id)).toEqual(["a.md", "docs/b.markdown"]);
    expect(result.filesScanned).toBe(2);
    expect(result.filesMatched).toBe(2);
    expect(result.filesExcluded).toBe(0);
    expect(result.filesLoaded).toBe(2);
  });

  it("accepts files matching a custom include and rejects nonmatching ones", () => {
    const root = makeRoot();
    writeDoc(root, "README.md", "# Readme\n");
    writeDoc(root, "docs/status.md", "# Status\n");
    writeDoc(root, "notes/scratch.md", "# Scratch\n");

    const result = loadMarkdownProjectDocuments(root, {
      include: ["README.md", "docs/**/*.md"],
    });
    expect(result.items.map((item) => item.id)).toEqual(["README.md", "docs/status.md"]);
    expect(result.filesScanned).toBe(3);
    expect(result.filesMatched).toBe(2);
    expect(result.filesExcluded).toBe(1);
    expect(result.filesLoaded).toBe(2);
  });

  it("lets exclude win over include and never reads excluded files", () => {
    const root = makeRoot();
    writeDoc(root, "docs/status.md", "# Status\n");
    writeDoc(root, "docs/archive/old.md", "# Archived ARCHIVED-SENTINEL\n");

    const result = loadMarkdownProjectDocuments(root, {
      include: ["docs/**/*.md"],
      exclude: ["docs/archive/**"],
    });
    expect(result.items.map((item) => item.id)).toEqual(["docs/status.md"]);
    expect(result.filesScanned).toBe(2);
    expect(result.filesMatched).toBe(1);
    expect(result.filesExcluded).toBe(1);
    expect(JSON.stringify(result.items)).not.toContain("ARCHIVED-SENTINEL");
  });

  it("does not count excluded files toward the max file limit", () => {
    const root = makeRoot();
    writeDoc(root, "docs/a.md", "# A\n");
    writeDoc(root, "docs/archive/x.md", "# X\n");
    writeDoc(root, "docs/archive/y.md", "# Y\n");
    writeDoc(root, "docs/b.md", "# B\n");

    const result = loadMarkdownProjectDocuments(root, {
      include: ["docs/**/*.md"],
      exclude: ["docs/archive/**"],
      maxFiles: 2,
    });
    // Only the two non-archived files matter; both fit under the limit.
    expect(result.items.map((item) => item.id)).toEqual(["docs/a.md", "docs/b.md"]);
    expect(result.filesMatched).toBe(2);
    expect(result.filesLoaded).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it("cannot re-enable hard ignored directories via include rules", () => {
    const root = makeRoot();
    writeDoc(root, "keep.md", "# Keep\n");
    writeDoc(root, "node_modules/pkg/readme.md", "# Dep\n");

    const result = loadMarkdownProjectDocuments(root, { include: ["**/*.md"] });
    expect(result.items.map((item) => item.id)).toEqual(["keep.md"]);
    expect(result.filesScanned).toBe(1);
  });

  it("keeps symlinks ignored even with a broad include rule", () => {
    const outside = makeRoot();
    writeDoc(outside, "secret.md", "# Outside\n");
    const root = makeRoot();
    writeDoc(root, "inside.md", "# Inside\n");
    symlinkSync(join(outside, "secret.md"), join(root, "linked.md"));

    const result = loadMarkdownProjectDocuments(root, { include: ["**/*.md"] });
    expect(result.items.map((item) => item.id)).toEqual(["inside.md"]);
  });

  it("applies lower configured limits", () => {
    const root = makeRoot();
    writeDoc(root, "docs/a.md", "# A\n");
    writeDoc(root, "docs/b.md", "# B\n");
    writeDoc(root, "docs/c.md", "# C\n");

    const result = loadMarkdownProjectDocuments(root, {
      include: ["docs/**/*.md"],
      maxFiles: 2,
    });
    expect(result.items.map((item) => item.id)).toEqual(["docs/a.md", "docs/b.md"]);
    expect(result.filesLoaded).toBe(2);
  });

  it("orders filtered results deterministically", () => {
    const root = makeRoot();
    writeDoc(root, "docs/z.md", "# Z\n");
    writeDoc(root, "docs/a.md", "# A\n");
    writeDoc(root, "docs/m.md", "# M\n");

    const result = loadMarkdownProjectDocuments(root, { include: ["docs/**/*.md"] });
    expect(result.items.map((item) => item.id)).toEqual(["docs/a.md", "docs/m.md", "docs/z.md"]);
  });

  it("never mutates the project tree", () => {
    const root = makeRoot();
    writeDoc(root, "README.md", "# Readme\n");
    writeDoc(root, "docs/status.md", "# Status\n");
    const before = snapshotTree(root);

    const result = loadMarkdownProjectDocuments(root);
    expect(result.ok).toBe(true);

    const after = snapshotTree(root);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [path, entry] of before) {
      expect(after.get(path)).toEqual(entry);
    }
  });
});
