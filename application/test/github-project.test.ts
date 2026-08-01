// GitHub project workflow use cases: fail-closed ordering, dependency
// injection, and sanitized failures. Every test is offline.

import { describe, expect, it } from "vitest";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import type { GitHubHttpTransport, ResolvedProviderConfig } from "@oh-my-pm/providers";
import type { Runtime } from "@oh-my-pm/runtime";
import {
  getGitHubProjectBrief,
  getGitHubProjectHandoff,
  getGitHubProjectNextActions,
  getGitHubProjectRisks,
  runGitHubProjectWorkflow,
} from "../src/index.js";
import type { GitHubProjectDeps } from "../src/index.js";

function enabledConfig(): ResolvedProviderConfig {
  const base = defaultProviderConfig();
  return {
    ...base,
    providers: {
      ...base.providers,
      github: { ...base.providers.github, enabled: true, defaultRepository: "he8um/oh-my-pm" },
    },
  };
}

function githubConfig(
  over: Partial<ResolvedProviderConfig["providers"]["github"]>,
): ResolvedProviderConfig {
  const base = enabledConfig();
  return {
    ...base,
    providers: { ...base.providers, github: { ...base.providers.github, ...over } },
  };
}

/** A transport that fails the test if it is ever called. */
function forbiddenTransport(): GitHubHttpTransport {
  return {
    request: async () => {
      throw new Error("transport must not be constructed or used");
    },
  } as unknown as GitHubHttpTransport;
}

function stubRuntime(captured: { requests: unknown[] }): Runtime {
  return {
    handle: async (request: unknown) => {
      captured.requests.push(request);
      return {
        id: (request as { id: string }).id,
        ok: true,
        data: { output: { summary: "ok" }, providerResponses: [] },
        trace: [],
      };
    },
  } as unknown as Runtime;
}

function deps(
  over: Partial<GitHubProjectDeps> = {},
  captured: { requests: unknown[] } = { requests: [] },
): GitHubProjectDeps {
  return {
    resolveProviderConfig: () => ({ config: enabledConfig() }),
    transport: forbiddenTransport(),
    now: () => "2026-01-01T00:00:00.000Z",
    version: "0.5.1",
    createRuntime: () => stubRuntime(captured),
    ...over,
  };
}

describe("github project workflows", () => {
  it("resolves repository and selection then returns a structured success", async () => {
    const captured = { requests: [] as unknown[] };
    const result = await getGitHubProjectBrief({}, deps({}, captured));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operation).toBe("brief");
    expect(result.repository).toBe("he8um/oh-my-pm");
    expect(result.now).toBe("2026-01-01T00:00:00.000Z");
    expect(result.selection).toBeDefined();
    expect((captured.requests[0] as { id: string }).id).toBe("mcp-github-brief");
  });

  it("routes each of the four operations", async () => {
    for (const [run, operation] of [
      [getGitHubProjectBrief, "brief"],
      [getGitHubProjectRisks, "risks"],
      [getGitHubProjectNextActions, "next"],
      [getGitHubProjectHandoff, "handoff"],
    ] as const) {
      const result = await run({}, deps());
      expect(result.ok).toBe(true);
      expect(result.operation).toBe(operation);
    }
  });

  it("reads the clock exactly once, and only after selection resolves", async () => {
    let clockReads = 0;
    await getGitHubProjectBrief({}, deps({ now: () => { clockReads += 1; return "2026-01-01T00:00:00.000Z"; } }));
    expect(clockReads).toBe(1);
  });
});

describe("github fail-closed ordering", () => {
  it("fails on an invalid config without reading the clock", async () => {
    let clockReads = 0;
    const result = await getGitHubProjectBrief(
      {},
      deps({
        resolveProviderConfig: () => ({ config: null, message: "config is not valid JSON" }),
        now: () => { clockReads += 1; return "x"; },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("github_invalid_config");
    expect(result.message).toBe("config is not valid JSON");
    expect(clockReads).toBe(0);
  });

  it("fails when the provider is disabled, before any transport use", async () => {
    const result = await getGitHubProjectBrief(
      {},
      deps({ resolveProviderConfig: () => ({ config: githubConfig({ enabled: false }) }) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_provider_disabled");
  });

  it("fails on an unresolvable repository", async () => {
    const base = enabledConfig();
    const { defaultRepository: _omitted, ...githubWithoutRepository } = base.providers.github;
    const result = await getGitHubProjectBrief(
      {},
      deps({
        resolveProviderConfig: () => ({
          config: {
            ...base,
            providers: { ...base.providers, github: githubWithoutRepository },
          } as ResolvedProviderConfig,
        }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_invalid_repository");
  });

  it("fails on an invalid selection without reading the clock", async () => {
    let clockReads = 0;
    const result = await runGitHubProjectWorkflow(
      "brief",
      { source: "search", query: "" },
      deps({ now: () => { clockReads += 1; return "x"; } }),
    );
    expect(result.ok).toBe(false);
    expect(clockReads).toBe(0);
  });

  it("never returns a token in a result", async () => {
    const result = await getGitHubProjectBrief({}, deps({ token: "ghp_supersecret_value" }));
    expect(JSON.stringify(result)).not.toContain("ghp_supersecret_value");
  });

  it("converts a runtime failure into a sanitized structured failure", async () => {
    const result = await getGitHubProjectBrief(
      {},
      deps({
        createRuntime: () =>
          ({
            handle: async () => ({
              id: "mcp-github-brief",
              ok: false,
              error: { code: "OMP-P-2", message: "provider refused" },
              data: { providerCode: "github_forbidden" },
              trace: [],
            }),
          }) as unknown as Runtime,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("github_forbidden");
    expect(result.message).toBe("provider refused");
  });
});
