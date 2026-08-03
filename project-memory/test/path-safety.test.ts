import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { ProjectMemoryError, PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { deriveProjectKey, deriveRecordKey } from "../src/integrity.js";
import {
  assertExportDestinationSafe,
  assertProjectDataSeparation,
  BACKUPS_DIRNAME,
  confine,
  EVIDENCE_DIRNAME,
  isNonRecordStoreDirname,
  isSameOrInside,
  LOCKS_DIRNAME,
  lockPathFor,
  manifestPathFor,
  projectDirFor,
  QUARANTINE_DIRNAME,
  QUARANTINE_METADATA_FILENAME,
  QUARANTINE_PAYLOAD_FILENAME,
  quarantineDirFor,
  quarantineMetadataPathFor,
  quarantineOperationDirFor,
  quarantinePayloadPathFor,
  recordPathFor,
  REPAIR_RECEIPT_FILENAME,
  repairReceiptPathFor,
  resolveStoreLayout,
  SNAPSHOTS_DIRNAME,
  STAGING_DIRNAME,
} from "../src/path-safety.js";

const DATA_ROOT = "/data/oh-my-pm";
const layout = resolveStoreLayout(DATA_ROOT);

describe("project/data-root separation", () => {
  it("accepts disjoint roots", () => {
    expect(() => assertProjectDataSeparation(DATA_ROOT, "/work/project")).not.toThrow();
  });

  it("rejects equal roots", () => {
    expect(() => assertProjectDataSeparation(DATA_ROOT, DATA_ROOT)).toThrow(ProjectMemoryError);
  });

  it("rejects data root inside project root", () => {
    expect(() => assertProjectDataSeparation("/work/project/data", "/work/project")).toThrow(
      /must not be inside the project root/,
    );
  });

  it("rejects project root inside data root", () => {
    expect(() => assertProjectDataSeparation("/data", "/data/project")).toThrow(
      /must not be inside the data root/,
    );
  });
});

describe("confinement and traversal", () => {
  it("confines a normal managed path", () => {
    const p = manifestPathFor(layout, deriveProjectKey("proj"));
    // isSameOrInside(), not startsWith(). `resolveStoreLayout` resolves through
    // node:path, so on Windows a "/data/..." root becomes "D:\\data\\..." and a raw
    // prefix test fails on the drive letter alone -- while also being the wrong
    // check, since "/data/store-evil" does begin with "/data/store".
    expect(isSameOrInside(layout.dataRoot, p)).toBe(true);
  });

  it("rejects a traversal that escapes the data root", () => {
    expect(() => confine(DATA_ROOT, `${DATA_ROOT}/../../etc/passwd`)).toThrow(ProjectMemoryError);
    try {
      confine(DATA_ROOT, `${DATA_ROOT}/../escape`);
    } catch (err) {
      expect((err as ProjectMemoryError).code).toBe(PROJECT_MEMORY_ERROR_CODES.pathEscape);
    }
  });

  it("isSameOrInside detects nesting both ways", () => {
    expect(isSameOrInside("/a", "/a/b")).toBe(true);
    expect(isSameOrInside("/a/b", "/a")).toBe(false);
    expect(isSameOrInside("/a", "/a")).toBe(true);
    expect(isSameOrInside("/a", "/b")).toBe(false);
  });
});

describe("keys never become raw filenames", () => {
  it("uses SHA-256 keys, not the raw ids, in managed paths", () => {
    const projectId = "explicit/../id-with-slash";
    const snapshotId = "snap:with:colons";
    const projectKey = deriveProjectKey(projectId);
    const recordKey = deriveRecordKey("snapshot", snapshotId);
    const recordPath = recordPathFor(layout, projectKey, SNAPSHOTS_DIRNAME, recordKey);
    // The raw ids must never appear in the path; only their SHA-256 keys.
    expect(recordPath).not.toContain("id-with-slash");
    expect(recordPath).not.toContain("snap:with:colons");
    expect(recordPath).toContain(projectKey);
    expect(recordPath).toContain(recordKey);
  });

  it("record and project keys are lowercase 64-char hex", () => {
    expect(deriveProjectKey("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveRecordKey("evidence", "y")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("managed path segments never contain Windows-invalid characters", () => {
    // Keys are hex, so the only non-hex bytes come from fixed structural names.
    const projectKey = deriveProjectKey("proj:<>|?*");
    for (const p of [
      lockPathFor(layout, projectKey),
      projectDirFor(layout, projectKey),
      manifestPathFor(layout, projectKey),
    ]) {
      const managed = p.slice(layout.dataRoot.length);
      expect(managed).not.toMatch(/[<>:"|?*]/);
    }
  });
});

describe("export destination safety", () => {
  it("rejects a destination inside the project root", () => {
    expect(() =>
      assertExportDestinationSafe(DATA_ROOT, "/work/project", "/work/project/out"),
    ).toThrow(/must not be inside the project root/);
  });

  it("rejects a destination inside the active data root", () => {
    expect(() =>
      assertExportDestinationSafe(DATA_ROOT, "/work/project", `${DATA_ROOT}/out`),
    ).toThrow(/must not be inside the active data root/);
  });

  it("accepts a disjoint destination", () => {
    expect(() =>
      assertExportDestinationSafe(DATA_ROOT, "/work/project", "/exports/copy"),
    ).not.toThrow();
  });
});

describe("governed quarantine layout", () => {
  const projectKey = deriveProjectKey("proj");
  const entryKey = deriveRecordKey("snapshot", "snap-1");
  const OP = "omp-repair-2026-01-01-1234";

  it("places quarantine inside the project store, confined to the data root", () => {
    const dir = quarantineDirFor(layout, projectKey);
    expect(isSameOrInside(projectDirFor(layout, projectKey), dir)).toBe(true);
    expect(isSameOrInside(layout.dataRoot, dir)).toBe(true);
    expect(dir.endsWith(QUARANTINE_DIRNAME)).toBe(true);
  });

  it("keeps quarantine outside every record directory", () => {
    // Record discovery walks snapshots/ and evidence/. Quarantine must not be
    // reachable from either, or an isolated payload would be re-read as a live
    // record and the isolation would be undone by the next scan.
    const dir = quarantineDirFor(layout, projectKey);
    const projectDir = projectDirFor(layout, projectKey);
    for (const recordDir of [SNAPSHOTS_DIRNAME, EVIDENCE_DIRNAME]) {
      expect(isSameOrInside(`${projectDir}/${recordDir}`, dir)).toBe(false);
    }
  });

  it("scopes payload, metadata, and receipt to one operation directory", () => {
    const opDir = quarantineOperationDirFor(layout, projectKey, OP);
    const payload = quarantinePayloadPathFor(layout, projectKey, OP, entryKey);
    const metadata = quarantineMetadataPathFor(layout, projectKey, OP, entryKey);
    const receipt = repairReceiptPathFor(layout, projectKey, OP);
    for (const p of [payload, metadata, receipt]) {
      expect(isSameOrInside(opDir, p)).toBe(true);
    }
    expect(payload.endsWith(QUARANTINE_PAYLOAD_FILENAME)).toBe(true);
    expect(metadata.endsWith(QUARANTINE_METADATA_FILENAME)).toBe(true);
    expect(receipt.endsWith(REPAIR_RECEIPT_FILENAME)).toBe(true);
    // Payload and metadata share an entry directory so one entry's evidence is
    // never split across operations. Compared with dirname(): a lastIndexOf("/")
    // scan finds nothing in a backslash path and silently compared two whole
    // paths instead of two directories.
    expect(dirname(payload)).toBe(dirname(metadata));
  });

  it("is deterministic for the same operation and entry", () => {
    // Idempotency depends on this: a retried apply must reuse the same slot
    // rather than write a second copy of identical evidence.
    expect(quarantinePayloadPathFor(layout, projectKey, OP, entryKey)).toBe(
      quarantinePayloadPathFor(layout, projectKey, OP, entryKey),
    );
    expect(quarantinePayloadPathFor(layout, projectKey, "other-op", entryKey)).not.toBe(
      quarantinePayloadPathFor(layout, projectKey, OP, entryKey),
    );
  });

  it("rejects a traversal or separator in the operation id", () => {
    for (const bad of ["..", ".", "a/b", "a\\b", "../escape", "", "op with space", "op:1"]) {
      expect(() => quarantineOperationDirFor(layout, projectKey, bad)).toThrow(ProjectMemoryError);
    }
  });

  it("rejects an entry key that is not a SHA-256 key", () => {
    // The entry key is the only remaining path fragment, so it must be a derived
    // digest and never a caller-chosen name.
    for (const bad of ["..", "not-hex", "ABCDEF", entryKey.slice(0, 63), `${entryKey}0`]) {
      expect(() => quarantinePayloadPathFor(layout, projectKey, OP, bad)).toThrow(
        ProjectMemoryError,
      );
    }
  });

  it("never puts a raw id into a quarantine path", () => {
    const rawProject = "proj/../escape";
    const key = deriveProjectKey(rawProject);
    const path = quarantinePayloadPathFor(layout, key, OP, entryKey);
    expect(path).not.toContain("escape");
    expect(path).toContain(key);
  });

  it("classifies every governed non-record directory", () => {
    for (const name of [STAGING_DIRNAME, BACKUPS_DIRNAME, QUARANTINE_DIRNAME, LOCKS_DIRNAME]) {
      expect(isNonRecordStoreDirname(name)).toBe(true);
    }
    for (const name of [SNAPSHOTS_DIRNAME, EVIDENCE_DIRNAME, "manifest.json"]) {
      expect(isNonRecordStoreDirname(name)).toBe(false);
    }
  });
});
