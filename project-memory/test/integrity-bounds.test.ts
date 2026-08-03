// Bounded integrity baselines (v0.6.2 Phase E).
//
// This is NOT the v0.6.5 performance release and invents no SLOs. It establishes
// STRUCTURAL bounds -- how many files an operation visits, how many times it reads
// the same bytes, how the work grows with store size -- over deterministic
// fixtures.
//
// Why structural rather than wall-clock: a timing gate on shared CI is a coin
// flip. It fails on a noisy neighbour and passes on a genuine 10x regression that
// happened to run on a quiet machine. Counting operations is exact, reproducible,
// and actually pins the property that matters -- "the scanner does not re-read the
// whole store once per finding" is a claim about algorithmic shape, not speed.
//
// Timing is recorded nowhere here. If a future release wants regression detection
// it should add generous, explicitly non-normative timing beside these counts.

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveProjectKey } from "../src/integrity.js";
import {
  PROJECTS_DIRNAME,
  QUARANTINE_DIRNAME,
  resolveStoreLayout,
  STAGING_DIRNAME,
} from "../src/path-safety.js";
import { applyRepairPlan } from "../src/repair-apply.js";
import { buildRepairPlan } from "../src/repair-plan.js";
import { scanStore } from "../src/repair-scan.js";
import { DATA_ROOT, makeEvidence, makeSnapshot, PROJECT_ROOT } from "./fixtures.js";
import { DependencyInjectedStore } from "../src/store.js";
import { MemoryFileSystem } from "./memory-filesystem.js";

const NOW = "2026-03-01T00:00:00.000Z";
const layout = resolveStoreLayout(DATA_ROOT);

/**
 * A filesystem that counts the calls an operation makes.
 *
 * Counting at the PORT is what makes these bounds meaningful: every byte of real
 * I/O in this package flows through this interface, so a count here is a count of
 * actual filesystem work, not of some internal helper that might be memoized.
 */
class CountingFileSystem extends MemoryFileSystem {
  readonly counts = { readFile: 0, exists: 0, readDir: 0, write: 0, remove: 0, lock: 0 };
  /** Every path read, so a repeated read of the same bytes is visible. */
  readonly reads: string[] = [];

  override async readFileIfExists(path: string): Promise<string | null> {
    this.counts.readFile += 1;
    this.reads.push(path);
    return super.readFileIfExists(path);
  }
  override async exists(path: string): Promise<boolean> {
    this.counts.exists += 1;
    return super.exists(path);
  }
  override async readDir(path: string): Promise<ReturnType<MemoryFileSystem["readDir"]>> {
    this.counts.readDir += 1;
    return super.readDir(path);
  }
  override async writeFileAtomic(p: string, c: string, t: string): Promise<void> {
    this.counts.write += 1;
    return super.writeFileAtomic(p, c, t);
  }
  override async removeFile(path: string): Promise<void> {
    this.counts.remove += 1;
    return super.removeFile(path);
  }
  override async removeDir(path: string): Promise<void> {
    this.counts.remove += 1;
    return super.removeDir(path);
  }
  override async createLockExclusive(
    path: string,
    contents: string,
  ): Promise<{ acquired: boolean }> {
    this.counts.lock += 1;
    return super.createLockExclusive(path, contents);
  }
}

/** Deterministic fixture size classes. */
const SIZES = { small: 1, medium: 8, large: 40 } as const;

/** Build a store with `snapshots` captures, each carrying one evidence record. */
async function seed(
  fs: CountingFileSystem,
  projectId: string,
  snapshots: number,
): Promise<DependencyInjectedStore> {
  const store = new DependencyInjectedStore({ fs, dataRoot: DATA_ROOT });
  for (let i = 0; i < snapshots; i += 1) {
    const capturedAt = `2026-03-01T00:00:${String(i).padStart(2, "0")}.000Z`;
    await store.commitSnapshotBundle({
      projectId,
      projectRootBoundary: PROJECT_ROOT,
      operationId: `seed-${i}`,
      occurredAt: capturedAt,
      snapshot: makeSnapshot(projectId, `snap-${i}`, [`ev-${i}`], { capturedAt }),
      evidence: [makeEvidence(projectId, `ev-${i}`)],
    });
  }
  return store;
}

function recordPathsOf(fs: CountingFileSystem, projectId: string): string[] {
  const key = deriveProjectKey(projectId);
  // Normalized to "/" to match listPaths(), which returns normalized keys.
  // keyFor(), not a hand-rolled separator swap: the double's normalization also
  // folds a Windows drive prefix into a leading segment, so only it produces the
  // key form listPaths() returns.
  const prefix = `${fs.keyFor(join(layout.storeRoot, PROJECTS_DIRNAME, key))}/`;
  // listPaths() returns NORMALIZED keys, so the prefix comparison holds whatever
  // separator the layout used. A raw nodes.keys() read matched nothing on Windows.
  const found = fs.listPaths().filter((p) => p.startsWith(prefix) && p.endsWith(".json"));
  // ANTI-VACUITY GATE. Every bound in this file compares counts, and a helper that
  // silently returned [] made each one compare zero against zero -- which is how
  // these tests passed on POSIX while the same code found nothing on Windows.
  // Failing loudly here turns a silent no-op into a visible defect.
  if (found.length === 0) {
    throw new Error(
      `recordPathsOf found no records under ${prefix}. The fixture is non-empty, so ` +
        `this is a path-key mismatch, not an empty store.`,
    );
  }
  return found;
}

