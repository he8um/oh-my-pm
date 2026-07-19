// Reusable, safety-first temporary-workspace helper for OH MY PM tests and
// manual verification. It creates exactly one uniquely named directory beneath
// os.tmpdir(), stamps it with a process-local ownership marker, and deletes
// only that exact directory after an ownership-verified guard passes. It never
// deletes an inferred parent, the shared temp root, the repository, the home
// directory, the current working directory, or the filesystem root.
//
// Node built-ins only. No product output ever contains the ownership token.

import { randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, parse, resolve } from "node:path";

export const OWNERSHIP_MARKER_FILENAME = ".oh-my-pm-temp-owner.json";
export const WORKSPACE_PREFIX = "oh-my-pm-test-";
const MARKER_SCHEMA_VERSION = 1;

/** Resolve os.tmpdir() through realpath so symlinked temp roots compare equal. */
function resolvedTmpdir() {
  return realpathSync(tmpdir());
}

/**
 * The set of acceptable spellings of the shared temp root. os.tmpdir() may be
 * symlinked (macOS returns /var/... while realpath is /private/var/...), so a
 * caller-supplied path or a not-yet-realpath'd path can legitimately use either
 * spelling. Comparisons accept both.
 */
function tempRootForms() {
  const raw = resolve(tmpdir());
  const real = resolvedTmpdir();
  return real === raw ? [raw] : [raw, real];
}

function isSharedTempRoot(target) {
  return tempRootForms().includes(target);
}

function isDirectTempChild(target) {
  return tempRootForms().includes(dirname(target));
}

/**
 * Pure guard: decide whether `input` is a safe exact deletion target. It never
 * deletes; it only classifies. `ownership` optionally supplies the resolved
 * repository root and the expected ownership token/marker so callers can reject
 * unowned or mismatched workspaces before any removal.
 */
export function validateCleanupTarget(input, ownership = {}) {
  if (typeof input !== "string" || input.trim() === "") {
    return fail("temp_cleanup_empty", "cleanup target must be a non-empty path");
  }
  if (input === "." || input === "..") {
    return fail("temp_cleanup_cwd", "cleanup target must not be a relative dot path");
  }

  const target = resolve(input);
  const root = parse(target).root;
  if (target === root) {
    return fail("temp_cleanup_root", "cleanup target must not be the filesystem root");
  }
  // Repository root is checked before cwd/home so the most specific rejection
  // wins even when the repository is also the current working directory.
  if (ownership.repositoryRoot !== undefined && target === resolve(ownership.repositoryRoot)) {
    return fail("temp_cleanup_repository", "cleanup target must not be the repository root");
  }
  if (target === resolve(process.cwd())) {
    return fail("temp_cleanup_cwd", "cleanup target must not be the current working directory");
  }
  if (target === resolve(homedir())) {
    return fail("temp_cleanup_home", "cleanup target must not be the home directory");
  }
  if (isSharedTempRoot(target)) {
    return fail("temp_cleanup_shared_temp", "cleanup target must not be the shared temp root");
  }

  // The target must be a direct child of the shared temp root (either spelling).
  // This rejects deeper nesting, ancestors, and any path outside the temp root.
  if (!isDirectTempChild(target)) {
    return fail(
      "temp_cleanup_outside_temp",
      "cleanup target must be a direct child of the shared temp root",
    );
  }

  // Basename must carry the approved project prefix.
  if (!basename(target).startsWith(WORKSPACE_PREFIX)) {
    return fail("temp_cleanup_outside_temp", "cleanup target lacks the approved workspace prefix");
  }

  // No symlink component on the target itself.
  let stat;
  try {
    stat = lstatSync(target);
  } catch {
    // A missing target is safe: nothing to delete. Idempotent cleanup relies on
    // this, so report ok with a note that the target is absent.
    return { ok: true, target, exists: false };
  }
  if (stat.isSymbolicLink()) {
    return fail("temp_cleanup_symlink", "cleanup target must not be a symlink");
  }
  // The resolved real path must equal the target (no symlinked ancestor swap).
  let real;
  try {
    real = realpathSync(target);
  } catch {
    return fail("temp_cleanup_symlink", "cleanup target could not be resolved");
  }
  if (real !== target) {
    return fail("temp_cleanup_symlink", "cleanup target resolves through a symlink");
  }

  // Ownership marker verification when a token is supplied.
  if (ownership.ownershipToken !== undefined) {
    const markerPath = join(target, OWNERSHIP_MARKER_FILENAME);
    let markerStat;
    try {
      markerStat = lstatSync(markerPath);
    } catch {
      return fail("temp_cleanup_marker_invalid", "ownership marker is absent");
    }
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
      return fail("temp_cleanup_symlink", "ownership marker must be a regular file");
    }
    let marker;
    try {
      marker = JSON.parse(readFileSync(markerPath, "utf8"));
    } catch {
      return fail("temp_cleanup_marker_invalid", "ownership marker is not valid JSON");
    }
    if (
      marker === null ||
      typeof marker !== "object" ||
      marker.schemaVersion !== MARKER_SCHEMA_VERSION ||
      marker.product !== "oh-my-pm" ||
      marker.purpose !== "test-workspace"
    ) {
      return fail("temp_cleanup_marker_invalid", "ownership marker contents are invalid");
    }
    if (marker.ownershipToken !== ownership.ownershipToken) {
      return fail("temp_cleanup_unowned", "ownership token does not match");
    }
  }

  return { ok: true, target, exists: true };
}

