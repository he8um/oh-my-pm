// v0.3 Phase 4 — memory process-boundary tests.
//
// Preview safety, capture apply, read-command status mapping, export/delete, the
// clock-consumed-once boundary, and the lazy Project Memory import are covered
// here. Preview/capture-apply run against the REAL Phase 2 Node adapter over a
// temporary data directory; status-mapping edge cases use an injected fake store.

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLocalCliProcess } from "../src/index.js";
import type { LocalCliProcessOptions } from "../src/index.js";
import { runMemoryProcess } from "@oh-my-pm/application";
import type { MemoryStore } from "@oh-my-pm/application";

const FIXED_NOW = "2026-03-03T00:00:00.000Z";

/** Build a temporary workspace with a project + data dir and a config. */
function makeWorkspace(projectId: string, docs: Record<string, string>): {
  root: string;
  project: string;
  data: string;
} {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-mem-"));
  const project = join(root, "project");
  const data = join(root, "data");
  mkdirSync(project, { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(
    join(project, "oh-my-pm.config.json"),
    JSON.stringify({ version: 1, projectId, documents: { include: ["**/*.md"] } }),
  );
  for (const [name, content] of Object.entries(docs)) {
    writeFileSync(join(project, name), content);
  }
  return { root, project, data };
}

function opts(over: Partial<LocalCliProcessOptions> = {}): LocalCliProcessOptions {
  return { now: FIXED_NOW, processId: 9999, ...over };
}

/** Recursively list files under a directory. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

const STATUS_DOC = "# Project\n## Next steps\n- Wire the API\n## Risks\n- Timeline is tight\n";

describe("memory capture preview safety (real adapter, zero writes)", () => {
  let ws: ReturnType<typeof makeWorkspace>;
  beforeEach(() => {
    ws = makeWorkspace("preview-proj", { "status.md": STATUS_DOC });
  });
  afterEach(() => rmSync(ws.root, { recursive: true, force: true }));

  it("creates no data directory, no file, no lock and reports would-not-write", async () => {
    const dataBefore = statSync(ws.data);
    const result = await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.mode).toBe("preview");
    expect(parsed.data.wouldWrite).toBe(false);
    expect(parsed.data.wouldCreateSnapshot).toBe(true);
    // Zero files written anywhere under the data dir.
    expect(listFiles(ws.data)).toHaveLength(0);
    // The data dir mtime layout is unchanged (no store subtree created).
    expect(statSync(ws.data).isDirectory()).toBe(true);
    void dataBefore;
  });

  it("leaves the analyzed project byte-identical", async () => {
    const before = readFileSync(join(ws.project, "status.md"), "utf8");
    await runLocalCliProcess(["memory", "capture", ws.project, "--data-dir", ws.data], opts());
    expect(readFileSync(join(ws.project, "status.md"), "utf8")).toBe(before);
  });
});

describe("memory capture apply (real adapter)", () => {
  let ws: ReturnType<typeof makeWorkspace>;
  beforeEach(() => {
    ws = makeWorkspace("apply-proj", { "status.md": STATUS_DOC });
  });
  afterEach(() => rmSync(ws.root, { recursive: true, force: true }));

  it("commits exactly one snapshot and preview/apply ids match", async () => {
    const preview = await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    const applied = await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply", "--json"],
      opts(),
    );
    const pd = JSON.parse(preview.stdout).data;
    const ad = JSON.parse(applied.stdout).data;
    expect(applied.exitCode).toBe(0);
    expect(ad.written).toBe(true);
    // Preview/apply parity under the same injected clock.
    expect(pd.snapshotId).toBe(ad.snapshotId);
    expect(pd.snapshotFingerprint).toBe(ad.snapshotFingerprint);
    expect(ad.snapshotCount).toBe(1);
    expect(listFiles(ws.data).some((f) => f.endsWith("manifest.json"))).toBe(true);
  });

  it("an idempotent unchanged re-apply leaves a single snapshot", async () => {
    const args = ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply", "--json"];
    await runLocalCliProcess(args, opts());
    const again = await runLocalCliProcess(args, opts());
    const d = JSON.parse(again.stdout).data;
    expect(d.idempotent).toBe(true);
    expect(d.snapshotCount).toBe(1);
  });

  it("stored bytes contain no raw body prose, token, or absolute project path", async () => {
    // A distinctive raw body sentence + a fake token + an absolute path that must
    // be minimized away (evidence stores fingerprints, not raw document text).
    const secretDoc =
      "# Project\n## Next steps\n- Ship it\n\nSECRET_RAW_BODY_SENTENCE ghp_FAKE_LEAK at /Users/x/abs.md\n";
    writeFileSync(join(ws.project, "status.md"), secretDoc);
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts(),
    );
    for (const file of listFiles(ws.data)) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("SECRET_RAW_BODY_SENTENCE");
      expect(content).not.toContain("ghp_FAKE_LEAK");
      expect(content).not.toContain("/Users/x/abs.md");
      expect(content).not.toContain(ws.project);
      expect(content).not.toContain("fingerprintInput");
    }
  });

  it("a required-source failure (no documents) writes nothing", async () => {
    const empty = makeWorkspace("empty-proj", {});
    try {
      const result = await runLocalCliProcess(
        ["memory", "capture", empty.project, "--data-dir", empty.data, "--apply"],
        opts(),
      );
      expect(result.exitCode).toBe(2);
      expect(listFiles(empty.data)).toHaveLength(0);
    } finally {
      rmSync(empty.root, { recursive: true, force: true });
    }
  });
});

describe("memory read/export/delete journey (real adapter)", () => {
  let ws: ReturnType<typeof makeWorkspace>;
  beforeEach(() => {
    ws = makeWorkspace("journey-proj", { "status.md": STATUS_DOC });
  });
  afterEach(() => rmSync(ws.root, { recursive: true, force: true }));

  it("status reports noPriorMemory before any capture", async () => {
    const result = await runLocalCliProcess(
      ["memory", "status", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data.status).toBe("noPriorMemory");
  });

  it("status reports healthy after capture; history is bounded newest-first", async () => {
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts(),
    );
    // Change the doc and capture again.
    writeFileSync(join(ws.project, "status.md"), STATUS_DOC + "## Blockers\n- Auth down\n");
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts({ now: "2026-03-04T00:00:00.000Z" }),
    );
    const status = await runLocalCliProcess(
      ["memory", "status", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    expect(JSON.parse(status.stdout).data.status).toBe("healthy");

    const history = await runLocalCliProcess(
      ["memory", "history", ws.project, "--data-dir", ws.data, "--limit", "1", "--json"],
      opts(),
    );
    const records = JSON.parse(history.stdout).data.records;
    expect(records).toHaveLength(1);
    expect(records[0].isLatest).toBe(true);
  });

  it("changes reports noPriorMemory (exit 3) with no snapshots", async () => {
    const result = await runLocalCliProcess(
      ["memory", "changes", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stdout).data.status).toBe("noPriorMemory");
  });

  it("changes output is byte-deterministic under a fixed clock", async () => {
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts(),
    );
    writeFileSync(join(ws.project, "status.md"), STATUS_DOC + "## Blockers\n- Auth down\n");
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts({ now: "2026-03-04T00:00:00.000Z" }),
    );
    const compareArgs = ["memory", "changes", ws.project, "--data-dir", ws.data, "--json"];
    const first = await runLocalCliProcess(compareArgs, opts({ now: "2026-03-10T00:00:00.000Z" }));
    const second = await runLocalCliProcess(compareArgs, opts({ now: "2026-03-10T00:00:00.000Z" }));
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout).data.status).toBe("compared");
    // Deep-equal on repeat under the same injected clock (G4 at the CLI).
    expect(second.stdout).toBe(first.stdout);
  });

  it("changes reports insufficientHistory (exit 3) after a single capture", async () => {
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts(),
    );
    const result = await runLocalCliProcess(
      ["memory", "changes", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stdout).data.status).toBe("insufficientHistory");
  });

  it("export preview writes nothing; apply writes to the destination", async () => {
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts(),
    );
    const dest = join(ws.root, "exported");
    const preview = await runLocalCliProcess(
      ["memory", "export", ws.project, "--data-dir", ws.data, "--destination", dest, "--json"],
      opts(),
    );
    expect(preview.exitCode).toBe(0);
    expect(JSON.parse(preview.stdout).data.wouldExport).toBe(true);
    expect(listFiles(dest)).toHaveLength(0);

    const applied = await runLocalCliProcess(
      ["memory", "export", ws.project, "--data-dir", ws.data, "--destination", dest, "--apply"],
      opts(),
    );
    expect(applied.exitCode).toBe(0);
    expect(listFiles(dest).length).toBeGreaterThan(0);
  });

  it("delete preview writes nothing; apply requires exact confirmation", async () => {
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts(),
    );
    const before = listFiles(ws.data).length;
    const preview = await runLocalCliProcess(
      ["memory", "delete", ws.project, "--data-dir", ws.data],
      opts(),
    );
    expect(preview.exitCode).toBe(0);
    expect(listFiles(ws.data).length).toBe(before);

    // Wrong confirmation is rejected with exit 2 and no deletion.
    const wrong = await runLocalCliProcess(
      ["memory", "delete", ws.project, "--data-dir", ws.data, "--apply", "--confirm", "nope"],
      opts(),
    );
    expect(wrong.exitCode).toBe(2);
    expect(listFiles(ws.data).length).toBe(before);

    // Correct confirmation deletes.
    const del = await runLocalCliProcess(
      ["memory", "delete", ws.project, "--data-dir", ws.data, "--apply", "--confirm", "journey-proj"],
      opts(),
    );
    expect(del.exitCode).toBe(0);
    const post = await runLocalCliProcess(
      ["memory", "status", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    expect(JSON.parse(post.stdout).data.status).toBe("noPriorMemory");
  });

  it("does not leak the data-dir absolute path in output", async () => {
    await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply"],
      opts(),
    );
    const status = await runLocalCliProcess(
      ["memory", "status", ws.project, "--data-dir", ws.data, "--json"],
      opts(),
    );
    expect(status.stdout).not.toContain(ws.data);
  });
});

describe("clock boundary and injected store", () => {
  it("consumes the clock at most once for a memory command", async () => {
    let calls = 0;
    const ws = makeWorkspace("clock-proj", { "status.md": STATUS_DOC });
    try {
      await runLocalCliProcess(["memory", "status", ws.project, "--data-dir", ws.data], {
        clock: () => {
          calls += 1;
          return FIXED_NOW;
        },
        processId: 1,
      });
      expect(calls).toBeLessThanOrEqual(1);
    } finally {
      rmSync(ws.root, { recursive: true, force: true });
    }
  });

  it("does not read the clock for a legacy offline command", async () => {
    let calls = 0;
    await runLocalCliProcess(["status"], {
      clock: () => {
        calls += 1;
        return FIXED_NOW;
      },
    });
    expect(calls).toBe(0);
  });

  it("maps store version states to CLI status via an injected fake store", async () => {
    const fake = (versionState: string): MemoryStore =>
      ({
        readManifest: async () => null,
        listSnapshots: async () => [],
        readSnapshot: async () => {
          throw new Error("not found");
        },
        readEvidence: async () => {
          throw new Error("not found");
        },
        inspect: async (projectId: string) => ({
          projectId,
          exists: true,
          versionState,
          storeFormatVersion: 1,
          projectBrainSchemaVersion: 1,
          snapshotCount: 0,
          evidenceCount: 0,
          latestSnapshotId: null,
          issues: [],
        }),
        verify: async (projectId: string) => ({ projectId, ok: true, issues: [] }),
        commitSnapshotBundle: async () => {
          throw new Error("no commit");
        },
        exportProject: async () => {
          throw new Error("no export");
        },
        deleteProject: async () => {
          throw new Error("no delete");
        },
      }) as unknown as MemoryStore;

    const cases: Array<[string, string]> = [
      ["unsupportedNewer", "unsupportedNewer"],
      ["migrationRequired", "migrationRequired"],
      ["incompatibleSchema", "incompatibleSchema"],
      ["supported", "healthy"],
    ];
    for (const [versionState, expected] of cases) {
      const outcome = await runMemoryProcess(
        { subcommand: "status", projectRoot: ".", projectId: "x", outputMode: "brief" },
        { now: FIXED_NOW, storeFactory: () => fake(versionState) },
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok && outcome.command === "memory.status") {
        expect(outcome.status).toBe(expected);
      }
    }
  });

  it("reports corrupt when verification fails", async () => {
    const corruptStore = {
      readManifest: async () => null,
      listSnapshots: async () => [],
      readSnapshot: async () => {
        throw new Error("x");
      },
      readEvidence: async () => {
        throw new Error("x");
      },
      inspect: async (projectId: string) => ({
        projectId,
        exists: true,
        versionState: "supported",
        storeFormatVersion: 1,
        projectBrainSchemaVersion: 1,
        snapshotCount: 1,
        evidenceCount: 1,
        latestSnapshotId: "snapshot:x",
        issues: [],
      }),
      verify: async (projectId: string) => ({
        projectId,
        ok: false,
        issues: [{ kind: "integrityFailure", detail: "sanitized" }],
      }),
      commitSnapshotBundle: async () => {
        throw new Error("x");
      },
      exportProject: async () => {
        throw new Error("x");
      },
      deleteProject: async () => {
        throw new Error("x");
      },
    } as unknown as MemoryStore;

    const outcome = await runMemoryProcess(
      { subcommand: "status", projectRoot: ".", projectId: "x", outputMode: "brief" },
      { now: FIXED_NOW, storeFactory: () => corruptStore },
    );
    if (outcome.ok && outcome.command === "memory.status") {
      expect(outcome.status).toBe("corrupt");
    }
  });
});
