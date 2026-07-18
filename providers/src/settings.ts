// Pure resolver for effective GitHub provider settings. Combines validated
// provider configuration with explicit per-command/per-tool overrides,
// applying a fixed precedence. No environment, filesystem, network, or clock
// access. Token state is never part of effective settings. Explicit invalid
// overrides fail closed and never silently fall back to configuration.

import {
  DEFAULT_GITHUB_PROVIDER_LIMIT,
  DEFAULT_GITHUB_PROVIDER_SOURCE,
  DEFAULT_GITHUB_PROVIDER_STATE,
} from "./config.js";
import type { ResolvedProviderConfig } from "./config.js";
import { parseGitHubRepository } from "./github/query.js";
import type { GitHubConfigurableSource, GitHubSourceState } from "./github/selection.js";

const GITHUB_PROVIDER_MIN_LIMIT = 1;
const GITHUB_PROVIDER_MAX_LIMIT = 100;

export type GitHubProviderOverrides = {
  repository?: string;
  limit?: number;
  source?: GitHubConfigurableSource;
  state?: GitHubSourceState;
};

export type EffectiveGitHubProviderSettingsResult =
  | {
      ok: true;
      enabled: true;
      repository: string;
      limit: number;
      defaultSource: GitHubConfigurableSource;
      defaultState: GitHubSourceState;
      repositorySource: "explicit" | "config";
      limitSource: "explicit" | "config" | "default";
      sourceSource: "explicit" | "config" | "default";
      stateSource: "explicit" | "config" | "default";
    }
  | {
      ok: false;
      code:
        | "github_provider_disabled"
        | "github_repository_required"
        | "github_repository_invalid"
        | "github_limit_invalid";
      message: string;
    };

/**
 * Resolve the effective repository and limit for a GitHub workflow.
 *
 * Precedence:
 *   repository: explicit override > config.defaultRepository > error
 *   limit:      explicit override > config.defaultLimit      > 50
 *
 * A disabled GitHub provider is rejected first, before any repository/limit
 * resolution, so no transport is ever constructed. Config values are already
 * validated, but this resolver still validates them defensively so injected
 * malformed data in tests fails closed.
 */
export function resolveGitHubProviderSettings(input: {
  config: ResolvedProviderConfig;
  overrides: GitHubProviderOverrides;
}): EffectiveGitHubProviderSettingsResult {
  const github = input.config.providers.github;
  if (!github.enabled) {
    return {
      ok: false,
      code: "github_provider_disabled",
      message: "the github provider is disabled in provider configuration",
    };
  }

  // Repository: explicit override wins and must be valid on its own; an invalid
  // explicit value never falls back to configuration.
  let repository: string;
  let repositorySource: "explicit" | "config";
  if (input.overrides.repository !== undefined) {
    const parsed = parseGitHubRepository(input.overrides.repository);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "github_repository_invalid",
        message: "repository must be a valid owner/repository identifier",
      };
    }
    repository = parsed.ref.slug;
    repositorySource = "explicit";
  } else if (github.defaultRepository !== undefined) {
    const parsed = parseGitHubRepository(github.defaultRepository);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "github_repository_invalid",
        message: "configured default repository is not a valid owner/repository identifier",
      };
    }
    repository = parsed.ref.slug;
    repositorySource = "config";
  } else {
    return {
      ok: false,
      code: "github_repository_required",
      message: "a repository is required; supply one or set providers.github.defaultRepository",
    };
  }

  // Limit: explicit override wins and must be valid on its own; an invalid
  // explicit value never falls back to configuration. Without an override the
  // value comes from the resolved config: "config" when it differs from the
  // schema default, "default" when it equals it.
  let limit: number;
  let limitSource: "explicit" | "config" | "default";
  if (input.overrides.limit !== undefined) {
    if (!isValidLimit(input.overrides.limit)) {
      return {
        ok: false,
        code: "github_limit_invalid",
        message: "limit must be an integer in 1..100",
      };
    }
    limit = input.overrides.limit;
    limitSource = "explicit";
  } else {
    if (!isValidLimit(github.defaultLimit)) {
      return {
        ok: false,
        code: "github_limit_invalid",
        message: "configured default limit is not an integer in 1..100",
      };
    }
    limit = github.defaultLimit;
    limitSource = github.defaultLimit === DEFAULT_GITHUB_PROVIDER_LIMIT ? "default" : "config";
  }

  // Source: explicit override wins; otherwise the configured default, reported
  // as "config" when it differs from the schema default and "default" otherwise.
  let defaultSource: GitHubConfigurableSource;
  let sourceSource: "explicit" | "config" | "default";
  if (input.overrides.source !== undefined) {
    defaultSource = input.overrides.source;
    sourceSource = "explicit";
  } else {
    defaultSource = github.defaultSource;
    sourceSource = github.defaultSource === DEFAULT_GITHUB_PROVIDER_SOURCE ? "default" : "config";
  }

  let defaultState: GitHubSourceState;
  let stateSource: "explicit" | "config" | "default";
  if (input.overrides.state !== undefined) {
    defaultState = input.overrides.state;
    stateSource = "explicit";
  } else {
    defaultState = github.defaultState;
    stateSource = github.defaultState === DEFAULT_GITHUB_PROVIDER_STATE ? "default" : "config";
  }

  return {
    ok: true,
    enabled: true,
    repository,
    limit,
    defaultSource,
    defaultState,
    repositorySource,
    limitSource,
    sourceSource,
    stateSource,
  };
}

function isValidLimit(value: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= GITHUB_PROVIDER_MIN_LIMIT &&
    value <= GITHUB_PROVIDER_MAX_LIMIT
  );
}