function fail(code, message) {
  return { ok: false, code, message };
}

/**
 * Assert that `path` is a safe, owned workspace or throw. Never includes the
 * ownership token in the thrown message.
 */
export function assertSafeOwnedWorkspace(path, ownership = {}) {
  const result = validateCleanupTarget(path, ownership);
  if (!result.ok) {
    throw new Error(`unsafe cleanup target (${result.code}): ${result.message}`);
  }
  return result;
}

/**
 * Create one unique owned workspace beneath os.tmpdir() with a process-local
 * ownership marker. Returns a workspace object whose cleanup() removes only the
 * exact root after the guard passes.
 */
export function createSafeTempWorkspace(options = {}) {
  const prefix = options.prefix ?? WORKSPACE_PREFIX;
  if (!String(prefix).startsWith(WORKSPACE_PREFIX)) {
    throw new Error(`workspace prefix must start with "${WORKSPACE_PREFIX}"`);
  }
  const root = realpathSync(mkdtempSync(join(resolvedTmpdir(), prefix)));
  const ownershipToken = randomBytes(24).toString("hex");
  const ownershipFile = join(root, OWNERSHIP_MARKER_FILENAME);
  writeFileSync(
    ownershipFile,
    `${JSON.stringify(
      {
        schemaVersion: MARKER_SCHEMA_VERSION,
        product: "oh-my-pm",
        purpose: "test-workspace",
        ownershipToken,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const workspace = {
    root,
    ownershipFile,
    ownershipToken,
    cleanup() {
      cleanupSafeTempWorkspace(workspace);
    },
  };
  return workspace;
}

/**
 * Delete only the exact workspace root after the ownership-verified guard
 * passes. Idempotent: a second call after successful deletion is a no-op.
 * Never deletes a parent, and never widens scope on failure.
 */
export function cleanupSafeTempWorkspace(workspace) {
  if (workspace === null || typeof workspace !== "object") {
    throw new Error("cleanupSafeTempWorkspace requires a workspace object");
  }
  const result = validateCleanupTarget(workspace.root, {
    ownershipToken: workspace.ownershipToken,
  });
  if (!result.ok) {
    throw new Error(`refusing unsafe cleanup (${result.code}): ${result.message}`);
  }
  if (result.exists === false) {
    return; // idempotent no-op
  }
  rmSync(workspace.root, { recursive: true, force: true });
}

/**
 * Run `callback(workspace)` and always attempt exact-workspace cleanup
 * afterward. If the callback throws, its error is preserved and rethrown; a
 * cleanup failure never hides the callback failure. When both fail, an
 * AggregateError carrying both (callback first) is thrown.
 */
export async function withSafeTempWorkspace(callback, options = {}) {
  const workspace = createSafeTempWorkspace(options);
  let callbackError;
  try {
    return await callback(workspace);
  } catch (error) {
    callbackError = error;
    throw error;
  } finally {
    try {
      cleanupSafeTempWorkspace(workspace);
    } catch (cleanupError) {
      if (callbackError !== undefined) {
        // Preserve both, callback failure first, without masking it.
        throw new AggregateError(
          [callbackError, cleanupError],
          "callback and cleanup both failed",
        );
      }
      throw cleanupError;
    }
  }
}
