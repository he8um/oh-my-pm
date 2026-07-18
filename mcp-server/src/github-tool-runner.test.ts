import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import {
  MCP_GITHUB_TEST_NOW,
  executeMcpGitHubTool,
  githubOperationForToolName,
  toolNameForGitHubOperation,
} from "./github-tool-runner.js";

// Every runner test injects a resolved provider config so it stays fully
// offline and never reads the developer's real ~/.config provider file.
const OFFLINE = { providerConfig: defaultProviderConfig() } as const;

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "providers",
  "test",
  "fixtures",
  "github",
);
const load = (name: string): unknown => JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
const SLUG = "riverline/field-guide";

function recordingTransport(): { transport: GitHubHttpTransport; calls: GitHubHttpRequest[] } {
  const calls: GitHubHttpRequest[] = [];
  const transport: GitHubHttpTransport = {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      calls.push(request);
      const url = new URL(request.url);
      if (url.pathname === `/repos/${SLUG}`) return { status: 200, headers: {}, body: load("repository.json") };
      if (url.pathname === `/repos/${SLUG}/issues`) return { status: 200, headers: {}, body: load("issues.json") };
      return { status: 404, headers: {}, body: {} };
    },
  };
  return { transport, calls };
}

describe("github tool/operation mapping", () => {
  it("maps operations to tool names and back", () => {
    for (const op of ["brief", "risks", "next", "handoff"] as const) {
      const name = toolNameForGitHubOperation(op);
      expect(githubOperationForToolName(name)).toBe(op);
    }
  });
});

describe("executeMcpGitHubTool", () => {
  it("rejects an invalid repository before any network call", async () => {
    const { transport, calls } = recordingTransport();
    const result = await executeMcpGitHubTool("brief", { repository: "not a repo", limit: 50 }, { transport, ...OFFLINE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_invalid_repository");
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid limit before any network call", async () => {
    const { transport, calls } = recordingTransport();
    const result = await executeMcpGitHubTool("brief", { repository: SLUG, limit: 0 }, { transport, ...OFFLINE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_invalid_limit");
    expect(calls).toHaveLength(0);
  });

  it("runs all four operations and projects a sanitized source list", async () => {
    for (const op of ["brief", "risks", "next", "handoff"] as const) {
      const { transport } = recordingTransport();
      const result = await executeMcpGitHubTool(op, { repository: SLUG, limit: 10 }, { transport, ...OFFLINE });
      expect(result.ok, op).toBe(true);
      if (!result.ok) continue;
      expect(result.repository).toBe(SLUG);
      expect(result.sourceSummary.repositories).toBe(1);
      // The repository metadata item is not repeated in sources.
      for (const source of result.sources) {
        expect(source.type === "issue" || source.type === "pullRequest").toBe(true);
      }
      const serialized = JSON.stringify(result);
      // No raw provider internals leak into the public projection.
      expect(serialized).not.toContain("providerResponses");
      expect(serialized).not.toContain("runtimeResponse");
      expect(serialized).not.toContain("plannerInput");
      expect(serialized).not.toContain("node_id");
    }
  });

  it("bounds the source list by the requested limit", async () => {
    const { transport } = recordingTransport();
    const result = await executeMcpGitHubTool("brief", { repository: SLUG, limit: 2 }, { transport, ...OFFLINE });
    if (!result.ok) throw new Error("expected ok");
    // limit 2 -> repo + 1 source item.
    expect(result.sources.length).toBeLessThanOrEqual(1);
  });

  it("never includes a token in the projection", async () => {
    const { transport } = recordingTransport();
    const result = await executeMcpGitHubTool("brief", { repository: SLUG, limit: 10 }, {
      transport,
      token: "secret-mcp-token",
      ...OFFLINE,
    });
    expect(JSON.stringify(result)).not.toContain("secret-mcp-token");
  });

  it("reads the clock at most once per call and stays deterministic when injected", async () => {
    const { transport: t1 } = recordingTransport();
    const { transport: t2 } = recordingTransport();
    let clockCalls = 0;
    const clock = () => {
      clockCalls += 1;
      return MCP_GITHUB_TEST_NOW;
    };
    const first = await executeMcpGitHubTool("brief", { repository: SLUG, limit: 10 }, { transport: t1, clock, ...OFFLINE });
    expect(clockCalls).toBe(1);
    const second = await executeMcpGitHubTool("brief", { repository: SLUG, limit: 10 }, {
      transport: t2,
      now: MCP_GITHUB_TEST_NOW,
      ...OFFLINE,
    });
    if (!first.ok || !second.ok) throw new Error("expected ok");
    // The injected `now` takes precedence over `clock`; repeated structured
    // output with the same injected time is deep-equal.
    expect(first.output).toStrictEqual(second.output);
  });

  it("maps a sanitized provider failure", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        return { status: 404, headers: {}, body: { message: "not found detail" } };
      },
    };
    const result = await executeMcpGitHubTool("brief", { repository: SLUG, limit: 10 }, { transport, ...OFFLINE });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OMP-P-4006");
      expect(result.message).not.toContain("not found detail");
    }
  });
});

