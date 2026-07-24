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

// --- Item comments E2E -----------------------------------------------------

function commentTransport(recorded: string[]): GitHubHttpTransport {
  return {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      const url = new URL(request.url);
      recorded.push(url.pathname);
      if (url.pathname === `/repos/${SLUG}/issues/7`) {
        return { status: 200, headers: {}, body: ghItem(7, "issue") };
      }
      if (url.pathname === `/repos/${SLUG}/issues/7/comments`) {
        return {
          status: 200,
          headers: {},
          body: [
            {
              id: 101,
              body: "Blocker: staging credentials expired",
              user: { login: "alice" },
              author_association: "MEMBER",
              html_url: `https://github.com/${SLUG}/issues/7#issuecomment-101`,
              created_at: "2026-02-01T00:00:00Z",
            },
          ],
        };
      }
      return { status: 404, headers: {}, body: {} };
    },
  };
}

describe("GitHub item comments E2E", () => {
  it("item + --include-comments brings the primary item and comment notes into the Runtime", async () => {
    const recorded: string[] = [];
    const result = await runLocalCliProcess(
      ["github", "brief", SLUG, "--source", "item", "--number", "7", "--include-comments", "--comment-limit", "20", "--json"],
      { githubTransport: commentTransport(recorded), now: NOW, providerConfig: defaultProviderConfig() },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const items = JSON.parse(result.stdout).data.providerResponses[0].items as Array<{ type: string; data: Record<string, unknown> }>;
    expect(items[0]!.type).toBe("issue");
    const notes = items.filter((i) => i.type === "note");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.data.kind).toBe("issueComment");
    // Exactly the issue then its comments page, one page only.
    expect(recorded).toEqual([`/repos/${SLUG}/issues/7`, `/repos/${SLUG}/issues/7/comments`]);
  });

  it("without --include-comments no comment request is made", async () => {
    const recorded: string[] = [];
    const result = await runLocalCliProcess(
      ["github", "brief", SLUG, "--source", "item", "--number", "7", "--json"],
      { githubTransport: commentTransport(recorded), now: NOW, providerConfig: defaultProviderConfig() },
    );
    expect(result.exitCode).toBe(0);
    expect(recorded).toEqual([`/repos/${SLUG}/issues/7`]);
  });

  it("risks surfaces a comment blocker with the author in the formatted output", async () => {
    const result = await runLocalCliProcess(
      ["github", "risks", SLUG, "--source", "item", "--number", "7", "--include-comments"],
      { githubTransport: commentTransport([]), now: NOW, providerConfig: defaultProviderConfig() },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("author: alice");
    expect(result.stdout).toContain("staging credentials expired");
  });

  it("rejects --include-comments for a non-item source before any network call", async () => {
    const recorded: string[] = [];
    const result = await runLocalCliProcess(
      ["github", "brief", SLUG, "--source", "issues", "--include-comments"],
      { githubTransport: commentTransport(recorded), now: NOW, providerConfig: defaultProviderConfig() },
    );
    expect(result.exitCode).toBe(2);
    expect(recorded).toHaveLength(0);
  });

  it("rejects --comment-limit without --include-comments before any network call", async () => {
    const recorded: string[] = [];
    const result = await runLocalCliProcess(
      ["github", "brief", SLUG, "--source", "item", "--number", "7", "--comment-limit", "10"],
      { githubTransport: commentTransport(recorded), now: NOW, providerConfig: defaultProviderConfig() },
    );
    expect(result.exitCode).toBe(2);
    expect(recorded).toHaveLength(0);
  });

  it("rejects an out-of-range --comment-limit at the parser", async () => {
    const result = await runLocalCliProcess(
      ["github", "brief", SLUG, "--source", "item", "--number", "7", "--include-comments", "--comment-limit", "51"],
      { githubTransport: commentTransport([]), now: NOW, providerConfig: defaultProviderConfig() },
    );
    expect(result.exitCode).toBe(2);
  });

  it("produces byte-identical output on repeated runs (determinism)", async () => {
    const run = () =>
      runLocalCliProcess(
        ["github", "risks", SLUG, "--source", "item", "--number", "7", "--include-comments", "--json"],
        { githubTransport: commentTransport([]), now: NOW, providerConfig: defaultProviderConfig() },
      );
    const a = await run();
    const b = await run();
    expect(a.stdout).toBe(b.stdout);
  });
});

// --- PR reviews and review comments E2E ------------------------------------

function reviewTransport(recorded: string[]): GitHubHttpTransport {
  return {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      const url = new URL(request.url);
      recorded.push(url.pathname);
      if (url.pathname === `/repos/${SLUG}/issues/8`) {
        return { status: 200, headers: {}, body: ghItem(8, "pr") };
      }
      if (url.pathname === `/repos/${SLUG}/pulls/8`) {
        return { status: 200, headers: {}, body: { ...ghItem(8, "pr"), merged: false, draft: false } };
      }
      if (url.pathname === `/repos/${SLUG}/issues/8/comments`) {
        return { status: 200, headers: {}, body: [] };
      }
      if (url.pathname === `/repos/${SLUG}/pulls/8/reviews`) {
        return {
          status: 200,
          headers: {},
          body: [
            {
              id: 201,
              user: { login: "alice" },
              state: "CHANGES_REQUESTED",
              body: "",
              author_association: "MEMBER",
              submitted_at: "2026-02-01T00:00:00Z",
              html_url: `https://github.com/${SLUG}/pull/8#pullrequestreview-201`,
            },
            {
              id: 202,
              user: { login: "bob" },
              state: "APPROVED",
              body: "## Decisions\n- ship it",
              author_association: "MEMBER",
              submitted_at: "2026-02-02T00:00:00Z",
              html_url: `https://github.com/${SLUG}/pull/8#pullrequestreview-202`,
            },
          ],
        };
      }
      if (url.pathname === `/repos/${SLUG}/pulls/8/comments`) {
        return {
          status: 200,
          headers: {},
          body: [
            {
              id: 301,
              user: { login: "carol" },
              body: "Blocker: null pointer here",
              path: "src/lib.ts",
              line: 12,
              side: "RIGHT",
              author_association: "MEMBER",
              created_at: "2026-02-01T00:00:00Z",
              html_url: `https://github.com/${SLUG}/pull/8#discussion_r301`,
            },
          ],
        };
      }
      return { status: 404, headers: {}, body: {} };
    },
  };
}

