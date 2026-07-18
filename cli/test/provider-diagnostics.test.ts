import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import type { ResolvedProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import {
  GITHUB_FIXED_API_VERSION,
  GITHUB_FIXED_METHOD,
  GITHUB_FIXED_ORIGIN,
  buildOfflineDoctorReport,
  buildProviderStatusReport,
  runGitHubProviderNetworkDiagnostic,
  tokenPresence,
} from "../src/provider-diagnostics.js";

function configWith(github: Partial<ResolvedProviderConfig["providers"]["github"]>): ResolvedProviderConfig {
  const base = defaultProviderConfig();
  return {
    ...base,
    providers: { local: { enabled: true }, github: { ...base.providers.github, ...github } },
  };
}

describe("tokenPresence", () => {
  it("treats whitespace-only as absent", () => {
    expect(tokenPresence("   ")).toBe("absent");
    expect(tokenPresence(undefined)).toBe("absent");
    expect(tokenPresence("x")).toBe("present");
  });
});

describe("buildProviderStatusReport", () => {
  it("reports local ready/offline and github states", () => {
    const report = buildProviderStatusReport({
      config: configWith({ defaultRepository: "a/b" }),
      configSource: "defaults",
      configExists: false,
      configValid: true,
      token: undefined,
    });
    const local = report.providers.find((p) => p.id === "local");
    const github = report.providers.find((p) => p.id === "github");
    expect(local).toMatchObject({ state: "ready", network: "none", token: "not-applicable" });
    expect(github).toMatchObject({ state: "ready", network: "explicit-opt-in", token: "absent" });
  });

  it("reports needs-repository when no default repository is configured", () => {
    const report = buildProviderStatusReport({
      config: configWith({}),
      configSource: "defaults",
      configExists: false,
      configValid: true,
      token: undefined,
    });
    expect(report.providers.find((p) => p.id === "github")?.state).toBe("needs-repository");
  });

  it("reports disabled when github is disabled", () => {
    const report = buildProviderStatusReport({
      config: configWith({ enabled: false }),
      configSource: "defaults",
      configExists: false,
      configValid: true,
      token: undefined,
    });
    expect(report.providers.find((p) => p.id === "github")?.state).toBe("disabled");
  });

  it("reports token present without exposing the value", () => {
    const report = buildProviderStatusReport({
      config: configWith({ defaultRepository: "a/b" }),
      configSource: "defaults",
      configExists: false,
      configValid: true,
      token: "ghp_secretvalue",
    });
    expect(report.providers.find((p) => p.id === "github")?.token).toBe("present");
    expect(JSON.stringify(report)).not.toContain("ghp_secretvalue");
  });
});

describe("buildOfflineDoctorReport", () => {
  const base = {
    configLoaded: true,
    configValid: true,
    config: configWith({ defaultRepository: "a/b", defaultLimit: 25 }),
    token: undefined as string | undefined,
    nodeVersion: "20.0.0",
    kernelConfigured: true,
  };

  it("emits the fixed-order offline checks with no network", () => {
    const report = buildOfflineDoctorReport(base);
    expect(report.networkAttempted).toBe(false);
    const ids = report.checks.map((c) => c.id);
    expect(ids).toStrictEqual([
      "config.load",
      "config.schema",
      "provider.local.enabled",
      "provider.local.offline",
      "provider.github.enabled",
      "provider.github.repository",
      "provider.github.limit",
      "provider.github.origin",
      "provider.github.api-version",
      "provider.github.method",
      "provider.github.token",
      "runtime.node-version",
      "runtime.kernel",
    ]);
  });

  it("asserts the fixed GitHub boundary constants", () => {
    const report = buildOfflineDoctorReport(base);
    const origin = report.checks.find((c) => c.id === "provider.github.origin");
    const apiVersion = report.checks.find((c) => c.id === "provider.github.api-version");
    const method = report.checks.find((c) => c.id === "provider.github.method");
    expect(origin?.message).toContain(GITHUB_FIXED_ORIGIN);
    expect(origin?.message).toContain("https://api.github.com");
    expect(apiVersion?.message).toContain(GITHUB_FIXED_API_VERSION);
    expect(method?.message).toContain("GET-only");
    expect(GITHUB_FIXED_METHOD).toBe("GET");
  });

  it("token absence is info, not fail", () => {
    const report = buildOfflineDoctorReport(base);
    const token = report.checks.find((c) => c.id === "provider.github.token");
    expect(token?.status).toBe("info");
    expect(report.ok).toBe(true);
  });

  it("fails when the kernel is unavailable", () => {
    const report = buildOfflineDoctorReport({ ...base, kernelConfigured: false });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "runtime.kernel")?.status).toBe("fail");
  });

  it("contains no timestamps, durations, or absolute paths", () => {
    const report = buildOfflineDoctorReport(base);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(serialized).not.toMatch(/\/Users\/|\/home\//);
    expect(serialized).not.toContain("durationMs");
  });

  it("never includes a token value", () => {
    const report = buildOfflineDoctorReport({ ...base, token: "ghp_secret" });
    expect(JSON.stringify(report)).not.toContain("ghp_secret");
  });

  it("is deterministic for repeated calls", () => {
    expect(buildOfflineDoctorReport(base)).toStrictEqual(buildOfflineDoctorReport(base));
  });
});

