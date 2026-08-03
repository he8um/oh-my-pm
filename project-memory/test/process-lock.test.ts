// G3 -- the single-writer lock proven across REAL operating-system processes.
//
// concurrency.test.ts already proves the lock POLICY: staleness requires
// `age exceeded AND owner dead`, reads never lock, distinct projects do not
// contend. It does so in one process against MemoryFileSystem, which means the
// MECHANISM was unproven: nothing showed that `open(path, "wx")` on a real
// filesystem actually excludes a second OS process, that killing a writer leaves
// a reclaimable lock owned by a really-dead PID, or that a fresh process can
// recover on the damaged store another process left behind.
//
// This suite closes that gap. Every scenario spawns real `node` child processes
// against a real temporary store directory, with real PIDs and real termination.
// Synchronization is by explicit handshake -- named stdout events and marker
// files -- never by sleeping. The timeouts guard against a deadlock hanging the
// suite; they are not how the tests wait.

import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { deriveProjectKey } from "../src/integrity.js";
import { STALE_LOCK_THRESHOLD_MS } from "../src/lock.js";
import { lockPathFor, resolveStoreLayout } from "../src/path-safety.js";
import { NodeFileSystem } from "../src/node-adapter.js";
import { DependencyInjectedStore } from "../src/store.js";

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(HERE, "..");
const WORKER = join(HERE, "process-lock-worker.mjs");
const DIST_DIR = join(PACKAGE_DIR, "dist");

/** Deadlock guard only. Never used to sequence a handshake. */
const DEADLOCK_MS = 60_000;

const PROJECT_ID = "proj-lock";

interface WorkerEvent {
  readonly event: string;
  readonly pid: number;
  readonly [key: string]: unknown;
}

/** A spawned worker plus the handshake plumbing the parent waits on. */
interface Worker {
  readonly pid: number;
  /** Resolve when the named event arrives; reject on worker exit or deadlock. */
  waitFor(event: string): Promise<WorkerEvent>;
  /** All events observed so far, in arrival order. */
  events(): readonly WorkerEvent[];
  /** Resolve when the process has exited, with its code/signal. */
  exited(): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  kill(signal?: NodeJS.Signals): void;
}

/**
 * Build dist/ ONCE before any worker spawns. A child process cannot resolve the
 * ".js" specifiers the TS sources use, so the worker imports the built package;
 * building here means the worker can never exercise a stale artifact.
 */
beforeAll(async () => {
  await execFileAsync(
    process.execPath,
    [join(PACKAGE_DIR, "..", "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"],
    { cwd: PACKAGE_DIR },
  );
  await stat(join(DIST_DIR, "lock.js"));
}, 300_000);

let root: string;
let dataRoot: string;
let projectRoot: string;
let markerDir: string;
const live: Worker[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "omp-proc-lock-"));
  dataRoot = join(root, "data");
  projectRoot = join(root, "project");
  markerDir = join(root, "markers");
  const fs = new NodeFileSystem();
  await fs.mkdirp(dataRoot);
  await fs.mkdirp(projectRoot);
  await fs.mkdirp(markerDir);
});