describe("scan is bounded by store size, not by finding count", () => {
  it("reads each authoritative file at most once per scan", async () => {
    const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(fs, "bounds-once", SIZES.medium);

    // Mark where the seeding reads end rather than truncating the array: mutating
    // shared state around an await is exactly the pattern that makes a counter
    // unreliable.
    const seedReads = fs.reads.length;
    await scanStore({ fs, layout, projectId: "bounds-once" });
    const scanReads = fs.reads.slice(seedReads);

    // No path is read twice. A scanner that re-read a record per check would show
    // duplicates here even while producing identical findings.
    const duplicates = scanReads.filter((p, i) => scanReads.indexOf(p) !== i);
    expect(duplicates).toEqual([]);
  });

  it("does not re-scan the store once per finding", async () => {
    // Damage EVERY snapshot, then compare the read count against a clean scan of
    // the same store. Per-finding rescanning would multiply the reads by the
    // finding count; a single pass leaves them essentially unchanged.
    const clean = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(clean, "bounds-clean", SIZES.medium);
    clean.counts.readFile = 0;
    const cleanScan = await scanStore({ fs: clean, layout, projectId: "bounds-clean" });
    const cleanReads = clean.counts.readFile;
    expect(cleanScan.findings).toEqual([]);

    const damaged = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(damaged, "bounds-damaged", SIZES.medium);
    for (const path of recordPathsOf(damaged, "bounds-damaged")) {
      if (path.includes("snapshots")) damaged.poke(path, "{broken");
    }
    damaged.counts.readFile = 0;
    const damagedScan = await scanStore({ fs: damaged, layout, projectId: "bounds-damaged" });
    const damagedReads = damaged.counts.readFile;

    expect(damagedScan.findings.length).toBeGreaterThanOrEqual(SIZES.medium);
    // Equal work for equal store size, regardless of how much is wrong.
    expect(damagedReads).toBe(cleanReads);
  });

  it("grows linearly, not quadratically, with store size", async () => {
    const measure = async (snapshots: number, id: string): Promise<number> => {
      const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
      await seed(fs, id, snapshots);
      fs.counts.readFile = 0;
      await scanStore({ fs, layout, projectId: id });
      return fs.counts.readFile;
    };

    const small = await measure(SIZES.small, "growth-small");
    const large = await measure(SIZES.large, "growth-large");

    // Linear in records means the ratio tracks the size ratio. A quadratic scan
    // would land near the SQUARE of it, which this bound excludes with room to
    // spare for the fixed per-scan reads (the manifest).
    const sizeRatio = SIZES.large / SIZES.small;
    expect(large).toBeLessThanOrEqual(small * sizeRatio * 2);
    expect(large).toBeGreaterThan(small);
  });

  it("visits a bounded number of directories regardless of size", async () => {
    // The scanner enumerates a FIXED set of directories (snapshots, evidence,
    // staging) by explicit path. It never walks the project directory, which is
    // what keeps quarantine and backups out of record discovery by construction.
    const counts: number[] = [];
    for (const [index, size] of [SIZES.small, SIZES.large].entries()) {
      const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
      await seed(fs, `dirs-${index}`, size);
      fs.counts.readDir = 0;
      await scanStore({ fs, layout, projectId: `dirs-${index}` });
      counts.push(fs.counts.readDir);
    }
    // Identical for a 1-snapshot and a 40-snapshot store.
    expect(counts[0]).toBe(counts[1]);
    expect(counts[0]).toBeLessThanOrEqual(4);
  });
});

