// v0.3 Phase 4 — source-workspace CLI end-to-end journey.
//
// Runs the REAL built CLI as a child process from a temporary workspace fixture
// against a temporary data directory: real parser/process, real local Markdown
// loader/provider, real Phase 3 Runtime, real WASM Kernel, real Phase 2 Node
// adapter. It walks the full fifteen-step journey (English + Persian signals),
// asserts stable exit codes and that the project stays byte-identical, and scans
// stored/exported bytes for forbidden values. No MCP, no network.
//
// This is a source/workspace qualification, not an installed-release one.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "ohmypm.mjs");
const PROJECT_ID = "e2e-journey-project";

type Run = { status: number; stdout: string; stderr: string };

let root: string;
let project: string;
let data: string;

/** Run the built CLI as a child process; capture status/stdout/stderr. */
function run(...args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: "utf8",
      cwd: root,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function memory(...args: string[]): Run {
  return run("memory", ...args, "--data-dir", data);
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

const DOC_EN_A = [
  "# Project",
  "## Next steps",
  "- Wire the API",
  "## Risks",
  "- Timeline is tight",
].join("\n");
const DOC_EN_B = [
  "# Project",
  "## Next steps",
  "- Wire the API",
  "- Add integration tests",
  "## Blockers",
  "- Auth service is down",
].join("\n");
const DOC_FA = ["# وضعیت", "## ریسک ها", "- بودجه محدود است"].join("\n");

describe("memory CLI source-workspace end-to-end journey", () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "oh-my-pm-mem-e2e-"));
    project = join(root, "project");
    data = join(root, "data");
    mkdirSync(project, { recursive: true });
    mkdirSync(data, { recursive: true });
    // 1. explicit projectId in config; 2. English + Persian signals.
    writeFileSync(
      join(project, "oh-my-pm.config.json"),
      JSON.stringify({ version: 1, projectId: PROJECT_ID, documents: { include: ["**/*.md"] } }),
    );
    writeFileSync(join(project, "status.md"), DOC_EN_A);
    writeFileSync(join(project, "status-fa.md"), DOC_FA);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("runs the full fifteen-step journey with stable exit codes", () => {
    const projectSnapshot = snapshotProject();

    // 3. capture preview (all three output modes) — writes nothing.
    for (const mode of [[], ["--json"], ["--markdown"]]) {
      const preview = memory("capture", project, ...mode);
      expect(preview.status).toBe(0);
    }
    // 4. prove no memory directory exists after preview.
    expect(listFiles(data)).toHaveLength(0);

    // 5. capture --apply.
    const applyA = memory("capture", project, "--apply", "--json");
    expect(applyA.status).toBe(0);
    const snapA = JSON.parse(applyA.stdout).data.snapshotId as string;
    expect(listFiles(data).some((f) => f.endsWith("manifest.json"))).toBe(true);

    // 6. edit Markdown; 7. second capture --apply.
    writeFileSync(join(project, "status.md"), DOC_EN_B);
    const applyB = memory("capture", project, "--apply", "--json");
    expect(applyB.status).toBe(0);
    const snapB = JSON.parse(applyB.stdout).data.snapshotId as string;
    expect(snapB).not.toBe(snapA);

    // 8. status.
    const status = memory("status", project, "--json");
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout).data.status).toBe("healthy");
    expect(JSON.parse(status.stdout).data.snapshotCount).toBe(2);

    // 9. history (newest-first).
    const history = memory("history", project, "--json");
    expect(history.status).toBe(0);
    const records = JSON.parse(history.stdout).data.records as Array<{
      snapshotId: string;
      isLatest: boolean;
    }>;
    expect(records[0].snapshotId).toBe(snapB);
    expect(records[0].isLatest).toBe(true);

    // 10. changes. The default pair is drawn from the two committed snapshots
    // (the Phase 3 selection heuristic decides their prev/current roles from the
    // store's stable id order). Structural change output is stable across runs;
    // time-derived freshness fields depend on the (real) invocation clock, so the
    // exact byte-equal determinism guarantee is proven separately under a fixed
    // injected clock.
    const bothSnapshots = new Set([snapA, snapB]);
    const changes1 = memory("changes", project, "--json");
    expect(changes1.status).toBe(0);
    const cs1 = JSON.parse(changes1.stdout);
    expect(cs1.data.status).toBe("compared");
    expect(bothSnapshots.has(cs1.data.previousSnapshotId)).toBe(true);
    expect(bothSnapshots.has(cs1.data.currentSnapshotId)).toBe(true);
    expect(cs1.data.previousSnapshotId).not.toBe(cs1.data.currentSnapshotId);
    const categories = (cs1.data.changeSet.changes as Array<{ category: string }>).map(
      (c) => c.category,
    );
    const changes2 = memory("changes", project, "--json");
    const cs2 = JSON.parse(changes2.stdout);
    expect(
      (cs2.data.changeSet.changes as Array<{ category: string }>).map((c) => c.category),
    ).toEqual(categories);

    // 11. export preview (no write); 12. export --apply.
    const dest = join(root, "exported");
    const exportPreview = memory("export", project, "--destination", dest, "--json");
    expect(exportPreview.status).toBe(0);
    expect(listFiles(dest)).toHaveLength(0);
    const exportApply = memory("export", project, "--destination", dest, "--apply", "--json");
    expect(exportApply.status).toBe(0);
    expect(listFiles(dest).length).toBeGreaterThan(0);

    // 13. delete preview (no write).
    const deletePreview = memory("delete", project, "--json");
    expect(deletePreview.status).toBe(0);
    expect(JSON.parse(deletePreview.stdout).data.storeExists).toBe(true);

    // 14. delete --apply --confirm.
    const deleteApply = memory("delete", project, "--apply", "--confirm", PROJECT_ID, "--json");
    expect(deleteApply.status).toBe(0);
    expect(JSON.parse(deleteApply.stdout).data.deleted).toBe(true);

    // 15. status -> noPriorMemory.
    const post = memory("status", project, "--json");
    expect(post.status).toBe(0);
    expect(JSON.parse(post.stdout).data.status).toBe("noPriorMemory");

    // The analyzed project is byte-identical (only the test-authored edit).
    expect(snapshotProject()).toEqual({
      ...projectSnapshot,
      "status.md": DOC_EN_B,
    });

    // Privacy: no absolute project path, no ephemeral fingerprint input, and no
    // token/raw-body sentence in stored/exported bytes. (Risk/task titles are a
    // derived, allowed surface and are intentionally not asserted here.)
    for (const file of [...listFiles(dest), ...listFiles(data)]) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain(project);
      expect(content).not.toContain("fingerprintInput");
      expect(content).not.toContain("ghp_");
    }
  });

  it("rejects delete --apply without confirmation (exit 2)", () => {
    // Re-capture so a store exists, then attempt an unconfirmed apply.
    memory("capture", project, "--apply");
    const result = memory("delete", project, "--apply");
    expect(result.status).toBe(2);
    // Clean up the store for isolation.
    memory("delete", project, "--apply", "--confirm", PROJECT_ID);
  });
});

/** Capture the analyzed project's file contents keyed by relative name. */
function snapshotProject(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(project)) {
    out[name] = readFileSync(join(project, name), "utf8");
  }
  return out;
}