afterEach(async () => {
  // Never leave a real child process behind, even when an assertion failed.
  for (const worker of live.splice(0)) {
    try {
      worker.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
  await rm(root, { recursive: true, force: true });
});

afterAll(() => {
  for (const worker of live.splice(0)) {
    try {
      worker.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
});

interface SpawnConfig {
  readonly scenario: string;
  readonly operationId?: string;
  readonly snapshotId?: string;
  readonly evidenceId?: string;
  readonly occurredAt?: string;
  readonly nowIso?: string;
  readonly forceAlive?: boolean;
  readonly releaseAfterAcquire?: boolean;
  readonly releaseOnSuccess?: boolean;
  readonly holdUntilSignalFile?: boolean;
  readonly commits?: readonly Record<string, string>[];
}

/** Spawn a real child process running one worker scenario. */
function spawnWorker(config: SpawnConfig): Worker {
  const payload = JSON.stringify({
    ...config,
    distDir: DIST_DIR,
    dataRoot,
    projectRoot,
    markerDir,
    projectId: PROJECT_ID,
  });
  // Spawn so stdout streams line-by-line; the handshake reads those lines.
  const child = spawn(process.execPath, [WORKER, payload], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.stdout === null || child.stderr === null) {
    throw new Error("worker stdio pipes were not created");
  }

  const observed: WorkerEvent[] = [];
  const waiters = new Map<string, ((event: WorkerEvent) => void)[]>();
  let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  const exitWaiters: ((info: { code: number | null; signal: NodeJS.Signals | null }) => void)[] =
    [];

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length > 0) {
        const parsed = JSON.parse(line) as WorkerEvent;
        observed.push(parsed);
        for (const resolve of waiters.get(parsed.event) ?? []) resolve(parsed);
        waiters.delete(parsed.event);
      }
      index = buffer.indexOf("\n");
    }
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  child.on("exit", (code, signal) => {
    exitInfo = { code, signal };
    for (const resolve of exitWaiters.splice(0)) resolve(exitInfo);
  });

  const worker: Worker = {
    pid: child.pid ?? -1,
    events: () => observed,
    waitFor(event: string): Promise<WorkerEvent> {
      const already = observed.find((candidate) => candidate.event === event);
      if (already !== undefined) return Promise.resolve(already);
      return new Promise<WorkerEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `deadlock: worker never emitted "${event}". seen=${JSON.stringify(
                observed.map((candidate) => candidate.event),
              )} stderr=${stderr}`,
            ),
          );
        }, DEADLOCK_MS);
        const list = waiters.get(event) ?? [];
        list.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
        waiters.set(event, list);
        // A process that exits without emitting the event is a failure, not a hang.
        void worker.exited().then(() => {
          const found = observed.find((candidate) => candidate.event === event);
          if (found === undefined) {
            clearTimeout(timer);
            reject(
              new Error(
                `worker exited before emitting "${event}". seen=${JSON.stringify(
                  observed.map((candidate) => candidate.event),
                )} stderr=${stderr}`,
              ),
            );
          }
        });
      });
    },
    exited(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
      if (exitInfo !== null) return Promise.resolve(exitInfo);
      return new Promise((resolve) => exitWaiters.push(resolve));
    },
    kill(signal: NodeJS.Signals = "SIGKILL") {
      child.kill(signal);
    },
  };
  live.push(worker);
  return worker;
}

/** The lock path the store uses for the fixture project. */
function fixtureLockPath(): string {
  return lockPathFor(resolveStoreLayout(dataRoot), deriveProjectKey(PROJECT_ID));
}

