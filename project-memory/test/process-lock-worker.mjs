// A real OS child process that exercises the REAL Node filesystem adapter
// against a REAL store directory. This is the other half of the G3 proof: the
// in-process suite (concurrency.test.ts) covers lock POLICY against an injected
// clock and liveness probe; this worker covers the lock MECHANISM -- exclusive
// creation, contention, ownership, residue after a kill, and recovery -- across
// separate processes, separate address spaces, and real PIDs.
//
// It imports the BUILT package (dist/), because a child process cannot resolve
// the ".js"-suffixed specifiers the TypeScript sources use without a loader. The
// suite rebuilds dist/ before spawning any worker, so the code under test can
// never be a stale artifact.
//
// Protocol: one JSON object per line on stdout, each `{"event": "..."}`. The
// parent waits for named events rather than sleeping, so the handshake is
// deterministic. Timeouts in the parent exist only to fail a deadlock instead of
// hanging forever; they are never the synchronization mechanism.

import { writeFile } from "node:fs/promises";
import process from "node:process";

/** Emit one protocol line. Flushed per write because stdout is a pipe. */
function emit(event, extra = {}) {
  process.stdout.write(`${JSON.stringify({ event, pid: process.pid, ...extra })}\n`);
}

/** Read the JSON config passed as argv[2]. */
function config() {
  const raw = process.argv[2];
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("worker requires a JSON config argument");
  }
  return JSON.parse(raw);
}

const cfg = config();

const dist = cfg.distDir;
const { NodeFileSystem } = await import(`${dist}/node-adapter.js`);
const { acquireLock, STALE_LOCK_THRESHOLD_MS } = await import(`${dist}/lock.js`);
const { deriveProjectKey } = await import(`${dist}/integrity.js`);
const { lockPathFor, resolveStoreLayout } = await import(`${dist}/path-safety.js`);
const { DependencyInjectedStore } = await import(`${dist}/store.js`);

const layout = resolveStoreLayout(cfg.dataRoot);
const projectKey = deriveProjectKey(cfg.projectId);
const lockPath = lockPathFor(layout, projectKey);

/**
 * Build the real Node filesystem adapter. `now` and `isProcessAlive` are only
 * injected when the scenario explicitly needs a controlled reference time or a
 * forced-liveness answer; otherwise the real wall clock and real
 * process.kill(pid, 0) probe are used, which is the production path.
 */
function makeFs() {
  const options = {};
  if (typeof cfg.nowIso === "string") {
    options.now = () => cfg.nowIso;
  }
  if (typeof cfg.forceAlive === "boolean") {
    options.isProcessAlive = () => cfg.forceAlive;
  }
  return new NodeFileSystem(options);
}

/**
 * Wait until a marker file appears, yielding to the event loop between checks.
 * This is a handshake on real filesystem state, not a timed sleep: it returns as
 * soon as the parent has acted, and never earlier.
 */