const SLUG = "riverline/field-guide";
function countingTransport(response: GitHubHttpResponse): {
  transport: GitHubHttpTransport;
  calls: GitHubHttpRequest[];
} {
  const calls: GitHubHttpRequest[] = [];
  return {
    calls,
    transport: {
      async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
        calls.push(request);
        return response;
      },
    },
  };
}

describe("runGitHubProviderNetworkDiagnostic", () => {
  const repoBody = {
    id: 1,
    full_name: SLUG,
    name: "field-guide",
    owner: { login: "riverline" },
    html_url: `https://github.com/${SLUG}`,
    description: "sensitive description that must not leak",
    open_issues_count: 3,
  };

  it("makes exactly one request with limit 1 (no issue list) on success", async () => {
    const { transport, calls } = countingTransport({ status: 200, headers: {}, body: repoBody });
    const result = await runGitHubProviderNetworkDiagnostic({
      repository: SLUG,
      transport,
      productVersion: "0.0.0",
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe(`/repos/${SLUG}`);
    expect(calls[0]!.method).toBe("GET");
    expect(JSON.stringify(result)).not.toContain("sensitive description");
  });

  it("reports unauthenticated when no token is supplied", async () => {
    const { transport } = countingTransport({ status: 200, headers: {}, body: repoBody });
    const result = await runGitHubProviderNetworkDiagnostic({ repository: SLUG, transport, productVersion: "0.0.0" });
    if (result.ok) expect(result.authentication).toBe("unauthenticated");
  });

  it("reports token-present without leaking the token", async () => {
    const { transport } = countingTransport({ status: 200, headers: {}, body: repoBody });
    const result = await runGitHubProviderNetworkDiagnostic({
      repository: SLUG,
      token: "ghp_topsecret",
      transport,
      productVersion: "0.0.0",
    });
    if (result.ok) expect(result.authentication).toBe("token-present");
    expect(JSON.stringify(result)).not.toContain("ghp_topsecret");
  });

  it.each([
    [401, "OMP-P-4004"],
    [403, "OMP-P-4005"],
    [404, "OMP-P-4006"],
    [429, "OMP-P-4007"],
    [500, "OMP-P-4008"],
  ])("maps a %s response to %s with a sanitized message", async (status, code) => {
    const { transport, calls } = countingTransport({
      status,
      headers: {},
      body: { message: "raw provider detail that must not leak" },
    });
    const result = await runGitHubProviderNetworkDiagnostic({ repository: SLUG, transport, productVersion: "0.0.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.providerCode).toBe(code);
      expect(result.message).not.toContain("raw provider detail");
    }
    expect(calls).toHaveLength(1);
  });
});
