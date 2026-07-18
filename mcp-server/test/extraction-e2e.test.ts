// Offline end-to-end coverage for deterministic risk/next extraction across the
// CLI and MCP surfaces, for both local Markdown and GitHub (fake-transport)
// context. No live network. Each structured flow is run twice and deep-compared.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runLocalCliProcess } from "@oh-my-pm/cli";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { executeMcpGitHubTool, executeMcpProjectTool } from "../src/index.js";

const OFFLINE_CONFIG = defaultProviderConfig();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const signalsRoot = join(repoRoot, "examples", "fixtures", "project-signals");
const NOW = "2026-03-01T00:00:00.000Z";
const SLUG = "octo/demo";

/** A fake GitHub transport with a repository record plus a mixed issue/PR set. */
function githubTransport(): GitHubHttpTransport {
  return {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      const url = new URL(request.url);
      if (url.pathname === `/repos/${SLUG}`) {
        return {
          status: 200,
          headers: {},
          body: {
            full_name: SLUG,
            html_url: `https://github.com/${SLUG}`,
            private: false,
            archived: false,
            disabled: false,
            default_branch: "main",
            open_issues_count: 4,
            owner: { login: "octo" },
          },
        };
      }
      return {
        status: 200,
        headers: {},
        body: [
          {
            number: 1,
            title: "Blocked release",
            body: "b1",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/1`,
            user: { login: "a" },
            assignees: [{ login: "mika" }],
            labels: [{ name: "blocker" }],
          },
          {
            number: 2,
            title: "Overdue audit",
            body: "b2",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/2`,
            user: { login: "b" },
            assignees: [],
            labels: [],
            milestone: { title: "M", due_on: "2025-06-01T00:00:00Z" },
          },
          {
            number: 3,
            title: "Write docs",
            body: "b3",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/3`,
            user: { login: "c" },
            assignees: [],
            labels: [],
          },
          {
            number: 4,
            title: "Draft feature",
            body: "b4",
            state: "open",
            html_url: `https://github.com/${SLUG}/pull/4`,
            user: { login: "d" },
            assignees: [],
            labels: [],
            pull_request: { url: "x" },
            draft: true,
          },
          {
            number: 5,
            title: "Old idea",
            body: "b5",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/5`,
            user: { login: "e" },
            assignees: [],
            labels: [{ name: "wontfix" }],
          },
        ],
      };
    },
  };
}

async function cliOutput(op: string, args: string[], transport?: GitHubHttpTransport): Promise<unknown> {
  const result = await runLocalCliProcess([...args, "--json"], {
    now: NOW,
    ...(transport ? { githubTransport: transport } : {}),
  });
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout).data.output;
}

describe("CLI local extraction e2e", () => {
  it("produces deterministic local risks and next tasks", async () => {
    const risks1 = await cliOutput("risks", ["risks", signalsRoot]);
    const risks2 = await cliOutput("risks", ["risks", signalsRoot]);
    expect(risks1).toEqual(risks2);
    const next1 = await cliOutput("next", ["next", signalsRoot]);
    const next2 = await cliOutput("next", ["next", signalsRoot]);
    expect(next1).toEqual(next2);
    // No absolute path or raw document dump in the output projection.
    expect(JSON.stringify(risks1)).not.toContain(repoRoot);
  });
});

describe("CLI GitHub extraction e2e (fake transport)", () => {
  it("routes blocked/overdue to risks and actionable items to next", async () => {
    const risks = (await cliOutput("risks", ["github", "risks", SLUG], githubTransport())) as {
      risks: Array<Record<string, unknown>>;
    };
    const reasons = risks.risks.map((r) => r.reason);
    expect(reasons).toContain("github_state:blocked");
    expect(reasons).toContain("github_due:overdue");

    const next = (await cliOutput("next", ["github", "next", SLUG], githubTransport())) as {
      tasks: Array<Record<string, unknown>>;
    };
    const nums = next.tasks.map((t) => t.number);
    // #1 blocked and #5 wontfix are excluded; #3 issue and #4 draft PR remain.
    expect(nums).toContain(3);
    expect(nums).toContain(4);
    expect(nums).not.toContain(1);
    expect(nums).not.toContain(5);
    // Deterministic repeat.
    const next2 = (await cliOutput("next", ["github", "next", SLUG], githubTransport())) as unknown;
    expect(next).toEqual(next2);
  });
});

describe("MCP local extraction e2e", () => {
  it("returns deterministic local risks and next via the runner", async () => {
    const risks1 = await executeMcpProjectTool("risks", signalsRoot);
    const risks2 = await executeMcpProjectTool("risks", signalsRoot);
    expect(risks1.ok && risks2.ok).toBe(true);
    if (risks1.ok && risks2.ok) expect(risks1.output).toEqual(risks2.output);
    const next1 = await executeMcpProjectTool("next", signalsRoot);
    const next2 = await executeMcpProjectTool("next", signalsRoot);
    if (next1.ok && next2.ok) expect(next1.output).toEqual(next2.output);
  });
});

describe("MCP GitHub extraction e2e (fake transport)", () => {
  it("excludes the repository record from next and carries public metadata", async () => {
    const risks = await executeMcpGitHubTool("risks", { repository: SLUG, limit: 10 }, { transport: githubTransport(), providerConfig: OFFLINE_CONFIG });
    const next = await executeMcpGitHubTool("next", { repository: SLUG, limit: 10 }, { transport: githubTransport(), providerConfig: OFFLINE_CONFIG });
    expect(risks.ok && next.ok).toBe(true);
    if (!risks.ok || !next.ok) return;

    const riskReasons = (risks.output as { risks: Array<Record<string, unknown>> }).risks.map((r) => r.reason);
    expect(riskReasons).toContain("github_state:blocked");
    expect(riskReasons).toContain("github_due:overdue");

    const tasks = (next.output as { tasks: Array<Record<string, unknown>> }).tasks;
    expect(tasks.every((t) => t.reason !== undefined)).toBe(true);
    // Repository record is never a task; blocked/wontfix excluded.
    expect(tasks.map((t) => t.number)).not.toContain(1);
    expect(tasks.map((t) => t.number)).not.toContain(5);
    expect(tasks[0]?.repository).toBe(SLUG);

    // No provider internals or raw body leak.
    const serialized = JSON.stringify({ risks, next });
    expect(serialized).not.toContain("providerResponses");
    expect(serialized).not.toContain("runtimeResponse");
    expect(serialized).not.toContain('"b1"');

    // Deterministic repeat.
    const risks2 = await executeMcpGitHubTool("risks", { repository: SLUG, limit: 10 }, { transport: githubTransport(), providerConfig: OFFLINE_CONFIG });
    if (risks2.ok) expect(risks.output).toEqual(risks2.output);
  });
});

describe("brief and handoff regression (unchanged public shape)", () => {
  it("keeps the local brief and handoff output shapes", async () => {
    const brief = await executeMcpProjectTool("brief", signalsRoot);
    expect(brief.ok).toBe(true);
    if (brief.ok) {
      const keys = Object.keys(brief.output as Record<string, unknown>).sort();
      expect(keys).toEqual(["counts", "generatedAt", "highlights", "summary", "title"]);
    }
    const handoff = await executeMcpProjectTool("handoff", signalsRoot);
    expect(handoff.ok).toBe(true);
    if (handoff.ok) {
      const keys = Object.keys(handoff.output as Record<string, unknown>).sort();
      expect(keys).toEqual(["generatedAt", "sections", "title"]);
    }
  });

  it("keeps the GitHub brief and handoff output shapes without new signal fields", async () => {
    const brief = await executeMcpGitHubTool("brief", { repository: SLUG, limit: 10 }, { transport: githubTransport(), providerConfig: OFFLINE_CONFIG });
    expect(brief.ok).toBe(true);
    if (brief.ok) {
      // The brief output is the status summary; it gains no risk/next metadata.
      const output = brief.output as Record<string, unknown>;
      expect(output).toHaveProperty("counts");
      expect(output).not.toHaveProperty("priority");
      expect(output).not.toHaveProperty("repository");
    }
    const handoff = await executeMcpGitHubTool("handoff", { repository: SLUG, limit: 10 }, { transport: githubTransport(), providerConfig: OFFLINE_CONFIG });
    expect(handoff.ok).toBe(true);
    if (handoff.ok) {
      const output = handoff.output as Record<string, unknown>;
      expect(output).toHaveProperty("sections");
      expect(output).not.toHaveProperty("priority");
    }
  });
});
