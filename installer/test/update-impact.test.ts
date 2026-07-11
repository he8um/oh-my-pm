import { describe, expect, it } from "vitest";
import type { LocalUpdatePolicyReport, UpdateImpactPreviewInput } from "../src/index.js";
import {
  createUpdateImpactDryRun,
  createUpdateImpactOperations,
  createUpdateImpactPreview,
  exampleUpdateImpactPreviewInput,
  normalizeImpactPath,
  summarizeUpdateImpact,
} from "../src/index.js";

const root = "/tmp/oh-my-pm";

const allowedPolicy: LocalUpdatePolicyReport = {
  ok: true,
  decision: "allowed",
  channel: "dev",
  reasons: [],
  currentVersion: "1.0.0",
  candidateVersion: "2.0.0-alpha.0",
};

const input = (overrides: Partial<UpdateImpactPreviewInput> = {}): UpdateImpactPreviewInput => ({
  root,
  currentFiles: [],
  candidateEntries: [],
  policy: allowedPolicy,
  ...overrides,
});

describe("normalizeImpactPath", () => {
  it("joins a package-relative path under the root", () => {
    expect(normalizeImpactPath(root, "bin/oh-my-pm")).toBe("/tmp/oh-my-pm/bin/oh-my-pm");
  });

  it("keeps an absolute path already under the root", () => {
    expect(normalizeImpactPath(root, "/tmp/oh-my-pm/README.md")).toBe("/tmp/oh-my-pm/README.md");
  });
});

describe("createUpdateImpactOperations", () => {
  it("classifies create, replace, remove, and unchanged", () => {
    const operations = createUpdateImpactOperations(
      input({
        currentFiles: [
          { path: "keep.txt", content: "same", checksum: "sha256:same" },
          { path: "change.txt", content: "old!", checksum: "sha256:old" },
          { path: "gone.txt", content: "bye!", checksum: "sha256:gone" },
        ],
        candidateEntries: [
          { path: "keep.txt", checksum: "sha256:same", sizeBytes: 4 },
          { path: "change.txt", checksum: "sha256:new", sizeBytes: 4 },
          { path: "fresh.txt", checksum: "sha256:fresh", sizeBytes: 5 },
        ],
      }),
    );
    const byPath = Object.fromEntries(operations.map((op) => [op.path, op.kind]));
    expect(byPath["/tmp/oh-my-pm/fresh.txt"]).toBe("create");
    expect(byPath["/tmp/oh-my-pm/change.txt"]).toBe("replace");
    expect(byPath["/tmp/oh-my-pm/gone.txt"]).toBe("remove");
    expect(byPath["/tmp/oh-my-pm/keep.txt"]).toBe("unchanged");
  });

  it("treats a size difference as replace", () => {
    const operations = createUpdateImpactOperations(
      input({
        currentFiles: [{ path: "a.txt", content: "ab", checksum: "sha256:x" }],
        candidateEntries: [{ path: "a.txt", checksum: "sha256:x", sizeBytes: 99 }],
      }),
    );
    expect(operations[0].kind).toBe("replace");
  });

  it("returns operations sorted by path and does not mutate inputs", () => {
    const currentFiles = [{ path: "z.txt", content: "z", checksum: "sha256:z" }];
    const candidateEntries = [{ path: "a.txt", checksum: "sha256:a", sizeBytes: 1 }];
    const operations = createUpdateImpactOperations(input({ currentFiles, candidateEntries }));
    expect(operations.map((op) => op.path)).toEqual([
      "/tmp/oh-my-pm/a.txt",
      "/tmp/oh-my-pm/z.txt",
    ]);
    expect(currentFiles).toHaveLength(1);
    expect(candidateEntries).toHaveLength(1);
  });
});

