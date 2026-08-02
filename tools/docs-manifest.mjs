// Loader and validator for docs/manifest.json, the authoritative documentation
// classification contract.
//
// Why this exists
// ---------------
// Document authority used to be implicit in tools/validate-doc-truth.mjs: an
// ACTIVE_DOCS array said which documents were checked for current-state claims,
// and a HISTORICAL_PREFIXES array said which were exempt. That worked, but the
// classification was knowable only by reading validator source. Nothing could
// enumerate it, a newly added document was silently unclassified and therefore
// unchecked, and a document that had been superseded could still be linked from
// an active index as though it were current.
//
// docs/manifest.json makes the classification explicit and enumerable. This
// module is the single loader over it, so the validator and the inventory tool
// agree by construction rather than by restating the same lists.
//
// Deliberately offline and read-only: no network, no writes, no environment
// reads, so it runs identically in CI and on a laptop.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./command-surface.mjs";

export const DOCS_MANIFEST_PATH = "docs/manifest.json";

/** Lifecycle states a classified document may be in. */
export const DOC_STATUSES = Object.freeze(["active", "historical", "superseded", "release-record"]);

/** Whether a document may be cited as current truth. */
export const DOC_AUTHORITIES = Object.freeze(["normative", "informative"]);

/**
 * Read and structurally validate docs/manifest.json.
 *
 * Returns `{ manifest, errors }`, matching the shape of loadReleaseState so
 * callers can report uniformly: the validator prints and fails the build, the
 * tests assert. `manifest` is null when the file is missing or unparseable.
 */
export function loadDocsManifest(repoRoot = REPO_ROOT) {
  const errors = [];
  let raw;
  try {
    raw = readFileSync(join(repoRoot, DOCS_MANIFEST_PATH), "utf8");
  } catch {
    return { manifest: null, errors: [`${DOCS_MANIFEST_PATH} is missing`] };
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    return {
      manifest: null,
      errors: [`${DOCS_MANIFEST_PATH} is not valid JSON: ${error.message}`],
    };
  }

  const err = (msg) => errors.push(`${DOCS_MANIFEST_PATH}: ${msg}`);

  if (manifest.schemaVersion !== 1) err("schemaVersion must be 1");
  if (!Array.isArray(manifest.documents)) {
    err("documents must be an array");
    return { manifest: null, errors };
  }
  for (const key of ["excludedPrefixes", "excludedPaths"]) {
    if (!Array.isArray(manifest[key])) err(`${key} must be an array`);
  }

  const seenPaths = new Set();
  // A "concern" is what a document is authoritative ABOUT. Two normative active
  // documents claiming the same concern is the duplicate-authority defect: a
  // reader has two candidate truths and no rule for choosing.
  const normativeConcerns = new Map();

  for (const [index, doc] of manifest.documents.entries()) {
    const where = `documents[${index}]`;
    if (typeof doc.path !== "string" || doc.path.length === 0) {
      err(`${where}.path must be a non-empty string`);
      continue;
    }
    if (seenPaths.has(doc.path)) {
      err(`${doc.path} is listed more than once`);
    }
    seenPaths.add(doc.path);

    if (!DOC_STATUSES.includes(doc.status)) {
      err(`${doc.path}: status must be one of ${DOC_STATUSES.join(" | ")}`);
    }
    if (!DOC_AUTHORITIES.includes(doc.authority)) {
      err(`${doc.path}: authority must be one of ${DOC_AUTHORITIES.join(" | ")}`);
    }
    if (typeof doc.appliesTo !== "string" || doc.appliesTo.length === 0) {
      err(`${doc.path}: appliesTo must be a non-empty string`);
    }
    if (typeof doc.concern !== "string" || doc.concern.length === 0) {
      err(`${doc.path}: concern must be a non-empty string`);
    }

    // The classified file must actually exist. A manifest entry for a deleted
    // document is stale metadata that would silently exempt nothing.
    if (!existsSync(join(repoRoot, doc.path))) {
      err(`${doc.path} is classified but does not exist`);
    }

    // replacement is required exactly when superseded, and must resolve.
    if (doc.status === "superseded") {
      if (typeof doc.replacement !== "string" || doc.replacement.length === 0) {
        err(`${doc.path}: status is "superseded" so replacement must name the replacing document`);
      }
    }
    if (doc.replacement !== null && doc.replacement !== undefined) {
      if (typeof doc.replacement !== "string") {
        err(`${doc.path}: replacement must be a path or null`);
      } else if (!existsSync(join(repoRoot, doc.replacement))) {
        err(`${doc.path}: replacement ${doc.replacement} does not exist`);
      }
    }

    // An active document is by definition not superseded, and a superseded one
    // is not active. Catching the contradiction here keeps every consumer from
    // having to decide which field wins.
    if (doc.status === "active" && typeof doc.replacement === "string") {
      err(`${doc.path}: an active document must not declare a replacement`);
    }

    if (doc.status === "active" && doc.authority === "normative") {
      const existing = normativeConcerns.get(doc.concern);
      if (existing !== undefined) {
        err(
          `duplicate authoritative document for concern "${doc.concern}": ` +
            `${existing} and ${doc.path} are both active+normative`,
        );
      } else {
        normativeConcerns.set(doc.concern, doc.path);
      }
    }
  }

  return { manifest, errors };
}

/** Documents with the given status. */
export const documentsWithStatus = (manifest, status) =>
  manifest.documents.filter((d) => d.status === status);

/** Paths of active documents, the set whose current-state claims are checked. */
export const activeDocPaths = (manifest) =>
  documentsWithStatus(manifest, "active").map((d) => d.path);

/** Paths of active documents that may be cited as current truth. */
export const normativeDocPaths = (manifest) =>
  manifest.documents
    .filter((d) => d.status === "active" && d.authority === "normative")
    .map((d) => d.path);

/** Paths that are point-in-time records, exempt from current-state checks. */
export const historicalDocPaths = (manifest) =>
  manifest.documents
    .filter((d) => d.status === "historical" || d.status === "release-record")
    .map((d) => d.path);

/** Paths explicitly marked superseded. */
export const supersededDocPaths = (manifest) =>
  documentsWithStatus(manifest, "superseded").map((d) => d.path);

/** True when the path is excluded from classification by prefix or exact match. */
export function isExcluded(manifest, rel) {
  if ((manifest.excludedPaths ?? []).includes(rel)) return true;
  return (manifest.excludedPrefixes ?? []).some((p) => rel.startsWith(p));
}

/** Look up one document's classification, or null when unclassified. */
export function classificationOf(manifest, rel) {
  return manifest.documents.find((d) => d.path === rel) ?? null;
}
