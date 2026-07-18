import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import type { ResolvedProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { runLocalCliProcess } from "../src/index.js";

const SLUG = "owner/repo";
const NOW = "2026-03-01T00:00:00.000Z";

function configWith(github: Partial<ResolvedProviderConfig["providers"]["github"]>): ResolvedProviderConfig {
  const base = defaultProviderConfig();
  return { ...base, providers: { local: { enabled: true }, github: { ...base.providers.github, ...github } } };
}

const repoBody = { full_name: SLUG, html_url: `https://github.com/${SLUG}`, owner: { login: "owner" }, open_issues_count: 2 };
function ghItem(n: number, isPr = false): Record<string, unknown> {
  const b: Record<string, unknown> = {
    number: n,
    title: `Item ${n}`,
    body: `body ${n}`,
    state: "open",
    html_url: `https://github.com/${SLUG}/issues/${n}`,
    user: { login: "u" },
    assignees: [],
    labels: [],
  };
  if (isPr) b["pull_request"] = { url: "x" };
  return b;
}

function transport(): { transport: GitHubHttpTransport; calls: GitHubHttpRequest[] } {
  const calls: GitHubHttpRequest[] = [];
  const t: GitHubHttpTransport = {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      calls.push(request);
      const url = new URL(request.url);
      if (url.pathname === `/repos/${SLUG}`) return { status: 200, headers: {}, body: repoBody };
      if (url.pathname === `/repos/${SLUG}/issues`) return { status: 200, headers: {}, body: [ghItem(1), ghItem(2, true)] };
      if (url.pathname === `/repos/${SLUG}/issues/7`) return { status: 200, headers: {}, body: ghItem(7) };
      if (url.pathname === "/search/issues") {
        return { status: 200, headers: {}, body: { incomplete_results: false, items: [ghItem(3), ghItem(4, true)] } };
      }
      return { status: 404, headers: {}, body: {} };
    },
  };
  return { transport: t, calls };
}

function paths(calls: GitHubHttpRequest[]): string[] {
  return calls.map((c) => new URL(c.url).pathname);
}

async function runGh(args: string[], opts: Parameters<typeof runLocalCliProcess>[1] = {}) {
  const { transport: t, calls } = transport();
  const result = await runLocalCliProcess(["github", ...args, "--json"], {
    githubTransport: t,
    now: NOW,
    providerConfig: defaultProviderConfig(),
    ...opts,
  });
  return { result, calls };
}

describe("github source process — default and overview", () => {
  it("defaults to overview (repo + issues)", async () => {
    const { result, calls } = await runGh(["brief", SLUG]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(paths(calls)).toEqual([`/repos/${SLUG}`, `/repos/${SLUG}/issues`]);
  });

  it("uses the configured default source", async () => {
    const { result, calls } = await runGh(["risks", SLUG], { providerConfig: configWith({ defaultSource: "issues" }) });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(paths(calls)).toEqual(["/search/issues"]);
  });

  it("explicit source overrides config", async () => {
    const { result, calls } = await runGh(["risks", SLUG, "--source", "repository"], {
      providerConfig: configWith({ defaultSource: "issues" }),
    });
    expect(result.exitCode).toBe(0);
    expect(paths(calls)).toEqual([`/repos/${SLUG}`]);
  });

  it("explicit state is encoded on the issues request", async () => {
    const { calls } = await runGh(["risks", SLUG, "--source", "issues", "--state", "closed"]);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q).toContain("is:closed");
  });
});

describe("github source process — repository/issues/pull-requests", () => {
  it("repository source makes one request", async () => {
    const { calls } = await runGh(["brief", SLUG, "--source", "repository"]);
    expect(paths(calls)).toEqual([`/repos/${SLUG}`]);
  });

  it("issues source scopes to is:issue", async () => {
    const { calls } = await runGh(["risks", SLUG, "--source", "issues"]);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q).toContain("is:issue");
  });

  it("pull-requests source scopes to is:pr", async () => {
    const { calls } = await runGh(["handoff", SLUG, "--source", "pull-requests", "--state", "closed"]);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q).toContain("is:pr");
    expect(q).toContain("is:closed");
  });
});

describe("github source process — item and search", () => {
  it("item source fetches one issue", async () => {
    const { result, calls } = await runGh(["brief", SLUG, "--source", "item", "--number", "7"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(paths(calls)).toEqual([`/repos/${SLUG}/issues/7`]);
  });

  it("search source injects scope and passes terms", async () => {
    const { result, calls } = await runGh(["risks", SLUG, "--source", "search", "--query", "release blocker", "--kind", "issues"]);
    expect(result.exitCode, result.stderr).toBe(0);
    const q = new URL(calls[0]!.url).searchParams.get("q") ?? "";
    expect(q.startsWith(`repo:${SLUG} is:open is:issue`)).toBe(true);
    expect(q).toContain("release blocker");
  });
});

describe("github source process — invalid combinations fail before transport", () => {
  it("item without number fails before any request", async () => {
    const { result, calls } = await runGh(["brief", SLUG, "--source", "item"]);
    expect(result.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
    expect(result.stderr).toContain("--number");
  });

  it("search without query fails before any request", async () => {
    const { result, calls } = await runGh(["risks", SLUG, "--source", "search"]);
    expect(result.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
    expect(result.stderr).toContain("--query");
  });

  it("state with repository fails before any request", async () => {
    const { result, calls } = await runGh(["brief", SLUG, "--source", "repository", "--state", "open"]);
    expect(result.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it("disabled provider fails before any request", async () => {
    const { result, calls } = await runGh(["brief", SLUG], {
      providerConfig: configWith({ enabled: false }),
    });
    expect(result.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
  });
});

describe("github source process — safety", () => {
  it("does not read the token before a valid selection", async () => {
    // An invalid selection must fail before the token boundary; a poisoned
    // transport would throw if construction/execution were reached.
    const poisoned: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        throw new Error("must not reach transport");
      },
    };
    const result = await runLocalCliProcess(["github", "brief", SLUG, "--source", "item", "--json"], {
      githubTransport: poisoned,
      githubToken: "ghp_should_not_be_used",
      providerConfig: defaultProviderConfig(),
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).not.toContain("ghp_should_not_be_used");
    expect(result.stderr).not.toContain("ghp_should_not_be_used");
  });

  it("never leaks the token or raw provider bodies in output", async () => {
    const { result } = await runGh(["risks", SLUG, "--source", "issues"], { githubToken: "ghp_secret" });
    expect(result.stdout).not.toContain("ghp_secret");
    expect(result.stdout).not.toContain("Authorization");
  });

  it("produces byte-identical output across repeated runs", async () => {
    const a = await runGh(["risks", SLUG, "--source", "issues", "--state", "open"]);
    const b = await runGh(["risks", SLUG, "--source", "issues", "--state", "open"]);
    expect(a.result.stdout).toBe(b.result.stdout);
  });
});
