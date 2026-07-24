import { GITHUB_DEFAULT_LIMIT } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { GITHUB_CLI_DEFAULT_LIMIT, parseCliArgs } from "../src/index.js";

function parseGitHub(args: string[]) {
  const r = parseCliArgs(["github", ...args]);
  if (r.ok && r.command === "github") return r;
  throw new Error(`expected github parse, got ${JSON.stringify(r)}`);
}

describe("github source options — parsing", () => {
  it("parses each source mode", () => {
    for (const source of ["overview", "repository", "issues", "pull-requests", "item", "search"] as const) {
      const r = parseCliArgs(["github", "brief", "owner/repo", "--source", source]);
      expect(r.ok, source).toBe(true);
      if (r.ok && r.command === "github") expect(r.source).toBe(source);
    }
  });

  it("parses each state", () => {
    for (const state of ["open", "closed", "all"] as const) {
      const r = parseGitHub(["risks", "owner/repo", "--source", "issues", "--state", state]);
      expect(r.state).toBe(state);
    }
  });

  it("parses each search kind", () => {
    for (const kind of ["all", "issues", "pull-requests"] as const) {
      const r = parseGitHub(["risks", "owner/repo", "--source", "search", "--query", "x", "--kind", kind]);
      expect(r.kind).toBe(kind);
    }
  });

  it("parses a positive number", () => {
    const r = parseGitHub(["brief", "owner/repo", "--source", "item", "--number", "123"]);
    expect(r.number).toBe(123);
  });

  it("parses a query as one argument", () => {
    const r = parseGitHub(["risks", "owner/repo", "--source", "search", "--query", "release blocker"]);
    expect(r.query).toBe("release blocker");
  });

  it("rejects an invalid source/state/kind", () => {
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "pr"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--state", "merged"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--kind", "prs"]).ok).toBe(false);
  });

  it("rejects a non-positive or non-integer number", () => {
    for (const bad of ["0", "-1", "1.5", "abc", "01"]) {
      expect(parseCliArgs(["github", "brief", "owner/repo", "--number", bad]).ok, bad).toBe(false);
    }
  });

  it("rejects an empty, whitespace-padded, or over-long query", () => {
    expect(parseCliArgs(["github", "brief", "owner/repo", "--query", ""]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--query", " x "]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--query", "a".repeat(257)]).ok).toBe(false);
  });

  it("rejects duplicate source/state/number/query/kind", () => {
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "issues", "--source", "overview"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--state", "open", "--state", "closed"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--number", "1", "--number", "2"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--query", "a", "--query", "b"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--kind", "all", "--kind", "issues"]).ok).toBe(false);
  });

  it("rejects a missing option value", () => {
    for (const opt of ["--source", "--state", "--number", "--query", "--kind"]) {
      expect(parseCliArgs(["github", "brief", "owner/repo", opt]).ok, opt).toBe(false);
      expect(parseCliArgs(["github", "brief", "owner/repo", opt, "--json"]).ok, `${opt} --json`).toBe(false);
    }
  });

  it("keeps the repository optional", () => {
    const r = parseGitHub(["risks", "--source", "issues"]);
    expect(r.repository).toBeUndefined();
    expect(r.source).toBe("issues");
  });

  it("preserves the provider-config path alongside source options", () => {
    const r = parseGitHub(["brief", "owner/repo", "--source", "repository", "--provider-config", "./p.json"]);
    expect(r.providerConfigPath).toBe("./p.json");
    expect(r.source).toBe("repository");
  });

  it("rejects an unknown option and rejects token/api-url", () => {
    expect(parseCliArgs(["github", "brief", "owner/repo", "--nope"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--token", "x"]).ok).toBe(false);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--api-url", "x"]).ok).toBe(false);
  });

  it("supports output modes with source options", () => {
    const j = parseGitHub(["brief", "owner/repo", "--source", "issues", "--json"]);
    expect(j.outputMode).toBe("json");
    const m = parseGitHub(["risks", "owner/repo", "--source", "search", "--query", "x", "--markdown"]);
    expect(m.outputMode).toBe("markdown");
  });
});

describe("github --limit boundary matrix + canonical alias (F-DUP-1)", () => {
  const limitOf = (args: string[]) => {
    const r = parseGitHub(args);
    return r;
  };

  it("accepts --limit 1 and 100", () => {
    for (const limit of [1, 100]) {
      const r = limitOf(["brief", "owner/repo", "--source", "issues", "--limit", String(limit)]);
      expect(r.ok, String(limit)).toBe(true);
      if (r.ok && r.command === "github") expect(r.limit).toBe(limit);
    }
  });

  it("rejects --limit 0 and 101 with the invalid-option code", () => {
    for (const limit of [0, 101]) {
      const r = parseCliArgs(["github", "brief", "owner/repo", "--source", "issues", "--limit", String(limit)]);
      expect(r.ok, String(limit)).toBe(false);
      if (!r.ok) expect(r.code).toBe("OMP-C-3002");
    }
  });

  it("keeps ordinary comment bounds (1..50) unchanged", () => {
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "item", "--number", "1", "--include-comments", "--comment-limit", "50"]).ok).toBe(true);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "item", "--number", "1", "--include-comments", "--comment-limit", "51"]).ok).toBe(false);
  });

  it("keeps review bounds (1..20) unchanged", () => {
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "item", "--number", "1", "--include-reviews", "--review-limit", "20"]).ok).toBe(true);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "item", "--number", "1", "--include-reviews", "--review-limit", "21"]).ok).toBe(false);
  });

  it("keeps review-comment bounds (1..20) unchanged", () => {
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "item", "--number", "1", "--include-review-comments", "--review-comment-limit", "20"]).ok).toBe(true);
    expect(parseCliArgs(["github", "brief", "owner/repo", "--source", "item", "--number", "1", "--include-review-comments", "--review-comment-limit", "21"]).ok).toBe(false);
  });

  it("the CLI default-limit alias resolves to the canonical provider default", () => {
    expect(GITHUB_CLI_DEFAULT_LIMIT).toBe(GITHUB_DEFAULT_LIMIT);
    expect(GITHUB_CLI_DEFAULT_LIMIT).toBe(50);
  });
});
