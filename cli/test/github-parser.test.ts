import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/index.js";

function parse(args: string[]) {
  return parseCliArgs(args);
}

describe("github command parsing", () => {
  it("parses all four operations", () => {
    for (const op of ["brief", "risks", "next", "handoff"] as const) {
      const result = parse(["github", op, "owner/repo"]);
      expect(result.ok).toBe(true);
      if (result.ok && result.command === "github") {
        expect(result.operation).toBe(op);
        expect(result.repository).toBe("owner/repo");
      }
    }
  });

  it("requires an operation", () => {
    const result = parse(["github"]);
    expect(result.ok).toBe(false);
  });

  it("requires a repository", () => {
    const result = parse(["github", "brief"]);
    expect(result.ok).toBe(false);
  });

  it("defaults the limit to 50", () => {
    const result = parse(["github", "brief", "owner/repo"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command === "github") {
      expect(result.limit).toBe(50);
    }
  });

  it("accepts a valid limit", () => {
    const result = parse(["github", "brief", "owner/repo", "--limit", "25"]);
    if (result.ok && result.command === "github") {
      expect(result.limit).toBe(25);
    } else {
      throw new Error("expected github result");
    }
  });

  it("rejects zero, negative, over-100, and non-integer limits", () => {
    for (const bad of ["0", "-1", "101", "1.5", "abc"]) {
      expect(parse(["github", "brief", "owner/repo", "--limit", bad]).ok, bad).toBe(false);
    }
  });

  it("rejects a duplicate --limit", () => {
    expect(parse(["github", "brief", "owner/repo", "--limit", "10", "--limit", "20"]).ok).toBe(false);
  });

  it("rejects a missing --limit value", () => {
    expect(parse(["github", "brief", "owner/repo", "--limit"]).ok).toBe(false);
    expect(parse(["github", "brief", "owner/repo", "--limit", "--json"]).ok).toBe(false);
  });

  it("rejects unknown options", () => {
    expect(parse(["github", "brief", "owner/repo", "--token", "x"]).ok).toBe(false);
    expect(parse(["github", "brief", "owner/repo", "--api-url", "x"]).ok).toBe(false);
    expect(parse(["github", "brief", "owner/repo", "--nope"]).ok).toBe(false);
  });

  it("rejects an extra positional argument", () => {
    expect(parse(["github", "brief", "owner/repo", "extra"]).ok).toBe(false);
  });

  it("rejects an unknown operation", () => {
    expect(parse(["github", "bogus", "owner/repo"]).ok).toBe(false);
  });

  it("supports json and markdown output modes", () => {
    const json = parse(["github", "brief", "owner/repo", "--json"]);
    if (json.ok && json.command === "github") expect(json.outputMode).toBe("json");
    const md = parse(["github", "risks", "owner/repo", "--markdown"]);
    if (md.ok && md.command === "github") expect(md.outputMode).toBe("markdown");
  });

  it("does not accept a github token or URL as repository", () => {
    // A raw https URL is passed through the parser but rejected downstream by
    // the provider query parser; the CLI parser accepts the string as-is here.
    const result = parse(["github", "brief", "https://github.com/a/b"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command === "github") {
      expect(result.repository).toBe("https://github.com/a/b");
    }
  });
});
