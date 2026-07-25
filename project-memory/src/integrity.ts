// SHA-256 integrity and key derivation for the local project memory store.
// Uses node:crypto only (no hash dependency). Every hash is domain-separated so
// a project key, record key, manifest integrity, and record integrity can never
// collide across purposes.

import { createHash } from "node:crypto";

import { canonicalStringify } from "./canonical-json.js";
import { integrityMismatch } from "./errors.js";
import type { IntegrityDigest, JsonValue } from "./types.js";

/** Domain separator for deriving the on-disk project directory key. */
export const DOMAIN_PROJECT_KEY = "oh-my-pm:project-memory:v1:project-key";

/** Domain separator for deriving the on-disk record filename key. */
export const DOMAIN_RECORD_KEY = "oh-my-pm:project-memory:v1:record-key";

/** Domain separator for manifest integrity. */
export const DOMAIN_MANIFEST_INTEGRITY = "oh-my-pm:project-memory:v1:manifest-integrity";

/** Domain separator for record-envelope integrity. */
export const DOMAIN_RECORD_INTEGRITY = "oh-my-pm:project-memory:v1:record-integrity";

/** Domain separator for export inventory integrity. */
export const DOMAIN_EXPORT_INVENTORY_INTEGRITY =
  "oh-my-pm:project-memory:v1:export-inventory-integrity";

/** A parsed integrity digest matcher: `sha256:<64 lowercase hex>`. */
const INTEGRITY_RE = /^sha256:[0-9a-f]{64}$/;

/** True when a string is a well-formed integrity digest. */
export function isIntegrityDigest(value: unknown): value is IntegrityDigest {
  return typeof value === "string" && INTEGRITY_RE.test(value);
}

/**
 * Lowercase hex SHA-256 over a domain separator and a UTF-8 string, joined by a
 * NUL byte so the separator boundary is unambiguous.
 */
function sha256Hex(domain: string, input: string): string {
  return createHash("sha256").update(domain).update("\0").update(input, "utf8").digest("hex");
}

/**
 * Derive the lowercase SHA-256 project key from an opaque project id. The id is
 * never used directly as a filename.
 */
export function deriveProjectKey(projectId: string): string {
  return sha256Hex(DOMAIN_PROJECT_KEY, projectId);
}

/**
 * Derive the lowercase SHA-256 record key from a record type and record id. The
 * record id is never used directly as a filename.
 */
export function deriveRecordKey(recordType: string, recordId: string): string {
  return sha256Hex(DOMAIN_RECORD_KEY, `${recordType}\0${recordId}`);
}

/** Compute a domain-separated integrity digest over a canonicalized JSON body. */
export function computeIntegrity(domain: string, body: JsonValue): IntegrityDigest {
  const canonical = canonicalStringify(body);
  return `sha256:${sha256Hex(domain, canonical)}`;
}

/**
 * Verify a body's integrity against an expected digest. Throws a controlled
 * integrity-mismatch error when they differ.
 */
export function assertIntegrity(
  domain: string,
  body: JsonValue,
  expected: IntegrityDigest,
  what: string,
): void {
  const actual = computeIntegrity(domain, body);
  if (actual !== expected) {
    throw integrityMismatch(`${what} integrity mismatch`, "the stored data may be corrupt");
  }
}
