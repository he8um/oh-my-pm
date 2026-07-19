import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OWNERSHIP_MARKER_FILENAME,
  WORKSPACE_PREFIX,
  assertSafeOwnedWorkspace,
  cleanupSafeTempWorkspace,
  createSafeTempWorkspace,
  validateCleanupTarget,
  withSafeTempWorkspace,
} from "./safe-temp-workspace.mjs";

// Extra directories the tests themselves create for negative cases; cleaned up
// via the helper or an exact rmSync of a tracked mkdtemp root (never a parent).
const strays = [];
afterEach(() => {
  for (const dir of strays.splice(0)) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});
function track(dir) {
  strays.push(dir);
  return dir;
}

describe("createSafeTempWorkspace", () => {
  it("creates a uniquely prefixed workspace with an ownership marker", () => {
    const ws = createSafeTempWorkspace();
    try {
      expect(existsSync(ws.root)).toBe(true);
      expect(ws.root.split(/[\\/]/).pop()?.startsWith(WORKSPACE_PREFIX)).toBe(true);
      const marker = JSON.parse(readFileSync(ws.ownershipFile, "utf8"));
      expect(marker).toMatchObject({ schemaVersion: 1, product: "oh-my-pm", purpose: "test-workspace" });
      expect(typeof marker.ownershipToken).toBe("string");
      expect(marker.ownershipToken).toBe(ws.ownershipToken);
    } finally {
      ws.cleanup();
    }
  });

  it("rejects a prefix that does not start with the approved prefix", () => {
    expect(() => createSafeTempWorkspace({ prefix: "evil-" })).toThrow();
  });
});

