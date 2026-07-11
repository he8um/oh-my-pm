import { describe, expect, it } from "vitest";
import type { RollbackImpactPreviewInput } from "../src/index.js";
import {
  createRollbackImpactDryRun,
  createRollbackImpactOperations,
  createRollbackImpactPreview,
  exampleRollbackImpactPreviewInput,
  normalizeRollbackImpactPath,
  summarizeRollbackImpact,
} from "../src/index.js";

const root = "/tmp/oh-my-pm";

const input = (
  overrides: Partial<RollbackImpactPreviewInput> = {},
): RollbackImpactPreviewInput => ({
  ...exampleRollbackImpactPreviewInput(),
  ...overrides,
});

describe("normalizeRollbackImpactPath", () => {
  it("joins a package-relative path under the root", () => {
    expect(normalizeRollbackImpactPath(root, "bin/oh-my-pm")).toBe("/tmp/oh-my-pm/bin/oh-my-pm");
  });

  it("keeps an absolute path already under the root", () => {
    expect(normalizeRollbackImpactPath(root, "/tmp/oh-my-pm/README.md")).toBe(
      "/tmp/oh-my-pm/README.md",
    );
  });
});

describe("createRollbackImpactOperations", () => {
  it("classifies restore, unchanged, and remove from the fixture", () => {
    const operations = createRollbackImpactOperations(input());
    const byPath = Object.fromEntries(operations.map((op) => [op.path, op.kind]));
    expect(byPath["/tmp/oh-my-pm/bin/oh-my-pm"]).toBe("restore");
    expect(byPath["/tmp/oh-my-pm/README.md"]).toBe("unchanged");
    expect(byPath["/tmp/oh-my-pm/old-file.txt"]).toBe("remove");
  });

  it("restores a backup-only path", () => {
    const operations = createRollbackImpactOperations(
      input({
        currentFiles: [],
        backupFiles: [{ path: "bin/oh-my-pm", content: "old binary", checksum: "sha256:old-bin" }],
        rollback: { id: "rollback-1", paths: ["bin/oh-my-pm"], createdAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    expect(operations.map((op) => op.kind)).toEqual(["restore"]);
  });

  it("marks missing for a rollback path with no current and no backup", () => {
    const operations = createRollbackImpactOperations(
      input({
        currentFiles: [],
        backupFiles: [{ path: "bin/oh-my-pm", content: "old binary", checksum: "sha256:old-bin" }],
        rollback: {
          id: "rollback-1",
          paths: ["bin/oh-my-pm", "ghost.txt"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    const byPath = Object.fromEntries(operations.map((op) => [op.path, op.kind]));
    expect(byPath["/tmp/oh-my-pm/ghost.txt"]).toBe("missing");
  });

  it("ignores current-only paths outside the rollback set", () => {
    const operations = createRollbackImpactOperations(
      input({
        currentFiles: [{ path: "unrelated.txt", content: "x", checksum: "sha256:x" }],
        backupFiles: [{ path: "bin/oh-my-pm", content: "old binary", checksum: "sha256:old-bin" }],
        rollback: { id: "rollback-1", paths: ["bin/oh-my-pm"], createdAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    expect(operations.map((op) => op.path)).toEqual(["/tmp/oh-my-pm/bin/oh-my-pm"]);
  });

  it("returns operations sorted by path and does not mutate inputs", () => {
    const source = input();
    const before = JSON.parse(JSON.stringify(source));
    const operations = createRollbackImpactOperations(source);
    expect(operations.map((op) => op.path)).toEqual(
      [...operations.map((op) => op.path)].sort(),
    );
    expect(source).toEqual(before);
  });
});

describe("summarizeRollbackImpact", () => {
  it("counts kinds and totals sizes from the fixture", () => {
    const summary = summarizeRollbackImpact(createRollbackImpactOperations(input()));
    expect(summary.restores).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(summary.removes).toBe(1);
    expect(summary.missing).toBe(0);
    expect(summary.beforeSizeBytes).toBeGreaterThan(0);
    expect(summary.afterSizeBytes).toBeGreaterThan(0);
  });
});

describe("createRollbackImpactPreview", () => {
  it("accepts the example fixture", () => {
    const preview = createRollbackImpactPreview(input());
    expect(preview.ok).toBe(true);
    expect(preview.reasons).toEqual([]);
    expect(preview.rollbackId).toBe("rollback-1");
  });

  it("fails on a missing root", () => {
    expect(createRollbackImpactPreview(input({ root: " " })).reasons).toContain(
      "rollback_impact_root_missing",
    );
  });

  it("fails on a missing rollback id", () => {
    const preview = createRollbackImpactPreview(
      input({ rollback: { id: "", paths: ["bin/oh-my-pm"], createdAt: "2026-01-01T00:00:00.000Z" } }),
    );
    expect(preview.reasons).toContain("rollback_impact_id_missing");
  });

  it("fails on empty rollback paths", () => {
    const preview = createRollbackImpactPreview(
      input({ rollback: { id: "rollback-1", paths: [], createdAt: "2026-01-01T00:00:00.000Z" } }),
    );
    expect(preview.reasons).toContain("rollback_impact_paths_empty");
  });

  it("fails on an unsafe rollback path", () => {
    const preview = createRollbackImpactPreview(
      input({ rollback: { id: "rollback-1", paths: ["../escape"], createdAt: "2026-01-01T00:00:00.000Z" } }),
    );
    expect(preview.reasons).toContain("rollback_impact_path_unsafe");
  });

  it("fails on empty backup files", () => {
    expect(createRollbackImpactPreview(input({ backupFiles: [] })).reasons).toContain(
      "rollback_impact_backup_files_empty",
    );
  });

  it("orders reasons exactly", () => {
    const preview = createRollbackImpactPreview({
      root: "",
      rollback: { id: "", paths: ["../escape"], createdAt: "2026-01-01T00:00:00.000Z" },
      currentFiles: [],
      backupFiles: [],
    });
    expect(preview.reasons).toEqual([
      "rollback_impact_root_missing",
      "rollback_impact_id_missing",
      "rollback_impact_path_unsafe",
      "rollback_impact_backup_files_empty",
    ]);
  });
});

describe("createRollbackImpactDryRun", () => {
  it("omits warnings for an ok preview", () => {
    const report = createRollbackImpactDryRun(input());
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for an invalid preview", () => {
    const report = createRollbackImpactDryRun(input({ backupFiles: [] }));
    expect(report.ok).toBe(false);
    expect(report.warnings).toEqual([
      { code: "OMP-I-6001", message: "rollback_impact_backup_files_empty" },
    ]);
  });
});

describe("exampleRollbackImpactPreviewInput", () => {
  it("is deterministic and dry-runs ok", () => {
    expect(exampleRollbackImpactPreviewInput()).toEqual(exampleRollbackImpactPreviewInput());
    expect(createRollbackImpactDryRun(exampleRollbackImpactPreviewInput()).ok).toBe(true);
  });
});
