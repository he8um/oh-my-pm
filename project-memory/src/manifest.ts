// Manifest and immutable record-envelope construction and verification. All
// integrity is computed over the canonicalized body (every field except the
// `integrity` field itself), domain-separated so a manifest digest and a record
// digest can never be confused.

import {
  assertIntegrity,
  computeIntegrity,
  DOMAIN_MANIFEST_INTEGRITY,
  DOMAIN_RECORD_INTEGRITY,
} from "./integrity.js";
import { corruption, invalidInput } from "./errors.js";
import {
  CURRENT_STORE_FORMAT_VERSION,
  SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION,
} from "./types.js";
import type {
  IntegrityDigest,
  JsonObject,
  JsonValue,
  MigrationHistoryEntry,
  ProjectStoreManifest,
  RecordEnvelope,
  RecordType,
  SnapshotChronologyOrigin,
  SnapshotHistoryEntry,
} from "./types.js";

/** The manifest body (everything the integrity digest covers). */
type ManifestBody = Omit<ProjectStoreManifest, "integrity">;

/** The record-envelope body (everything the integrity digest covers). */
type EnvelopeBody = Omit<RecordEnvelope, "integrity">;

/**
 * Convert a manifest (minus integrity) to a canonical JSON body.
 *
 * The chronology fields (`snapshotHistory`, `snapshotChronologyOrigin`) are
 * included in the integrity body ONLY when the manifest carries them (store
 * format v2). A store format v1 body omits them, so its digest is byte-for-byte
 * identical to the pre-Phase-4.1 scheme — v1 manifests written before this
 * correction still verify, and the pinned v1 golden hashes are unchanged.
 */
function manifestBodyJson(body: ManifestBody): JsonValue {
  const base: Record<string, JsonValue> = {
    storeFormatVersion: body.storeFormatVersion,
    projectBrainSchemaVersion: body.projectBrainSchemaVersion,
    projectId: body.projectId,
    projectKey: body.projectKey,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
    latestSnapshotId: body.latestSnapshotId,
    snapshotIds: [...body.snapshotIds],
    evidenceIds: [...body.evidenceIds],
    migrationHistory: body.migrationHistory.map((entry) => ({
      fromStoreFormatVersion: entry.fromStoreFormatVersion,
      toStoreFormatVersion: entry.toStoreFormatVersion,
      migratedAt: entry.migratedAt,
      operationId: entry.operationId,
      backupKey: entry.backupKey,
    })),
  };
  if (body.snapshotHistory !== undefined) {
    base["snapshotHistory"] = body.snapshotHistory.map((entry) => ({
      snapshotId: entry.snapshotId,
      capturedAt: entry.capturedAt,
      sequence: entry.sequence,
    }));
  }
  if (body.snapshotChronologyOrigin !== undefined) {
    base["snapshotChronologyOrigin"] = body.snapshotChronologyOrigin;
  }
  return base;
}

/** Convert an envelope (minus integrity) to a canonical JSON body. */
function envelopeBodyJson(body: EnvelopeBody): JsonValue {
  return {
    recordType: body.recordType,
    storeFormatVersion: body.storeFormatVersion,
    projectBrainSchemaVersion: body.projectBrainSchemaVersion,
    projectId: body.projectId,
    recordId: body.recordId,
    payload: body.payload,
  };
}

/** The maximum chronology entries a manifest may carry (matches snapshot cap). */
const MAX_SNAPSHOT_HISTORY = 10_000;

/**
 * Assert the chronology invariants for a store format v2 manifest body. A body
 * without chronology (store format v1, read only during migration) is accepted
 * unchanged. All violations raise a controlled error; the caller decides
 * whether that surfaces as invalid-input (build) or corruption (read).
 *
 * Invariants enforced:
 *  - every `snapshotIds` value appears exactly once in `snapshotHistory`;
 *  - every history entry references an id present in the inventory;
 *  - no duplicate Snapshot id and no duplicate sequence in history;
 *  - sequence is contiguous 1..N in oldest-first order;
 *  - the latest pointer equals the final history entry (null iff empty);
 *  - the chronology origin is a known value;
 *  - the chronology is not malformed or oversized.
 *
 * The per-entry `capturedAt` match against the persisted Snapshot payload is a
 * record-level check performed by the store during verification (the manifest
 * alone cannot see the payloads).
 */
