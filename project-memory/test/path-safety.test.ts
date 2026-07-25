import { describe, expect, it } from "vitest";

import { ProjectMemoryError, PROJECT_MEMORY_ERROR_CODES } from "../src/errors.js";
import { deriveProjectKey, deriveRecordKey } from "../src/integrity.js";
import {
  assertExportDestinationSafe,
  assertProjectDataSeparation,
  confine,
  isSameOrInside,
  lockPathFor,
  manifestPathFor,
  projectDirFor,
  recordPathFor,
  resolveStoreLayout,
  SNAPSHOTS_DIRNAME,
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
    expect(p.startsWith(layout.dataRoot)).toBe(true);
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
