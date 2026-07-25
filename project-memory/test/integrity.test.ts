import { describe, expect, it } from "vitest";

import { canonicalStringify } from "../src/canonical-json.js";
import { ProjectMemoryError } from "../src/errors.js";
import {
  computeIntegrity,
  deriveProjectKey,
  deriveRecordKey,
  DOMAIN_MANIFEST_INTEGRITY,
  DOMAIN_RECORD_INTEGRITY,
  isIntegrityDigest,
} from "../src/integrity.js";
import {
  buildEnvelope,
  buildManifest,
  parseAndVerifyEnvelope,
  parseAndVerifyManifest,
  serializeEnvelope,
  serializeManifest,
} from "../src/manifest.js";

describe("canonical JSON", () => {
  it("sorts object keys lexicographically and preserves array order", () => {
    expect(canonicalStringify({ b: 1, a: [3, 2, 1], c: { z: 1, y: 2 } } as never)).toBe(
      '{"a":[3,2,1],"b":1,"c":{"y":2,"z":1}}',
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalStringify({ n: Number.POSITIVE_INFINITY } as never)).toThrow(
      ProjectMemoryError,
    );
    expect(() => canonicalStringify({ n: Number.NaN } as never)).toThrow(ProjectMemoryError);
  });

  it("skips undefined object properties rather than emitting invalid JSON", () => {
    expect(canonicalStringify({ a: 1, b: undefined } as never)).toBe('{"a":1}');
  });

  it("is stable regardless of insertion order", () => {
    expect(canonicalStringify({ a: 1, b: 2 } as never)).toBe(
      canonicalStringify({ b: 2, a: 1 } as never),
    );
  });
});

describe("integrity digest format", () => {
  it("produces sha256:<64 hex>", () => {
    const digest = computeIntegrity(DOMAIN_RECORD_INTEGRITY, { a: 1 } as never);
    expect(isIntegrityDigest(digest)).toBe(true);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is domain-separated: the same body hashes differently per domain", () => {
    const body = { a: 1 } as never;
    expect(computeIntegrity(DOMAIN_MANIFEST_INTEGRITY, body)).not.toBe(
      computeIntegrity(DOMAIN_RECORD_INTEGRITY, body),
    );
  });
});

describe("golden integrity hashes", () => {
  // Pinned goldens: any change to canonicalization, domain separators, or the
  // hashing scheme must be deliberate and will trip these exact literal values.
  it("pins the project key", () => {
    expect(deriveProjectKey("proj-1")).toBe(
      "a0d300608584b2e3e3b7a0ceaedf900482e3e5e139f96066e9986a7741957b15",
    );
  });

  it("pins a record key", () => {
    expect(deriveRecordKey("snapshot", "snap-1")).toBe(
      "2c6cf52d9756c532bbc2559739fa83d21c3ca1c115d7c967767fdcc54d758d6c",
    );
  });

  it("pins the manifest integrity digest", () => {
    expect(computeIntegrity(DOMAIN_MANIFEST_INTEGRITY, GOLDEN_MANIFEST_BODY as never)).toBe(
      "sha256:2e2b68346c1cc1fb75cbcb9d6e4c8d0520ebc20ab329ab7c70d61299cbb77234",
    );
  });

  it("pins the record integrity digest", () => {
    expect(computeIntegrity(DOMAIN_RECORD_INTEGRITY, GOLDEN_RECORD_BODY as never)).toBe(
      "sha256:26f7119b1df19c3f31a7a291b1ac3181a4b010f676aadda8e60adfb6cf57a998",
    );
  });
});

describe("manifest and record round-trip", () => {
  it("round-trips a manifest and verifies integrity", () => {
    const manifest = buildManifest({
      storeFormatVersion: 1,
      projectBrainSchemaVersion: 1,
      projectId: "p",
      projectKey: deriveProjectKey("p"),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      latestSnapshotId: "s1",
      snapshotIds: ["s1"],
      evidenceIds: [],
      migrationHistory: [],
    });
    const parsed = parseAndVerifyManifest(serializeManifest(manifest));
    expect(parsed.integrity).toBe(manifest.integrity);
  });

  it("round-trips a record envelope and verifies integrity", () => {
    const env = buildEnvelope("evidence", "p", "e1", {
      evidenceId: "e1",
      projectId: "p",
      schemaVersion: 1,
    });
    const parsed = parseAndVerifyEnvelope(serializeEnvelope(env), {
      recordType: "evidence",
      projectId: "p",
      recordId: "e1",
    });
    expect(parsed.integrity).toBe(env.integrity);
  });

  it("detects a tampered manifest body", () => {
    const manifest = buildManifest({
      storeFormatVersion: 1,
      projectBrainSchemaVersion: 1,
      projectId: "p",
      projectKey: deriveProjectKey("p"),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      latestSnapshotId: null,
      snapshotIds: [],
      evidenceIds: [],
      migrationHistory: [],
    });
    const tampered = JSON.parse(serializeManifest(manifest));
    tampered.updatedAt = "2030-01-01T00:00:00.000Z";
    expect(() => parseAndVerifyManifest(JSON.stringify(tampered))).toThrow(ProjectMemoryError);
  });

  it("detects a tampered record payload", () => {
    const env = buildEnvelope("evidence", "p", "e1", {
      evidenceId: "e1",
      projectId: "p",
      schemaVersion: 1,
    });
    const tampered = JSON.parse(serializeEnvelope(env));
    tampered.payload.schemaVersion = 2;
    expect(() =>
      parseAndVerifyEnvelope(JSON.stringify(tampered), {
        recordType: "evidence",
        projectId: "p",
        recordId: "e1",
      }),
    ).toThrow(ProjectMemoryError);
  });
});

// --- Golden fixtures (the exact bodies the pinned digests above cover) ------

const GOLDEN_MANIFEST_BODY = {
  storeFormatVersion: 1,
  projectBrainSchemaVersion: 1,
  projectId: "golden",
  projectKey: "0".repeat(64),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  latestSnapshotId: null,
  snapshotIds: [],
  evidenceIds: [],
  migrationHistory: [],
};

const GOLDEN_RECORD_BODY = {
  recordType: "snapshot",
  storeFormatVersion: 1,
  projectBrainSchemaVersion: 1,
  projectId: "golden",
  recordId: "snap-1",
  payload: { snapshotId: "snap-1", projectId: "golden", schemaVersion: 1 },
};