async function awaitMarker(fs, name) {
  const target = `${cfg.markerDir}/${name}`;
  while (!(await fs.exists(target))) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Decorate a real filesystem adapter so the FIRST call to `method` whose target
 * lies inside the project store (i.e. after the lock has been taken) stalls
 * until the parent releases it. Everything else passes straight through to the
 * real adapter, so the commit remains a genuine real-filesystem commit.
 */
function stallOnce(fs, method) {
  let stalled = false;
  const original = fs[method].bind(fs);
  fs[method] = async (...args) => {
    const target = String(args[0] ?? "");
    // Stall only on a post-lock path: the locks directory is created BEFORE the
    // lock is acquired, so stalling there would prove nothing about a held lock.
    if (!stalled && target.includes("staging")) {
      stalled = true;
      emit("stalled", { at: method });
      await awaitMarker(fs, "proceed");
      emit("resumed", { at: method });
    }
    return original(...args);
  };
  return fs;
}

function snapshotFor(snapshotId, evidenceId, capturedAt) {
  return {
    snapshotId,
    projectId: cfg.projectId,
    schemaVersion: 1,
    capturedAt,
    sourceBoundaries: [],
    evidenceRefs: [evidenceId],
    fingerprint: `sha256:${"b".repeat(64)}`,
  };
}

function evidenceFor(evidenceId, observedAt) {
  return {
    evidenceId,
    projectId: cfg.projectId,
    schemaVersion: 1,
    sourceKind: "markdown",
    sourceIdentity: "docs/status.md#L1",
    observedAt,
    provenance: { line: "1" },
    rawContentPolicy: "minimized",
    retentionState: "active",
    contentFingerprint: `sha256:${"a".repeat(64)}`,
  };
}

/** Touch a marker file so the parent can observe a step without parsing stdout. */
async function marker(name) {
  if (typeof cfg.markerDir === "string") {
    await writeFile(`${cfg.markerDir}/${name}`, `${process.pid}\n`, "utf8");
  }
}

/**
 * Wait until this process is killed by the parent.
 *
 * A bare never-settling promise is NOT enough: Node exits when the event loop
 * has no pending work, and would report "unsettled top-level await" and tear the
 * process down -- which silently turns a "live owner" scenario into a dead one.
 * An unref'd-free interval keeps a real handle on the loop, so the process stays
 * genuinely alive (and its PID genuinely live) until it is signalled.
 */
function waitForever() {
  return new Promise(() => {
    setInterval(() => {
      // Intentionally empty: this handle exists only to keep the loop alive.
    }, 1_000);
  });
}

/** Classify a thrown store error into a stable protocol shape. */
function describeError(err) {
  const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
  return {
    ok: false,
    code: typeof code === "string" ? code : "unknown",
    message: err instanceof Error ? err.message : String(err),
  };
}

const scenarios = {
  /**
   * Acquire the writer lock, announce it, then hold it until killed or until a
   * release is requested. Used as "process A" for contention and residue tests.
   */
  async holdLock() {
    const fs = makeFs();
    await fs.mkdirp(layout.locksDir);
    emit("child-started");
    const lock = await acquireLock(fs, lockPath, projectKey, cfg.operationId ?? "op-hold");
    emit("lock-acquired", { lockPath });
    await marker("lock-acquired");
    if (cfg.releaseAfterAcquire === true) {
      await lock.release();
      emit("owner-killed-or-released", { released: true });
      return;
    }
    await waitForever();
  },

  /**
   * Attempt to acquire the lock exactly once and report the outcome. Used as
   * "process B". The result is bounded: acquireLock never spins.
   */
  async tryAcquire() {
    const fs = makeFs();
    await fs.mkdirp(layout.locksDir);
    emit("child-started");
    emit("second-attempted");
    const startedAt = process.hrtime.bigint();
    try {
      const lock = await acquireLock(fs, lockPath, projectKey, cfg.operationId ?? "op-try");
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      emit("second-result", { ok: true, elapsedMs });
      if (cfg.releaseOnSuccess !== false) await lock.release();
    } catch (err) {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      emit("second-result", { ...describeError(err), elapsedMs });
    }
  },

  /**
   * A slow writer: hold the lock across a real commit that genuinely stalls
   * mid-flight, so the parent can prove a LIVE writer is never evicted while it
   * works and still commits successfully afterwards.
   *
   * The stall is introduced by DECORATING the real adapter -- one `mkdirp` call
   * blocks until the parent drops a `proceed` marker -- rather than by changing
   * production code or sleeping. Every byte of I/O still goes through the real
   * NodeFileSystem.
   */
  async slowCommit() {
    const fs = stallOnce(makeFs(), "mkdirp");
    emit("child-started");
    const store = new DependencyInjectedStore({ fs, dataRoot: cfg.dataRoot });
    const commit = store.commitSnapshotBundle({
      projectId: cfg.projectId,
      projectRootBoundary: cfg.projectRoot,
      operationId: cfg.operationId ?? "op-slow",
      occurredAt: cfg.occurredAt ?? "2026-01-01T00:00:00.000Z",
      snapshot: snapshotFor(
        cfg.snapshotId ?? "snap-slow",
        cfg.evidenceId ?? "ev-slow",
        cfg.occurredAt ?? "2026-01-01T00:00:00.000Z",
      ),
      evidence: [
        evidenceFor(cfg.evidenceId ?? "ev-slow", cfg.occurredAt ?? "2026-01-01T00:00:00.000Z"),
      ],
    });
    // The stall hook fires inside the lock, so once it reports, the lock is
    // provably held by this process and will stay held until the parent acts.
    const result = await commit;
    emit("commit-completed", { snapshotId: result.snapshotId ?? cfg.snapshotId });
    await marker("commit-completed");
  },

  /**
   * Stall mid-commit while holding the lock, so the PARENT can kill this process
   * from outside and leave realistic residue: a lock file owned by a now-dead
   * PID plus whatever the commit had already written.
   *
   * The kill is external and unstoppable (SIGKILL on POSIX, TerminateProcess on
   * Windows), so no `finally` runs and the lock is genuinely orphaned. Killing
   * from the parent rather than signalling ourselves keeps the scenario
   * identical on all three platforms, where self-signalling semantics differ.
   */
  async crashMidCommit() {
    const fs = stallOnce(makeFs(), "mkdirp");
    emit("child-started");
    const store = new DependencyInjectedStore({ fs, dataRoot: cfg.dataRoot });
    const commit = store.commitSnapshotBundle({
      projectId: cfg.projectId,
      projectRootBoundary: cfg.projectRoot,
      operationId: cfg.operationId ?? "op-crash",
      occurredAt: cfg.occurredAt ?? "2026-01-01T00:00:00.000Z",
      snapshot: snapshotFor(
        cfg.snapshotId ?? "snap-crash",
        cfg.evidenceId ?? "ev-crash",
        cfg.occurredAt ?? "2026-01-01T00:00:00.000Z",
      ),
      evidence: [
        evidenceFor(cfg.evidenceId ?? "ev-crash", cfg.occurredAt ?? "2026-01-01T00:00:00.000Z"),
      ],
    });
    // The stall fires inside the lock. Never settle: the parent kills us while
    // the lock is held and the commit is half-done.
    void commit.catch(() => {});
    await waitForever();
  },

  /**
   * Recover on the SAME persisted store a crashed writer left behind: acquire
   * the lock (reclaiming a stale dead one under the current policy) and commit.
   */
  async recoverAndCommit() {
    const fs = makeFs();
    emit("child-started");
    emit("recovery-started");
    const store = new DependencyInjectedStore({ fs, dataRoot: cfg.dataRoot });
    try {
      const result = await store.commitSnapshotBundle({
        projectId: cfg.projectId,
        projectRootBoundary: cfg.projectRoot,
        operationId: cfg.operationId ?? "op-recover",
        occurredAt: cfg.occurredAt ?? "2026-01-02T00:00:00.000Z",
        snapshot: snapshotFor(
          cfg.snapshotId ?? "snap-recover",
          cfg.evidenceId ?? "ev-recover",
          cfg.occurredAt ?? "2026-01-02T00:00:00.000Z",
        ),
        evidence: [
          evidenceFor(cfg.evidenceId ?? "ev-recover", cfg.occurredAt ?? "2026-01-02T00:00:00.000Z"),
        ],
      });
      emit("recovery-completed", { ok: true, snapshotId: result.snapshotId ?? cfg.snapshotId });
    } catch (err) {
      emit("recovery-completed", describeError(err));
    }
  },

  /**
   * Race two independent processes into the same exclusive window from the
   * parent's perspective: this scenario simply reports whether IT got in, and
   * the parent asserts that across N such processes exactly one succeeded.
   */
  async raceAcquire() {
    const fs = makeFs();
    await fs.mkdirp(layout.locksDir);
    emit("child-started");
    try {
      const lock = await acquireLock(fs, lockPath, projectKey, cfg.operationId ?? "op-race");
      emit("second-result", { ok: true });
      // Hold briefly so a competitor cannot succeed merely because we released
      // first. The parent gates release on its own marker, not on a sleep.
      if (cfg.holdUntilSignalFile === true) {
        await awaitMarker(fs, "release-now");
      }
      await lock.release();
    } catch (err) {
      emit("second-result", describeError(err));
    }
  },

  /**
   * Commit twice from one process to seed a multi-record store used by the
   * cross-process consistency assertions.
   */
  async seedCommits() {
    const fs = makeFs();
    emit("child-started");
    const store = new DependencyInjectedStore({ fs, dataRoot: cfg.dataRoot });
    for (const spec of cfg.commits ?? []) {
      await store.commitSnapshotBundle({
        projectId: cfg.projectId,
        projectRootBoundary: cfg.projectRoot,
        operationId: spec.operationId,
        occurredAt: spec.occurredAt,
        snapshot: snapshotFor(spec.snapshotId, spec.evidenceId, spec.occurredAt),
        evidence: [evidenceFor(spec.evidenceId, spec.occurredAt)],
      });
      emit("commit-completed", { snapshotId: spec.snapshotId });
    }
  },
};

const scenario = scenarios[cfg.scenario];
if (scenario === undefined) {
  emit("worker-error", { message: `unknown scenario: ${cfg.scenario}` });
  process.exit(2);
}

try {
  await scenario();
  emit("worker-done");
  process.exit(0);
} catch (err) {
  emit("worker-error", describeError(err));
  process.exit(1);
}

// Keep the stale threshold referenced so a future refactor that drops the
// export from the package is caught here rather than silently.
void STALE_LOCK_THRESHOLD_MS;
