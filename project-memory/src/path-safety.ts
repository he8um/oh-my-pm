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

/**
 * Directory holding quarantined recovery evidence.
 *
 * Quarantine is its own authority class, distinct from every other directory in
 * the store:
 *
 *   * it is NOT authoritative live state -- a quarantined file is deliberately
 *     no longer part of the readable store, and `snapshots/`/`evidence/`
 *     discovery never looks here;
 *   * it is NOT chronology -- the manifest never references a quarantined
 *     payload, so `snapshotHistory` cannot regress when a record is isolated;
 *   * it is NOT cache -- nothing regenerates it, so it is never evicted;
 *   * it is NOT pruned -- automatic deletion of recovery evidence would destroy
 *     the only remaining copy of the user's damaged authoritative data.
 *
 * Its sole purpose is to preserve the EXACT original bytes of a file the repair
 * apply removed from the live store, so a user (or a support process) can still
 * recover semantics a program cannot reconstruct.
 */
export const QUARANTINE_DIRNAME = "quarantine";

/** Filenames inside one quarantine operation directory. */
export const QUARANTINE_PAYLOAD_FILENAME = "payload.bin";
export const QUARANTINE_METADATA_FILENAME = "metadata.json";

/** The repair receipt filename inside one quarantine operation directory. */
export const REPAIR_RECEIPT_FILENAME = "receipt.json";

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
  // `resolve`, not `normalize`. Every managed path is produced by `confine`, which
  // resolves -- and on Windows `resolve` prefixes the CURRENT DRIVE onto a
  // drive-relative path like `\data\oh-my-pm`. A layout root built with
  // `normalize` alone therefore lacked the `D:` segment that every confined path
  // below it carried, so the two could not be compared: stripping the root prefix
  // failed, the repair scanner's derived directories matched nothing, and the scan
  // observed an EMPTY store. Resolving here makes the root and everything under it
  // agree on one spelling, on every platform. On POSIX `resolve` and `normalize`
  // coincide for an absolute path, so nothing changes there.
  const normalizedRoot = resolve(normalize(dataRoot));
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
 * A validated operation-id path segment.
 *
 * Quarantine paths are operation-scoped, so the operation id becomes a directory
 * name. It is therefore held to the same rules the store already applies to
 * temp/backup/tombstone names: a bounded filename-safe charset and no traversal
 * token. Rejecting `.`/`..` explicitly matters even though the charset already
 * excludes a separator -- `..` is spelled entirely with permitted characters.
 */
const OPERATION_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/** Assert a value is usable as a single operation-scoped path segment. */
function assertOperationSegment(value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidInput("the operation id must be a non-empty string");
  }
  if (!OPERATION_SEGMENT_RE.test(value)) {
    throw invalidInput("the operation id must contain only [A-Za-z0-9._-]");
  }
  if (value === "." || value === "..") {
    throw invalidInput("the operation id must not be a path traversal token");
  }
}

/**
 * The absolute quarantine root for a project key.
 *
 * A sibling of `snapshots/`/`evidence/` under the project store, so it inherits
 * the same confinement and the same owner-only directory mode, while remaining
 * outside every record-discovery path.
 */
export function quarantineDirFor(layout: StoreLayout, projectKey: string): string {
  return confine(layout.dataRoot, join(projectDirFor(layout, projectKey), QUARANTINE_DIRNAME));
}

/**
 * The absolute directory for ONE repair operation's quarantine evidence.
 *
 * Operation-scoped rather than content-scoped so a retry of the same operation
 * lands on the same path -- which is what makes apply idempotent instead of
 * accumulating a second copy of identical evidence on every attempt.
 */
export function quarantineOperationDirFor(
  layout: StoreLayout,
  projectKey: string,
  operationId: string,
): string {
  assertOperationSegment(operationId);
  return confine(layout.dataRoot, join(quarantineDirFor(layout, projectKey), operationId));
}

/**
 * The absolute path of one quarantined payload's slot.
 *
 * `entryKey` is a caller-derived lowercase SHA-256 key, never a user-supplied
 * name and never the quarantined file's own path: a corrupt record's on-disk
 * name is already a derived key, but routing it through the same assertion keeps
 * "no user-controlled path fragment" true by construction rather than by
 * convention.
 */
export function quarantinePayloadPathFor(
  layout: StoreLayout,
  projectKey: string,
  operationId: string,
  entryKey: string,
): string {
  assertKey(entryKey, "quarantine entry key");
  return confine(
    layout.dataRoot,
    join(
      quarantineOperationDirFor(layout, projectKey, operationId),
      entryKey,
      QUARANTINE_PAYLOAD_FILENAME,
    ),
  );
}

/** The absolute path of one quarantined payload's sanitized metadata. */
export function quarantineMetadataPathFor(
  layout: StoreLayout,
  projectKey: string,
  operationId: string,
  entryKey: string,
): string {
  assertKey(entryKey, "quarantine entry key");
  return confine(
    layout.dataRoot,
    join(
      quarantineOperationDirFor(layout, projectKey, operationId),
      entryKey,
      QUARANTINE_METADATA_FILENAME,
    ),
  );
}

/** The absolute repair-receipt path for one repair operation. */
export function repairReceiptPathFor(
  layout: StoreLayout,
  projectKey: string,
  operationId: string,
): string {
  return confine(
    layout.dataRoot,
    join(quarantineOperationDirFor(layout, projectKey, operationId), REPAIR_RECEIPT_FILENAME),
  );
}

/**
 * The store-relative path of one record file, with POSIX separators.
 *
 * The SINGLE authority for this spelling. The repair scanner emits it as a
 * finding target and the repair rebuild derives it to decide which records
 * survived; if those two spellings could drift, a damaged record would never be
 * dropped from the manifest and the store would never converge. One function
 * makes that class of bug unrepresentable rather than merely unlikely.
 *
 * Relative, never absolute: a finding target is printed, so it must not disclose
 * a local filesystem layout.
 */
export function recordStoreRelativePath(
  projectKey: string,
  recordDir: typeof SNAPSHOTS_DIRNAME | typeof EVIDENCE_DIRNAME,
  recordKey: string,
): string {
  assertKey(projectKey, "project key");
  assertKey(recordKey, "record key");
  return `${PROJECTS_DIRNAME}/${projectKey}/${recordDir}/${recordKey}.json`;
}

/**
 * True when a project-relative directory name is a governed non-record
 * directory: one that legitimately exists inside a project store but must never
 * be treated as a live record, walked by record discovery, or added to the
 * manifest chronology.
 *
 * Expressed as a single predicate so a new governed directory cannot be added to
 * the layout while silently remaining invisible to the code that must exclude
 * it.
 */
export function isNonRecordStoreDirname(name: string): boolean {
  return (
    name === STAGING_DIRNAME ||
    name === BACKUPS_DIRNAME ||
    name === QUARANTINE_DIRNAME ||
    name === LOCKS_DIRNAME
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
