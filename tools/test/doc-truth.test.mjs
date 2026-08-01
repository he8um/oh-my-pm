// The documentation-truth validator must derive its expectations, and it must
// actually fail on drift.
//
// A validator that cannot fail is worse than none: it certifies whatever it is
// shown. These tests prove the derivation matches the real product surface and
// that each class of stale claim is caught.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const validator = join(repoRoot, "tools", "validate-doc-truth.mjs");

function runValidator() {
  return spawnSync(process.execPath, [validator], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

// Backups live OUTSIDE the repository. Writing them alongside the original
// would leave an untracked stray file in the working tree if a run is
// interrupted, which validate-structure would then reject.
const backupDir = mkdtempSync(join(tmpdir(), "omp-doc-truth-"));
afterAll(() => {
  rmSync(backupDir, { recursive: true, force: true });
});

/** Restore any file this suite temporarily edits, even when a test fails. */
const restores = [];
afterEach(() => {
  for (const { path, backup } of restores.splice(0)) {
    copyFileSync(backup, path);
  }
});

let backupSeq = 0;
function withTemporaryEdit(relPath, edit) {
  const path = join(repoRoot, relPath);
  const backup = join(backupDir, `${backupSeq++}-${basename(relPath)}`);
  copyFileSync(path, backup);
  restores.push({ path, backup });
  writeFileSync(path, edit(readFileSync(path, "utf8")));
}

describe("validate-doc-truth passes on the current tree", () => {
  it("exits zero and reports the derived facts", () => {
    const result = runValidator();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate-doc-truth: OK");
  });

  it("derives the version from version.json, not a restated literal", () => {
    const version = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
    expect(runValidator().stdout).toContain(`v${version}`);
    const source = readFileSync(validator, "utf8");
    // The validator must not hard-code the current version as an expectation.
    expect(source).not.toMatch(new RegExp(`["'\`]${version.replace(/\./g, "\\.")}["'\`]`));
  });

  it("derives the MCP tool count from the server registration source", () => {
    const server = readFileSync(join(repoRoot, "mcp-server", "src", "server.ts"), "utf8");
    // Every registered tool name must appear in the server source.
    for (const tool of [
      "project_brief",
      "project_risks",
      "project_next",
      "project_handoff",
      "github_project_brief",
      "github_project_risks",
      "github_project_next",
      "github_project_handoff",
      "provider_status",
      "github_provider_diagnostics",
      "project_changes",
      "project_timeline",
    ]) {
      expect(server).toContain(tool);
    }
    expect(runValidator().stdout).toContain("12 MCP tools");
  });

  it("derives the memory subcommand count from the closed allowlist", () => {
    expect(runValidator().stdout).toContain("7 memory subcommands");
  });
});

describe("validate-doc-truth fails on real drift", () => {
  it("catches a stale MCP tool count", () => {
    withTemporaryEdit("mcp-server/README.md", (text) =>
      text.replace(/All twelve tools/, "All eleven tools"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/eleven/);
  });

  it("catches a stale source version claim", () => {
    withTemporaryEdit(
      "README.md",
      (text) => `${text}\n\nThe current source version is 0.3.1.\n`,
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/claims source version 0\.3\.1/);
  });

  it("catches a dropped project_timeline in the MCP reference", () => {
    withTemporaryEdit("mcp-server/README.md", (text) =>
      text.replaceAll("project_timeline", "project_removed"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/project_timeline/);
  });

  it("catches a reintroduced 'nothing invokes it' comment", () => {
    withTemporaryEdit(
      "project-memory/README.md",
      (text) => `${text}\n\nNothing invokes it yet.\n`,
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Nothing invokes it yet/i);
  });

  it("catches an architecture document that loses the application layer", () => {
    withTemporaryEdit("docs/architecture.md", (text) =>
      text.replaceAll("Application", "Xpplication").replaceAll("@oh-my-pm/application", "removed"),
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Application/);
  });

  it("catches a shell example that demonstrates a deprecated alias", () => {
    withTemporaryEdit(
      "README.md",
      (text) => `${text}\n\n\`\`\`bash\noh-my-pm status\n\`\`\`\n`,
    );
    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/deprecated alias/);
  });
});

describe("historical documents are exempt", () => {
  it("does not flag an old release note for naming its own old version", () => {
    // docs/releases/v0.2.0.md legitimately says 0.2.0 everywhere. The validator
    // must leave it alone; only active documents are checked.
    const result = runValidator();
    expect(result.status).toBe(0);
    const note = readFileSync(join(repoRoot, "docs", "releases", "v0.2.0.md"), "utf8");
    expect(note).toContain("0.2.0");
  });

  it("keeps historical release notes out of the active document list", () => {
    const source = readFileSync(validator, "utf8");
    expect(source).toContain("HISTORICAL_PREFIXES");
    expect(source).toContain("docs/releases/");
  });
});
