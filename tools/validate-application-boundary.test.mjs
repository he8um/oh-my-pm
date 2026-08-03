// Mutation coverage for the application-boundary validator.
//
// A validator that passes is not evidence of anything on its own -- a check
// that can never fail is indistinguishable from no check at all. These tests
// break the tree in each way the validator claims to detect, run it against the
// damaged copy, and assert it fails for the right reason. Then they assert it
// passes on the real tree.
//
// The mutations run against a temporary COPY of the repository sources, never
// the working tree: a test that edited tracked files in place would leave the
// repository dirty if it failed midway.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATOR = join("tools", "validate-application-boundary.mjs");

/** Files the validator reads. Only these need copying into a mutation sandbox. */
const REQUIRED = [
  "package.json",
  "packages.json",
  "command-surface.json",
  "version.json",
  join("tools", "validate-application-boundary.mjs"),
  join("tools", "command-surface.mjs"),
  join("cli", "src", "local-process.ts"),
  join("cli", "src", "github-process.ts"),
  join("mcp-server", "src", "project-tool-runner.ts"),
  join("mcp-server", "src", "github-tool-runner.ts"),
  join("mcp-server", "src", "types.ts"),
  join("application", "src", "index.ts"),
];

const sandboxes = [];

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of just the files the validator reads. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "omp-boundary-"));
  sandboxes.push(dir);
  for (const relative of REQUIRED) {
    cpSync(join(repoRoot, relative), join(dir, relative), { recursive: true });
  }
  return dir;
}

/** Run the validator inside a sandbox; return its exit code and output. */
function runValidator(dir) {
  try {
    const stdout = execFileSync(process.execPath, [VALIDATOR], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    return {
      code: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

/** Apply a string replacement to a sandboxed file, asserting it actually hit. */
function mutate(dir, relative, find, replace) {
  const path = join(dir, relative);
  const before = readFileSync(path, "utf8");
  const after = before.replace(find, replace);
  // A mutation that changed nothing would make the test vacuous: it would
  // "pass" by running the validator against an unmodified tree.
  expect(after, `mutation did not apply to ${relative}`).not.toBe(before);
  writeFileSync(path, after, "utf8");
}

describe("the boundary validator accepts the real repository", () => {
  it("passes on an unmutated tree", () => {
    const result = runValidator(sandbox());
    expect(result.output).toContain("validate-application-boundary: OK");
    expect(result.code).toBe(0);
  });
});

describe("the boundary validator detects duplicated use-case composition", () => {
  it("fails when the CLI stops calling the shared local use case", () => {
    // The exact regression v0.6.1 closed: the CLI re-composing its own Runtime
    // for the shared four instead of routing through the application boundary.
    const dir = sandbox();
    mutate(
      dir,
      join("cli", "src", "local-process.ts"),
      /runLocalProjectWorkflow/gu,
      "reComposedLocalWorkflow",
    );
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain("does not call runLocalProjectWorkflow");
  });

  it("fails when the CLI stops calling the shared GitHub use case", () => {
    const dir = sandbox();
    mutate(
      dir,
      join("cli", "src", "github-process.ts"),
      /runGitHubProjectWorkflow/gu,
      "reComposedGitHubWorkflow",
    );
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain("does not call runGitHubProjectWorkflow");
  });

  it("fails when an MCP runner stops calling the shared use case", () => {
    const dir = sandbox();
    mutate(
      dir,
      join("mcp-server", "src", "project-tool-runner.ts"),
      /runLocalProjectWorkflow/gu,
      "reComposedLocalWorkflow",
    );
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain("does not call runLocalProjectWorkflow");
  });
});

describe("the boundary validator detects over-migration", () => {
  it("fails when a CLI-only command becomes an MCP project operation", () => {
    // The opposite failure mode: forcing status/doctor/plan through the
    // boundary for diagrammatic symmetry, with no second consumer.
    const dir = sandbox();
    mutate(
      dir,
      join("mcp-server", "src", "types.ts"),
      /export type McpProjectOperation = "brief" \| "risks" \| "next" \| "handoff";/u,
      'export type McpProjectOperation = "brief" | "risks" | "next" | "handoff" | "doctor";',
    );
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain('McpProjectOperation includes "doctor"');
  });

  it("fails when a CLI-only command becomes an MCP GitHub operation", () => {
    const dir = sandbox();
    mutate(
      dir,
      join("mcp-server", "src", "types.ts"),
      /export type McpGitHubOperation = "brief" \| "risks" \| "next" \| "handoff";/u,
      'export type McpGitHubOperation = "brief" | "risks" | "next" | "handoff" | "plan";',
    );
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain('McpGitHubOperation includes "plan"');
  });
});

describe("the boundary validator detects a shrunken shared surface", () => {
  it("fails when a shared workflow is dropped from the MCP surface", () => {
    const dir = sandbox();
    mutate(
      dir,
      join("mcp-server", "src", "types.ts"),
      /export type McpGitHubOperation = "brief" \| "risks" \| "next" \| "handoff";/u,
      'export type McpGitHubOperation = "brief" | "risks" | "next";',
    );
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain('no longer includes the shared workflow "handoff"');
  });
});

describe("the boundary validator keeps the declared asymmetry honest", () => {
  it("fails when the rationale stops naming a CLI-only command", () => {
    const dir = sandbox();
    mutate(dir, "packages.json", /`status`, `doctor`, and `plan`/u, "`status` and `plan`");
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain('no longer names "doctor"');
  });

  it("fails when a surface claims every CLI workflow is application-owned", () => {
    // The documentation drift this validator exists to prevent: prose asserting
    // a symmetry the architecture deliberately does not have.
    const dir = sandbox();
    mutate(
      dir,
      "packages.json",
      /"own the CLI exit-code mapping",/u,
      '"own the CLI exit-code mapping", "note: all CLI commands are application owned",',
    );
    const result = runValidator(dir);
    expect(result.code).toBe(1);
    expect(result.output).toContain("claims every CLI workflow is application-owned");
  });
});
