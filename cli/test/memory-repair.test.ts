// v0.6.2 G5 — the `memory repair` CLI surface.
//
// These tests drive the REAL process boundary against a REAL temporary store, not
// an injected fake. That is deliberate for this command: the properties under test
// are "a preview changes no byte on disk" and "an apply preserves exact bytes and
// never touches the project", and neither can be established against an in-memory
// double. The store-level suite (project-memory/test/repair.test.ts) covers the
// algorithm; this suite covers the wiring, output contract, and write boundary.

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runLocalCliProcess } from "../src/local-process.js";

const PROJECT_ID = "cli-repair-proj";

let work: string;
let projectRoot: string;
let dataDir: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "omp-cli-repair-"));
  projectRoot = join(work, "project");
  dataDir = join(work, "data");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(projectRoot, "status.md"), "# Status\n\n- [ ] one open task\n", "utf8");
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

/** Every file under a root, with its bytes, as one digest. */
function treeDigest(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        hash.update(`D:${path}\n`);
        walk(path);
      } else if (entry.isFile()) {
        hash.update(`F:${path}\n`);
        hash.update(readFileSync(path));
      }
    }
  };
  walk(root);
  return hash.digest("hex");
}

/** Every file path under a root, relative and sorted. */
function treePaths(root: string, base = root): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...treePaths(path, base));
    else out.push(path.slice(base.length + 1));
  }
  return out.sort();
}

