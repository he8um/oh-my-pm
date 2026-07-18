import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import type { ResolvedProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import {
  executeMcpGitHubProviderDiagnostics,
  executeMcpProviderStatus,
} from "./provider-diagnostics-runner.js";

const SLUG = "riverline/field-guide";

function configWith(github: Partial<ResolvedProviderConfig["providers"]["github"]>): ResolvedProviderConfig {
  const base = defaultProviderConfig();
  return {
    ...base,
    providers: { local: { enabled: true }, github: { ...base.providers.github, ...github } },
  };
}

function repoTransport(status = 200): { transport: GitHubHttpTransport; calls: GitHubHttpRequest[] } {
  const calls: GitHubHttpRequest[] = [];
  return {
    calls,
    transport: {
      async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
        calls.push(request);
        return {
          status,
          headers: {},
          body: status === 200 ? { full_name: SLUG, name: "field-guide", owner: { login: "riverline" } } : { message: "detail" },
        };
      },
    },
  };
}

describe("executeMcpProviderStatus", () => {
  it("is offline and reports configured defaults", () => {
    const report = executeMcpProviderStatus({
      providerConfig: configWith({ defaultRepository: SLUG, defaultLimit: 25 }),
    });
    expect(report.schemaVersion).toBe(1);
    const github = report.providers.find((p) => p.id === "github");
    expect(github?.defaultRepository).toBe(SLUG);
    expect(github?.defaultLimit).toBe(25);
    expect(github?.network).toBe("explicit-opt-in");
  });

  it("reports token presence only, never the value", () => {
    const report = executeMcpProviderStatus({
      providerConfig: defaultProviderConfig(),
      token: "ghp_secretstatus",
    });
    const github = report.providers.find((p) => p.id === "github");
    expect(github?.token).toBe("present");
    expect(JSON.stringify(report)).not.toContain("ghp_secretstatus");
  });
});

describe("executeMcpGitHubProviderDiagnostics — offline", () => {
  it("returns offline checks without touching the network by default", async () => {
    const { transport, calls } = repoTransport();
    const report = await executeMcpGitHubProviderDiagnostics(
      { repository: SLUG },
      { providerConfig: configWith({ defaultRepository: SLUG }), transport },
    );
    expect(report.networkAttempted).toBe(false);
    expect(calls).toHaveLength(0);
    expect(report.checks.some((c) => c.id === "provider.github.origin")).toBe(true);
  });

  it("treats confirmNetwork false the same as omitted", async () => {
    const { transport, calls } = repoTransport();
    const report = await executeMcpGitHubProviderDiagnostics(
      { repository: SLUG, confirmNetwork: false },
      { providerConfig: configWith({ defaultRepository: SLUG }), transport },
    );
    expect(report.networkAttempted).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("executeMcpGitHubProviderDiagnostics — network", () => {
  it("makes exactly one repository request when confirmNetwork is true", async () => {
    const { transport, calls } = repoTransport();
    const report = await executeMcpGitHubProviderDiagnostics(
      { repository: SLUG, confirmNetwork: true },
      { providerConfig: configWith({ defaultRepository: SLUG }), transport },
    );
    expect(report.networkAttempted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe(`/repos/${SLUG}`);
    expect(report.github?.access).toBe("ok");
  });

  it("resolves the repository from configuration when omitted", async () => {
    const { transport, calls } = repoTransport();
    const report = await executeMcpGitHubProviderDiagnostics(
      { confirmNetwork: true },
      { providerConfig: configWith({ defaultRepository: SLUG }), transport },
    );
    expect(calls).toHaveLength(1);
    expect(report.github?.repository).toBe(SLUG);
  });

  it("maps a sanitized 404 failure", async () => {
    const { transport } = repoTransport(404);
    const report = await executeMcpGitHubProviderDiagnostics(
      { repository: SLUG, confirmNetwork: true },
      { providerConfig: configWith({ defaultRepository: SLUG }), transport },
    );
    expect(report.ok).toBe(false);
    expect(report.github?.access).toBe("failed");
    expect(report.github?.providerCode).toBe("OMP-P-4006");
    expect(JSON.stringify(report)).not.toContain("detail");
  });

  it("blocks a disabled provider before any request", async () => {
    const { transport, calls } = repoTransport();
    const report = await executeMcpGitHubProviderDiagnostics(
      { repository: SLUG, confirmNetwork: true },
      { providerConfig: configWith({ enabled: false, defaultRepository: SLUG }), transport },
    );
    expect(calls).toHaveLength(0);
    expect(report.ok).toBe(false);
  });

  it("never leaks a token value", async () => {
    const { transport } = repoTransport();
    const report = await executeMcpGitHubProviderDiagnostics(
      { repository: SLUG, confirmNetwork: true },
      { providerConfig: configWith({ defaultRepository: SLUG }), transport, token: "ghp_secretdiag" },
    );
    expect(JSON.stringify(report)).not.toContain("ghp_secretdiag");
    expect(report.github?.authentication).toBe("token-present");
  });
});
