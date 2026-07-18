import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProviderRequest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createGitHubProvider } from "../src/index.js";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "../src/index.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "github");
const load = (name: string): unknown => JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
const context = { requestId: "req-test" };
const SLUG = "riverline/field-guide";

type Route = { match: (url: URL) => boolean; status?: number; headers?: Record<string, string>; body: unknown };

/** A scripted transport that answers by URL path and records requests. */
function scriptedTransport(routes: Route[]): { transport: GitHubHttpTransport; calls: GitHubHttpRequest[] } {
  const calls: GitHubHttpRequest[] = [];
  const transport: GitHubHttpTransport = {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      calls.push(request);
      const url = new URL(request.url);
      for (const route of routes) {
        if (route.match(url)) {
          return { status: route.status ?? 200, headers: route.headers ?? {}, body: route.body };
        }
      }
      return { status: 404, headers: {}, body: {} };
    },
  };
  return { transport, calls };
}

function provider(routes: Route[]) {
  const { transport, calls } = scriptedTransport(routes);
  return { provider: createGitHubProvider({ transport, productVersion: "9.9.9-test" }), calls };
}

function req(overrides: Partial<ProviderRequest>): ProviderRequest {
  return { providerId: "github", action: "list", query: SLUG, ...overrides };
}

const repoRoute: Route = { match: (u) => u.pathname === `/repos/${SLUG}`, body: load("repository.json") };
const issuesRoute: Route = {
  match: (u) => u.pathname === `/repos/${SLUG}/issues`,
  body: load("issues.json"),
};

describe("descriptor", () => {
  it("is read-only with list/search/fetch", () => {
    const { provider: p } = provider([]);
    expect(p.descriptor.id).toBe("github");
    expect(p.descriptor.readOnly).toBe(true);
    expect(p.descriptor.capabilities.map((c) => c.action)).toEqual(["list", "search", "fetch"]);
    expect(p.descriptor.capabilities.every((c) => c.readOnly)).toBe(true);
  });
});

