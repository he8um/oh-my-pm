// Deterministic PM-workflow E2E across every GitHub source mode, using only a
// fake transport. Asserts that the selected source controls which normalized
// items enter the Runtime, with no hidden fallback and no live network.

import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { runLocalCliProcess } from "../src/index.js";

const SLUG = "owner/repo";
const NOW = "2026-03-01T00:00:00.000Z";

function ghItem(n: number, kind: "issue" | "pr"): Record<string, unknown> {
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
  if (kind === "pr") b["pull_request"] = { url: "x" };
  return b;
}

// Search results carry the is:issue/is:pr scope, so a scoped search returns only
// that kind; the fake honors the injected qualifier.
function transport(): GitHubHttpTransport {
  return {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      const url = new URL(request.url);
      if (url.pathname === `/repos/${SLUG}`) {
        return { status: 200, headers: {}, body: { full_name: SLUG, html_url: `https://github.com/${SLUG}`, owner: { login: "owner" }, open_issues_count: 3 } };
      }
      if (url.pathname === `/repos/${SLUG}/issues`) {
        return { status: 200, headers: {}, body: [ghItem(1, "issue"), ghItem(2, "pr")] };
      }
      if (url.pathname === `/repos/${SLUG}/issues/7`) {
        return { status: 200, headers: {}, body: ghItem(7, "issue") };
      }
      if (url.pathname === "/search/issues") {
        const q = url.searchParams.get("q") ?? "";
        let items: Record<string, unknown>[];
        if (q.includes("is:pr")) items = [ghItem(4, "pr"), ghItem(6, "pr")];
        else if (q.includes("is:issue")) items = [ghItem(3, "issue"), ghItem(5, "issue")];
        else items = [ghItem(3, "issue"), ghItem(4, "pr")];
        return { status: 200, headers: {}, body: { incomplete_results: false, items } };
      }
      return { status: 404, headers: {}, body: {} };
    },
  };
}

async function itemsFor(args: string[]): Promise<Array<{ type: string }>> {
  const result = await runLocalCliProcess(["github", ...args, "--json"], {
    githubTransport: transport(),
    now: NOW,
    providerConfig: defaultProviderConfig(),
  });
  expect(result.exitCode, result.stderr).toBe(0);
  const parsed = JSON.parse(result.stdout);
  return parsed.data.providerResponses[0].items as Array<{ type: string }>;
}

describe("GitHub source E2E — item composition entering Runtime", () => {
  for (const op of ["brief", "risks", "next", "handoff"] as const) {
    it(`${op}: overview contains a repository record plus issues/PRs`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "overview"]);
      expect(items.some((i) => i.type === "record")).toBe(true);
    });

    it(`${op}: repository contains only the record`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "repository"]);
      expect(items).toHaveLength(1);
      expect(items[0]?.type).toBe("record");
    });

    it(`${op}: issues contains only issues (no record, no PR)`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "issues"]);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.type === "issue")).toBe(true);
    });

    it(`${op}: pull-requests contains only pull requests`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "pull-requests"]);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.type === "pullRequest")).toBe(true);
    });

    it(`${op}: item contains exactly one normalized item`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "item", "--number", "7"]);
      expect(items).toHaveLength(1);
    });

    it(`${op}: search all returns a mix`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "search", "--query", "x", "--kind", "all"]);
      expect(items.length).toBeGreaterThan(0);
    });

    it(`${op}: search issues returns only issues`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "search", "--query", "x", "--kind", "issues"]);
      expect(items.every((i) => i.type === "issue")).toBe(true);
    });

    it(`${op}: search pull-requests returns only pull requests`, async () => {
      const items = await itemsFor([op, SLUG, "--source", "search", "--query", "x", "--kind", "pull-requests"]);
      expect(items.every((i) => i.type === "pullRequest")).toBe(true);
    });
  }

  it("repeated runs are byte-identical", async () => {
    const run = () =>
      runLocalCliProcess(["github", "risks", SLUG, "--source", "issues", "--state", "open", "--json"], {
        githubTransport: transport(),
        now: NOW,
        providerConfig: defaultProviderConfig(),
      });
    const a = await run();
    const b = await run();
    expect(a.stdout).toBe(b.stdout);
  });
});
