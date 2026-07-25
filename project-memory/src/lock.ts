// Single-writer lock. A project lock is an exclusively-created file under
// <data-root>/project-brain/v1/locks/<project-key>.lock. It carries no project
// path and no content. A lock is stale only when its age exceeds a threshold AND
// its owning process is not alive; the reference time and liveness probe are
// injected through the filesystem port so the policy is deterministically
// testable. Reads never lock. There is no daemon or background cleanup.

import { storeLocked } from "./errors.js";
import type { FileSystem } from "./filesystem.js";

/** Lock content version. */
export const LOCK_VERSION = 1 as const;

/** Stale threshold: a lock older than this whose owner is dead may be reclaimed. */
export const STALE_LOCK_THRESHOLD_MS = 60_000;

/** The on-disk lock record. Carries no path or content. */
export interface LockRecord {
  readonly lockVersion: number;
  readonly projectKey: string;
  readonly operationId: string;
  readonly pid: number;
  /** RFC3339 creation time (injected reference clock). */
  readonly createdAt: string;
}

/** A held lock handle; release removes the exact lock file. */
export interface LockHandle {
  readonly path: string;
  release(): Promise<void>;
}

function serialize(record: LockRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function parse(raw: string): LockRecord | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed["lockVersion"] === "number" &&
      typeof parsed["projectKey"] === "string" &&
      typeof parsed["operationId"] === "string" &&
      typeof parsed["pid"] === "number" &&
      typeof parsed["createdAt"] === "string"
    ) {
      return parsed as unknown as LockRecord;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Milliseconds between two RFC3339 timestamps, or +Infinity if unparseable. */
function ageMs(nowIso: string, createdAtIso: string): number {
  const now = Date.parse(nowIso);
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(now) || Number.isNaN(created)) return Number.POSITIVE_INFINITY;
  return now - created;
}

/**
 * Acquire the project lock, or throw a controlled store-locked error when a live
 * lock is held. A stale (old AND dead) lock is reclaimed once, then the acquire
 * is retried a single time. No spinning, no daemon.
 */
export async function acquireLock(
  fs: FileSystem,
  lockPath: string,
  projectKey: string,
  operationId: string,
): Promise<LockHandle> {
  const record: LockRecord = {
    lockVersion: LOCK_VERSION,
    projectKey,
    operationId,
    pid: fs.currentPid(),
    createdAt: fs.referenceNow(),
  };

  const attempt = await fs.createLockExclusive(lockPath, serialize(record));
  if (attempt.acquired) {
    return makeHandle(fs, lockPath);
  }

  // Existing lock: reclaim only if stale (old AND owner dead).
  const existingRaw = await fs.readLock(lockPath);
  if (existingRaw === null) {
    // Race: it vanished between create and read. Retry once.
    const retry = await fs.createLockExclusive(lockPath, serialize(record));
    if (retry.acquired) return makeHandle(fs, lockPath);
    throw storeLocked("the project store is locked by another writer", "retry after it completes");
  }
  const existing = parse(existingRaw);
  if (existing === null) {
    throw storeLocked(
      "the project store lock is unreadable",
      "remove a confirmed-dead lock manually if needed",
    );
  }
  const old = ageMs(fs.referenceNow(), existing.createdAt) > STALE_LOCK_THRESHOLD_MS;
  const dead = !fs.isProcessAlive(existing.pid);
  if (old && dead) {
    await fs.removeLock(lockPath);
    const reclaimed = await fs.createLockExclusive(lockPath, serialize(record));
    if (reclaimed.acquired) return makeHandle(fs, lockPath);
  }
  throw storeLocked("the project store is locked by another writer", "retry after it completes");
}

function makeHandle(fs: FileSystem, lockPath: string): LockHandle {
  return {
    path: lockPath,
    async release(): Promise<void> {
      await fs.removeLock(lockPath);
    },
  };
}