describe("request guards", () => {
  it("rejects a non-github provider id", async () => {
    const { provider: p } = provider([]);
    const result = await p.execute(req({ providerId: "local" }), context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OMP-P-4003");
  });

  it("rejects an invalid limit", async () => {
    const { provider: p } = provider([repoRoute, issuesRoute]);
    for (const limit of [0, -1, 101, 1.5]) {
      const result = await p.execute(req({ limit }), context);
      expect(result.ok, `limit ${limit}`).toBe(false);
      if (!result.ok) expect(result.code).toBe("OMP-P-4003");
    }
  });
});

describe("list", () => {
  it("reads the repo first then issues and bounds the item count", async () => {
    const { provider: p, calls } = provider([repoRoute, issuesRoute]);
    const result = await p.execute(req({ action: "list", limit: 3 }), context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.items[0]!.id).toBe(`github:repository:${SLUG}`);
    expect(result.response.items).toHaveLength(3);
    // First call repo metadata, second call issues with per_page = limit-1.
    expect(new URL(calls[0]!.url).pathname).toBe(`/repos/${SLUG}`);
    const issuesUrl = new URL(calls[1]!.url);
    expect(issuesUrl.pathname).toBe(`/repos/${SLUG}/issues`);
    expect(issuesUrl.searchParams.get("state")).toBe("open");
    expect(issuesUrl.searchParams.get("per_page")).toBe("2");
    expect(issuesUrl.searchParams.get("page")).toBe("1");
  });

  it("returns only the repository item when limit is 1", async () => {
    const { provider: p, calls } = provider([repoRoute, issuesRoute]);
    const result = await p.execute(req({ action: "list", limit: 1 }), context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.items).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("classifies pull requests from the issues listing", async () => {
    const { provider: p } = provider([repoRoute, issuesRoute]);
    const result = await p.execute(req({ action: "list", limit: 3 }), context);
    if (!result.ok) throw new Error("expected ok");
    const types = result.response.items.map((i) => i.type);
    expect(types).toEqual(["record", "issue", "pullRequest"]);
  });
});

describe("search", () => {
  it("scopes the query and injects repo + is:open", async () => {
    const { provider: p, calls } = provider([
      { match: (u) => u.pathname === "/search/issues", body: load("search.json") },
    ]);
    const result = await p.execute(
      req({ action: "search", query: `${SLUG}::trail`, limit: 10 }),
      context,
    );
    expect(result.ok).toBe(true);
    const q = new URL(calls[0]!.url).searchParams.get("q");
    expect(q).toBe(`repo:${SLUG} is:open trail`);
  });

  it("adds a warning for incomplete results", async () => {
    const incomplete = { ...(load("search.json") as object), incomplete_results: true };
    const { provider: p } = provider([{ match: (u) => u.pathname === "/search/issues", body: incomplete }]);
    const result = await p.execute(req({ action: "search", query: `${SLUG}::trail` }), context);
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.warnings?.some((w) => w.code === "github_incomplete_results")).toBe(true);
  });
});

describe("fetch", () => {
  it("fetches an issue", async () => {
    const { provider: p } = provider([
      { match: (u) => u.pathname === `/repos/${SLUG}/issues/42`, body: load("issue.json") },
    ]);
    const result = await p.execute(req({ action: "fetch", query: `${SLUG}#42` }), context);
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.items).toHaveLength(1);
    expect(result.response.items[0]!.type).toBe("issue");
  });

  it("enriches a pull request via the pulls endpoint", async () => {
    const prIssue = (load("issues.json") as unknown[])[1];
    const { provider: p, calls } = provider([
      { match: (u) => u.pathname === `/repos/${SLUG}/issues/47`, body: prIssue },
      { match: (u) => u.pathname === `/repos/${SLUG}/pulls/47`, body: load("pull-request.json") },
    ]);
    const result = await p.execute(req({ action: "fetch", query: `${SLUG}#47` }), context);
    if (!result.ok) throw new Error("expected ok");
    expect(result.response.items[0]!.type).toBe("pullRequest");
    const data = result.response.items[0]!.data as Record<string, unknown>;
    expect(data.baseBranch).toBe("main");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      `/repos/${SLUG}/issues/47`,
      `/repos/${SLUG}/pulls/47`,
    ]);
  });
});

describe("error mapping", () => {
  const cases: Array<{ status: number; headers?: Record<string, string>; code: string }> = [
    { status: 401, code: "OMP-P-4004" },
    { status: 403, code: "OMP-P-4005" },
    { status: 404, code: "OMP-P-4006" },
    { status: 410, code: "OMP-P-4006" },
    { status: 422, code: "OMP-P-4003" },
    { status: 429, code: "OMP-P-4007" },
    { status: 403, headers: { "x-ratelimit-remaining": "0" }, code: "OMP-P-4007" },
    { status: 403, headers: { "retry-after": "60" }, code: "OMP-P-4007" },
    { status: 500, code: "OMP-P-4008" },
  ];
  for (const c of cases) {
    it(`maps status ${c.status}${c.headers ? ` ${JSON.stringify(c.headers)}` : ""} to ${c.code}`, async () => {
      const { provider: p } = provider([
        { match: (u) => u.pathname === `/repos/${SLUG}`, status: c.status, headers: c.headers, body: { message: "x" } },
      ]);
      const result = await p.execute(req({ action: "list", limit: 1 }), context);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(c.code);
        expect(result.response.items).toEqual([]);
        expect(result.message).not.toContain("x");
      }
    });
  }

  it("maps malformed and oversized responses to OMP-P-4009", async () => {
    const { provider: p } = provider([
      { match: (u) => u.pathname === `/repos/${SLUG}`, body: "not-an-object" },
    ]);
    const result = await p.execute(req({ action: "list", limit: 1 }), context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OMP-P-4009");
  });

  it("maps a transport throw to OMP-P-4008", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        throw new Error("network down");
      },
    };
    const p = createGitHubProvider({ transport, productVersion: "9.9.9-test" });
    const result = await p.execute(req({ action: "list", limit: 1 }), context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OMP-P-4008");
  });
});
