import { describe, expect, it } from "vitest";
import {
  GITHUB_DEFAULT_LIMIT,
  GITHUB_MAX_LIMIT,
  GITHUB_MIN_LIMIT,
} from "../src/github/constants.js";
import {
  DEFAULT_GITHUB_PROVIDER_LIMIT,
  PROVIDER_CONFIG_VERSION,
  defaultProviderConfig,
  validateProviderConfig,
} from "../src/config.js";

describe("defaultProviderConfig", () => {
  it("returns local enabled and github enabled with the default limit", () => {
    const config = defaultProviderConfig();
    expect(config).toStrictEqual({
      version: 1,
      providers: {
        local: { enabled: true },
        github: { enabled: true, defaultLimit: 50, defaultSource: "overview", defaultState: "open" },
      },
    });
  });

  it("exposes stable constants", () => {
    expect(PROVIDER_CONFIG_VERSION).toBe(1);
    expect(DEFAULT_GITHUB_PROVIDER_LIMIT).toBe(50);
  });
});

describe("canonical GitHub list-limit constants (F-DUP-1)", () => {
  it("holds the expected values", () => {
    expect(GITHUB_MIN_LIMIT).toBe(1);
    expect(GITHUB_DEFAULT_LIMIT).toBe(50);
    expect(GITHUB_MAX_LIMIT).toBe(100);
  });

  it("the provider-config default alias resolves to the canonical default", () => {
    expect(DEFAULT_GITHUB_PROVIDER_LIMIT).toBe(GITHUB_DEFAULT_LIMIT);
  });
});

describe("validateProviderConfig — limit boundary matrix", () => {
  const withLimit = (defaultLimit: unknown) =>
    validateProviderConfig({ version: 1, providers: { github: { enabled: true, defaultLimit } } });

  it("accepts the minimum (1) and maximum (100) list limits", () => {
    for (const limit of [GITHUB_MIN_LIMIT, GITHUB_MAX_LIMIT]) {
      const result = withLimit(limit);
      expect(result.ok, String(limit)).toBe(true);
      if (result.ok) expect(result.config.providers.github?.defaultLimit).toBe(limit);
    }
  });

  it("rejects just below the minimum (0) and just above the maximum (101)", () => {
    for (const limit of [0, 101]) {
      const result = withLimit(limit);
      expect(result.ok, String(limit)).toBe(false);
      if (!result.ok) expect(result.code).toBe("provider_config_invalid_limit");
    }
  });

  it("keeps the default at 50 when no limit is configured", () => {
    expect(defaultProviderConfig().providers.github?.defaultLimit).toBe(50);
  });
});

describe("validateProviderConfig — valid", () => {
  it("accepts a bare version-only config", () => {
    const result = validateProviderConfig({ version: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providers.github).toStrictEqual({ enabled: true, defaultLimit: 50, defaultSource: "overview", defaultState: "open" });
      expect(result.config.providers.local).toStrictEqual({ enabled: true });
    }
  });

  it("accepts a minimal github config", () => {
    const result = validateProviderConfig({
      version: 1,
      providers: { github: { enabled: true } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providers.github).toStrictEqual({ enabled: true, defaultLimit: 50, defaultSource: "overview", defaultState: "open" });
    }
  });

  it("accepts a full github config and normalizes the repository slug", () => {
    const result = validateProviderConfig({
      version: 1,
      providers: {
        github: { enabled: true, defaultRepository: "he8um/oh-my-pm", defaultLimit: 25 },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providers.github).toStrictEqual({
        enabled: true,
        defaultRepository: "he8um/oh-my-pm",
        defaultLimit: 25,
        defaultSource: "overview",
        defaultState: "open",
      });
    }
  });

  it("accepts a disabled github provider", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { enabled: false } } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.providers.github.enabled).toBe(false);
  });

  it("defaults enabled to true when omitted", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { defaultLimit: 10 } } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.providers.github.enabled).toBe(true);
  });

  it("defaults source to overview and state to open when omitted", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: {} } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providers.github.defaultSource).toBe("overview");
      expect(result.config.providers.github.defaultState).toBe("open");
    }
  });

  it("accepts each configurable default source", () => {
    for (const source of ["overview", "repository", "issues", "pull-requests"] as const) {
      const result = validateProviderConfig({
        version: 1,
        providers: { github: { defaultSource: source } },
      });
      expect(result.ok, source).toBe(true);
      if (result.ok) expect(result.config.providers.github.defaultSource).toBe(source);
    }
  });

  it("accepts each default state", () => {
    for (const state of ["open", "closed", "all"] as const) {
      const result = validateProviderConfig({
        version: 1,
        providers: { github: { defaultState: state } },
      });
      expect(result.ok, state).toBe(true);
      if (result.ok) expect(result.config.providers.github.defaultState).toBe(state);
    }
  });
});

