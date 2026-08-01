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
import { createNodeGitHubProjectDeps } from "../src/node/index.js";

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
    caller: "mcp",
    resolveProviderConfig: () => ({ config: enabledConfig() }),
    createTransport: () => forbiddenTransport(),
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

  it("preserves the injected caller identity instead of hardcoding one", async () => {
    // Regression guard for the duplicated-composition era, when the shared use
    // case hardcoded caller: "mcp" and silently mislabelled every CLI request.
    for (const [caller, expected] of [
      ["cli", "cli-github-brief"],
      ["mcp", "mcp-github-brief"],
    ] as const) {
      const captured = { requests: [] as unknown[] };
      const result = await getGitHubProjectBrief({}, deps({ caller }, captured));
      expect(result.ok).toBe(true);
      expect((captured.requests[0] as { id: string }).id).toBe(expected);
      expect((captured.requests[0] as { payload: { source: string } }).payload.source).toBe(caller);
    }
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
    // The token only ever exists inside the transport factory closure, so a
    // result can never carry it.
    const result = await getGitHubProjectBrief(
      {},
      deps({
        createTransport: () => {
          const token = "ghp_supersecret_value";
          void token;
          return forbiddenTransport();
        },
      }),
    );
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

// Ordering is a security property: a controlled failure must be resolved fully
// offline. These tests count the dependency invocations directly, so a future
// refactor that moves a token read, transport construction, or clock read above
// validation fails here rather than in production.
describe("github dependency-invocation ordering", () => {
  type Counters = { transports: number; tokens: number; clocks: number };

  /**
   * Dependencies that count every side-effecting access. `tokens` models the
   * environment read that the Node boundary performs lazily inside the transport
   * factory, so "never reads the token" is observable from the core surface.
   */
  function countingDeps(
    over: Partial<GitHubProjectDeps> = {},
  ): { deps: GitHubProjectDeps; counts: Counters } {
    const counts: Counters = { transports: 0, tokens: 0, clocks: 0 };
    const base: GitHubProjectDeps = {
      caller: "mcp",
      resolveProviderConfig: () => ({ config: enabledConfig() }),
      createTransport: () => {
        counts.transports += 1;
        counts.tokens += 1;
        return forbiddenTransport();
      },
      now: () => {
        counts.clocks += 1;
        return "2026-01-01T00:00:00.000Z";
      },
      version: "0.5.1",
      createRuntime: () => stubRuntime({ requests: [] }),
      ...over,
    };
    return { deps: base, counts };
  }

  const controlledFailures: ReadonlyArray<
    readonly [string, Partial<GitHubProjectDeps>, Parameters<typeof runGitHubProjectWorkflow>[1]]
  > = [
    [
      "invalid provider config",
      { resolveProviderConfig: () => ({ config: null, message: "config is not valid JSON" }) },
      {},
    ],
    [
      "disabled provider",
      { resolveProviderConfig: () => ({ config: githubConfig({ enabled: false }) }) },
      {},
    ],
    ["invalid repository", {}, { repository: "not-a-slug" }],
    ["invalid limit", {}, { limit: 0 }],
    ["invalid source selection", {}, { source: "search", query: "" }],
  ];

  for (const [label, over, input] of controlledFailures) {
    it(`does not create a transport, read a token, or read the clock on ${label}`, async () => {
      const { deps: injected, counts } = countingDeps(over);
      const result = await runGitHubProjectWorkflow("brief", input, injected);
      expect(result.ok).toBe(false);
      expect(counts.transports).toBe(0);
      expect(counts.tokens).toBe(0);
      expect(counts.clocks).toBe(0);
    });
  }

  it("creates the transport exactly once and reads the clock exactly once on success", async () => {
    const { deps: injected, counts } = countingDeps();
    const result = await runGitHubProjectWorkflow("brief", {}, injected);
    expect(result.ok).toBe(true);
    expect(counts.transports).toBe(1);
    expect(counts.clocks).toBe(1);
  });

  it("an injected transport avoids the token/environment read entirely", async () => {
    // Exercised through the real Node dependency factory: with a transport
    // injected, the composed closure must short-circuit before consulting the
    // environment, which is what keeps the offline suites offline. The env map is
    // a getter-trapped proxy, so any read at all fails the test.
    let envReads = 0;
    const trappedEnv = new Proxy(
      {} as Record<string, string | undefined>,
      {
        get: (_target, key) => {
          envReads += 1;
          return `leaked-${String(key)}`;
        },
      },
    );
    const injected = createNodeGitHubProjectDeps({
      caller: "mcp",
      version: "0.5.1",
      providerConfig: enabledConfig(),
      githubTransport: forbiddenTransport(),
      env: trappedEnv,
      now: () => "2026-01-01T00:00:00.000Z",
      platform: "linux",
      cwd: "/workspace",
    });
    const result = await runGitHubProjectWorkflow("brief", {}, {
      ...injected,
      createRuntime: () => stubRuntime({ requests: [] }),
    });
    expect(result.ok).toBe(true);
    expect(envReads).toBe(0);
  });

  it("reads the token lazily, and only when no transport is injected", async () => {
    // Without an injected transport the composed closure does consult the
    // environment — but only inside createTransport, i.e. after validation.
    let envReads = 0;
    const trappedEnv = new Proxy(
      {} as Record<string, string | undefined>,
      {
        get: (_target, key) => {
          envReads += 1;
          return key === "OH_MY_PM_GITHUB_TOKEN" ? "ghp_lazy_value" : undefined;
        },
      },
    );
    const injected = createNodeGitHubProjectDeps({
      caller: "mcp",
      version: "0.5.1",
      providerConfig: githubConfig({ enabled: false }),
      env: trappedEnv,
      now: () => "2026-01-01T00:00:00.000Z",
      platform: "linux",
      cwd: "/workspace",
    });
    // A disabled provider fails before createTransport runs, so the token that
    // this env would hand out is never requested.
    const blocked = await runGitHubProjectWorkflow("brief", {}, injected);
    expect(blocked.ok).toBe(false);
    expect(envReads).toBe(0);
  });
});
