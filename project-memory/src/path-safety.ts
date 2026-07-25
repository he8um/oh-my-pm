// Pure path-safety arithmetic for the local project memory store. Uses only
// node:path for cross-platform path math; it performs NO filesystem access. It
// resolves the managed on-disk layout, confines every managed path below the
// data root, rejects traversal, and enforces the project/data-root separation
// that keeps the analyzed project untouched.

import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

import { invalidInput, pathEscape } from "./errors.js";

/** Store format directory segment. */
export const STORE_FORMAT_SEGMENT = "v1";

/** Top-level managed directory under the data root. */
export const STORE_ROOT_DIRNAME = "project-brain";

/** Directory holding per-project lock files. */
export const LOCKS_DIRNAME = "locks";

/** Directory holding per-project stores. */
export const PROJECTS_DIRNAME = "projects";

/** Per-project subdirectory names. */
export const SNAPSHOTS_DIRNAME = "snapshots";
export const EVIDENCE_DIRNAME = "evidence";
export const STAGING_DIRNAME = "staging";
export const BACKUPS_DIRNAME = "backups";

/** The manifest filename inside a project store. */
export const MANIFEST_FILENAME = "manifest.json";

/** A lowercase SHA-256 hex key (64 chars). */
const SHA256_KEY_RE = /^[0-9a-f]{64}$/;

/**
 * The resolved, absolute roots for the managed store. All returned paths are
 * absolute and normalized.
 */
export interface StoreLayout {
  readonly dataRoot: string;
  readonly storeRoot: string;
  readonly locksDir: string;
  readonly projectsDir: string;
}

/** Assert a value is a well-formed lowercase SHA-256 key. */
function assertKey(key: string, what: string): void {
  if (!SHA256_KEY_RE.test(key)) {
    throw invalidInput(`${what} must be a lowercase SHA-256 key`);
  }
}

/** Resolve the top-level managed layout under an absolute data root. */
export function resolveStoreLayout(dataRoot: string): StoreLayout {
  if (!isAbsolute(dataRoot)) {
    throw invalidInput("the data root must be an absolute path");
  }
  const normalizedRoot = normalize(dataRoot);
  const storeRoot = join(normalizedRoot, STORE_ROOT_DIRNAME, STORE_FORMAT_SEGMENT);
  return {
    dataRoot: normalizedRoot,
    storeRoot,
    locksDir: join(storeRoot, LOCKS_DIRNAME),
    projectsDir: join(storeRoot, PROJECTS_DIRNAME),
  };
}

/** The absolute lock-file path for a project key. */
export function lockPathFor(layout: StoreLayout, projectKey: string): string {
  assertKey(projectKey, "project key");
  return confine(layout.dataRoot, join(layout.locksDir, `${projectKey}.lock`));
}

/** The absolute project-store directory for a project key. */
export function projectDirFor(layout: StoreLayout, projectKey: string): string {
  assertKey(projectKey, "project key");
  return confine(layout.dataRoot, join(layout.projectsDir, projectKey));
}

/** The absolute manifest path for a project key. */
export function manifestPathFor(layout: StoreLayout, projectKey: string): string {
  return confine(layout.dataRoot, join(projectDirFor(layout, projectKey), MANIFEST_FILENAME));
}

/** The absolute record path for a project key, record kind directory, and key. */
export function recordPathFor(
  layout: StoreLayout,
  projectKey: string,
  recordDir: typeof SNAPSHOTS_DIRNAME | typeof EVIDENCE_DIRNAME,
  recordKey: string,
): string {
  assertKey(recordKey, "record key");
  return confine(
    layout.dataRoot,
    join(projectDirFor(layout, projectKey), recordDir, `${recordKey}.json`),
  );
}

/**
 * Confine a candidate path below the data root. Returns the normalized absolute
 * path, or throws a controlled path-escape error when the candidate resolves
 * outside the data root or contains traversal that escapes it.
 */
export function confine(dataRoot: string, candidate: string): string {
  const root = resolve(normalize(dataRoot));
  const target = resolve(normalize(candidate));
  if (target === root) return target;
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw pathEscape("managed path escapes the data root", "no traversal is allowed in the store");
  }
  // Defense in depth: no segment of the relative path may be a traversal token.
  for (const segment of rel.split(sep)) {
    if (segment === "..") {
      throw pathEscape("managed path contains traversal", "no traversal is allowed in the store");
    }
  }
  return target;
}

/** True when `inner` is the same as or nested inside `outer` (both absolute). */
export function isSameOrInside(outer: string, inner: string): boolean {
  const o = resolve(normalize(outer));
  const i = resolve(normalize(inner));
  if (o === i) return true;
  const rel = relative(o, i);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Enforce the project/data-root separation for every mutating operation. The
 * project root is never stored; it is only a write-safety boundary. Throws a
 * controlled path-escape error when the two roots collide or nest either way.
 */
export function assertProjectDataSeparation(dataRoot: string, projectRootBoundary: string): void {
  if (!isAbsolute(projectRootBoundary)) {
    throw invalidInput("the project root boundary must be an absolute path");
  }
  const data = resolve(normalize(dataRoot));
  const project = resolve(normalize(projectRootBoundary));
  if (data === project) {
    throw pathEscape("the data root must not equal the project root");
  }
  if (isSameOrInside(project, data)) {
    throw pathEscape("the data root must not be inside the project root");
  }
  if (isSameOrInside(data, project)) {
    throw pathEscape("the project root must not be inside the data root");
  }
}

/**
 * Reject an export destination that is inside the project root or inside the
 * active data root (either would risk writing memory into the analyzed project
 * or colliding with the live store).
 */
export function assertExportDestinationSafe(
  dataRoot: string,
  projectRootBoundary: string,
  destination: string,
): void {
  if (!isAbsolute(destination)) {
    throw invalidInput("the export destination must be an absolute path");
  }
  const dest = resolve(normalize(destination));
  if (isSameOrInside(resolve(normalize(projectRootBoundary)), dest)) {
    throw pathEscape("the export destination must not be inside the project root");
  }
  if (isSameOrInside(resolve(normalize(dataRoot)), dest)) {
    throw pathEscape("the export destination must not be inside the active data root");
  }
}
