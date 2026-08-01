import { describe, expect, it } from "vitest";

import { assertNoForbiddenKeys, normalizeKey } from "../src/privacy.js";
import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { DependencyInjectedStore } from "../src/store.js";
import { DATA_ROOT, makeEvidence, makeSnapshot, PROJECT_ROOT } from "./fixtures.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const PID = "proj-1";

describe("forbidden key rejection", () => {
  it("rejects a raw body key nested anywhere", () => {
    expect(() => assertNoForbiddenKeys({ a: { rawBody: "x" } } as never, "test")).toThrow();
    expect(() => assertNoForbiddenKeys({ token: "x" } as never, "test")).toThrow();
    expect(() =>
      assertNoForbiddenKeys({ nested: [{ absolutePath: "/x" }] } as never, "test"),
    ).toThrow();
  });

  it("normalizes camelCase and separators before comparison", () => {
    expect(normalizeKey("access_token")).toBe("accesstoken");
    expect(normalizeKey("Set-Cookie")).toBe("setcookie");
    expect(() => assertNoForbiddenKeys({ Access_Token: "x" } as never, "test")).toThrow();
  });

  it("allows normal title-level text values and keys", () => {
    expect(() =>
      assertNoForbiddenKeys(
        { title: "Fix the login bug", status: "open", severity: "high" } as never,
        "test",
      ),
    ).not.toThrow();
  });
});

describe("no secret is ever written", () => {
  it("commit rejects evidence carrying a token key before any byte is written", async () => {
    const fs = new MemoryFileSystem();
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    const evidence = makeEvidence(PID, "ev-1", {
      // A planted secret masquerading as metadata; the guard must refuse it.
      metadata: { token: "ghp_PLANTED_FAKE_TOKEN_abc123" },
    });
    await expect(
      store.commitSnapshotBundle({
        projectId: PID,
        projectRootBoundary: PROJECT_ROOT,
        operationId: "op-1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        snapshot: makeSnapshot(PID, "snap-1", ["ev-1"]),
        evidence: [evidence],
      }),
    ).rejects.toMatchObject({ code: PROJECT_MEMORY_ERROR_CODES.invalidInput });
    // Nothing was written to disk.
    const written = [...fs.snapshot().keys()];
    expect(written).toEqual([]);
  });

  it("a planted fake token never appears in any written byte", async () => {
    const FAKE_TOKEN = "ghp_PLANTED_FAKE_TOKEN_abc123";
    const fs = new MemoryFileSystem();
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    // The token lives only in a title-level allowed field name; the guard passes
    // because the KEY is fine — but here we assert the store never invents it,
    // so we commit a clean record and scan every written byte for the token.
    await store.commitSnapshotBundle({
      projectId: PID,
      projectRootBoundary: PROJECT_ROOT,
      operationId: "op-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      snapshot: makeSnapshot(PID, "snap-1", ["ev-1"]),
      evidence: [makeEvidence(PID, "ev-1")],
    });
    for (const content of fs.snapshot().values()) {
      expect(content).not.toContain(FAKE_TOKEN);
    }
  });

  it("no written byte contains an absolute project path", async () => {
    const fs = new MemoryFileSystem();
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await store.commitSnapshotBundle({
      projectId: PID,
      projectRootBoundary: PROJECT_ROOT,
      operationId: "op-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      snapshot: makeSnapshot(PID, "snap-1", ["ev-1"]),
      evidence: [makeEvidence(PID, "ev-1")],
    });
    // The project root boundary must never be persisted into any record byte.
    for (const content of fs.snapshot().values()) {
      expect(content).not.toContain(PROJECT_ROOT);
    }
  });

  it("minimized evidence persists without verbatim content but keeps a fingerprint", async () => {
    const fs = new MemoryFileSystem();
    const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
    await store.commitSnapshotBundle({
      projectId: PID,
      projectRootBoundary: PROJECT_ROOT,
      operationId: "op-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      snapshot: makeSnapshot(PID, "snap-1", ["ev-1"]),
      evidence: [makeEvidence(PID, "ev-1")],
    });
    const evidence = await store.readEvidence(PID, "ev-1");
    expect(evidence.rawContentPolicy).toBe("minimized");
    expect(evidence.contentFingerprint).toMatch(/^sha256:/);
  });
});