describe("executeMcpGitHubTool risk/next public metadata", () => {
  function scenarioTransport(): GitHubHttpTransport {
    return {
      async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
        const url = new URL(request.url);
        if (url.pathname === `/repos/${SLUG}`) {
          return { status: 200, headers: {}, body: load("repository.json") };
        }
        // One blocker issue (risk, not next) and one ordinary open issue (next).
        return {
          status: 200,
          headers: {},
          body: [
            {
              number: 21,
              title: "Blocked deploy",
              body: "Sensitive body text that must not leak.",
              state: "open",
              html_url: `https://github.com/${SLUG}/issues/21`,
              user: { login: "a" },
              assignees: [{ login: "mika" }],
              labels: [{ name: "blocker" }],
              comments: 0,
              locked: false,
            },
            {
              number: 22,
              title: "Write onboarding docs",
              body: "Another body that must not leak.",
              state: "open",
              html_url: `https://github.com/${SLUG}/issues/22`,
              user: { login: "b" },
              assignees: [],
              labels: [],
              comments: 0,
              locked: false,
            },
          ],
        };
      },
    };
  }

  it("carries url/repository/number on risks and excludes raw body", async () => {
    const transport = scenarioTransport();
    const result = await executeMcpGitHubTool("risks", { repository: SLUG, limit: 10 }, { transport, ...OFFLINE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const risks = (result.output as { risks: Array<Record<string, unknown>> }).risks;
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      repository: SLUG,
      number: 21,
      url: `https://github.com/${SLUG}/issues/21`,
      reason: "github_state:blocked",
      severity: "high",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Sensitive body text");
    expect(serialized).not.toContain("providerResponses");
    expect(serialized).not.toContain("runtimeResponse");
  });

  it("includes only the actionable open issue in next with public metadata", async () => {
    const transport = scenarioTransport();
    const result = await executeMcpGitHubTool("next", { repository: SLUG, limit: 10 }, { transport, ...OFFLINE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tasks = (result.output as { tasks: Array<Record<string, unknown>> }).tasks;
    // The blocker issue is a risk, never a next task.
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      repository: SLUG,
      number: 22,
      url: `https://github.com/${SLUG}/issues/22`,
      reason: "github_issue:open",
    });
    expect(JSON.stringify(result)).not.toContain("must not leak");
  });
});

describe("executeMcpGitHubTool — source selection", () => {
  function sourceTransport(): { transport: GitHubHttpTransport; calls: GitHubHttpRequest[] } {
    const calls: GitHubHttpRequest[] = [];
    const transport: GitHubHttpTransport = {
      async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
        calls.push(request);
        const url = new URL(request.url);
        if (url.pathname === `/repos/${SLUG}`) return { status: 200, headers: {}, body: load("repository.json") };
        if (url.pathname === `/repos/${SLUG}/issues`) return { status: 200, headers: {}, body: load("issues.json") };
        if (url.pathname === `/repos/${SLUG}/issues/7`) {
          return { status: 200, headers: {}, body: { number: 7, title: "One", state: "open", body: "" } };
        }
        if (url.pathname === "/search/issues") {
          return { status: 200, headers: {}, body: { incomplete_results: false, items: [] } };
        }
        return { status: 404, headers: {}, body: {} };
      },
    };
    return { transport, calls };
  }

  it("repository source projects a single-record summary and selection", async () => {
    const { transport, calls } = sourceTransport();
    const result = await executeMcpGitHubTool("brief", { repository: SLUG, source: "repository" }, { transport, ...OFFLINE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([`/repos/${SLUG}`]);
    expect(result.selection).toStrictEqual({ mode: "repository" });
    expect(result.sourceSummary.repositories).toBe(1);
    expect(result.sourceSummary.issues).toBe(0);
    expect(result.sourceSummary.pullRequests).toBe(0);
  });

  it("issues source projects state/limit in the public selection", async () => {
    const { transport, calls } = sourceTransport();
    const result = await executeMcpGitHubTool("risks", { repository: SLUG, source: "issues", state: "closed", limit: 5 }, { transport, ...OFFLINE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new URL(calls[0]!.url).pathname).toBe("/search/issues");
    expect(result.selection).toStrictEqual({ mode: "issues", state: "closed", limit: 5 });
  });

  it("item source requires a number and fails before transport otherwise", async () => {
    const { transport, calls } = sourceTransport();
    const missing = await executeMcpGitHubTool("brief", { repository: SLUG, source: "item" }, { transport, ...OFFLINE });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("github_number_required");
    expect(calls).toHaveLength(0);

    const ok = await executeMcpGitHubTool("brief", { repository: SLUG, source: "item", number: 7 }, { transport, ...OFFLINE });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.selection).toStrictEqual({ mode: "item", number: 7 });
  });

  it("search source requires a query and projects it back", async () => {
    const { transport, calls } = sourceTransport();
    const missing = await executeMcpGitHubTool("risks", { repository: SLUG, source: "search" }, { transport, ...OFFLINE });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("github_query_required");

    const ok = await executeMcpGitHubTool("risks", { repository: SLUG, source: "search", query: "blocker", kind: "issues" }, { transport, ...OFFLINE });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.selection).toMatchObject({ mode: "search", query: "blocker", kind: "issues" });
      // The public selection carries the user's bounded query but never a raw REST query string.
      expect(JSON.stringify(ok.selection)).not.toContain("repo:");
      expect(JSON.stringify(ok.selection)).not.toContain("per_page");
    }
    void calls;
  });

  it("uses configured default source/state when tool inputs omit them", async () => {
    const { transport, calls } = sourceTransport();
    const config = defaultProviderConfig();
    config.providers.github.defaultSource = "issues";
    config.providers.github.defaultState = "closed";
    const result = await executeMcpGitHubTool("risks", { repository: SLUG }, { transport, providerConfig: config });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.selection).toMatchObject({ mode: "issues", state: "closed" });
    expect(new URL(calls[0]!.url).pathname).toBe("/search/issues");
  });
});
