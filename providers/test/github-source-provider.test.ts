// Provider behavior for each source mode, driven through the canonical query
// builders and a scripted fake transport. No live network.

import type { ProviderRequest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  buildGitHubFetchQuery,
  buildGitHubListQuery,
  buildGitHubSearchQuery,
  createGitHubProvider,
} from "../src/index.js";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "../src/index.js";

const context = { requestId: "req-test" };
const SLUG = "owner/repo";

type Route = { match: (url: URL) => boolean; status?: number; body: unknown };

function scripted(routes: Route[]): { transport: GitHubHttpTransport; calls: GitHubHttpRequest[] } {
  const calls: GitHubHttpRequest[] = [];
  const transport: GitHubHttpTransport = {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      calls.push(request);
      const url = new URL(request.url);
      for (const route of routes) {
        if (route.match(url)) return { status: route.status ?? 200, headers: {}, body: route.body };
      }
      return { status: 404, headers: {}, body: {} };
    },
  };
  return { transport, calls };
}

const repoBody = {
  full_name: SLUG,
  html_url: `https://github.com/${SLUG}`,
  owner: { login: "owner" },
  open_issues_count: 3,
};

function issue(n: number, isPr = false): Record<string, unknown> {
  const base: Record<string, unknown> = {
    number: n,
    title: `Item ${n}`,
    body: `body ${n}`,
    state: "open",
    html_url: `https://github.com/${SLUG}/issues/${n}`,
    user: { login: "u" },
    assignees: [],
    labels: [],
  };
  if (isPr) base["pull_request"] = { url: "x" };
  return base;
}

const repoRoute: Route = { match: (u) => u.pathname === `/repos/${SLUG}`, body: repoBody };
const issuesListRoute: Route = {
  match: (u) => u.pathname === `/repos/${SLUG}/issues`,
  body: [issue(1), issue(2, true)],
};
function searchRoute(items: Record<string, unknown>[]): Route {
  return { match: (u) => u.pathname === "/search/issues", body: { total_count: items.length, incomplete_results: false, items } };
}

function run(routes: Route[], request: Partial<ProviderRequest>) {
  const { transport, calls } = scripted(routes);
  const provider = createGitHubProvider({ transport, productVersion: "9.9.9-test" });
  return { provider, calls, request: { providerId: "github", action: "list", query: SLUG, ...request } as ProviderRequest };
}

describe("provider overview source", () => {
  it("fetches repository then issues with the selected state", async () => {
    const { provider, calls, request } = run([repoRoute, issuesListRoute], {
      action: "list",
      query: buildGitHubListQuery({ repository: SLUG, source: "overview", state: "closed" }),
      limit: 10,
    });
    const result = await provider.execute(request, context);
    expect(result.ok).toBe(true);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([`/repos/${SLUG}`, `/repos/${SLUG}/issues`]);
    expect(new URL(calls[1]!.url).searchParams.get("state")).toBe("closed");
    if (result.ok) expect(result.response.items[0]?.type).toBe("record");
  });

  it("limit 1 makes only the repository request", async () => {
    const { provider, calls, request } = run([repoRoute, issuesListRoute], {
      action: "list",
      query: buildGitHubListQuery({ repository: SLUG, source: "overview", state: "open" }),
      limit: 1,
    });
    await provider.execute(request, context);
    expect(calls).toHaveLength(1);
  });

  it("legacy bare-repository query preserves overview/open behavior", async () => {
    const { provider, calls, request } = run([repoRoute, issuesListRoute], { action: "list", query: SLUG, limit: 10 });
    await provider.execute(request, context);
    expect(new URL(calls[1]!.url).searchParams.get("state")).toBe("open");
  });
});

describe("provider repository source", () => {
  it("makes exactly one request and returns one record item", async () => {
    const { provider, calls, request } = run([repoRoute, issuesListRoute], {
      action: "list",
      query: buildGitHubListQuery({ repository: SLUG, source: "repository", state: "open" }),
      limit: 50,
    });
    const result = await provider.execute(request, context);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe(`/repos/${SLUG}`);
    if (result.ok) {
      expect(result.response.items).toHaveLength(1);
      expect(result.response.items[0]?.type).toBe("record");
    }
  });
});