export function assertManifestChronology(
  body: {
    readonly latestSnapshotId: string | null;
    readonly snapshotIds: readonly string[];
    readonly snapshotHistory?: readonly SnapshotHistoryEntry[];
    readonly snapshotChronologyOrigin?: SnapshotChronologyOrigin;
  },
  raise: (message: string) => Error,
): void {
  const history = body.snapshotHistory;
  const origin = body.snapshotChronologyOrigin;
  // A v1 manifest (no chronology at all) is accepted here; readers gate its
  // format separately and migrate it before use.
  if (history === undefined && origin === undefined) return;
  if (history === undefined || origin === undefined) {
    throw raise("a v2 manifest must carry both snapshotHistory and snapshotChronologyOrigin");
  }
  if (origin !== "native" && origin !== "recoveredV1") {
    throw raise("snapshotChronologyOrigin is not a known value");
  }
  if (history.length > MAX_SNAPSHOT_HISTORY) {
    throw raise("snapshotHistory exceeds the maximum size");
  }
  const inventory = new Set(body.snapshotIds);
  if (inventory.size !== body.snapshotIds.length) {
    throw raise("snapshotIds inventory contains a duplicate id");
  }
  const seenIds = new Set<string>();
  const seenSequences = new Set<number>();
  for (let i = 0; i < history.length; i += 1) {
    const entry = history[i]!;
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof entry.snapshotId !== "string" ||
      entry.snapshotId.length === 0 ||
      typeof entry.capturedAt !== "string" ||
      entry.capturedAt.length === 0 ||
      !Number.isSafeInteger(entry.sequence)
    ) {
      throw raise("snapshotHistory contains a malformed entry");
    }
    if (seenIds.has(entry.snapshotId)) {
      throw raise("snapshotHistory contains a duplicate snapshot id");
    }
    if (seenSequences.has(entry.sequence)) {
      throw raise("snapshotHistory contains a duplicate sequence");
    }
    // Sequence must be contiguous 1..N in oldest-first order.
    if (entry.sequence !== i + 1) {
      throw raise("snapshotHistory sequence is not contiguous from 1");
    }
    if (!inventory.has(entry.snapshotId)) {
      throw raise("a snapshotHistory entry references an id absent from the inventory");
    }
    seenIds.add(entry.snapshotId);
    seenSequences.add(entry.sequence);
  }
  // Every inventory id must appear in history exactly once.
  if (seenIds.size !== inventory.size) {
    throw raise("an inventory id is absent from the chronology");
  }
  // The latest pointer is the final history entry (null only when empty).
  if (history.length === 0) {
    if (body.latestSnapshotId !== null) {
      throw raise("latestSnapshotId must be null when the chronology is empty");
    }
  } else {
    const finalEntry = history[history.length - 1]!;
    if (body.latestSnapshotId !== finalEntry.snapshotId) {
      throw raise("latestSnapshotId must equal the final chronology entry");
    }
  }
}

/** Build a fully-formed manifest with a computed integrity digest. */
export function buildManifest(body: ManifestBody): ProjectStoreManifest {
  if (body.latestSnapshotId !== null && !body.snapshotIds.includes(body.latestSnapshotId)) {
    throw invalidInput("latestSnapshotId must exist in snapshotIds");
  }
  assertManifestChronology(body, invalidInput);
  const integrity = computeIntegrity(DOMAIN_MANIFEST_INTEGRITY, manifestBodyJson(body));
  return { ...body, integrity };
}

/** Build an immutable record envelope with a computed integrity digest. */
export function buildEnvelope(
  recordType: RecordType,
  projectId: string,
  recordId: string,
  payload: JsonObject,
): RecordEnvelope {
  const body: EnvelopeBody = {
    recordType,
    storeFormatVersion: CURRENT_STORE_FORMAT_VERSION,
    projectBrainSchemaVersion: SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION,
    projectId,
    recordId,
    payload,
  };
  const integrity = computeIntegrity(DOMAIN_RECORD_INTEGRITY, envelopeBodyJson(body));
  return { ...body, integrity };
}

