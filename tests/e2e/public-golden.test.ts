// Byte-for-byte replay of the recorded v0.6.0 public surface.
//
// Why this exists
// ---------------
// v0.6.1 rewrites how the shared workflows are composed: the GitHub and local
// families move onto `ApplicationResult<T>`, and the CLI's duplicated local
// composition is replaced by a call to the shared use case. Every one of those
// changes is internal, so the observable output must not move at all.
//
// The parity tests next door compare CLI against MCP, which catches divergence
// BETWEEN surfaces but not a change that moves BOTH in the same direction. This
// test pins the absolute bytes: stdout, stderr, exit code, and the MCP payload,
// against a recording captured from the v0.6.0 tree before any refactor began.
//
// A failure here is not a flaky test. It means the public contract changed.
// Regenerate with `node tools/capture-public-golden.mjs` ONLY when the change is
// intended, and justify the diff in review -- the compatibility hierarchy puts
// public CLI behaviour above internal cleanliness.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runLocalCliProcess } from "@oh-my-pm/cli";
import { executeMcpGitHubTool, executeMcpProjectTool } from "@oh-my-pm/mcp-server";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import { githubTransport } from "../../tools/capture-public-golden.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const golden = JSON.parse(
  readFileSync(join(repoRoot, "tests", "fixtures", "public-golden.json"), "utf8"),
) as {
  schemaVersion: number;
  capturedFor: string;
  now: string;
  entries: readonly GoldenEntry[];
};

type GoldenEntry =
  | {
      name: string;
      surface: "cli";
      args: readonly string[];
      exitCode: number;
      stdout: string;
      stderr: string;
    }
  | { name: string; surface: "mcp"; operation: string; result: unknown };

const SLUG = "octo/demo";
const OFFLINE_CONFIG = defaultProviderConfig();

/** Entries are addressed by name so a reordered recording cannot mask a miss. */
const byName = new Map(golden.entries.map((entry) => [entry.name, entry]));

beforeAll(() => {
  // Both surfaces resolve a relative root against the cwd, exactly as the
  // capture script did. Without this the fixture roots would not resolve when
  // Vitest is invoked from elsewhere.
  process.chdir(repoRoot);
});

function cliEntry(name: string) {
  const entry = byName.get(name);
  if (entry === undefined || entry.surface !== "cli") {
    throw new Error(`golden entry "${name}" is missing; regenerate the recording`);
  }
  return entry;
}

function mcpEntry(name: string) {
  const entry = byName.get(name);
  if (entry === undefined || entry.surface !== "mcp") {
    throw new Error(`golden entry "${name}" is missing; regenerate the recording`);
  }
  return entry;
}

/** Replay a recorded CLI invocation with the same injected inputs. */
async function replayCli(name: string, options: Record<string, unknown> = {}) {
  const entry = cliEntry(name);
  const result = await runLocalCliProcess([...entry.args], options);
  return { entry, result };
}

describe("recorded local CLI output is unchanged", () => {
  for (const operation of ["brief", "risks", "next", "handoff"] as const) {
    for (const mode of ["json", "human"] as const) {
      it(`${operation} (${mode}) matches the v0.6.0 recording`, async () => {
        const { entry, result } = await replayCli(`local.${operation}.${mode}`);
        expect(result.exitCode).toBe(entry.exitCode);
        expect(result.stdout).toBe(entry.stdout);
        expect(result.stderr).toBe(entry.stderr);
      });
    }
  }

  it("the second fixture corpus matches", async () => {
    const { entry, result } = await replayCli("local.risks.markdown.json");
    expect(result.exitCode).toBe(entry.exitCode);
    expect(result.stdout).toBe(entry.stdout);
  });
});

describe("recorded local failure output is unchanged", () => {
  for (const name of ["local.brief.missing.json", "local.brief.missing.relative"]) {
    it(`${name} matches the v0.6.0 recording`, async () => {
      const { entry, result } = await replayCli(name);
      expect(result.exitCode).toBe(entry.exitCode);
      expect(result.stdout).toBe(entry.stdout);
      expect(result.stderr).toBe(entry.stderr);
    });
  }
});

describe("recorded GitHub CLI output is unchanged", () => {
  for (const operation of ["brief", "risks", "next", "handoff"] as const) {
    for (const mode of ["json", "human"] as const) {
      it(`github ${operation} (${mode}) matches the v0.6.0 recording`, async () => {
        const { entry, result } = await replayCli(`github.${operation}.${mode}`, {
          githubTransport: githubTransport(),
          now: golden.now,
          providerConfig: OFFLINE_CONFIG,
        });
        expect(result.exitCode, result.stderr).toBe(entry.exitCode);
        expect(result.stdout).toBe(entry.stdout);
        expect(result.stderr).toBe(entry.stderr);
      });
    }
  }
});

describe("recorded MCP payloads are unchanged", () => {
  for (const operation of ["brief", "risks", "next", "handoff"] as const) {
    it(`local ${operation} MCP payload matches`, async () => {
      const entry = mcpEntry(`local.${operation}.mcp`);
      const actual = await executeMcpProjectTool(operation, "examples/fixtures/project-signals");
      expect(JSON.parse(JSON.stringify(actual))).toEqual(entry.result);
    });

    it(`github ${operation} MCP payload matches`, async () => {
      const entry = mcpEntry(`github.${operation}.mcp`);
      const actual = await executeMcpGitHubTool(
        operation,
        { repository: SLUG, limit: 5 },
        { transport: githubTransport(), providerConfig: OFFLINE_CONFIG, now: golden.now },
      );
      expect(JSON.parse(JSON.stringify(actual))).toEqual(entry.result);
    });
  }

  it("the local failure payload matches", async () => {
    const entry = mcpEntry("local.brief.missing.mcp");
    const actual = await executeMcpProjectTool("brief", "./does-not-exist-anywhere");
    expect(JSON.parse(JSON.stringify(actual))).toEqual(entry.result);
  });
});

describe("the recording itself stays trustworthy", () => {
  it("covers every shared workflow on both surfaces", () => {
    // Guards against a regenerated recording that silently dropped entries:
    // a shrunken golden would still "pass" every replay above.
    expect(golden.entries.length).toBe(29);
    expect(golden.capturedFor).toBe("0.6.0");
  });

  it("contains no absolute filesystem path", () => {
    const serialized = JSON.stringify(golden);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("/home/");
    // A Windows drive-absolute path inside the JSON string: one real backslash,
    // which JSON.stringify has escaped to two characters in `serialized`.
    //
    // The drive letter must be preceded by a non-letter, otherwise the
    // forward-slash form also matches the `s:/` inside a recorded
    // "https://github.com/..." URL -- which is legitimate output, not a leak.
    expect(serialized).not.toMatch(/(^|[^A-Za-z])[A-Za-z]:\\\\/u);
    expect(serialized).not.toMatch(/(^|[^A-Za-z])[A-Za-z]:\//u);
  });

  it("contains no secret marker", () => {
    const serialized = JSON.stringify(golden).toLowerCase();
    for (const marker of ["authorization", "bearer ", "ghp_", "github_pat_", "gho_"]) {
      expect(serialized).not.toContain(marker);
    }
  });
});
