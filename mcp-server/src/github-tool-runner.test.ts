import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import {
  executeMcpGitHubTool,
  githubOperationForToolName,
  toolNameForGitHubOperation,
} from "./github-tool-runner.js";

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
    const result = await executeMcpGitHubTool("brief", "not a repo", 50, { transport });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_invalid_repository");
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid limit before any network call", async () => {
    const { transport, calls } = recordingTransport();
    const result = await executeMcpGitHubTool("brief", SLUG, 0, { transport });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_invalid_limit");
    expect(calls).toHaveLength(0);
  });

  it("runs all four operations and projects a sanitized source list", async () => {
    for (const op of ["brief", "risks", "next", "handoff"] as const) {
      const { transport } = recordingTransport();
      const result = await executeMcpGitHubTool(op, SLUG, 10, { transport });
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
    const result = await executeMcpGitHubTool("brief", SLUG, 2, { transport });
    if (!result.ok) throw new Error("expected ok");
    // limit 2 -> repo + 1 source item.
    expect(result.sources.length).toBeLessThanOrEqual(1);
  });

  it("never includes a token in the projection", async () => {
    const { transport } = recordingTransport();
    const result = await executeMcpGitHubTool("brief", SLUG, 10, {
      transport,
      token: "secret-mcp-token",
    });
    expect(JSON.stringify(result)).not.toContain("secret-mcp-token");
  });

  it("maps a sanitized provider failure", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        return { status: 404, headers: {}, body: { message: "not found detail" } };
      },
    };
    const result = await executeMcpGitHubTool("brief", SLUG, 10, { transport });
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
    const result = await executeMcpGitHubTool("risks", SLUG, 10, { transport });
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
    const result = await executeMcpGitHubTool("next", SLUG, 10, { transport });
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
