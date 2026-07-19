import { describe, expect, it } from "vitest";
import {
  GITHUB_SEARCH_KINDS,
  GITHUB_SOURCE_MODES,
  GITHUB_SOURCE_STATES,
  createGitHubProviderRequest,
  resolveGitHubSourceSelection,
} from "../src/github/selection.js";
import type {
  GitHubSourceSelectionDefaults,
  GitHubSourceSelectionOverrides,
} from "../src/github/selection.js";

const DEFAULTS: GitHubSourceSelectionDefaults = { source: "overview", state: "open", limit: 50 };

function resolve(overrides: GitHubSourceSelectionOverrides, defaults = DEFAULTS) {
  return resolveGitHubSourceSelection({ defaults, overrides });
}

describe("source-selection enums", () => {
  it("exposes exact canonical values", () => {
    expect(GITHUB_SOURCE_MODES).toEqual([
      "overview",
      "repository",
      "issues",
      "pull-requests",
      "item",
      "search",
    ]);
    expect(GITHUB_SOURCE_STATES).toEqual(["open", "closed", "all"]);
    expect(GITHUB_SEARCH_KINDS).toEqual(["all", "issues", "pull-requests"]);
  });
});

describe("resolveGitHubSourceSelection — defaults and overview", () => {
  it("defaults to overview/open/limit", () => {
    const r = resolve({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.selection).toStrictEqual({ mode: "overview", state: "open", limit: 50 });
  });

  it("accepts explicit overview with state and limit", () => {
    const r = resolve({ source: "overview", state: "all", limit: 10 });
    if (r.ok) expect(r.selection).toStrictEqual({ mode: "overview", state: "all", limit: 10 });
    else throw new Error("expected ok");
  });

  it("rejects number/query/kind for overview", () => {
    expect(resolve({ source: "overview", number: 1 }).ok).toBe(false);
    expect(resolve({ source: "overview", query: "x" }).ok).toBe(false);
    expect(resolve({ source: "overview", kind: "issues" }).ok).toBe(false);
  });
});

describe("resolveGitHubSourceSelection — repository", () => {
  it("accepts a bare repository source", () => {
    const r = resolve({ source: "repository" });
    if (r.ok) expect(r.selection).toStrictEqual({ mode: "repository" });
    else throw new Error("expected ok");
  });

  it("does not let inherited defaults invalidate repository", () => {
    // state/limit are NOT in overrides, only inherited — must stay valid.
    const r = resolve({ source: "repository" }, { source: "repository", state: "closed", limit: 25 });
    expect(r.ok).toBe(true);
  });

  it("rejects explicit state/limit/number/query/kind for repository", () => {
    expect(resolve({ source: "repository", state: "open" }).ok).toBe(false);
    expect(resolve({ source: "repository", limit: 10 }).ok).toBe(false);
    expect(resolve({ source: "repository", number: 1 }).ok).toBe(false);
    expect(resolve({ source: "repository", query: "x" }).ok).toBe(false);
    expect(resolve({ source: "repository", kind: "all" }).ok).toBe(false);
  });
});

describe("resolveGitHubSourceSelection — issues and pull-requests", () => {
  for (const mode of ["issues", "pull-requests"] as const) {
    for (const state of GITHUB_SOURCE_STATES) {
      it(`accepts ${mode} with state ${state}`, () => {
        const r = resolve({ source: mode, state, limit: 30 });
        if (r.ok) expect(r.selection).toStrictEqual({ mode, state, limit: 30 });
        else throw new Error("expected ok");
      });
    }
    it(`rejects number/query/kind for ${mode}`, () => {
      expect(resolve({ source: mode, number: 1 }).ok).toBe(false);
      expect(resolve({ source: mode, query: "x" }).ok).toBe(false);
      expect(resolve({ source: mode, kind: "all" }).ok).toBe(false);
    });
  }
});

describe("resolveGitHubSourceSelection — item", () => {
  it("accepts item with a valid number", () => {
    const r = resolve({ source: "item", number: 123 });
    if (r.ok)
      expect(r.selection).toStrictEqual({
        mode: "item",
        number: 123,
        includeComments: false,
        commentLimit: 20,
      });
    else throw new Error("expected ok");
  });

  it("does not let inherited defaults invalidate item", () => {
    const r = resolve({ source: "item", number: 7 }, { source: "overview", state: "closed", limit: 25 });
    expect(r.ok).toBe(true);
  });

  it("requires a number", () => {
    const r = resolve({ source: "item" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_number_required");
  });

  it("rejects state/limit/query/kind for item", () => {
    expect(resolve({ source: "item", number: 1, state: "open" }).ok).toBe(false);
    expect(resolve({ source: "item", number: 1, limit: 10 }).ok).toBe(false);
    expect(resolve({ source: "item", number: 1, query: "x" }).ok).toBe(false);
    expect(resolve({ source: "item", number: 1, kind: "all" }).ok).toBe(false);
  });

  it("rejects zero, negative, and unsafe integers", () => {
    for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const r = resolve({ source: "item", number: bad });
      expect(r.ok, String(bad)).toBe(false);
      if (!r.ok) expect(r.code).toBe("github_number_invalid");
    }
  });
});

describe("resolveGitHubSourceSelection — search", () => {
  it("accepts search with query and defaults kind to all", () => {
    const r = resolve({ source: "search", query: "release blocker" });
    if (r.ok) {
      expect(r.selection).toStrictEqual({
        mode: "search",
        query: "release blocker",
        state: "open",
        kind: "all",
        limit: 50,
      });
    } else throw new Error("expected ok");
  });

  it("accepts explicit kind and state", () => {
    const r = resolve({ source: "search", query: "x", kind: "pull-requests", state: "all", limit: 5 });
    if (r.ok) expect(r.selection).toMatchObject({ kind: "pull-requests", state: "all", limit: 5 });
    else throw new Error("expected ok");
  });

  it("requires a query", () => {
    const r = resolve({ source: "search" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_query_required");
  });

  it("rejects a number for search", () => {
    const r = resolve({ source: "search", query: "x", number: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_option_not_applicable");
  });

  it("rejects an empty query", () => {
    const r = resolve({ source: "search", query: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_query_required");
  });

  it("rejects an over-long query", () => {
    const r = resolve({ source: "search", query: "a".repeat(257) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_query_invalid");
  });

  it("rejects a control character in the query", () => {
    const r = resolve({ source: "search", query: `a${String.fromCharCode(0)}b` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_query_invalid");
  });
});

describe("resolveGitHubSourceSelection — invalid enums", () => {
  it("rejects an invalid source", () => {
    const r = resolve({ source: "pr" as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_source_invalid");
  });

  it("rejects an invalid state", () => {
    const r = resolve({ source: "issues", state: "merged" as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_state_invalid");
  });

  it("rejects an invalid kind", () => {
    const r = resolve({ source: "search", query: "x", kind: "prs" as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_kind_invalid");
  });
});

describe("resolveGitHubSourceSelection — config defaults inheritance", () => {
  it("uses configured default source/state when not overridden", () => {
    const r = resolve({}, { source: "issues", state: "closed", limit: 25 });
    if (r.ok) expect(r.selection).toStrictEqual({ mode: "issues", state: "closed", limit: 25 });
    else throw new Error("expected ok");
  });

  it("explicit source overrides configured default", () => {
    const r = resolve({ source: "pull-requests" }, { source: "issues", state: "open", limit: 50 });
    if (r.ok) expect(r.selection.mode).toBe("pull-requests");
    else throw new Error("expected ok");
  });
});

describe("resolveGitHubSourceSelection — purity", () => {
  it("does not mutate inputs and is deterministic", () => {
    const overrides = { source: "search", query: "x", kind: "issues" } as const;
    const snapshot = JSON.stringify(overrides);
    const a = resolve(overrides);
    const b = resolve(overrides);
    expect(JSON.stringify(overrides)).toBe(snapshot);
    expect(a).toStrictEqual(b);
  });
});

describe("createGitHubProviderRequest", () => {
  const repo = "owner/repo";
  it("maps overview to a list request with the encoded source/state", () => {
    const req = createGitHubProviderRequest({ repository: repo, selection: { mode: "overview", state: "all", limit: 10 } });
    expect(req).toStrictEqual({
      providerId: "github",
      action: "list",
      query: "owner/repo::source=overview&state=all",
      limit: 10,
    });
  });

  it("maps repository to a limit-1 list request", () => {
    const req = createGitHubProviderRequest({ repository: repo, selection: { mode: "repository" } });
    expect(req).toStrictEqual({
      providerId: "github",
      action: "list",
      query: "owner/repo::source=repository&state=open",
      limit: 1,
    });
  });

  it("maps issues and pull-requests to list requests", () => {
    const issues = createGitHubProviderRequest({ repository: repo, selection: { mode: "issues", state: "closed", limit: 20 } });
    expect(issues.query).toBe("owner/repo::source=issues&state=closed");
    const prs = createGitHubProviderRequest({ repository: repo, selection: { mode: "pull-requests", state: "open", limit: 20 } });
    expect(prs.query).toBe("owner/repo::source=pull-requests&state=open");
  });

  it("maps item to a fetch request with limit 1 when comments are disabled", () => {
    const req = createGitHubProviderRequest({
      repository: repo,
      selection: { mode: "item", number: 42, includeComments: false, commentLimit: 20 },
    });
    expect(req).toStrictEqual({
      providerId: "github",
      action: "fetch",
      query: "owner/repo#42",
      limit: 1,
    });
  });

  it("maps item with comments to a fetch request with the comment query and limit 1+N", () => {
    const req = createGitHubProviderRequest({
      repository: repo,
      selection: { mode: "item", number: 42, includeComments: true, commentLimit: 20 },
    });
    expect(req).toStrictEqual({
      providerId: "github",
      action: "fetch",
      query: "owner/repo#42::comments=20",
      limit: 21,
    });
  });

  it("maps search to a search request with encoded terms", () => {
    const req = createGitHubProviderRequest({
      repository: repo,
      selection: { mode: "search", query: "release blocker", state: "open", kind: "issues", limit: 5 },
    });
    expect(req.action).toBe("search");
    expect(req.query).toBe("owner/repo::state=open&kind=issues&q=release+blocker");
    expect(req.limit).toBe(5);
  });

  it("never includes token/header/origin/config fields", () => {
    const req = createGitHubProviderRequest({ repository: repo, selection: { mode: "overview", state: "open", limit: 1 } });
    const serialized = JSON.stringify(req);
    for (const forbidden of ["token", "Authorization", "api.github.com", "headers", "http"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("resolveGitHubSourceSelection — item comments", () => {
  it("item defaults to comments disabled with the default limit", () => {
    const r = resolve({ source: "item", number: 5 });
    expect(r.ok).toBe(true);
    if (r.ok && r.selection.mode === "item") {
      expect(r.selection.includeComments).toBe(false);
      expect(r.selection.commentLimit).toBe(20);
    }
  });

  it("--include-comments enables comments and defaults the limit to 20", () => {
    const r = resolve({ source: "item", number: 5, includeComments: true });
    expect(r.ok).toBe(true);
    if (r.ok && r.selection.mode === "item") {
      expect(r.selection.includeComments).toBe(true);
      expect(r.selection.commentLimit).toBe(20);
    }
  });

  it("accepts an explicit comment limit alongside --include-comments (1 and 50)", () => {
    for (const limit of [1, 50]) {
      const r = resolve({ source: "item", number: 5, includeComments: true, commentLimit: limit });
      expect(r.ok, `limit ${limit}`).toBe(true);
      if (r.ok && r.selection.mode === "item") expect(r.selection.commentLimit).toBe(limit);
    }
  });

  it("rejects a comment limit without --include-comments", () => {
    const r = resolve({ source: "item", number: 5, commentLimit: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("github_comment_limit_invalid");
  });

  it("rejects an out-of-range comment limit", () => {
    for (const limit of [0, 51, -1, 1.5]) {
      const r = resolve({ source: "item", number: 5, includeComments: true, commentLimit: limit });
      expect(r.ok, `limit ${limit}`).toBe(false);
      if (!r.ok) expect(r.code).toBe("github_comment_limit_invalid");
    }
  });

  it("rejects --include-comments for every non-item source", () => {
    for (const source of ["overview", "repository", "issues", "pull-requests", "search"] as const) {
      const overrides =
        source === "search"
          ? { source, query: "x", includeComments: true }
          : { source, includeComments: true };
      const r = resolve(overrides);
      expect(r.ok, source).toBe(false);
      if (!r.ok) expect(r.code).toBe("github_comments_not_applicable");
    }
  });

  it("rejects --comment-limit for every non-item source", () => {
    for (const source of ["overview", "repository", "issues", "pull-requests", "search"] as const) {
      const overrides =
        source === "search" ? { source, query: "x", commentLimit: 10 } : { source, commentLimit: 10 };
      const r = resolve(overrides);
      expect(r.ok, source).toBe(false);
      if (!r.ok) expect(r.code).toBe("github_comment_limit_not_applicable");
    }
  });

  it("does not treat an inherited default as an explicit comment option", () => {
    // Defaults never carry comment options; overview stays valid with no comments.
    const r = resolve({ source: "overview" });
    expect(r.ok).toBe(true);
  });
});