/** Serialize a manifest to a stable JSON string for on-disk storage. */
export function serializeManifest(manifest: ProjectStoreManifest): string {
  // Pretty-printed for human inspection; integrity is over the canonical body,
  // not this presentation, so formatting is free to be readable.
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Serialize a record envelope to a stable JSON string for on-disk storage. */
export function serializeEnvelope(envelope: RecordEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/** Type guard for a plausible manifest object shape (store format v1 or v2). */
function isManifestShape(value: unknown): value is ProjectStoreManifest {
  if (value === null || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  // Chronology fields are optional (absent on v1); when present they must be of
  // the right shape. The value-level invariants are enforced by
  // assertManifestChronology after integrity verifies.
  const chronologyShapeOk =
    (m["snapshotHistory"] === undefined || Array.isArray(m["snapshotHistory"])) &&
    (m["snapshotChronologyOrigin"] === undefined ||
      m["snapshotChronologyOrigin"] === "native" ||
      m["snapshotChronologyOrigin"] === "recoveredV1");
  return (
    typeof m["storeFormatVersion"] === "number" &&
    typeof m["projectBrainSchemaVersion"] === "number" &&
    typeof m["projectId"] === "string" &&
    typeof m["projectKey"] === "string" &&
    typeof m["createdAt"] === "string" &&
    typeof m["updatedAt"] === "string" &&
    (m["latestSnapshotId"] === null || typeof m["latestSnapshotId"] === "string") &&
    Array.isArray(m["snapshotIds"]) &&
    Array.isArray(m["evidenceIds"]) &&
    Array.isArray(m["migrationHistory"]) &&
    chronologyShapeOk &&
    typeof m["integrity"] === "string"
  );
}

/**
 * Parse and integrity-verify a manifest from its on-disk string. Readers never
 * accept a partial or tampered manifest; any shape or integrity failure raises a
 * controlled corruption/integrity error.
 */
export function parseAndVerifyManifest(raw: string): ProjectStoreManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw corruption("manifest is not valid JSON", "the store manifest may be corrupt");
  }
  if (!isManifestShape(parsed)) {
    throw corruption("manifest shape is invalid", "the store manifest may be corrupt");
  }
  const { integrity, ...rest } = parsed;
  const body: ManifestBody = {
    storeFormatVersion: rest.storeFormatVersion,
    projectBrainSchemaVersion: rest.projectBrainSchemaVersion,
    projectId: rest.projectId,
    projectKey: rest.projectKey,
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
    latestSnapshotId: rest.latestSnapshotId,
    snapshotIds: rest.snapshotIds,
    evidenceIds: rest.evidenceIds,
    // Include chronology fields in the integrity body ONLY when present, so a v1
    // manifest's digest is computed exactly as before (backward compatible).
    ...(rest.snapshotHistory !== undefined
      ? { snapshotHistory: rest.snapshotHistory as SnapshotHistoryEntry[] }
      : {}),
    ...(rest.snapshotChronologyOrigin !== undefined
      ? { snapshotChronologyOrigin: rest.snapshotChronologyOrigin as SnapshotChronologyOrigin }
      : {}),
    migrationHistory: rest.migrationHistory as MigrationHistoryEntry[],
  };
  assertIntegrity(DOMAIN_MANIFEST_INTEGRITY, manifestBodyJson(body), integrity, "manifest");
  if (rest.latestSnapshotId !== null && !rest.snapshotIds.includes(rest.latestSnapshotId)) {
    throw corruption("manifest latest snapshot is not in snapshotIds", "the store may be corrupt");
  }
  // Chronology invariants are integrity-protected (covered by the digest above)
  // and additionally structurally enforced here so a self-consistent but invalid
  // chronology (e.g. a gap deliberately signed into a hand-built manifest)
  // surfaces as controlled corruption rather than being trusted.
  assertManifestChronology(body, (message) => corruption(message, "the store may be corrupt"));
  return parsed;
}

/** Type guard for a plausible envelope object shape. */
function isEnvelopeShape(value: unknown): value is RecordEnvelope {
  if (value === null || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    (e["recordType"] === "snapshot" || e["recordType"] === "evidence") &&
    typeof e["storeFormatVersion"] === "number" &&
    typeof e["projectBrainSchemaVersion"] === "number" &&
    typeof e["projectId"] === "string" &&
    typeof e["recordId"] === "string" &&
    e["payload"] !== null &&
    typeof e["payload"] === "object" &&
    !Array.isArray(e["payload"]) &&
    typeof e["integrity"] === "string"
  );
}

/**
 * Parse and integrity-verify a record envelope, checking its declared type,
 * owning project, and record id against the expectations of the caller.
 */
export function parseAndVerifyEnvelope(
  raw: string,
  expected: {
    readonly recordType: RecordType;
    readonly projectId: string;
    readonly recordId: string;
  },
): RecordEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw corruption("record is not valid JSON", "the stored record may be corrupt");
  }
  if (!isEnvelopeShape(parsed)) {
    throw corruption("record shape is invalid", "the stored record may be corrupt");
  }
  const { integrity, ...rest } = parsed;
  const body: EnvelopeBody = {
    recordType: rest.recordType,
    storeFormatVersion: rest.storeFormatVersion,
    projectBrainSchemaVersion: rest.projectBrainSchemaVersion,
    projectId: rest.projectId,
    recordId: rest.recordId,
    payload: rest.payload,
  };
  assertIntegrity(
    DOMAIN_RECORD_INTEGRITY,
    envelopeBodyJson(body),
    integrity as IntegrityDigest,
    "record",
  );
  if (rest.recordType !== expected.recordType) {
    throw corruption("record type mismatch", "the stored record may be corrupt");
  }
  if (rest.projectId !== expected.projectId) {
    throw corruption("record project ownership mismatch", "the stored record may be corrupt");
  }
  if (rest.recordId !== expected.recordId) {
    throw corruption("record id mismatch", "the stored record may be corrupt");
  }
  return parsed;
}
