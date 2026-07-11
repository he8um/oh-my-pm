// Tests for the dry-run installer preview. Only test code prepares and
// removes temporary directories; the preview itself must never write.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatInstallerPreview, runInstallerPreview } from "../src/index.js";
import type { InstallerPreviewResult } from "../src/index.js";

function withTempRoot<T>(run: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-install-preview-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const failureResult: InstallerPreviewResult = {
  ok: false,
  root: "",
  operations: [],
  packageName: "oh-my-pm-local",
  packageVersion: "2.0.0-alpha.0",
  warnings: ["invalid install input: missing_root"],
};

describe("runInstallerPreview", () => {
  it("assembles from the root and plans operations without writing anything", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      writeFileSync(join(root, "README.md"), "old readme", "utf8");
      const before = readdirSync(root).sort();

      const result = runInstallerPreview(root);
      expect(result.ok).toBe(true);
      expect(result.packageName).toBe("oh-my-pm-local");
      expect(result.packageVersion).toBe("2.0.0-alpha.0");
      expect(result.operations.map((operation) => operation.kind)).toEqual([
        "replace",
        "replace",
      ]);
      expect(result.warnings).toEqual([]);
      expect(result.archive).toEqual({
        format: "zip",
        archiveName: "oh-my-pm-local-2.0.0-alpha.0.zip",
        entries: 2,
        checksum: expect.stringMatching(/^archive:zip:oh-my-pm-local:2\.0\.0-alpha\.0:/),
      });

      expect(readdirSync(root).sort()).toEqual(before);
      expect(readFileSync(join(root, "bin", "oh-my-pm"), "utf8")).toBe("old binary");
      expect(readdirSync(root).some((name) => name.endsWith(".zip"))).toBe(false);
    });
  });

  it("warns about missing include files but still previews found files", () => {
    withTempRoot((root) => {
      writeFileSync(join(root, "README.md"), "old readme", "utf8");
      const result = runInstallerPreview(root);
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual(["OMP-I-6001: assembly_include_file_missing"]);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].path.endsWith("README.md")).toBe(true);
    });
  });

  it("carries manifest-derived per-file checksums into json output", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      writeFileSync(join(root, "README.md"), "old readme", "utf8");
      const parsed = JSON.parse(formatInstallerPreview(runInstallerPreview(root), "json"));
      expect(parsed.operations).toHaveLength(2);
      for (const operation of parsed.operations as { checksum?: string }[]) {
        expect(operation.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
      expect(parsed.archive.archiveName).toBe("oh-my-pm-local-2.0.0-alpha.0.zip");
      expect(parsed.archive.entries).toBe(2);
    });
  });

  it("fails without mutating anything for an empty root", () => {
    const result = runInstallerPreview("");
    expect(result.ok).toBe(false);
    expect(result.operations).toEqual([]);
    expect(result.warnings).toEqual([
      "OMP-I-6001: archive_files_must_not_be_empty",
      "OMP-I-6001: missing_root",
      "invalid package manifest: package_files_must_not_be_empty",
    ]);
    expect(result.archive?.entries).toBe(0);
  });
});

describe("formatInstallerPreview", () => {
  const successResult: InstallerPreviewResult = {
    ok: true,
    root: "/tmp/oh-my-pm",
    operations: [
      { kind: "replace", path: "/tmp/oh-my-pm/bin/oh-my-pm", checksum: "sha256:example" },
      { kind: "create", path: "/tmp/oh-my-pm/README.md", checksum: "sha256:example" },
    ],
    packageName: "oh-my-pm-local",
    packageVersion: "2.0.0-alpha.0",
    warnings: [],
  };

  it("formats a brief success report", () => {
    expect(formatInstallerPreview(successResult, "brief")).toBe(
      [
        "OH MY PM install-preview: ok",
        "package: oh-my-pm-local@2.0.0-alpha.0",
        "root: /tmp/oh-my-pm",
        "operations: 2",
        "- replace /tmp/oh-my-pm/bin/oh-my-pm",
        "- create /tmp/oh-my-pm/README.md",
        "",
      ].join("\n"),
    );
  });

  it("formats a markdown success report", () => {
    expect(formatInstallerPreview(successResult, "markdown")).toBe(
      [
        "# OH MY PM Install Preview",
        "",
        "Package: `oh-my-pm-local@2.0.0-alpha.0`",
        "Root: `/tmp/oh-my-pm`",
        "",
        "## Operations",
        "",
        "- `replace` `/tmp/oh-my-pm/bin/oh-my-pm`",
        "- `create` `/tmp/oh-my-pm/README.md`",
        "",
      ].join("\n"),
    );
  });

  it("formats a json report that round-trips", () => {
    const output = formatInstallerPreview(successResult, "json");
    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output)).toEqual(successResult);
  });

  it("formats a brief failure report", () => {
    expect(formatInstallerPreview(failureResult, "brief")).toBe(
      [
        "OH MY PM install-preview: failed",
        "package: oh-my-pm-local@2.0.0-alpha.0",
        "root: ",
        "warning: invalid install input: missing_root",
        "",
      ].join("\n"),
    );
  });

  it("adds an archive-plan line to brief output when planned", () => {
    const withArchive = {
      ...successResult,
      archive: {
        format: "zip",
        archiveName: "oh-my-pm-local-2.0.0-alpha.0.zip",
        entries: 2,
        checksum: "archive:zip:oh-my-pm-local:2.0.0-alpha.0:x",
      },
    };
    expect(formatInstallerPreview(withArchive, "brief")).toContain(
      "archive-plan: oh-my-pm-local-2.0.0-alpha.0.zip\n",
    );
    expect(formatInstallerPreview(withArchive, "markdown")).toContain(
      "## Archive Plan\n\nPlanned archive: `oh-my-pm-local-2.0.0-alpha.0.zip`\n",
    );
  });

  it("formats a markdown failure report", () => {
    expect(formatInstallerPreview(failureResult, "markdown")).toBe(
      [
        "# OH MY PM Install Preview",
        "",
        "Status: failed",
        "",
        "Package: `oh-my-pm-local@2.0.0-alpha.0`",
        "Root: ``",
        "",
        "## Warnings",
        "",
        "- invalid install input: missing_root",
        "",
      ].join("\n"),
    );
  });
});
