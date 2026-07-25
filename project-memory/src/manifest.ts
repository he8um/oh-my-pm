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
} from "./types.js";

/** The manifest body (everything the integrity digest covers). */
type ManifestBody = Omit<ProjectStoreManifest, "integrity">;

/** The record-envelope body (everything the integrity digest covers). */
type EnvelopeBody = Omit<RecordEnvelope, "integrity">;

/** Convert a manifest (minus integrity) to a canonical JSON body. */
function manifestBodyJson(body: ManifestBody): JsonValue {
  return {
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

/** Build a fully-formed manifest with a computed integrity digest. */
export function buildManifest(body: ManifestBody): ProjectStoreManifest {
  if (body.latestSnapshotId !== null && !body.snapshotIds.includes(body.latestSnapshotId)) {
    throw invalidInput("latestSnapshotId must exist in snapshotIds");
  }
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

/** Type guard for a plausible manifest object shape. */
function isManifestShape(value: unknown): value is ProjectStoreManifest {
  if (value === null || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
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
    migrationHistory: rest.migrationHistory as MigrationHistoryEntry[],
  };
  assertIntegrity(DOMAIN_MANIFEST_INTEGRITY, manifestBodyJson(body), integrity, "manifest");
  if (rest.latestSnapshotId !== null && !rest.snapshotIds.includes(rest.latestSnapshotId)) {
    throw corruption("manifest latest snapshot is not in snapshotIds", "the store may be corrupt");
  }
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
