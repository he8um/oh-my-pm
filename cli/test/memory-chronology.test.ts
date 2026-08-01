// v0.3 Phase 4.1 — CLI memory chronology + --migrate-store flow.
//
// End-to-end over the REAL Phase 2 Node adapter on a temporary data dir:
// history presents real capture order (newest first), default changes compares
// the immediate predecessor, and the explicit --migrate-store preview/apply flow
// migrates a store-format v1 store to v2 exactly once with the documented exit
// codes. All output stays sanitized (no raw body, token, or absolute path).

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildEnvelope,
  buildManifest,
  deriveProjectKey,
  deriveRecordKey,
  resolveStoreLayout,
  serializeEnvelope,
  serializeManifest,
} from "@oh-my-pm/project-memory";
import { runLocalCliProcess } from "../src/index.js";
import { parseMemoryCommand } from "../src/memory-parser.js";

/** A temporary workspace with a project + data dir and a config. */
function makeWorkspace(projectId: string, docs: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-chrono-"));
  const project = join(root, "project");
  const data = join(root, "data");
  mkdirSync(project, { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(
    join(project, "oh-my-pm.config.json"),
    JSON.stringify({ version: 1, projectId, documents: { include: ["**/*.md"] } }),
  );
  for (const [name, content] of Object.entries(docs)) writeFileSync(join(project, name), content);
  return { root, project, data };
}

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

/** Capture (apply) one snapshot from the given body at the given time. */
async function captureApply(
  project: string,
  data: string,
  body: string,
  now: string,
): Promise<string> {
  writeFileSync(join(project, "status.md"), body);
  const result = await runLocalCliProcess(
    ["memory", "capture", project, "--data-dir", data, "--apply", "--json"],
    { now, processId: 4242 },
  );
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout).data.snapshotId as string;
}

describe("memory history + changes use real capture order", () => {
  let ws: ReturnType<typeof makeWorkspace>;
  beforeEach(() => {
    ws = makeWorkspace("chrono-proj", { "status.md": "# P\n## Next\n- A\n" });
  });
  afterEach(() => rmSync(ws.root, { recursive: true, force: true }));

  it("history presents newest capture first with sequence and capturedAt", async () => {
    const a = await captureApply(
      ws.project,
      ws.data,
      "# P\n## Next\n- A",
      "2026-01-01T00:00:00.000Z",
    );
    const b = await captureApply(
      ws.project,
      ws.data,
      "# P\n## Next\n- A\n- B",
      "2026-01-02T00:00:00.000Z",
    );
    const c = await captureApply(
      ws.project,
      ws.data,
      "# P\n## Next\n- A\n- B\n- C",
      "2026-01-03T00:00:00.000Z",
    );
    const history = await runLocalCliProcess(
      ["memory", "history", ws.project, "--data-dir", ws.data, "--json"],
      { now: "2026-02-01T00:00:00.000Z", processId: 4242 },
    );
    expect(history.exitCode).toBe(0);
    const data = JSON.parse(history.stdout).data;
    // Newest capture first: C, B, A — regardless of content-derived id ordering.
    expect(data.records.map((r: { snapshotId: string }) => r.snapshotId)).toEqual([c, b, a]);
    expect(data.records.map((r: { sequence: number }) => r.sequence)).toEqual([3, 2, 1]);
    expect(data.records[0].isLatest).toBe(true);
    expect(data.records[0].capturedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(data.chronologyOrigin).toBe("native");
  });

  it("default changes compares the latest capture with its immediate predecessor", async () => {
    await captureApply(ws.project, ws.data, "# P\n## Next\n- A", "2026-01-01T00:00:00.000Z");
    const b = await captureApply(
      ws.project,
      ws.data,
      "# P\n## Next\n- A\n- B\n## Risks\n- tight",
      "2026-01-02T00:00:00.000Z",
    );
    const c = await captureApply(
      ws.project,
      ws.data,
      "# P\n## Next\n- A\n- B\n- C\n## Risks\n- tight\n## Blockers\n- auth",
      "2026-01-03T00:00:00.000Z",
    );
    const changes = await runLocalCliProcess(
      ["memory", "changes", ws.project, "--data-dir", ws.data, "--json"],
      { now: "2026-02-01T00:00:00.000Z", processId: 4242 },
    );
    expect(changes.exitCode).toBe(0);
    const data = JSON.parse(changes.stdout).data;
    expect(data.status).toBe("compared");
    expect(data.currentSnapshotId).toBe(c);
    expect(data.previousSnapshotId).toBe(b);
  });
});

// --- v1 store planting + the --migrate-store flow --------------------------

/** Plant a store-format v1 store for `projectId` under the CLI data dir. */
function plantV1Store(dataDir: string, projectId: string): void {
  const layout = resolveStoreLayout(dataDir);
  const projectKey = deriveProjectKey(projectId);
  const snapshots: Record<string, string> = {
    "v1-a": "2026-01-03T00:00:00.000Z",
    "v1-b": "2026-01-09T00:00:00.000Z", // latest, in the middle of the sorted inventory
    "v1-c": "2026-01-01T00:00:00.000Z",
  };
  const projectDir = join(dataDir, "project-brain", "v1", "projects", projectKey);
  mkdirSync(join(projectDir, "snapshots"), { recursive: true });
  for (const [id, capturedAt] of Object.entries(snapshots)) {
    const env = buildEnvelope("snapshot", projectId, id, {
      snapshotId: id,
      projectId,
      schemaVersion: 1,
      capturedAt,
    });
    writeFileSync(
      join(projectDir, "snapshots", `${deriveRecordKey("snapshot", id)}.json`),
      serializeEnvelope(env),
    );
  }
  const manifest = buildManifest({
    storeFormatVersion: 1,
    projectBrainSchemaVersion: 1,
    projectId,
    projectKey,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-09T00:00:00.000Z",
    latestSnapshotId: "v1-b",
    snapshotIds: ["v1-a", "v1-b", "v1-c"],
    evidenceIds: [],
    migrationHistory: [],
  });
  // The layout's manifest path is <projectDir>/manifest.json.
  writeFileSync(join(projectDir, "manifest.json"), serializeManifest(manifest));
  void layout;
}

describe("memory capture --migrate-store flow", () => {
  let ws: ReturnType<typeof makeWorkspace>;
  const NOW = "2026-03-03T00:00:00.000Z";
  beforeEach(() => {
    ws = makeWorkspace("migrate-proj", { "status.md": "# P\n## Next\n- A\n" });
    plantV1Store(ws.data, "migrate-proj");
  });
  afterEach(() => rmSync(ws.root, { recursive: true, force: true }));

  /** Files under the store dir, so we can assert a preview wrote nothing. */
  function storeFiles(): string[] {
    return listFiles(join(ws.data, "project-brain"));
  }

  it("capture preview on v1 without --migrate-store reports migrationRequired (exit 4)", async () => {
    const before = storeFiles().sort();
    const result = await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--json"],
      { now: NOW, processId: 4242 },
    );
    expect(result.exitCode).toBe(4);
    // No write.
    expect(storeFiles().sort()).toEqual(before);
  });

  it("capture --migrate-store preview reports wouldMigrateStore and writes nothing", async () => {
    const before = storeFiles().sort();
    const result = await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--migrate-store", "--json"],
      { now: NOW, processId: 4242 },
    );
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout).data;
    expect(data.wouldMigrateStore).toBe(true);
    expect(data.wouldWrite).toBe(false);
    // Preview is byte-stable: still a v1 store, no new file, no backup, no lock.
    expect(storeFiles().sort()).toEqual(before);
    for (const f of storeFiles()) {
      expect(f).not.toContain("backups");
      expect(f).not.toContain(".lock");
    }
  });

  it("capture --apply on v1 WITHOUT --migrate-store exits 4 and writes nothing", async () => {
    const before = storeFiles().sort();
    const result = await runLocalCliProcess(
      ["memory", "capture", ws.project, "--data-dir", ws.data, "--apply", "--json"],
      { now: NOW, processId: 4242 },
    );
    expect(result.exitCode).toBe(4);
    // Still v1, no capture written.
    expect(storeFiles().sort()).toEqual(before);
    const manifestPath = storeFiles().find((f) => f.endsWith("manifest.json"))!;
    expect(JSON.parse(readFileSync(manifestPath, "utf8")).storeFormatVersion).toBe(1);
  });

  it("capture --apply --migrate-store migrates once and captures once", async () => {
    const result = await runLocalCliProcess(
      [
        "memory",
        "capture",
        ws.project,
        "--data-dir",
        ws.data,
        "--apply",
        "--migrate-store",
        "--json",
      ],
      { now: NOW, processId: 4242 },
    );
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout).data;
    expect(data.storeMigrated).toBe(true);
    expect(data.written).toBe(true);
    // The store is now v2 with the three recovered captures plus the new one.
    expect(data.snapshotCount).toBe(4);
    // The LIVE manifest (not the pre-migration backup under backups/).
    const manifestPath = storeFiles().find(
      (f) => f.endsWith("manifest.json") && !f.includes("backups"),
    )!;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.storeFormatVersion).toBe(2);
    expect(manifest.snapshotChronologyOrigin).toBe("recoveredV1");

    // history reflects the recovered order (newest first) with the new capture on top.
    const history = await runLocalCliProcess(
      ["memory", "history", ws.project, "--data-dir", ws.data, "--json"],
      { now: NOW, processId: 4242 },
    );
    const hd = JSON.parse(history.stdout).data;
    expect(hd.chronologyOrigin).toBe("recoveredV1");
    expect(hd.records[0].isLatest).toBe(true);
    expect(hd.records[hd.records.length - 1].snapshotId).toBe("v1-c"); // oldest recovered
  });

  it("a second --apply --migrate-store does not re-migrate an already-v2 store", async () => {
    await runLocalCliProcess(
      [
        "memory",
        "capture",
        ws.project,
        "--data-dir",
        ws.data,
        "--apply",
        "--migrate-store",
        "--json",
      ],
      { now: NOW, processId: 4242 },
    );
    // The store is v2 now; re-running with --migrate-store must not migrate again.
    const second = await runLocalCliProcess(
      [
        "memory",
        "capture",
        ws.project,
        "--data-dir",
        ws.data,
        "--apply",
        "--migrate-store",
        "--json",
      ],
      { now: "2026-03-04T00:00:00.000Z", processId: 4242 },
    );
    expect(second.exitCode).toBe(0);
    const data = JSON.parse(second.stdout).data;
    expect(data.storeMigrated).toBeUndefined();
  });
});

describe("--migrate-store parser scope", () => {
  it("is accepted only for capture and rejected on every other subcommand", () => {
    const ok = parseMemoryCommand(["capture", ".", "--migrate-store"]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.command as { migrateStore: boolean }).migrateStore).toBe(true);
    for (const sub of ["changes", "status", "history", "export", "delete"]) {
      const args =
        sub === "export"
          ? [sub, ".", "--destination", "/x", "--migrate-store"]
          : [sub, ".", "--migrate-store"];
      const res = parseMemoryCommand(args);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain("--migrate-store is only valid for capture");
    }
  });

  it("rejects a duplicate --migrate-store", () => {
    const res = parseMemoryCommand(["capture", ".", "--migrate-store", "--migrate-store"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("duplicate --migrate-store");
  });
});