describe("summarizeUpdateImpact", () => {
  it("counts kinds and totals sizes", () => {
    const operations = createUpdateImpactOperations(
      input({
        currentFiles: [
          { path: "keep.txt", content: "same", checksum: "sha256:same" },
          { path: "gone.txt", content: "byebye", checksum: "sha256:gone" },
        ],
        candidateEntries: [
          { path: "keep.txt", checksum: "sha256:same", sizeBytes: 4 },
          { path: "fresh.txt", checksum: "sha256:fresh", sizeBytes: 5 },
        ],
      }),
    );
    const summary = summarizeUpdateImpact(operations);
    expect(summary).toEqual({
      creates: 1,
      replaces: 0,
      removes: 1,
      unchanged: 1,
      beforeSizeBytes: 4 + 6,
      afterSizeBytes: 4 + 5,
    });
  });
});

describe("createUpdateImpactPreview", () => {
  it("accepts the example fixture with a replace and an unchanged", () => {
    const preview = createUpdateImpactPreview(exampleUpdateImpactPreviewInput());
    expect(preview.ok).toBe(true);
    expect(preview.reasons).toEqual([]);
    expect(preview.summary.replaces).toBe(1);
    expect(preview.summary.unchanged).toBe(1);
  });

  it("blocks when the policy is not allowed and carries deduped policy reasons", () => {
    const preview = createUpdateImpactPreview(
      input({
        candidateEntries: [{ path: "a.txt", checksum: "sha256:a", sizeBytes: 1 }],
        policy: {
          ok: false,
          decision: "blocked",
          channel: "dev",
          reasons: ["channel_not_allowed", "channel_not_allowed"],
        },
      }),
    );
    expect(preview.ok).toBe(false);
    expect(preview.reasons).toEqual(["update_policy_not_allowed", "channel_not_allowed"]);
  });

  it("is ok for an already-current candidate", () => {
    const preview = createUpdateImpactPreview(
      input({
        candidateEntries: [{ path: "a.txt", checksum: "sha256:a", sizeBytes: 1 }],
        policy: {
          ok: true,
          decision: "already-current",
          channel: "dev",
          reasons: ["candidate_already_installed"],
        },
      }),
    );
    expect(preview.ok).toBe(true);
    expect(preview.reasons).toEqual(["candidate_already_installed"]);
  });

  it("fails on a missing root", () => {
    const preview = createUpdateImpactPreview(
      input({ root: " ", candidateEntries: [{ path: "a.txt", checksum: "sha256:a", sizeBytes: 1 }] }),
    );
    expect(preview.ok).toBe(false);
    expect(preview.reasons).toContain("update_impact_root_missing");
  });

  it("fails on empty candidate entries", () => {
    const preview = createUpdateImpactPreview(input({ candidateEntries: [] }));
    expect(preview.ok).toBe(false);
    expect(preview.reasons).toEqual(["update_impact_candidate_entries_empty"]);
  });

  it("orders reasons exactly", () => {
    const preview = createUpdateImpactPreview(
      input({
        root: "",
        candidateEntries: [],
        policy: { ok: false, decision: "blocked", channel: "dev", reasons: ["candidate_missing"] },
      }),
    );
    expect(preview.reasons).toEqual([
      "update_impact_root_missing",
      "update_policy_not_allowed",
      "candidate_missing",
      "update_impact_candidate_entries_empty",
    ]);
  });
});

describe("createUpdateImpactDryRun", () => {
  it("omits warnings for an ok preview", () => {
    const report = createUpdateImpactDryRun(exampleUpdateImpactPreviewInput());
    expect(report.ok).toBe(true);
    expect(report.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked preview", () => {
    const report = createUpdateImpactDryRun(input({ candidateEntries: [] }));
    expect(report.ok).toBe(false);
    expect(report.warnings).toEqual([
      { code: "OMP-I-6001", message: "update_impact_candidate_entries_empty" },
    ]);
  });
});

describe("exampleUpdateImpactPreviewInput", () => {
  it("is deterministic and dry-runs ok", () => {
    expect(exampleUpdateImpactPreviewInput()).toEqual(exampleUpdateImpactPreviewInput());
    expect(createUpdateImpactDryRun(exampleUpdateImpactPreviewInput()).ok).toBe(true);
  });
});
