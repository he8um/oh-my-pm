import { describe, expect, it } from "vitest";

import { assertNoForbiddenEvidenceFields } from "../src/projectbrain/privacy.js";
import { PROJECT_BRAIN_RUNTIME_ERROR_CODES } from "../src/projectbrain/index.js";

describe("pre-commit privacy scan", () => {
  it("accepts a clean minimized evidence record", () => {
    expect(() =>
      assertNoForbiddenEvidenceFields(
        {
          evidenceId: "evidence:sha256:abc",
          projectId: "p",
          sourceKind: "markdown",
          sourceIdentity: "docs/status.md#L1",
          observedAt: "2026-01-01T00:00:00Z",
          provenance: { line: "1" },
          metadata: { severity: "high", author: "octocat" },
          rawContentPolicy: "minimized",
          retentionState: "active",
          schemaVersion: 1,
          contentFingerprint: "sha256:deadbeef",
        },
        "evidence",
      ),
    ).not.toThrow();
  });

  it("rejects a forbidden key nested anywhere", () => {
    for (const forbidden of [
      "token",
      "rawBody",
      "fingerprintInput",
      "authorization",
      "projectRoot",
    ]) {
      expect(() =>
        assertNoForbiddenEvidenceFields({ metadata: { [forbidden]: "x" } }, "evidence"),
      ).toThrow();
    }
  });

  it("rejects a POSIX absolute path in a provenance value", () => {
    expect(() =>
      assertNoForbiddenEvidenceFields(
        { provenance: { filePath: "/Users/secret/abs.md" } },
        "evidence",
      ),
    ).toThrow();
  });

  it("rejects a Windows absolute path in a metadata value", () => {
    expect(() =>
      assertNoForbiddenEvidenceFields(
        { metadata: { path: "C:\\Users\\secret\\abs.md" } },
        "evidence",
      ),
    ).toThrow();
    // UNC form too.
    expect(() =>
      assertNoForbiddenEvidenceFields({ provenance: { p: "\\\\host\\share\\x" } }, "evidence"),
    ).toThrow();
  });

  it("allows a repo-relative filePath in provenance", () => {
    expect(() =>
      assertNoForbiddenEvidenceFields({ provenance: { filePath: "src/index.ts" } }, "evidence"),
    ).not.toThrow();
  });

  it("does not scan title-level values outside provenance/metadata for paths", () => {
    // A title that happens to mention a path is display text, not a scanned map.
    expect(() =>
      assertNoForbiddenEvidenceFields(
        { title: "Rename /etc/hosts handling", sourceIdentity: "docs/x.md" },
        "snapshot",
      ),
    ).not.toThrow();
  });

  it("uses the invalid-input error code", () => {
    try {
      assertNoForbiddenEvidenceFields({ provenance: { p: "/abs" } }, "evidence");
      expect.unreachable();
    } catch (err) {
      expect((err as { code: string }).code).toBe(PROJECT_BRAIN_RUNTIME_ERROR_CODES.invalidInput);
    }
  });
});