describe("repair work is bounded by the plan, not the store", () => {
  it("writes only what the plan named, plus one manifest and one receipt", async () => {
    const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(fs, "bounds-apply", SIZES.medium);
    const damaged = recordPathsOf(fs, "bounds-apply").filter((p) => p.includes("snapshots"))[0];
    fs.poke(damaged as string, "{broken");

    const scan = await scanStore({ fs, layout, projectId: "bounds-apply" });
    const plan = buildRepairPlan({ scan, operationId: "bounds-op", generatedAt: NOW });

    fs.counts.write = 0;
    fs.counts.remove = 0;
    await applyRepairPlan({
      fs,
      layout,
      plan,
      apply: true,
      appliedAt: NOW,
      projectRootBoundary: PROJECT_ROOT,
    });

    // One quarantine payload + one metadata + one rebuilt manifest + one receipt
    // for a single-finding plan. Isolating one record must not rewrite the store.
    expect(fs.counts.write).toBeLessThanOrEqual(4);
    // Exactly one live path removed: the file the plan named.
    expect(fs.counts.remove).toBe(1);
  });

  it("takes the writer lock exactly once per apply", async () => {
    const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(fs, "bounds-lock", SIZES.small);
    const damaged = recordPathsOf(fs, "bounds-lock").filter((p) => p.includes("snapshots"))[0];
    fs.poke(damaged as string, "{broken");

    const scan = await scanStore({ fs, layout, projectId: "bounds-lock" });
    const plan = buildRepairPlan({ scan, operationId: "lock-op", generatedAt: NOW });
    fs.counts.lock = 0;
    await applyRepairPlan({
      fs,
      layout,
      plan,
      apply: true,
      appliedAt: NOW,
      projectRootBoundary: PROJECT_ROOT,
    });
    // One acquire. No spinning, no retry loop, and no unbounded wait: a contended
    // lock fails closed rather than polling.
    expect(fs.counts.lock).toBe(1);
  });

  it("never writes or locks during a preview", async () => {
    const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(fs, "bounds-preview", SIZES.medium);
    const damaged = recordPathsOf(fs, "bounds-preview").filter((p) => p.includes("snapshots"))[0];
    fs.poke(damaged as string, "{broken");

    fs.counts.write = 0;
    fs.counts.remove = 0;
    fs.counts.lock = 0;
    const scan = await scanStore({ fs, layout, projectId: "bounds-preview" });
    buildRepairPlan({ scan, operationId: "preview-op", generatedAt: NOW });

    // Counted at the port, so this is a statement about real I/O.
    expect(fs.counts.write).toBe(0);
    expect(fs.counts.remove).toBe(0);
    expect(fs.counts.lock).toBe(0);
  });
});

describe("adversarial fixtures stay bounded", () => {
  it("handles many temporary files without extra record reads", async () => {
    const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(fs, "bounds-temps", SIZES.small);
    const key = deriveProjectKey("bounds-temps");
    const staging = join(layout.storeRoot, PROJECTS_DIRNAME, key, STAGING_DIRNAME);
    await fs.mkdirp(staging);
    for (let i = 0; i < 200; i += 1) {
      fs.poke(join(staging, `.tmp-op-1-${i}-staged`), "x");
    }

    fs.counts.readFile = 0;
    const scan = await scanStore({ fs, layout, projectId: "bounds-temps" });
    // Residue is classified by NAME. Reading 200 partially-written temp files
    // would add nothing a repair decision depends on, so none are read.
    expect(scan.findings.filter((f) => f.code === "temporary_file_residue")).toHaveLength(200);
    expect(fs.counts.readFile).toBeLessThanOrEqual(4);
  });

  it("scans a long history in a single pass", async () => {
    const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(fs, "bounds-history", SIZES.large);
    const seedReads = fs.reads.length;
    const scan = await scanStore({ fs, layout, projectId: "bounds-history" });
    const scanReads = fs.reads.length - seedReads;
    expect(scan.findings).toEqual([]);
    // One read per record, plus the manifest, plus one lock probe: a scan
    // classifies the project lock too, and that probe is a fixed cost rather than
    // one per record.
    expect(scanReads).toBe(SIZES.large * 2 + 2);
  });

  it("stays bounded with quarantine already present", async () => {
    // A quarantine-heavy store must not slow a scan: quarantine is outside every
    // record-discovery path, so its size cannot affect scan work at all.
    const fs = new CountingFileSystem({ now: () => NOW, pid: 1 });
    await seed(fs, "bounds-quar", SIZES.small);
    const before = await scanStore({ fs, layout, projectId: "bounds-quar" });

    const key = deriveProjectKey("bounds-quar");
    const quarantine = join(layout.storeRoot, PROJECTS_DIRNAME, key, QUARANTINE_DIRNAME);
    for (let i = 0; i < 50; i += 1) {
      fs.poke(join(quarantine, `op-${i}`, "entry", "payload.bin"), "old");
    }

    fs.counts.readFile = 0;
    const after = await scanStore({ fs, layout, projectId: "bounds-quar" });
    const readsWithQuarantine = fs.counts.readFile;

    // Identical findings and identical fingerprint: 50 quarantined payloads are
    // invisible to the scan, which is what keeps a repaired store from drifting
    // into "changed" on every later preview.
    expect(after.findings).toEqual(before.findings);
    expect(after.storeFingerprint).toBe(before.storeFingerprint);
    // Records + manifest + the one fixed lock probe. Unchanged by 50 quarantined
    // payloads, which is the property under test.
    expect(readsWithQuarantine).toBeLessThanOrEqual(SIZES.small * 2 + 2);
  });
});
