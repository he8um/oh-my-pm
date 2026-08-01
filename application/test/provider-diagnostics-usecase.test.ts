// Provider diagnostics use cases: offline-by-default, explicit network consent,
// and token-presence-without-value reporting.

import { describe, expect, it } from "vitest";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import type { GitHubHttpTransport, ResolvedProviderConfig } from "@oh-my-pm/providers";
import { getProviderStatus, runProviderDoctor } from "../src/index.js";
import type { ProviderDiagnosticsDeps } from "../src/index.js";

const TOKEN = "ghp_never_appears_in_a_report";

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

function deps(over: Partial<ProviderDiagnosticsDeps> = {}): ProviderDiagnosticsDeps {
  return {
    resolveProviderConfig: () => ({
      config: enabledConfig(),
      ok: true,
      source: "defaults",
      exists: false,
      displayPath: "defaults",
    }),
    readToken: () => undefined,
    nodeVersion: () => "v20.11.0",
    kernelConfigured: () => true,
    version: "0.5.1",
    createTransport: () => {
      throw new Error("no transport must be constructed offline");
    },
    ...over,
  };
}

describe("provider status", () => {
  it("is offline and reports the resolved display path", () => {
    const result = getProviderStatus(deps());
    expect(result.ok).toBe(true);
    expect(result.report.config.displayPath).toBe("defaults");
  });

  it("reports an invalid configuration as not ok", () => {
    const result = getProviderStatus(
      deps({
        resolveProviderConfig: () => ({
          config: defaultProviderConfig(),
          ok: false,
          message: "config is not valid JSON",
          source: "explicit",
          exists: true,
          displayPath: "./providers.json",
        }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.report.config.displayPath).toBe("./providers.json");
  });

  it("reports token presence but never the token value", () => {
    const result = getProviderStatus(deps({ readToken: () => TOKEN }));
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).toContain("present");
  });
});

describe("provider doctor", () => {
  it("runs offline checks and attempts no network without confirmation", async () => {
    const result = await runProviderDoctor({ confirmNetwork: false }, deps());
    expect(result.report.networkAttempted).toBeFalsy();
    expect(result.report.checks.length).toBeGreaterThan(0);
  });

  it("attempts no network for a non-github provider even when confirmed", async () => {
    const result = await runProviderDoctor({ confirmNetwork: true }, deps());
    expect(result.report.networkAttempted).toBeFalsy();
  });

  it("fails closed on an invalid configuration without touching the network", async () => {
    const result = await runProviderDoctor(
      { confirmNetwork: true, provider: "github" },
      deps({
        resolveProviderConfig: () => ({
          config: defaultProviderConfig(),
          ok: false,
          message: "config could not be read",
          source: "explicit",
          exists: true,
          displayPath: "./providers.json",
        }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.report.networkAttempted).toBeFalsy();
  });

  it("performs exactly one read-only request when explicitly confirmed", async () => {
    let requests = 0;
    const transport: GitHubHttpTransport = {
      request: async () => {
        requests += 1;
        return { status: 200, headers: {}, body: { full_name: "he8um/oh-my-pm" } };
      },
    };

    const result = await runProviderDoctor(
      { confirmNetwork: true, provider: "github" },
      deps({ transport }),
    );
    expect(requests).toBe(1);
    expect(result.report.networkAttempted).toBe(true);
    expect(result.report.github?.access).toBe("ok");
  });

  it("records a failed network check without leaking the token", async () => {
    const transport: GitHubHttpTransport = {
      request: async () => ({ status: 403, headers: {}, body: { message: "Forbidden" } }),
    };

    const result = await runProviderDoctor(
      { confirmNetwork: true, provider: "github" },
      deps({ transport, readToken: () => TOKEN }),
    );
    expect(result.ok).toBe(false);
    expect(result.report.github?.access).toBe("failed");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
