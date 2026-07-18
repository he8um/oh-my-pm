// Offline fake-transport end-to-end for the GitHub provider: CLI and MCP paths
// exercised for all four operations against fictional fixtures. No live network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runLocalCliProcess } from "@oh-my-pm/cli";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { executeMcpGitHubTool } from "../src/index.js";

// Injected so these offline e2e runs never read the developer's real config.
const OFFLINE_CONFIG = defaultProviderConfig();

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
const NOW = "2026-03-01T00:00:00.000Z";

function transportWithLog(): { transport: GitHubHttpTransport; paths: string[] } {
  const paths: string[] = [];
  const transport: GitHubHttpTransport = {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      const url = new URL(request.url);
      paths.push(url.pathname);
      // Assert the exact base headers, never a token value.
      expect(request.headers.Accept).toBe("application/vnd.github+json");
      expect(request.headers["X-GitHub-Api-Version"]).toBe("2026-03-10");
      expect(Object.keys(request.headers)).not.toContain("Authorization");
      if (url.pathname === `/repos/${SLUG}`) return { status: 200, headers: {}, body: load("repository.json") };
      if (url.pathname === `/repos/${SLUG}/issues`) return { status: 200, headers: {}, body: load("issues.json") };
      return { status: 404, headers: {}, body: {} };
    },
  };
  return { transport, paths };
}

describe("github offline e2e — CLI", () => {
  for (const op of ["brief", "risks", "next", "handoff"] as const) {
    it(`runs ${op} through the full CLI pipeline`, async () => {
      const { transport, paths } = transportWithLog();
      const result = await runLocalCliProcess(["github", op, SLUG, "--json", "--limit", "5"], {
        githubTransport: transport,
        now: NOW,
        providerConfig: OFFLINE_CONFIG,
      });
      expect(result.exitCode, result.stderr).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.ok).toBe(true);
      // Exact endpoint order: repo metadata first, then issues.
      expect(paths).toEqual([`/repos/${SLUG}`, `/repos/${SLUG}/issues`]);
      // Normalized item order: repository record, then issue, then pull request.
      const items = parsed.data.providerResponses[0].items;
      expect(items.map((i: { type: string }) => i.type)).toEqual(["record", "issue", "pullRequest"]);
      // No token or raw API host leaks.
      expect(result.stdout).not.toContain("api.github.com");
      expect(result.stdout).not.toContain("Bearer");
    });
  }
});

describe("github offline e2e — MCP", () => {
  for (const op of ["brief", "risks", "next", "handoff"] as const) {
    it(`runs ${op} through the MCP runner`, async () => {
      const { transport, paths } = transportWithLog();
      const result = await executeMcpGitHubTool(op, { repository: SLUG, limit: 5 }, {
        transport,
        providerConfig: OFFLINE_CONFIG,
      });
      expect(result.ok, result.ok ? "" : result.message).toBe(true);
      if (!result.ok) return;
      expect(paths).toEqual([`/repos/${SLUG}`, `/repos/${SLUG}/issues`]);
      expect(result.sourceSummary.repositories).toBe(1);
      // Public projection excludes raw provider bodies.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("providerResponses");
      expect(serialized).not.toContain("Several markers between mile");
    });
  }
});
