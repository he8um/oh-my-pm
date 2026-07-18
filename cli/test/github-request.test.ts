import { describe, expect, it } from "vitest";
import { createGitHubRuntimeRequest } from "../src/index.js";

function contextOf(request: ReturnType<typeof createGitHubRuntimeRequest>) {
  const payload = request.payload as {
    source: string;
    request: string;
    context: { providerRequests: Array<{ providerId: string; action: string; query: string; limit: number }> };
  };
  return payload;
}

describe("createGitHubRuntimeRequest", () => {
  it("routes each operation's request text to the intended intent", () => {
    const map: Record<string, string> = {
      brief: "status brief for GitHub repository owner/repo",
      risks: "review risks for GitHub repository owner/repo",
      next: "derive next tasks for GitHub repository owner/repo",
      handoff: "create handoff for GitHub repository owner/repo",
    };
    for (const op of ["brief", "risks", "next", "handoff"] as const) {
      const request = createGitHubRuntimeRequest(op, "owner/repo", 50, "cli");
      expect(contextOf(request).request).toBe(map[op]);
    }
  });

  it("carries the repository as a github list provider request with the limit", () => {
    const request = createGitHubRuntimeRequest("brief", "owner/repo", 25, "cli");
    const payload = contextOf(request);
    expect(payload.source).toBe("cli");
    expect(payload.context.providerRequests).toEqual([
      { providerId: "github", action: "list", query: "owner/repo", limit: 25 },
    ]);
  });

  it("uses a source-specific id and never embeds a token or headers", () => {
    const cli = createGitHubRuntimeRequest("brief", "owner/repo", 50, "cli");
    const mcp = createGitHubRuntimeRequest("brief", "owner/repo", 50, "mcp");
    expect(cli.id).toBe("cli-github-brief");
    expect(mcp.id).toBe("mcp-github-brief");
    const serialized = JSON.stringify(cli);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("token");
  });
});
