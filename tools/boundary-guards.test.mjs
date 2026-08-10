// Mutation coverage for the two boundary guards extracted in v0.6.3 (F-09).
//
// A static rule that only ever passes on a clean tree is indistinguishable from
// no rule at all: the MCP console ban and the allowlist-freshness check both
// hold today by discipline, so the only way to know they have teeth is to feed
// them the violations they claim to reject.
//
// Every fixture here is a throwaway string or an in-memory path set. Nothing
// writes to mcp-server/src/, and nothing mutates a real allowlist -- a test that
// wrote a console call into real MCP source would leave the repository failing
// its own CI if it aborted midway.

import { describe, expect, it } from "vitest";

import {
  checkAllowlistFreshness,
  checkMcpStdoutDiscipline,
  findConsoleUses,
} from "./boundary-guards.mjs";

const FILE = "mcp-server/src/fixture.ts";

describe("MCP console/stdout discipline", () => {
  // The methods the enumerated list already covered before v0.6.3. They must
  // keep failing -- the generic rule replaced the list, it did not relax it.
  const PREVIOUSLY_ENUMERATED = ["log", "error", "info", "warn", "debug"];

  // The gap the generic rule closes: real console methods the enumeration never
  // named, each of which writes to the same streams.
  const PREVIOUSLY_MISSED = ["trace", "table", "dir", "group", "groupEnd", "count", "assert"];

  describe("rejects every direct console method", () => {
    for (const method of [...PREVIOUSLY_ENUMERATED, ...PREVIOUSLY_MISSED]) {
      it(`rejects console.${method}`, () => {
        const failures = checkMcpStdoutDiscipline(FILE, `console.${method}("fixture");\n`);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain(`console.${method}`);
        expect(failures[0]).toContain(FILE);
      });
    }
  });

  it("rejects a console method the enumeration could never have listed", () => {
    // The point of a generic rule: a method nobody has thought of yet.
    const failures = checkMcpStdoutDiscipline(FILE, `console.somethingNewIn2030("x");\n`);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("console.somethingNewIn2030");
  });

  it("rejects bracket-notation console access", () => {
    const failures = checkMcpStdoutDiscipline(FILE, `console["log"]("evades a dot scan");\n`);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("console.log");
  });

  it("rejects a bare console reference passed elsewhere", () => {
    const failures = checkMcpStdoutDiscipline(FILE, `const sink = console;\n`);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("console");
  });

  it("rejects process.stdout", () => {
    const failures = checkMcpStdoutDiscipline(FILE, `process.stdout.write("raw");\n`);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("process.stdout");
  });

  it("reports console and stdout violations together", () => {
    const failures = checkMcpStdoutDiscipline(
      FILE,
      `console.table([]);\nprocess.stdout.write("x");\n`,
    );
    expect(failures).toHaveLength(2);
  });

  it("flags every console use in a file, not just the first", () => {
    const failures = checkMcpStdoutDiscipline(FILE, `console.log("a");\nconsole.trace("b");\n`);
    expect(failures).toHaveLength(2);
  });

  describe("accepts clean MCP source", () => {
    const CLEAN = [
      [
        "a typical tool module",
        `import { z } from "zod";\nexport function project(input: string): string {\n  return input.trim();\n}\n`,
      ],
      ["process.stderr", `process.stderr.write("diagnostic\\n");\n`],
      ["process.exitCode", `process.exitCode = 1;\n`],
      // These must not trip the identifier boundary: the rule bans the console
      // global, not every occurrence of the substring.
      ["a property named console", `const opts = { console: false };\nreturn opts.console;\n`],
      ["an identifier containing console", `const myconsoleSink = makeSink();\n`],
      ["the word in a comment-like string", `const label = "consoles are not banned";\n`],
    ];

    for (const [label, source] of CLEAN) {
      it(`accepts ${label}`, () => {
        expect(checkMcpStdoutDiscipline(FILE, source)).toEqual([]);
      });
    }
  });

  it("finds uses in source order", () => {
    expect(findConsoleUses(`console.warn("a"); console.dir("b");`)).toEqual([
      "console.warn",
      "console.dir",
    ]);
  });
});

describe("allowlist freshness", () => {
  const TRACKED = new Set([
    "application/src/node/github-token.ts",
    "application/src/node/index.ts",
    "tools/validate-boundaries.mjs",
  ]);

  it("accepts an allowlist whose every entry is tracked", () => {
    expect(checkAllowlistFreshness("GUARD", [...TRACKED], TRACKED)).toEqual([]);
  });

  it("accepts an empty allowlist", () => {
    expect(checkAllowlistFreshness("GUARD", [], TRACKED)).toEqual([]);
  });

  it("rejects a stale entry", () => {
    const failures = checkAllowlistFreshness("GUARD", ["does/not/exist.ts"], TRACKED);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("does/not/exist.ts");
  });

  it("names the guard and the repository-relative path, never an absolute path", () => {
    const failures = checkAllowlistFreshness(
      "GITHUB_TOKEN_ENV_ALLOWED",
      ["cli/src/github-token.ts"],
      TRACKED,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("GITHUB_TOKEN_ENV_ALLOWED");
    expect(failures[0]).toContain("cli/src/github-token.ts");
    // No absolute host path may leak into validator output.
    expect(failures[0]).not.toContain("/Users/");
    expect(failures[0]).not.toMatch(/(?:^|\s)\//);
  });

  it("rejects the exact entry that was stale on main before v0.6.3", () => {
    // cli/src/github-token.ts was allowlisted while not existing; the successor
    // is application/src/node/github-token.ts. This is the regression.
    const failures = checkAllowlistFreshness(
      "GITHUB_PRODUCTION_FILES",
      ["cli/src/github-token.ts", "application/src/node/github-token.ts"],
      TRACKED,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("cli/src/github-token.ts");
  });

  it("reports every stale entry, not just the first", () => {
    const failures = checkAllowlistFreshness("GUARD", ["gone/a.ts", "gone/b.ts"], TRACKED);
    expect(failures).toHaveLength(2);
  });

  it("accepts an array as the tracked surface, not only a Set", () => {
    expect(checkAllowlistFreshness("GUARD", ["a.ts"], ["a.ts"])).toEqual([]);
    expect(checkAllowlistFreshness("GUARD", ["a.ts"], ["b.ts"])).toHaveLength(1);
  });
});