describe("validateProviderConfig — invalid source/state", () => {
  it("rejects item as a default source", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { defaultSource: "item" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_source");
  });

  it("rejects search as a default source", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { defaultSource: "search" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_source");
  });

  it("rejects an unknown default source", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { defaultSource: "pr" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_source");
  });

  it("rejects an invalid default state", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { defaultState: "merged" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_state");
  });
});

describe("validateProviderConfig — invalid", () => {
  it("rejects a non-object root", () => {
    for (const value of [null, 42, "x", [1], true]) {
      const result = validateProviderConfig(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("provider_config_not_object");
    }
  });

  it("rejects an invalid version", () => {
    for (const version of [0, 2, "1", 1.5, null]) {
      const result = validateProviderConfig({ version });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("provider_config_invalid_version");
    }
  });

  it("rejects an unknown root key", () => {
    const result = validateProviderConfig({ version: 1, extra: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_unknown_key");
  });

  it("rejects an unknown provider", () => {
    const result = validateProviderConfig({ version: 1, providers: { gitlab: {} } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_unknown_provider");
  });

  it("rejects a local provider key (not user-configurable)", () => {
    const result = validateProviderConfig({ version: 1, providers: { local: { enabled: true } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_unknown_provider");
  });

  it("rejects providers as an array", () => {
    const result = validateProviderConfig({ version: 1, providers: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_providers");
  });

  it("rejects github as an array", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: [] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_github");
  });

  it("rejects an unknown github key", () => {
    const result = validateProviderConfig({
      version: 1,
      providers: { github: { enabled: true, origin: "https://example.com" } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_unknown_github_key");
  });

  it("rejects transport-shaping keys", () => {
    for (const key of ["apiVersion", "method", "headers", "timeout", "redirect", "host"]) {
      const result = validateProviderConfig({
        version: 1,
        providers: { github: { [key]: "x" } },
      });
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.code, key).toBe("provider_config_unknown_github_key");
    }
  });

  it("rejects an invalid enabled type", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { enabled: "yes" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_enabled");
  });

  it("rejects an invalid repository", () => {
    for (const repo of ["not a repo", "owner", "owner/repo/extra", "https://github.com/a/b", 42]) {
      const result = validateProviderConfig({
        version: 1,
        providers: { github: { defaultRepository: repo } },
      });
      expect(result.ok, String(repo)).toBe(false);
      if (!result.ok) expect(result.code, String(repo)).toBe("provider_config_invalid_repository");
    }
  });

  it("rejects an invalid limit", () => {
    for (const limit of [0, 101, -1, 1.5, "50", null]) {
      const result = validateProviderConfig({
        version: 1,
        providers: { github: { defaultLimit: limit } },
      });
      expect(result.ok, String(limit)).toBe(false);
      if (!result.ok) expect(result.code, String(limit)).toBe("provider_config_invalid_limit");
    }
  });
});

describe("validateProviderConfig — secret rejection", () => {
  it("rejects secret-bearing keys at the root", () => {
    for (const key of ["token", "secret", "password", "authorization", "cookie", "apiKey"]) {
      const result = validateProviderConfig({ version: 1, [key]: "value" });
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.code, key).toBe("provider_config_secret_key");
    }
  });

  it("rejects secret-bearing keys inside providers", () => {
    const result = validateProviderConfig({ version: 1, providers: { githubToken: "x" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_secret_key");
  });

  it("rejects secret-bearing keys inside the github object", () => {
    for (const key of ["token", "accessToken", "apiKey", "Authorization"]) {
      const result = validateProviderConfig({
        version: 1,
        providers: { github: { [key]: "x" } },
      });
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.code, key).toBe("provider_config_secret_key");
    }
  });

  it("is case-insensitive for secret markers", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { TOKEN: "x" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_secret_key");
  });

  it("never echoes raw JSON in the message", () => {
    const result = validateProviderConfig({ version: 1, providers: { github: { token: "sekret-abc" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("sekret-abc");
  });
});

describe("validateProviderConfig — purity", () => {
  it("does not mutate the input", () => {
    const input = { version: 1, providers: { github: { enabled: true, defaultLimit: 30 } } };
    const snapshot = JSON.stringify(input);
    validateProviderConfig(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("returns deep-equal results for repeated calls", () => {
    const input = { version: 1, providers: { github: { defaultRepository: "a/b", defaultLimit: 20 } } };
    const a = validateProviderConfig(input);
    const b = validateProviderConfig(input);
    expect(a).toStrictEqual(b);
  });
});
