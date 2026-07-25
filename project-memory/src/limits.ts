// Centralized bounded limits for the local project memory adapter. Every write
// and read path enforces these; the adapter rejects rather than truncates, and
// never auto-prunes history in Phase 2.

/** Maximum serialized manifest size in bytes (4 MiB). */
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

/** Maximum serialized record-envelope size in bytes (16 MiB). */
export const MAX_RECORD_BYTES = 16 * 1024 * 1024;

/** Maximum evidence records accepted in a single commit. */
export const MAX_EVIDENCE_PER_COMMIT = 10_000;

/** Maximum snapshots retained per project. */
export const MAX_SNAPSHOTS_PER_PROJECT = 10_000;

/** Maximum evidence records retained per project. */
export const MAX_EVIDENCE_PER_PROJECT = 100_000;

/** Maximum operation-id length in UTF-8 bytes. */
export const MAX_OPERATION_ID_BYTES = 128;

/** Maximum total export size in bytes (2 GiB). */
export const MAX_EXPORT_BYTES = 2 * 1024 * 1024 * 1024;

/** UTF-8 byte length of a string, using Node's TextEncoder (no dependency). */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