describe("cleanupSafeTempWorkspace", () => {
  it("deletes only the exact workspace root and is idempotent", () => {
    const ws = createSafeTempWorkspace();
    const parent = dirname(ws.root);
    cleanupSafeTempWorkspace(ws);
    expect(existsSync(ws.root)).toBe(false);
    // Parent (the shared temp root) remains.
    expect(existsSync(parent)).toBe(true);
    // Second cleanup is a no-op.
    expect(() => cleanupSafeTempWorkspace(ws)).not.toThrow();
  });

  it("cannot delete an unrelated sentinel outside the workspace", () => {
    const sentinelRoot = track(mkdtempSync(join(tmpdir(), `${WORKSPACE_PREFIX}sentinel-`)));
    const sentinelFile = join(sentinelRoot, "keep.txt");
    writeFileSync(sentinelFile, "keep", "utf8");
    const ws = createSafeTempWorkspace();
    ws.cleanup();
    // A different owned-looking dir is untouched by the first workspace cleanup.
    expect(existsSync(sentinelFile)).toBe(true);
  });

  it("concurrent workspaces cannot clean one another", () => {
    const a = createSafeTempWorkspace();
    const b = createSafeTempWorkspace();
    try {
      // Using a's token against b's root must be refused (token mismatch).
      expect(() =>
        cleanupSafeTempWorkspace({ root: b.root, ownershipToken: a.ownershipToken }),
      ).toThrow(/temp_cleanup_unowned/);
      expect(existsSync(b.root)).toBe(true);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });

  it("rejects a mismatched token, missing marker, and modified marker", () => {
    const ws = createSafeTempWorkspace();
    try {
      expect(() => cleanupSafeTempWorkspace({ root: ws.root, ownershipToken: "wrong" })).toThrow(
        /temp_cleanup_unowned/,
      );
      // Modified marker.
      writeFileSync(ws.ownershipFile, JSON.stringify({ schemaVersion: 1, product: "x" }), "utf8");
      expect(() => cleanupSafeTempWorkspace(ws)).toThrow(/temp_cleanup_marker_invalid/);
    } finally {
      rmSync(ws.root, { recursive: true, force: true });
    }
  });

  it("rejects a missing ownership marker", () => {
    const ws = createSafeTempWorkspace();
    try {
      rmSync(ws.ownershipFile, { force: true });
      expect(() => cleanupSafeTempWorkspace(ws)).toThrow(/temp_cleanup_marker_invalid/);
    } finally {
      rmSync(ws.root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked ownership marker", () => {
    const ws = createSafeTempWorkspace();
    try {
      const realTarget = track(mkdtempSync(join(tmpdir(), `${WORKSPACE_PREFIX}linktarget-`)));
      const fakeMarker = join(realTarget, "marker.json");
      writeFileSync(fakeMarker, JSON.stringify({ schemaVersion: 1, product: "oh-my-pm", purpose: "test-workspace", ownershipToken: ws.ownershipToken }), "utf8");
      rmSync(ws.ownershipFile, { force: true });
      symlinkSync(fakeMarker, ws.ownershipFile);
      expect(() => cleanupSafeTempWorkspace(ws)).toThrow(/temp_cleanup_symlink/);
    } finally {
      rmSync(ws.root, { recursive: true, force: true });
    }
  });
});

describe("validateCleanupTarget — dangerous paths are rejected without deleting", () => {
  it("rejects empty and dot paths", () => {
    expect(validateCleanupTarget("").code).toBe("temp_cleanup_empty");
    expect(validateCleanupTarget("   ").code).toBe("temp_cleanup_empty");
    expect(validateCleanupTarget(".").code).toBe("temp_cleanup_cwd");
    expect(validateCleanupTarget("..").code).toBe("temp_cleanup_cwd");
  });

  it("rejects the filesystem root", () => {
    expect(validateCleanupTarget(parse(process.cwd()).root).code).toBe("temp_cleanup_root");
  });

  it("rejects the shared temp root", () => {
    expect(validateCleanupTarget(tmpdir()).code).toBe("temp_cleanup_shared_temp");
  });

  it("rejects the home directory", () => {
    expect(validateCleanupTarget(homedir()).code).toBe("temp_cleanup_home");
  });

  it("rejects the current working directory", () => {
    expect(validateCleanupTarget(process.cwd()).code).toBe("temp_cleanup_cwd");
  });

  it("rejects the repository root when supplied", () => {
    const repoRoot = join(dirname(new URL(import.meta.url).pathname), "..", "..");
    const r = validateCleanupTarget(repoRoot, { repositoryRoot: repoRoot });
    expect(r.code).toBe("temp_cleanup_repository");
  });

  it("rejects a path outside the temp root", () => {
    expect(validateCleanupTarget(join(homedir(), "oh-my-pm-test-x")).code).toBe(
      "temp_cleanup_outside_temp",
    );
  });

  it("rejects a temp child without the approved prefix", () => {
    const dir = track(mkdtempSync(join(tmpdir(), "unrelated-")));
    expect(validateCleanupTarget(dir).code).toBe("temp_cleanup_outside_temp");
  });

  it("rejects a nested (non-direct-child) temp path", () => {
    const ws = createSafeTempWorkspace();
    try {
      const nested = join(ws.root, "nested");
      expect(validateCleanupTarget(nested).code).toBe("temp_cleanup_outside_temp");
    } finally {
      ws.cleanup();
    }
  });

  it("rejects the workspace parent (the shared temp root)", () => {
    const ws = createSafeTempWorkspace();
    try {
      expect(validateCleanupTarget(dirname(ws.root)).code).toBe("temp_cleanup_shared_temp");
    } finally {
      ws.cleanup();
    }
  });

  it("rejects a symlinked root", () => {
    const realDir = track(mkdtempSync(join(tmpdir(), `${WORKSPACE_PREFIX}real-`)));
    const linkPath = join(tmpdir(), `${WORKSPACE_PREFIX}link-${process.pid}-${Date.now()}`);
    try {
      symlinkSync(realDir, linkPath);
      expect(validateCleanupTarget(linkPath).code).toBe("temp_cleanup_symlink");
    } finally {
      if (existsSync(linkPath)) rmSync(linkPath, { force: true });
    }
  });

  it("treats a missing owned-shaped path as a safe no-op", () => {
    const missing = join(tmpdir(), `${WORKSPACE_PREFIX}missing-${process.pid}-${Date.now()}`);
    const r = validateCleanupTarget(missing);
    expect(r.ok).toBe(true);
    expect(r.exists).toBe(false);
  });
});

describe("withSafeTempWorkspace", () => {
  it("cleans the owned workspace after success", async () => {
    let capturedRoot;
    await withSafeTempWorkspace(async (ws) => {
      capturedRoot = ws.root;
      writeFileSync(join(ws.root, "file.txt"), "x", "utf8");
    });
    expect(existsSync(capturedRoot)).toBe(false);
  });

  it("supports descendant paths containing spaces", async () => {
    let childExisted = false;
    await withSafeTempWorkspace(async (ws) => {
      const child = join(ws.root, "a b c");
      mkdirSync(child, { recursive: true });
      writeFileSync(join(child, "plain.txt"), "x", "utf8");
      childExisted = existsSync(join(child, "plain.txt"));
    });
    expect(childExisted).toBe(true);
  });

  it("cleans the owned workspace even when the callback throws", async () => {
    let capturedRoot;
    await expect(
      withSafeTempWorkspace(async (ws) => {
        capturedRoot = ws.root;
        throw new Error("callback boom");
      }),
    ).rejects.toThrow("callback boom");
    expect(existsSync(capturedRoot)).toBe(false);
  });

  it("preserves the callback error when cleanup also fails", async () => {
    // Force cleanup to fail by corrupting the marker inside the callback.
    let err;
    let leftoverRoot;
    try {
      await withSafeTempWorkspace(async (ws) => {
        leftoverRoot = ws.root;
        track(ws.root); // exact-root cleanup in afterEach (never a parent)
        writeFileSync(ws.ownershipFile, "not json", "utf8");
        throw new Error("callback boom");
      });
    } catch (caught) {
      err = caught;
    }
    expect(err).toBeInstanceOf(AggregateError);
    expect(err.errors[0].message).toBe("callback boom");
    // The workspace still exists because cleanup was refused (marker invalid).
    expect(existsSync(leftoverRoot)).toBe(true);
  });

  it("never exposes the ownership token in thrown messages", async () => {
    let token;
    let message = "";
    try {
      await withSafeTempWorkspace(async (ws) => {
        token = ws.ownershipToken;
        throw new Error("callback boom");
      });
    } catch (caught) {
      message = String(caught);
    }
    expect(token).toBeTruthy();
    expect(message).not.toContain(token);
  });
});

describe("assertSafeOwnedWorkspace", () => {
  it("throws without leaking the token", () => {
    const ws = createSafeTempWorkspace();
    try {
      let msg = "";
      try {
        assertSafeOwnedWorkspace(tmpdir(), { ownershipToken: ws.ownershipToken });
      } catch (e) {
        msg = String(e);
      }
      expect(msg).toContain("temp_cleanup_shared_temp");
      expect(msg).not.toContain(ws.ownershipToken);
    } finally {
      ws.cleanup();
    }
  });
});

// Referenced only to satisfy the marker-filename export contract in tests.
void OWNERSHIP_MARKER_FILENAME;
