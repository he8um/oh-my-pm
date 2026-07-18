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
