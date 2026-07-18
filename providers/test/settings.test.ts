import { describe, expect, it } from "vitest";
import { defaultProviderConfig } from "../src/config.js";
import type { ResolvedProviderConfig } from "../src/config.js";
import { resolveGitHubProviderSettings } from "../src/settings.js";

function configWith(github: Partial<ResolvedProviderConfig["providers"]["github"]>): ResolvedProviderConfig {
  const base = defaultProviderConfig();
  return {
    ...base,
    providers: {
      local: { enabled: true },
      github: { ...base.providers.github, ...github },
    },
  };
}

describe("resolveGitHubProviderSettings — repository precedence", () => {
  it("uses the explicit override over config", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ defaultRepository: "config/repo" }),
      overrides: { repository: "explicit/repo" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repository).toBe("explicit/repo");
      expect(result.repositorySource).toBe("explicit");
    }
  });

  it("falls back to config default repository", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ defaultRepository: "config/repo" }),
      overrides: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repository).toBe("config/repo");
      expect(result.repositorySource).toBe("config");
    }
  });

  it("errors when no repository is resolvable", () => {
    const result = resolveGitHubProviderSettings({ config: configWith({}), overrides: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_repository_required");
  });

  it("does not fall back to config when explicit repository is invalid", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ defaultRepository: "config/repo" }),
      overrides: { repository: "not a repo" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_repository_invalid");
  });
});

describe("resolveGitHubProviderSettings — limit precedence", () => {
  it("uses the explicit override over config", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ defaultRepository: "a/b", defaultLimit: 30 }),
      overrides: { limit: 15 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limit).toBe(15);
      expect(result.limitSource).toBe("explicit");
    }
  });

  it("uses config default limit when it differs from the schema default", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ defaultRepository: "a/b", defaultLimit: 30 }),
      overrides: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limit).toBe(30);
      expect(result.limitSource).toBe("config");
    }
  });

  it("reports the default source when the config limit equals the schema default", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ defaultRepository: "a/b" }),
      overrides: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limit).toBe(50);
      expect(result.limitSource).toBe("default");
    }
  });

  it("does not fall back to config when explicit limit is invalid", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ defaultRepository: "a/b", defaultLimit: 30 }),
      overrides: { limit: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_limit_invalid");
  });

  it("fails closed on an injected malformed config limit", () => {
    const config = configWith({ defaultRepository: "a/b" });
    (config.providers.github as { defaultLimit: number }).defaultLimit = 999;
    const result = resolveGitHubProviderSettings({ config, overrides: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_limit_invalid");
  });
});

describe("resolveGitHubProviderSettings — disabled", () => {
  it("blocks a disabled provider before any resolution", () => {
    const result = resolveGitHubProviderSettings({
      config: configWith({ enabled: false, defaultRepository: "a/b" }),
      overrides: { repository: "c/d" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("github_provider_disabled");
  });
});

describe("resolveGitHubProviderSettings — purity", () => {
  it("does not include token state and is deterministic", () => {
    const config = configWith({ defaultRepository: "a/b", defaultLimit: 20 });
    const a = resolveGitHubProviderSettings({ config, overrides: { repository: "c/d" } });
    const b = resolveGitHubProviderSettings({ config, overrides: { repository: "c/d" } });
    expect(a).toStrictEqual(b);
    expect(JSON.stringify(a)).not.toContain("token");
  });
});
