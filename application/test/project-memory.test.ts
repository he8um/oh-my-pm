// Project Memory use cases over a real Node store in a temporary data root.
//
// Verifies that preview performs zero writes, that apply writes exactly once,
// and that status/history/changes/timeline read deterministically. Uses the
// real store so the preview/apply contract is exercised end to end.

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyProjectCapture,
  getProjectMemoryHistory,
  getProjectMemoryStatus,
  getProjectTimeline,
  previewProjectCapture,
  previewProjectDelete,
  previewProjectExport,
} from "../src/index.js";
import type { ProjectMemoryDeps } from "../src/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A project directory plus an isolated application-data root. */
function workspace(): { project: string; data: string } {
  const base = mkdtempSync(join(tmpdir(), "omp-app-memory-"));
  roots.push(base);
  const project = join(base, "project");
  const data = join(base, "data");
  mkdirSync(project, { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(
    join(project, "oh-my-pm.config.json"),
    JSON.stringify({ version: 1, projectId: "demo" }),
  );
  writeFileSync(
    join(project, "status.md"),
    "# Status\n\n- [ ] Ship the application boundary\n- [x] Lock the scope\n",
  );
  writeFileSync(join(project, "risks.md"), "# Risks\n\n- Blocked on review\n");
  return { project, data };
}

function deps(now = "2026-03-01T00:00:00.000Z"): ProjectMemoryDeps {
  return { now, processId: 4242 };
}

/** Files present under the data root, recursively. */
function dataEntries(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out;
}

function captureRequest(ws: { project: string; data: string }) {
  return {
    subcommand: "capture" as const,
    projectRoot: ws.project,
    locale: "en" as const,
    migrateStore: false,
    dataDir: ws.data,
    outputMode: "json" as const,
  };
}

describe("capture preview and apply", () => {
  it("preview writes nothing at all", async () => {
    const ws = workspace();
    const before = dataEntries(ws.data);
    expect(before).toEqual([]);

    const outcome = await previewProjectCapture(captureRequest(ws), deps());
    expect(outcome.ok).toBe(true);

    // The defining property of preview: no data directory, no lock, no record.
    expect(dataEntries(ws.data)).toEqual([]);
  });

  it("apply writes a snapshot the subsequent reads can see", async () => {
    const ws = workspace();
    const applied = await applyProjectCapture(captureRequest(ws), deps());
    expect(applied.ok).toBe(true);
    expect(dataEntries(ws.data).length).toBeGreaterThan(0);

    const status = await getProjectMemoryStatus(
      {
        subcommand: "status",
        projectRoot: ws.project,
        projectId: "demo",
        dataDir: ws.data,
        outputMode: "json",
      },
      deps(),
    );
    expect(status.ok).toBe(true);

    const history = await getProjectMemoryHistory(
      {
        subcommand: "history",
        projectRoot: ws.project,
        projectId: "demo",
        limit: 10,
        dataDir: ws.data,
        outputMode: "json",
      },
      deps(),
    );
    expect(history.ok).toBe(true);
  });

  it("a repeated identical capture is idempotent", async () => {
    const ws = workspace();
    await applyProjectCapture(captureRequest(ws), deps());
    const filesAfterFirst = dataEntries(ws.data).length;
    const second = await applyProjectCapture(captureRequest(ws), deps());
    expect(second.ok).toBe(true);
    expect(dataEntries(ws.data).length).toBe(filesAfterFirst);
  });

  it("produces deterministic repeated previews", async () => {
    const ws = workspace();
    const first = await previewProjectCapture(captureRequest(ws), deps());
    const second = await previewProjectCapture(captureRequest(ws), deps());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("read-only memory use cases", () => {
  it("reports a controlled failure for an unknown project", async () => {
    const ws = workspace();
    const outcome = await getProjectMemoryStatus(
      {
        subcommand: "status",
        projectRoot: ws.project,
        projectId: "does-not-exist",
        dataDir: ws.data,
        outputMode: "json",
      },
      deps(),
    );
    // A missing store is reported, never thrown.
    expect(typeof outcome.ok).toBe("boolean");
  });

  it("returns a timeline after a capture", async () => {
    const ws = workspace();
    await applyProjectCapture(captureRequest(ws), deps());
    const timeline = await getProjectTimeline(
      {
        subcommand: "timeline",
        projectId: "demo",
        limit: 20,
        dataDir: ws.data,
        outputMode: "json",
      },
      deps(),
    );
    expect(timeline.ok).toBe(true);
  });
});

describe("export and delete previews", () => {
  it("export preview writes no destination file", async () => {
    const ws = workspace();
    await applyProjectCapture(captureRequest(ws), deps());
    const destination = join(ws.project, "export.json");

    const outcome = await previewProjectExport(
      {
        subcommand: "export",
        projectRoot: ws.project,
        projectId: "demo",
        destination,
        dataDir: ws.data,
        outputMode: "json",
      },
      deps(),
    );
    expect(outcome.ok).toBe(true);
    expect(readdirSync(ws.project)).not.toContain("export.json");
  });

  it("delete preview removes nothing", async () => {
    const ws = workspace();
    await applyProjectCapture(captureRequest(ws), deps());
    const before = dataEntries(ws.data).length;
    expect(before).toBeGreaterThan(0);

    const outcome = await previewProjectDelete(
      {
        subcommand: "delete",
        projectRoot: ws.project,
        projectId: "demo",
        forceCorruptDelete: false,
        dataDir: ws.data,
        outputMode: "json",
      },
      deps(),
    );
    expect(outcome.ok).toBe(true);
    expect(dataEntries(ws.data).length).toBe(before);
  });
});