/** Run the CLI process boundary with a fixed clock and pid. */
async function cli(args: readonly string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const result = await runLocalCliProcess([...args], {
    now: "2026-02-01T00:00:00.000Z",
    processId: 4242,
  });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

const base = (): string[] => [
  "memory",
  "repair",
  projectRoot,
  "--project-id",
  PROJECT_ID,
  "--data-dir",
  dataDir,
];

/** Capture one real snapshot so there is a store to damage. */
async function seed(): Promise<void> {
  const result = await cli([
    "memory",
    "capture",
    projectRoot,
    "--project-id",
    PROJECT_ID,
    "--data-dir",
    dataDir,
    "--apply",
  ]);
  expect(result.exitCode).toBe(0);
}

/** Overwrite the committed snapshot record with malformed JSON. */
function corruptSnapshotRecord(): { path: string; bytes: string } {
  const relative = treePaths(dataDir).find(
    (p) => p.includes("snapshots") && p.endsWith(".json"),
  ) as string;
  const path = join(dataDir, relative);
  const bytes = '{"deliberately":"malformed"';
  writeFileSync(path, bytes, "utf8");
  return { path, bytes };
}

describe("memory repair preview", () => {
  it("reports a healthy store with nothing to do", async () => {
    await seed();
    const result = await cli([...base(), "--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      command: string;
      mode: string;
      data: { findingCount: number; wouldRepair: boolean };
    };
    expect(parsed.command).toBe("memory.repair");
    expect(parsed.mode).toBe("preview");
    expect(parsed.data.findingCount).toBe(0);
    expect(parsed.data.wouldRepair).toBe(false);
  });

  it("changes no byte of the store while reporting corruption", async () => {
    await seed();
    corruptSnapshotRecord();
    const before = treeDigest(dataDir);

    const result = await cli([...base(), "--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      data: { findingCount: number; wouldRepair: boolean; actionCount: number };
    };
    expect(parsed.data.findingCount).toBeGreaterThan(0);
    expect(parsed.data.wouldRepair).toBe(true);
    expect(parsed.data.actionCount).toBeGreaterThan(0);

    // The whole-tree digest, not a per-file check: this also catches a stray temp
    // file, a created directory, or a lock taken and released.
    expect(treeDigest(dataDir)).toBe(before);
  });

  it("never prints an absolute path or the data directory", async () => {
    await seed();
    corruptSnapshotRecord();
    for (const mode of ["--json", "--markdown", []].flat()) {
      const args = typeof mode === "string" ? [...base(), mode] : base();
      const result = await cli(args);
      expect(result.stdout).not.toContain(dataDir);
      expect(result.stdout).not.toContain(projectRoot);
      expect(result.stdout).not.toContain(work);
    }
  });

  it("renders deterministic output for unchanged bytes", async () => {
    await seed();
    corruptSnapshotRecord();
    const first = await cli([...base(), "--json"]);
    const second = await cli([...base(), "--json"]);
    expect(second.stdout).toBe(first.stdout);
  });
});

describe("memory repair --apply", () => {
  it("quarantines the exact original bytes and leaves the project untouched", async () => {
    await seed();
    const { path, bytes } = corruptSnapshotRecord();
    const projectBefore = treeDigest(projectRoot);

    const result = await cli([...base(), "--apply", "--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      mode: string;
      data: { isolatedCount: number; reconstructedCount: number };
    };
    expect(parsed.mode).toBe("applied");
    expect(parsed.data.isolatedCount).toBe(1);

    // The corrupt live path is gone.
    expect(() => statSync(path)).toThrow();

    // The quarantined payload is byte-identical: not reserialized, not repaired.
    const payload = treePaths(dataDir).find((p) => p.endsWith("payload.bin")) as string;
    expect(payload).toBeDefined();
    expect(readFileSync(join(dataDir, payload), "utf8")).toBe(bytes);

    // A repair must never write into the analyzed project.
    expect(treeDigest(projectRoot)).toBe(projectBefore);
  });

  it("reports isolation without claiming the record was recovered", async () => {
    await seed();
    corruptSnapshotRecord();
    const result = await cli([...base(), "--apply"]);
    expect(result.exitCode).toBe(0);
    // The wording matters: a user reading this must not conclude their damaged
    // record came back. Isolation and reconstruction are separate tallies.
    expect(result.stdout).toContain("isolated (quarantined, not recovered): 1");
    expect(result.stdout).toContain("reconstructed: 0");
    expect(result.stdout).not.toMatch(/\brepaired:/);
  });

  it("leaves the store healthy and the quarantine out of history", async () => {
    await seed();
    corruptSnapshotRecord();
    await cli([...base(), "--apply"]);

    const status = await cli([
      "memory",
      "status",
      projectRoot,
      "--project-id",
      PROJECT_ID,
      "--data-dir",
      dataDir,
      "--json",
    ]);
    const parsedStatus = JSON.parse(status.stdout) as { data: { status: string } };
    expect(parsedStatus.data.status).toBe("healthy");

    const history = await cli([
      "memory",
      "history",
      projectRoot,
      "--project-id",
      PROJECT_ID,
      "--data-dir",
      dataDir,
      "--json",
    ]);
    // The isolated snapshot is gone from the chronology, and no quarantine path
    // leaked into it.
    expect(history.stdout).not.toContain("quarantine");
    expect(history.stdout).not.toContain("payload.bin");
  });

  it("converges: a second preview finds nothing left to do", async () => {
    await seed();
    corruptSnapshotRecord();
    await cli([...base(), "--apply"]);
    const again = await cli([...base(), "--json"]);
    const parsed = JSON.parse(again.stdout) as { data: { findingCount: number } };
    expect(parsed.data.findingCount).toBe(0);
  });
});

describe("the repair grammar fails closed", () => {
  it("rejects options that belong to other subcommands", async () => {
    for (const bad of [
      ["--confirm", "x"],
      ["--destination", "/tmp/x"],
      ["--limit", "5"],
      ["--migrate-store"],
      ["--locale", "en"],
    ]) {
      const result = await cli([...base(), ...bad]);
      expect(result.exitCode, `${bad[0]} must be rejected for repair`).not.toBe(0);
    }
  });

  it("accepts --apply, which the read-only subcommands reject", async () => {
    // Parser-level: repair is in the apply allowlist, timeline is not.
    const repair = await cli([...base(), "--apply", "--json"]);
    expect(repair.exitCode).toBe(0);
    const timeline = await cli([
      "memory",
      "timeline",
      "--project-id",
      PROJECT_ID,
      "--data-dir",
      dataDir,
      "--apply",
    ]);
    expect(timeline.exitCode).not.toBe(0);
  });
});