async function reviewRun(args: string[], recorded: string[] = []) {
  return runLocalCliProcess(["github", ...args], {
    githubTransport: reviewTransport(recorded),
    now: NOW,
    providerConfig: defaultProviderConfig(),
  });
}

describe("GitHub PR reviews / review comments E2E", () => {
  it("PR item + --include-reviews brings the primary PR and review notes into the Runtime", async () => {
    const recorded: string[] = [];
    const result = await reviewRun(
      ["brief", SLUG, "--source", "item", "--number", "8", "--include-reviews", "--json"],
      recorded,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const items = JSON.parse(result.stdout).data.providerResponses[0].items as Array<{
      type: string;
      data: Record<string, unknown>;
    }>;
    expect(items[0]!.type).toBe("pullRequest");
    const reviews = items.filter((i) => i.data.kind === "pullRequestReview");
    expect(reviews).toHaveLength(2);
    expect(recorded).toEqual([
      `/repos/${SLUG}/issues/8`,
      `/repos/${SLUG}/pulls/8`,
      `/repos/${SLUG}/pulls/8/reviews`,
    ]);
  });

  it("PR item + --include-review-comments requests exactly issue, pull detail, review comments", async () => {
    const recorded: string[] = [];
    const result = await reviewRun(
      ["brief", SLUG, "--source", "item", "--number", "8", "--include-review-comments", "--json"],
      recorded,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(recorded).toEqual([
      `/repos/${SLUG}/issues/8`,
      `/repos/${SLUG}/pulls/8`,
      `/repos/${SLUG}/pulls/8/comments`,
    ]);
  });

  it("PR item + all optional context requests five endpoints in canonical order", async () => {
    const recorded: string[] = [];
    const result = await reviewRun(
      [
        "brief",
        SLUG,
        "--source",
        "item",
        "--number",
        "8",
        "--include-comments",
        "--include-reviews",
        "--include-review-comments",
        "--json",
      ],
      recorded,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(recorded).toEqual([
      `/repos/${SLUG}/issues/8`,
      `/repos/${SLUG}/pulls/8`,
      `/repos/${SLUG}/issues/8/comments`,
      `/repos/${SLUG}/pulls/8/reviews`,
      `/repos/${SLUG}/pulls/8/comments`,
    ]);
  });

  it("an issue selected with review options fails with exit 2 after the item-identification GET", async () => {
    const recorded: string[] = [];
    const result = await runLocalCliProcess(
      ["github", "brief", SLUG, "--source", "item", "--number", "7", "--include-reviews"],
      { githubTransport: commentTransport(recorded), now: NOW, providerConfig: defaultProviderConfig() },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("not a pull request");
    // Exactly one item-identification request; no PR/review request.
    expect(recorded).toEqual([`/repos/${SLUG}/issues/7`]);
  });

  it("risks from a changes-requested review surface with the author and high severity", async () => {
    const result = await reviewRun(["risks", SLUG, "--source", "item", "--number", "8", "--include-reviews"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Changes requested by @alice");
    expect(result.stdout).toContain("[high]");
    expect(result.stdout).toContain("author: alice");
  });

  it("next from a changes-requested review surfaces the address task", async () => {
    const result = await reviewRun(["next", SLUG, "--source", "item", "--number", "8", "--include-reviews"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Address changes requested by @alice");
  });

  it("handoff records an approval decision and an inline review-comment risk with file provenance", async () => {
    const result = await reviewRun([
      "handoff",
      SLUG,
      "--source",
      "item",
      "--number",
      "8",
      "--include-reviews",
      "--include-review-comments",
      "--markdown",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("@bob approved the pull request");
    expect(result.stdout).toContain("src/lib.ts:12");
  });

  it("never prints a raw review body unless a bounded signal title was extracted", async () => {
    const result = await reviewRun([
      "risks",
      SLUG,
      "--source",
      "item",
      "--number",
      "8",
      "--include-reviews",
      "--markdown",
    ]);
    // The bob review body "## Decisions\n- ship it" yields no risk; its raw body
    // text must not appear in the risks output.
    expect(result.stdout).not.toContain("ship it");
  });

  it("produces byte-identical output on repeated runs (determinism)", async () => {
    const run = () =>
      reviewRun([
        "risks",
        SLUG,
        "--source",
        "item",
        "--number",
        "8",
        "--include-reviews",
        "--include-review-comments",
        "--json",
      ]);
    const a = await run();
    const b = await run();
    expect(a.stdout).toBe(b.stdout);
  });
});
