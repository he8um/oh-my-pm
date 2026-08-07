// v0.5.1 architecture parity for the MCP server.
//
// The MCP server is a presentation adapter over @oh-my-pm/application. These
// checks fail the build if it re-acquires a dependency on the CLI, if the
// twelve-tool surface changes, or if a write tool appears.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(packageDir, "src");
const binDir = join(packageDir, "bin");

/**
 * The exact registered tool surface, in registration order. This list is the
 * contract: MCP clients depend on both the names and the order, so a change
 * here is a breaking change and must never happen in a patch release.
 */
const EXPECTED_TOOLS = [
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
] as const;

function sourceFiles(dir: string, extension: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full, extension));
    else if (entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

describe("the MCP server does not depend on the CLI", () => {
  it("declares no dependency on @oh-my-pm/cli", () => {
    const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      expect(
        Object.hasOwn(pkg[field] ?? {}, "@oh-my-pm/cli"),
        `${field} must not contain @oh-my-pm/cli`,
      ).toBe(false);
    }
  });

  it("depends on @oh-my-pm/application instead", () => {
    const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@oh-my-pm/application"]).toBe("workspace:*");
  });

  it("imports @oh-my-pm/cli from no source or bin file", () => {
    const files = [...sourceFiles(srcDir, ".ts"), ...sourceFiles(binDir, ".mjs")];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      expect(
        contents.includes('"@oh-my-pm/cli"'),
        `${relative(packageDir, file)} must not import @oh-my-pm/cli`,
      ).toBe(false);
    }
  });

  it("reaches shared project loading through the application Node surface", () => {
    const runner = readFileSync(join(srcDir, "project-tool-runner.ts"), "utf8");
    expect(runner).toContain("@oh-my-pm/application");
    // The MCP server must not re-implement the Node document loader.
    expect(runner).not.toContain('from "node:fs"');
  });
});

describe("the twelve-tool surface is unchanged", () => {
  const server = readFileSync(join(srcDir, "server.ts"), "utf8");

  it("registers exactly the expected tools in the expected order", () => {
    // Direct registrations plus the looped GitHub descriptors, in source order.
    const direct = [...server.matchAll(/server\.registerTool\(\s*"([a-z_]+)"/g)];
    const loopSite = server.indexOf("server.registerTool(\n      tool.name");
    const loopNames = [...server.matchAll(/^\s*name: "(github_project_[a-z]+)"/gm)].map(
      (m) => m[1] as string,
    );

    const ordered: string[] = [];
    let inserted = false;
    for (const match of direct) {
      if (!inserted && loopSite !== -1 && (match.index ?? 0) > loopSite) {
        ordered.push(...loopNames);
        inserted = true;
      }
      ordered.push(match[1] as string);
    }
    if (!inserted) ordered.push(...loopNames);

    expect(ordered).toEqual([...EXPECTED_TOOLS]);
    expect(ordered).toHaveLength(12);
  });

  it("declares zero write tools", () => {
    expect(server).not.toMatch(/destructiveHint:\s*true/);
    // A source-level smoke check only. The authoritative per-tool guarantee is
    // the live listTools() assertion in mcp-readonly-annotations.test.ts:
    // counting `readOnlyHint: true` occurrences here cannot tell which tools
    // they belong to, so it must never stand in for that check.
    expect(server).toMatch(/readOnlyHint:\s*true/);
  });

  it("uses stdio transport only", () => {
    const files = sourceFiles(srcDir, ".ts");
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      for (const marker of ["StreamableHTTP", "SSEServerTransport", "createServer", ".listen("]) {
        expect(
          contents.includes(marker),
          `${relative(packageDir, file)} must not use ${marker}`,
        ).toBe(false);
      }
    }
  });
});
