// Pure, strict provider configuration schema and validator. No filesystem,
// environment, network, or clock access. The provider configuration is
// read-only: OH MY PM never writes it. The schema is deliberately minimal —
// only the local and GitHub providers exist in this phase, only GitHub is
// user-configurable, and no secret-bearing or transport-shaping fields are
// permitted. Repository grammar is delegated to the existing strict parser so
// there is exactly one owner/repository definition.

import { parseGitHubRepository } from "./github/query.js";

export const PROVIDER_CONFIG_VERSION = 1;
export const DEFAULT_GITHUB_PROVIDER_LIMIT = 50;
const GITHUB_PROVIDER_MIN_LIMIT = 1;
const GITHUB_PROVIDER_MAX_LIMIT = 100;

export type GitHubProviderConfig = {
  enabled: boolean;
  defaultRepository?: string;
  defaultLimit: number;
};

export type ResolvedProviderConfig = {
  version: 1;
  providers: {
    local: {
      enabled: true;
    };
    github: GitHubProviderConfig;
  };
};

export type ProviderConfigErrorCode =
  | "provider_config_not_object"
  | "provider_config_unknown_key"
  | "provider_config_secret_key"
  | "provider_config_invalid_version"
  | "provider_config_invalid_providers"
  | "provider_config_unknown_provider"
  | "provider_config_invalid_github"
  | "provider_config_unknown_github_key"
  | "provider_config_invalid_enabled"
  | "provider_config_invalid_repository"
  | "provider_config_invalid_limit";

export type ProviderConfigValidationResult =
  | { ok: true; config: ResolvedProviderConfig }
  | { ok: false; code: ProviderConfigErrorCode; message: string };

// Case-insensitive substrings that mark a key as secret-bearing. A key
// containing any of these is rejected outright, at every level, before any
// other check, so a token can never enter provider configuration.
const SECRET_KEY_MARKERS = [
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "apikey",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyIsSecret(key: string): boolean {
  const lowered = key.toLowerCase();
  return SECRET_KEY_MARKERS.some((marker) => lowered.includes(marker));
}

/** The default resolved configuration used when no file is present. */
export function defaultProviderConfig(): ResolvedProviderConfig {
  return {
    version: PROVIDER_CONFIG_VERSION,
    providers: {
      local: { enabled: true },
      github: {
        enabled: true,
        defaultLimit: DEFAULT_GITHUB_PROVIDER_LIMIT,
      },
    },
  };
}

function fail(
  code: ProviderConfigErrorCode,
  message: string,
): { ok: false; code: ProviderConfigErrorCode; message: string } {
  return { ok: false, code, message };
}

/** Reject any secret-bearing key present on a record. */
function rejectSecretKeys(
  record: Record<string, unknown>,
): { ok: false; code: ProviderConfigErrorCode; message: string } | null {
  for (const key of Object.keys(record)) {
    if (keyIsSecret(key)) {
      return fail(
        "provider_config_secret_key",
        "provider configuration must not contain a secret-bearing key",
      );
    }
  }
  return null;
}

function validateGitHub(value: unknown): GitHubProviderConfig | { error: ProviderConfigValidationResult } {
  if (!isPlainObject(value)) {
    return { error: fail("provider_config_invalid_github", "providers.github must be an object") };
  }
  const secret = rejectSecretKeys(value);
  if (secret !== null) return { error: secret };

  const allowedKeys = new Set(["enabled", "defaultRepository", "defaultLimit"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return {
        error: fail(
          "provider_config_unknown_github_key",
          "providers.github contains an unknown key",
        ),
      };
    }
  }

  let enabled = true;
  if ("enabled" in value && value["enabled"] !== undefined) {
    if (typeof value["enabled"] !== "boolean") {
      return {
        error: fail("provider_config_invalid_enabled", "providers.github.enabled must be a boolean"),
      };
    }
    enabled = value["enabled"];
  }

  let defaultRepository: string | undefined;
  if ("defaultRepository" in value && value["defaultRepository"] !== undefined) {
    const raw = value["defaultRepository"];
    if (typeof raw !== "string") {
      return {
        error: fail(
          "provider_config_invalid_repository",
          "providers.github.defaultRepository must be a string in owner/repository form",
        ),
      };
    }
    const parsed = parseGitHubRepository(raw);
    if (!parsed.ok) {
      return {
        error: fail(
          "provider_config_invalid_repository",
          "providers.github.defaultRepository must be a valid owner/repository identifier",
        ),
      };
    }
    defaultRepository = parsed.ref.slug;
  }

  let defaultLimit = DEFAULT_GITHUB_PROVIDER_LIMIT;
  if ("defaultLimit" in value && value["defaultLimit"] !== undefined) {
    const raw = value["defaultLimit"];
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < GITHUB_PROVIDER_MIN_LIMIT ||
      raw > GITHUB_PROVIDER_MAX_LIMIT
    ) {
      return {
        error: fail(
          "provider_config_invalid_limit",
          "providers.github.defaultLimit must be an integer in 1..100",
        ),
      };
    }
    defaultLimit = raw;
  }

  const config: GitHubProviderConfig = { enabled, defaultLimit };
  if (defaultRepository !== undefined) {
    config.defaultRepository = defaultRepository;
  }
  return config;
}

/**
 * Validate an arbitrary parsed JSON value against the provider configuration
 * schema. Pure and total: never throws, never touches the environment, and
 * never echoes raw JSON in its messages. On success it resolves the local
 * provider (always enabled) alongside the validated GitHub configuration.
 */
export function validateProviderConfig(value: unknown): ProviderConfigValidationResult {
  if (!isPlainObject(value)) {
    return fail("provider_config_not_object", "provider configuration must be a JSON object");
  }

  const secret = rejectSecretKeys(value);
  if (secret !== null) return secret;

  const allowedRootKeys = new Set(["version", "providers"]);
  for (const key of Object.keys(value)) {
    if (!allowedRootKeys.has(key)) {
      return fail("provider_config_unknown_key", "provider configuration contains an unknown key");
    }
  }

  if (value["version"] !== PROVIDER_CONFIG_VERSION) {
    return fail("provider_config_invalid_version", "provider configuration version must be 1");
  }

  const github: GitHubProviderConfig = {
    enabled: true,
    defaultLimit: DEFAULT_GITHUB_PROVIDER_LIMIT,
  };

  if ("providers" in value && value["providers"] !== undefined) {
    const providers = value["providers"];
    if (!isPlainObject(providers)) {
      return fail("provider_config_invalid_providers", "providers must be an object");
    }
    const secretProviders = rejectSecretKeys(providers);
    if (secretProviders !== null) return secretProviders;

    const allowedProviders = new Set(["github"]);
    for (const key of Object.keys(providers)) {
      if (!allowedProviders.has(key)) {
        return fail(
          "provider_config_unknown_provider",
          "providers may only configure the github provider",
        );
      }
    }

    if ("github" in providers && providers["github"] !== undefined) {
      const result = validateGitHub(providers["github"]);
      if ("error" in result) return result.error;
      github.enabled = result.enabled;
      github.defaultLimit = result.defaultLimit;
      if (result.defaultRepository !== undefined) {
        github.defaultRepository = result.defaultRepository;
      }
    }
  }

  return {
    ok: true,
    config: {
      version: PROVIDER_CONFIG_VERSION,
      providers: {
        local: { enabled: true },
        github,
      },
    },
  };
}