describe("provider issues source", () => {
  it("uses one search request scoped to is:issue with the state qualifier", async () => {
    const { provider, calls, request } = run([searchRoute([issue(3), issue(4)])], {
      action: "list",
      query: buildGitHubListQuery({ repository: SLUG, source: "issues", state: "closed" }),
      limit: 10,
    });
    const result = await provider.execute(request, context);
    expect(calls).toHaveLength(1);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q).toContain(`repo:${SLUG}`);
    expect(q).toContain("is:closed");
    expect(q).toContain("is:issue");
    if (result.ok) expect(result.response.items.every((i) => i.type === "issue")).toBe(true);
  });

  it("all state omits the open/closed qualifier", async () => {
    const { provider, calls, request } = run([searchRoute([issue(3)])], {
      action: "list",
      query: buildGitHubListQuery({ repository: SLUG, source: "issues", state: "all" }),
      limit: 10,
    });
    await provider.execute(request, context);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q).not.toContain("is:open");
    expect(q).not.toContain("is:closed");
  });
});

describe("provider pull-requests source", () => {
  it("uses one search request scoped to is:pr and returns only PRs", async () => {
    const { provider, calls, request } = run([searchRoute([issue(4, true), issue(5, true)])], {
      action: "list",
      query: buildGitHubListQuery({ repository: SLUG, source: "pull-requests", state: "open" }),
      limit: 10,
    });
    const result = await provider.execute(request, context);
    expect(calls).toHaveLength(1);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q).toContain("is:pr");
    if (result.ok) expect(result.response.items.every((i) => i.type === "pullRequest")).toBe(true);
  });
});

describe("provider item source", () => {
  it("issue item makes one request", async () => {
    const { provider, calls, request } = run(
      [{ match: (u) => u.pathname === `/repos/${SLUG}/issues/7`, body: issue(7) }],
      { action: "fetch", query: buildGitHubFetchQuery({ repository: SLUG, number: 7 }), limit: 1 },
    );
    const result = await provider.execute(request, context);
    expect(calls).toHaveLength(1);
    if (result.ok) {
      expect(result.response.items).toHaveLength(1);
      expect(result.response.items[0]?.type).toBe("issue");
    }
  });

  it("pull-request item makes two sequential requests", async () => {
    const { provider, calls, request } = run(
      [
        { match: (u) => u.pathname === `/repos/${SLUG}/issues/8`, body: issue(8, true) },
        { match: (u) => u.pathname === `/repos/${SLUG}/pulls/8`, body: { ...issue(8, true), merged: false, draft: false } },
      ],
      { action: "fetch", query: buildGitHubFetchQuery({ repository: SLUG, number: 8 }), limit: 1 },
    );
    const result = await provider.execute(request, context);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([`/repos/${SLUG}/issues/8`, `/repos/${SLUG}/pulls/8`]);
    if (result.ok) expect(result.response.items[0]?.type).toBe("pullRequest");
  });
});

describe("provider search source", () => {
  it("injects repository/state/kind before user terms", async () => {
    const { provider, calls, request } = run([searchRoute([issue(9)])], {
      action: "search",
      query: buildGitHubSearchQuery({ repository: SLUG, terms: "release blocker", state: "open", kind: "issues" }),
      limit: 5,
    });
    await provider.execute(request, context);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q.startsWith(`repo:${SLUG} is:open is:issue`)).toBe(true);
    expect(q).toContain("release blocker");
  });

  it("emits an incomplete-results warning", async () => {
    const { transport, calls } = scripted([
      { match: (u) => u.pathname === "/search/issues", body: { incomplete_results: true, items: [issue(9)] } },
    ]);
    void calls;
    const provider = createGitHubProvider({ transport, productVersion: "9.9.9-test" });
    const result = await provider.execute(
      {
        providerId: "github",
        action: "search",
        query: buildGitHubSearchQuery({ repository: SLUG, terms: "x", state: "open", kind: "all" }),
        limit: 5,
      },
      context,
    );
    if (result.ok) {
      expect((result.response.warnings ?? []).some((w) => w.code === "github_incomplete_results")).toBe(true);
    } else {
      throw new Error("expected ok");
    }
  });
});

describe("provider shared safety", () => {
  it("maps error statuses without leaking raw bodies", async () => {
    for (const [status, code] of [
      [401, "OMP-P-4004"],
      [403, "OMP-P-4005"],
      [404, "OMP-P-4006"],
      [429, "OMP-P-4007"],
      [500, "OMP-P-4008"],
    ] as const) {
      const { transport } = scripted([{ match: () => true, status, body: { message: "raw detail" } }]);
      const provider = createGitHubProvider({ transport, productVersion: "9.9.9-test" });
      const result = await provider.execute(
        { providerId: "github", action: "list", query: buildGitHubListQuery({ repository: SLUG, source: "issues", state: "open" }), limit: 5 },
        context,
      );
      expect(result.ok, String(status)).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(code);
        expect(result.message).not.toContain("raw detail");
      }
    }
  });
});
