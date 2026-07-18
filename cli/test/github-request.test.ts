import type { GitHubSourceSelection } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { createGitHubRuntimeRequest } from "../src/index.js";

function contextOf(request: ReturnType<typeof createGitHubRuntimeRequest>) {
  const payload = request.payload as {
    source: string;
    request: string;
    context: {
      providerRequests: Array<{ providerId: string; action: string; query: string; limit?: number }>;
    };
  };
  return payload;
}

const overview: GitHubSourceSelection = { mode: "overview", state: "open", limit: 50 };

describe("createGitHubRuntimeRequest", () => {
  it("routes each operation's request text to the intended intent with the source phrase", () => {
    const map: Record<string, string> = {
      brief: "status brief for GitHub repository owner/repo using overview source",
      risks: "review risks for GitHub repository owner/repo using overview source",
      next: "derive next tasks for GitHub repository owner/repo using overview source",
      handoff: "create handoff for GitHub repository owner/repo using overview source",
    };
    for (const op of ["brief", "risks", "next", "handoff"] as const) {
      const request = createGitHubRuntimeRequest({
        operation: op,
        repository: "owner/repo",
        selection: overview,
        caller: "cli",
      });
      expect(contextOf(request).request).toBe(map[op]);
    }
  });

  it("builds the provider request from the selection", () => {
    const request = createGitHubRuntimeRequest({
      operation: "brief",
      repository: "owner/repo",
      selection: { mode: "overview", state: "closed", limit: 25 },
      caller: "cli",
    });
    const payload = contextOf(request);
    expect(payload.source).toBe("cli");
    expect(payload.context.providerRequests).toEqual([
      { providerId: "github", action: "list", query: "owner/repo::source=overview&state=closed", limit: 25 },
    ]);
  });

  it("names the selected source in request text for each mode", () => {
    const cases: Array<[GitHubSourceSelection, string]> = [
      [{ mode: "repository" }, "using repository source"],
      [{ mode: "issues", state: "open", limit: 5 }, "using issues source"],
      [{ mode: "pull-requests", state: "all", limit: 5 }, "using pull-requests source"],
      [{ mode: "item", number: 7 }, "using item source"],
      [{ mode: "search", query: "x", state: "open", kind: "all", limit: 5 }, "using search source"],
    ];
    for (const [selection, phrase] of cases) {
      const request = createGitHubRuntimeRequest({
        operation: "risks",
        repository: "owner/repo",
        selection,
        caller: "cli",
      });
      expect(contextOf(request).request).toContain(phrase);
    }
  });

  it("never embeds the search query in the request text", () => {
    const request = createGitHubRuntimeRequest({
      operation: "risks",
      repository: "owner/repo",
      selection: { mode: "search", query: "secret-launch-blocker", state: "open", kind: "all", limit: 5 },
      caller: "cli",
    });
    expect(contextOf(request).request).not.toContain("secret-launch-blocker");
  });

  it("uses a caller-specific id and never embeds a token or headers", () => {
    const cli = createGitHubRuntimeRequest({ operation: "brief", repository: "owner/repo", selection: overview, caller: "cli" });
    const mcp = createGitHubRuntimeRequest({ operation: "brief", repository: "owner/repo", selection: overview, caller: "mcp" });
    expect(cli.id).toBe("cli-github-brief");
    expect(mcp.id).toBe("mcp-github-brief");
    const serialized = JSON.stringify(cli);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("token");
  });
});