/** Read the on-disk lock record, or null when absent. */
async function readLockRecord(): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(fixtureLockPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A store bound to the real Node adapter for parent-side inspection. */
function parentStore(
  options: { now?: () => string; isProcessAlive?: (pid: number) => boolean } = {},
) {
  return new DependencyInjectedStore({
    fs: new NodeFileSystem(options),
    dataRoot,
  });
}

describe("cross-process exclusive acquisition", () => {
  it("a second OS process cannot acquire a lock another process holds", async () => {
    const holder = spawnWorker({ scenario: "holdLock", operationId: "op-holder" });
    await holder.waitFor("child-started");
    const acquired = await holder.waitFor("lock-acquired");
    expect(acquired.pid).toBeGreaterThan(0);
    expect(acquired.pid).not.toBe(process.pid);

    // The lock file exists on the real filesystem and is owned by the child.
    const record = await readLockRecord();
    expect(record).not.toBeNull();
    expect(record?.["pid"]).toBe(acquired.pid);

    // A genuinely separate process attempts the same lock exactly once.
    const contender = spawnWorker({ scenario: "tryAcquire", operationId: "op-contender" });
    await contender.waitFor("second-attempted");
    const result = await contender.waitFor("second-result");
    expect(result["ok"]).toBe(false);
    expect(result["code"]).toBe(PROJECT_MEMORY_ERROR_CODES.storeLocked);
    expect(contender.pid).not.toBe(holder.pid);

    // The holder still owns the lock: refusal did not disturb it.
    expect((await readLockRecord())?.["pid"]).toBe(acquired.pid);
  });

  it("acquisition failure is bounded and deterministic: no spinning", async () => {
    const holder = spawnWorker({ scenario: "holdLock" });
    await holder.waitFor("lock-acquired");

    // Three independent processes each attempt once. Every one must fail fast
    // with the same controlled code -- acquireLock does not retry in a loop.
    const contenders = [1, 2, 3].map((n) =>
      spawnWorker({ scenario: "tryAcquire", operationId: `op-bounded-${n}` }),
    );
    const results = await Promise.all(contenders.map((c) => c.waitFor("second-result")));
    for (const result of results) {
      expect(result["ok"]).toBe(false);
      expect(result["code"]).toBe(PROJECT_MEMORY_ERROR_CODES.storeLocked);
      // Bounded: a single exclusive-create plus one stale check, no backoff loop.
      expect(result["elapsedMs"] as number).toBeLessThan(DEADLOCK_MS / 2);
    }
    // All three exited on their own; none hung waiting for the lock.
    for (const contender of contenders) {
      const exit = await contender.exited();
      expect(exit.code).toBe(0);
    }
  });

  it("exactly one of many racing processes reports success in one exclusive window", async () => {
    // Six processes race for a lock nobody holds yet. Each holds until the
    // parent drops a release marker, so a winner cannot release early and let a
    // second process also succeed inside the same window.
    const racers = [1, 2, 3, 4, 5, 6].map((n) =>
      spawnWorker({
        scenario: "raceAcquire",
        operationId: `op-race-${n}`,
        holdUntilSignalFile: true,
      }),
    );
    const results = await Promise.all(racers.map((r) => r.waitFor("second-result")));
    const winners = results.filter((result) => result["ok"] === true);
    const losers = results.filter((result) => result["ok"] === false);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(5);
    for (const loser of losers) {
      expect(loser["code"]).toBe(PROJECT_MEMORY_ERROR_CODES.storeLocked);
    }

    // Release the winner only after the assertion above: the exclusive window
    // provably contained exactly one success.
    await writeFile(join(markerDir, "release-now"), "go\n", "utf8");
    for (const racer of racers) {
      expect((await racer.exited()).code).toBe(0);
    }
  });

  it("a released lock is immediately acquirable by a later process", async () => {
    const holder = spawnWorker({ scenario: "holdLock", releaseAfterAcquire: true });
    await holder.waitFor("lock-acquired");
    await holder.waitFor("owner-killed-or-released");
    expect((await holder.exited()).code).toBe(0);
    // Release removed the file, so the next process is not refused.
    expect(await readLockRecord()).toBeNull();

    const next = spawnWorker({ scenario: "tryAcquire", operationId: "op-after-release" });
    const result = await next.waitFor("second-result");
    expect(result["ok"]).toBe(true);
  });
});

describe("live owners are never evicted", () => {
  it("a live slow writer keeps its lock and completes its commit", async () => {
    const writer = spawnWorker({
      scenario: "slowCommit",
      operationId: "op-slow-writer",
      snapshotId: "snap-slow",
      evidenceId: "ev-slow",
    });
    // The writer stalls INSIDE its commit, holding the lock, and stays stalled
    // until this test says otherwise. No sleep is involved on either side.
    await writer.waitFor("stalled");
    expect((await readLockRecord())?.["pid"]).toBe(writer.pid);

    // While the writer genuinely holds the lock mid-commit, an independent
    // process is refused -- and the live writer is not evicted to make room.
    const contender = spawnWorker({ scenario: "tryAcquire", operationId: "op-during-slow" });
    const refusal = await contender.waitFor("second-result");
    expect(refusal["ok"]).toBe(false);
    expect(refusal["code"]).toBe(PROJECT_MEMORY_ERROR_CODES.storeLocked);
    // Still the same live owner after the refusal.
    expect((await readLockRecord())?.["pid"]).toBe(writer.pid);
    expect(isAlive(writer.pid)).toBe(true);

    // Release the stall; the writer was never evicted, so its commit completes.
    await writeFile(join(markerDir, "proceed"), "go\n", "utf8");
    await writer.waitFor("resumed");
    await writer.waitFor("commit-completed");
    expect((await writer.exited()).code).toBe(0);
    const manifest = await parentStore().readManifest(PROJECT_ID);
    expect(manifest?.snapshotIds).toContain("snap-slow");
    // The lock is gone: release ran in `finally` on the success path.
    expect(await readLockRecord()).toBeNull();
  });

  it("an old lock whose owner is still alive is NOT reclaimed", async () => {
    const holder = spawnWorker({ scenario: "holdLock", operationId: "op-old-live" });
    const acquired = await holder.waitFor("lock-acquired");

    // The contender sees a reference time far past the stale threshold, but the
    // real owner PID is genuinely alive, so `age AND dead` is not satisfied.
    const contender = spawnWorker({
      scenario: "tryAcquire",
      operationId: "op-old-live-contender",
      nowIso: new Date(Date.now() + STALE_LOCK_THRESHOLD_MS * 100).toISOString(),
    });
    const result = await contender.waitFor("second-result");
    expect(result["ok"]).toBe(false);
    expect(result["code"]).toBe(PROJECT_MEMORY_ERROR_CODES.storeLocked);
    // Untouched: same owner still recorded.
    expect((await readLockRecord())?.["pid"]).toBe(acquired.pid);
  });

  it("a dead owner BELOW the stale threshold is not reclaimed (age AND dead)", async () => {
    // Kill the owner so its PID is genuinely dead, then contend with a reference
    // time inside the threshold. Dead alone must not be sufficient.
    const holder = spawnWorker({ scenario: "holdLock", operationId: "op-dead-fresh" });
    const acquired = await holder.waitFor("lock-acquired");
    holder.kill("SIGKILL");
    await holder.exited();

    const contender = spawnWorker({
      scenario: "tryAcquire",
      operationId: "op-dead-fresh-contender",
      // Reference time equal to the lock's own creation: age is ~0.
      nowIso: String((await readLockRecord())?.["createdAt"]),
    });
    const result = await contender.waitFor("second-result");
    expect(result["ok"]).toBe(false);
    expect(result["code"]).toBe(PROJECT_MEMORY_ERROR_CODES.storeLocked);
    // The residue is still the dead owner's lock; nothing reclaimed it.
    expect((await readLockRecord())?.["pid"]).toBe(acquired.pid);
  });

  it("a dead AND stale owner is reclaimed by a later process", async () => {
    const holder = spawnWorker({ scenario: "holdLock", operationId: "op-dead-stale" });
    await holder.waitFor("lock-acquired");
    holder.kill("SIGKILL");
    await holder.exited();

    const contender = spawnWorker({
      scenario: "tryAcquire",
      operationId: "op-dead-stale-contender",
      nowIso: new Date(Date.now() + STALE_LOCK_THRESHOLD_MS * 10).toISOString(),
    });
    const result = await contender.waitFor("second-result");
    expect(result["ok"]).toBe(true);
    expect((await contender.exited()).code).toBe(0);
  });
});

describe("killing a writer, then recovering on the same persisted store", () => {
  it("a hard kill leaves realistic lock residue owned by a dead PID", async () => {
    const victim = spawnWorker({
      scenario: "crashMidCommit",
      operationId: "op-victim",
      snapshotId: "snap-victim",
      evidenceId: "ev-victim",
    });
    // The victim stalls mid-commit while holding the lock.
    await victim.waitFor("stalled");
    expect((await readLockRecord())?.["pid"]).toBe(victim.pid);
    // Kill it from OUTSIDE: nothing in the victim can intercept this, so no
    // `finally` runs and the lock is genuinely orphaned.
    victim.kill("SIGKILL");
    const exit = await victim.exited();
    // POSIX reports the signal; Windows reports a non-zero code. Either proves
    // the process did not exit through its own cleanup path.
    expect(exit.signal === "SIGKILL" || exit.code !== 0).toBe(true);

    const record = await readLockRecord();
    expect(record).not.toBeNull();
    expect(record?.["pid"]).toBe(victim.pid);
    // The owning PID is genuinely dead now.
    expect(isAlive(victim.pid)).toBe(false);
  });

  it("a NEW process recovers and commits on the very store the crash damaged", async () => {
    const victim = spawnWorker({
      scenario: "crashMidCommit",
      operationId: "op-victim-2",
      snapshotId: "snap-victim-2",
      evidenceId: "ev-victim-2",
    });
    await victim.waitFor("stalled");
    victim.kill("SIGKILL");
    await victim.exited();
    const residue = await readLockRecord();
    expect(residue).not.toBeNull();
    expect(residue?.["pid"]).toBe(victim.pid);

    // A genuinely new process, on the SAME dataRoot, with a reference time past
    // the stale threshold: the dead+stale lock is reclaimable and the commit
    // proceeds against the persisted (possibly partially written) store.
    const recoverer = spawnWorker({
      scenario: "recoverAndCommit",
      operationId: "op-recovery",
      snapshotId: "snap-recovered",
      evidenceId: "ev-recovered",
      occurredAt: "2026-01-02T00:00:00.000Z",
      nowIso: new Date(Date.now() + STALE_LOCK_THRESHOLD_MS * 10).toISOString(),
    });
    await recoverer.waitFor("recovery-started");
    const completed = await recoverer.waitFor("recovery-completed");
    expect(completed["ok"]).toBe(true);
    expect(recoverer.pid).not.toBe(victim.pid);

    // The store is consistent and readable, and the lock was released.
    const manifest = await parentStore().readManifest(PROJECT_ID);
    expect(manifest).not.toBeNull();
    expect(manifest?.snapshotIds).toContain("snap-recovered");
    expect(await readLockRecord()).toBeNull();

    const verification = await parentStore().verify(PROJECT_ID);
    expect(verification.ok).toBe(true);
  });

  it("no staging residue or duplicate state survives cross-process recovery", async () => {
    const victim = spawnWorker({
      scenario: "crashMidCommit",
      operationId: "op-victim-3",
      snapshotId: "snap-victim-3",
      evidenceId: "ev-victim-3",
    });
    await victim.waitFor("stalled");
    victim.kill("SIGKILL");
    await victim.exited();

    const recoverer = spawnWorker({
      scenario: "recoverAndCommit",
      operationId: "op-recovery-3",
      snapshotId: "snap-recovered-3",
      evidenceId: "ev-recovered-3",
      nowIso: new Date(Date.now() + STALE_LOCK_THRESHOLD_MS * 10).toISOString(),
    });
    expect((await recoverer.waitFor("recovery-completed"))["ok"]).toBe(true);

    const inspection = await parentStore().inspect(PROJECT_ID);
    // After a completed recovery the store must be internally consistent: no
    // abandoned staging left by the killed writer, no record the manifest
    // references but cannot find, no integrity failure, and a supported format.
    // Named explicitly rather than filtered on a severity field -- inspection
    // issues carry a `kind`, and a filter on a property that does not exist
    // would pass vacuously no matter how damaged the store was.
    const unresolved = inspection.issues.filter((issue) =>
      (
        ["abandonedStaging", "missingRecord", "integrityFailure", "unsupportedFormat"] as const
      ).includes(issue.kind as "abandonedStaging"),
    );
    expect(unresolved).toEqual([]);
    // And verification, which re-derives every checksum from the persisted bytes,
    // still passes on the recovered store.
    expect((await parentStore().verify(PROJECT_ID)).ok).toBe(true);
  });
});

describe("cross-process consistency of the committed store", () => {
  it("sequential commits from separate processes produce no duplicate ids and valid chronology", async () => {
    // Three processes commit in turn, each on the store the previous one left.
    for (const n of [1, 2, 3]) {
      const worker = spawnWorker({
        scenario: "seedCommits",
        commits: [
          {
            operationId: `op-seq-${n}`,
            snapshotId: `snap-seq-${n}`,
            evidenceId: `ev-seq-${n}`,
            occurredAt: `2026-01-0${n}T00:00:00.000Z`,
          },
        ],
      });
      await worker.waitFor("commit-completed");
      expect((await worker.exited()).code).toBe(0);
    }

    const manifest = await parentStore().readManifest(PROJECT_ID);
    expect(manifest).not.toBeNull();
    const ids = manifest?.snapshotIds ?? [];
    // No duplicate record ids.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["snap-seq-1", "snap-seq-2", "snap-seq-3"]));
    const evidenceIds = manifest?.evidenceIds ?? [];
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length);

    // Chronology is valid and the manifest is not in a mixed state: the latest
    // snapshot is the final history entry, and integrity verification passes
    // (which re-derives every checksum from the persisted bytes).
    const history = manifest?.snapshotHistory ?? [];
    expect(history.length).toBe(ids.length);
    expect(manifest?.latestSnapshotId).toBe(history[history.length - 1]?.snapshotId);
    const capturedTimes = history.map((entry) => entry.capturedAt);
    expect([...capturedTimes].sort()).toEqual(capturedTimes);

    const verification = await parentStore().verify(PROJECT_ID);
    expect(verification.ok).toBe(true);

    // Sequence numbers, where the store assigns them, must be unique.
    const sequences = history
      .map((entry) => (entry as { sequence?: number }).sequence)
      .filter((value): value is number => typeof value === "number");
    if (sequences.length > 0) {
      expect(new Set(sequences).size).toBe(sequences.length);
    }
  });

  it("a refused writer commits nothing: no partial records appear", async () => {
    // Seed one good commit so the store exists.
    const seed = spawnWorker({
      scenario: "seedCommits",
      commits: [
        {
          operationId: "op-seed",
          snapshotId: "snap-seed",
          evidenceId: "ev-seed",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    await seed.waitFor("commit-completed");
    await seed.exited();
    const before = await parentStore().readManifest(PROJECT_ID);

    // Hold the lock, then a full store commit from another process must be
    // refused before writing anything.
    const holder = spawnWorker({ scenario: "holdLock", operationId: "op-block" });
    await holder.waitFor("lock-acquired");
    const blocked = spawnWorker({
      scenario: "recoverAndCommit",
      operationId: "op-blocked-commit",
      snapshotId: "snap-blocked",
      evidenceId: "ev-blocked",
    });
    const outcome = await blocked.waitFor("recovery-completed");
    expect(outcome["ok"]).toBe(false);
    expect(outcome["code"]).toBe(PROJECT_MEMORY_ERROR_CODES.storeLocked);

    const after = await parentStore().readManifest(PROJECT_ID);
    expect(after?.snapshotIds).toEqual(before?.snapshotIds);
    expect(after?.snapshotIds).not.toContain("snap-blocked");
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });
});

describe("lock metadata discloses nothing sensitive", () => {
  it("the on-disk lock record carries no secret, argv, environment, or project path", async () => {
    const holder = spawnWorker({ scenario: "holdLock", operationId: "op-metadata" });
    await holder.waitFor("lock-acquired");
    const raw = await readFile(fixtureLockPath(), "utf8");
    const record = JSON.parse(raw) as Record<string, unknown>;

    // Exactly the documented fields, nothing more.
    expect(Object.keys(record).sort()).toEqual([
      "createdAt",
      "lockVersion",
      "operationId",
      "pid",
      "projectKey",
    ]);
    // The project key is a SHA-256 digest, never a readable path.
    expect(record["projectKey"]).toMatch(/^[0-9a-f]{64}$/);
    expect(raw).not.toContain(projectRoot);
    expect(raw).not.toContain(dataRoot);
    expect(raw).not.toContain(PROJECT_ID);
    // No argv or environment dump.
    expect(raw).not.toContain(process.execPath);
    expect(raw).not.toContain("node_modules");
    for (const forbidden of ["token", "secret", "password", "authorization", "apiKey", "env"]) {
      expect(raw.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // No absolute path of any kind in the persisted record.
    expect(raw).not.toMatch(/(^|")([A-Za-z]:[\\/]|\/)[^"]*"/);
  });
});

describe("the lock directory is left clean", () => {
  it("a completed commit from a real process leaves no lock file behind", async () => {
    const worker = spawnWorker({
      scenario: "seedCommits",
      commits: [
        {
          operationId: "op-clean",
          snapshotId: "snap-clean",
          evidenceId: "ev-clean",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    await worker.waitFor("commit-completed");
    expect((await worker.exited()).code).toBe(0);
    const locksDir = resolveStoreLayout(dataRoot).locksDir;
    const remaining = await readdir(locksDir).catch(() => [] as string[]);
    expect(remaining.filter((name) => name.endsWith(".lock"))).toEqual([]);
  });

  it("a controlled commit failure still releases the lock (release runs in finally)", async () => {
    // Drive the failure in-process against the real adapter: a commit that
    // throws at a labeled point must still release, so the NEXT real process
    // can acquire. That next acquisition is the observable proof.
    const failing = new DependencyInjectedStore({
      fs: Object.assign(new NodeFileSystem(), { failAt: "afterLock" as const }),
      dataRoot,
    });
    await expect(
      failing.commitSnapshotBundle({
        projectId: PROJECT_ID,
        projectRootBoundary: projectRoot,
        operationId: "op-will-fail",
        occurredAt: "2026-01-01T00:00:00.000Z",
        snapshot: {
          snapshotId: "snap-fail",
          projectId: PROJECT_ID,
          schemaVersion: 1,
          capturedAt: "2026-01-01T00:00:00.000Z",
          sourceBoundaries: [],
          evidenceRefs: ["ev-fail"],
          fingerprint: `sha256:${"b".repeat(64)}`,
        },
        evidence: [
          {
            evidenceId: "ev-fail",
            projectId: PROJECT_ID,
            schemaVersion: 1,
            sourceKind: "markdown",
            sourceIdentity: "docs/status.md#L1",
            observedAt: "2026-01-01T00:00:00.000Z",
            provenance: { line: "1" },
            rawContentPolicy: "minimized",
            retentionState: "active",
            contentFingerprint: `sha256:${"a".repeat(64)}`,
          },
        ],
      }),
    ).rejects.toThrow();

    // The lock file is gone immediately -- not after a stale timeout.
    expect(await readLockRecord()).toBeNull();
    // And a real separate process can take it right away.
    const next = spawnWorker({ scenario: "tryAcquire", operationId: "op-after-failure" });
    expect((await next.waitFor("second-result"))["ok"]).toBe(true);
  });
});

/** Real liveness probe used by the parent's assertions. */
function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
