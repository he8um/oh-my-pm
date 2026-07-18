// Provider diagnostics: a pure offline diagnostic model plus one narrowly
// scoped optional network diagnostic. The offline model reads only already
// resolved inputs (no filesystem, environment, or clock). The network function
// performs exactly one read-only repository-metadata GET, only when the caller
// explicitly opts in. No timestamps, durations, hostnames, usernames, absolute
// paths, token values, raw config text, or raw provider bodies ever appear in
// any report.

import {
  GITHUB_API_ORIGIN,
  GITHUB_API_VERSION,
  GITHUB_SEARCH_KINDS,
  GITHUB_SOURCE_MODES,
  GITHUB_SOURCE_STATES,
  createGitHubProvider,
  resolveGitHubProviderSettings,
} from "@oh-my-pm/providers";
import type {
  GitHubConfigurableSource,
  GitHubHttpTransport,
  GitHubSearchKind,
  GitHubSourceMode,
  GitHubSourceState,
  ResolvedProviderConfig,
} from "@oh-my-pm/providers";
import type { ProviderConfigSource } from "./provider-config.js";

export type ProviderDiagnosticStatus = "ok" | "info" | "warning" | "fail";

export type ProviderDiagnosticCheck = {
  id: string;
  status: ProviderDiagnosticStatus;
  message: string;
};

export type ProviderTokenState = "not-applicable" | "present" | "absent";

export type ProviderStatusReport = {
  schemaVersion: 1;
  config: {
    source: ProviderConfigSource;
    exists: boolean;
    displayPath: string;
    valid: boolean;
  };
  providers: Array<{
    id: "local" | "github";
    enabled: boolean;
    readOnly: true;
    network: "none" | "explicit-opt-in";
    state: "ready" | "disabled" | "needs-repository";
    defaultRepository?: string;
    defaultLimit?: number;
    defaultSource?: GitHubConfigurableSource;
    defaultState?: GitHubSourceState;
    token: ProviderTokenState;
    sourceSelection?: GitHubSourceSelectionCapability;
  }>;
};

/** Fixed, offline description of the GitHub source-selection capability. */
export type GitHubSourceSelectionCapability = {
  defaultSource: GitHubConfigurableSource;
  defaultState: GitHubSourceState;
  modes: readonly GitHubSourceMode[];
  states: readonly GitHubSourceState[];
  searchKinds: readonly GitHubSearchKind[];
  singleItemFetch: true;
  singlePage: true;
  comments: false;
  timelines: false;
  pullRequestFiles: false;
};

export type ProviderDoctorReport = {
  schemaVersion: 1;
  ok: boolean;
  networkAttempted: boolean;
  checks: ProviderDiagnosticCheck[];
  github?: {
    repository?: string;
    limit?: number;
    authentication: "token-present" | "unauthenticated";
    access?: "ok" | "failed" | "not-checked";
    providerCode?: string;
  };
};

/** The fixed GitHub boundary. Never inferred from user configuration. */
export const GITHUB_FIXED_ORIGIN = GITHUB_API_ORIGIN;
export const GITHUB_FIXED_API_VERSION = GITHUB_API_VERSION;
export const GITHUB_FIXED_METHOD = "GET";

/** The fixed, offline GitHub source-selection capability description. */
export function githubSourceSelectionCapability(
  defaultSource: GitHubConfigurableSource,
  defaultState: GitHubSourceState,
): GitHubSourceSelectionCapability {
  return {
    defaultSource,
    defaultState,
    modes: GITHUB_SOURCE_MODES,
    states: GITHUB_SOURCE_STATES,
    searchKinds: GITHUB_SEARCH_KINDS,
    singleItemFetch: true,
    singlePage: true,
    comments: false,
    timelines: false,
    pullRequestFiles: false,
  };
}

/** A whitespace-only token is treated as absent. */
export function tokenPresence(token: string | undefined): "present" | "absent" {
  if (typeof token !== "string") return "absent";
  return token.trim() === "" ? "absent" : "present";
}

export type ProviderStatusInput = {
  config: ResolvedProviderConfig;
  configSource: ProviderConfigSource;
  configExists: boolean;
  configValid: boolean;
  token: string | undefined;
};

/**
 * Build the offline provider status report. Pure: it derives everything from
 * the already-resolved configuration and the boolean token presence. It never
 * reports a token value and never accesses the network.
 */
export function buildProviderStatusReport(input: ProviderStatusInput): ProviderStatusReport {
  const github = input.config.providers.github;
  const githubState: "ready" | "disabled" | "needs-repository" = !github.enabled
    ? "disabled"
    : github.defaultRepository === undefined
      ? "needs-repository"
      : "ready";

  const githubEntry: ProviderStatusReport["providers"][number] = {
    id: "github",
    enabled: github.enabled,
    readOnly: true,
    network: "explicit-opt-in",
    state: githubState,
    defaultLimit: github.defaultLimit,
    defaultSource: github.defaultSource,
    defaultState: github.defaultState,
    token: tokenPresence(input.token),
    sourceSelection: githubSourceSelectionCapability(github.defaultSource, github.defaultState),
  };
  if (github.defaultRepository !== undefined) {
    githubEntry.defaultRepository = github.defaultRepository;
  }

  return {
    schemaVersion: 1,
    config: {
      source: input.configSource,
      exists: input.configExists,
      displayPath: "",
      valid: input.configValid,
    },
    providers: [
      {
        id: "local",
        enabled: true,
        readOnly: true,
        network: "none",
        state: "ready",
        token: "not-applicable",
      },
      githubEntry,
    ],
  };
}

export type OfflineDoctorInput = {
  configLoaded: boolean;
  configValid: boolean;
  configErrorMessage?: string;
  config: ResolvedProviderConfig;
  token: string | undefined;
  nodeVersion: string;
  kernelConfigured: boolean;
};

/**
 * Build the offline provider doctor checks in a fixed, deterministic order.
 * Pure: no network, no clock, no absolute paths, no token values. The GitHub
 * fixed-boundary checks assert the pinned origin/API version/method that are
 * never configurable — never inferred from user config.
 */
export function buildOfflineDoctorReport(input: OfflineDoctorInput): ProviderDoctorReport {
  const checks: ProviderDiagnosticCheck[] = [];
  const github = input.config.providers.github;

  checks.push({
    id: "config.load",
    status: input.configLoaded ? "ok" : "fail",
    message: input.configLoaded
      ? "provider configuration loaded"
      : "provider configuration could not be loaded",
  });
  checks.push({
    id: "config.schema",
    status: input.configValid ? "ok" : "fail",
    message: input.configValid
      ? "provider configuration is valid"
      : (input.configErrorMessage ?? "provider configuration is invalid"),
  });

  checks.push({
    id: "provider.local.enabled",
    status: "ok",
    message: "local provider is enabled",
  });
  checks.push({
    id: "provider.local.offline",
    status: "ok",
    message: "local provider is offline and read-only",
  });

  checks.push({
    id: "provider.github.enabled",
    status: github.enabled ? "ok" : "info",
    message: github.enabled
      ? "github provider is enabled"
      : "github provider is disabled in configuration",
  });
  checks.push({
    id: "provider.github.repository",
    status: github.defaultRepository !== undefined ? "ok" : "info",
    message:
      github.defaultRepository !== undefined
        ? "a default repository is configured"
        : "no default repository is configured; supply one per command",
  });
  checks.push({
    id: "provider.github.limit",
    status: "ok",
    message: `default limit is ${github.defaultLimit}`,
  });
  checks.push({
    id: "provider.github.origin",
    status: "ok",
    message: `fixed origin is ${GITHUB_FIXED_ORIGIN}`,
  });
  checks.push({
    id: "provider.github.api-version",
    status: "ok",
    message: `fixed API version is ${GITHUB_FIXED_API_VERSION}`,
  });
  checks.push({
    id: "provider.github.method",
    status: "ok",
    message: "requests are GET-only; write operations are unavailable",
  });
  checks.push({
    id: "provider.github.token",
    status: "info",
    message:
      tokenPresence(input.token) === "present"
        ? "a token is present"
        : "token is absent; public repositories may still work",
  });

  checks.push({
    id: "runtime.node-version",
    status: "ok",
    message: `node version is ${input.nodeVersion}`,
  });
  checks.push({
    id: "runtime.kernel",
    status: input.kernelConfigured ? "ok" : "fail",
    message: input.kernelConfigured
      ? "kernel binding is configured"
      : "kernel binding is unavailable",
  });

  const ok = checks.every((check) => check.status !== "fail");
  return {
    schemaVersion: 1,
    ok,
    networkAttempted: false,
    checks,
    github: {
      authentication: tokenPresence(input.token) === "present" ? "token-present" : "unauthenticated",
      access: "not-checked",
    },
  };
}

export type GitHubProviderNetworkDiagnosticResult =
  | {
      ok: true;
      repository: string;
      access: "ok";
      authentication: "token-present" | "unauthenticated";
    }
  | {
      ok: false;
      repository: string;
      access: "failed";
      authentication: "token-present" | "unauthenticated";
      providerCode: string;
      message: string;
    };

/**
 * Perform exactly one read-only repository-metadata GET through the existing
 * GitHub provider and transport. This never fetches issues or pull requests,
 * never calls /rate_limit, never retries, never sleeps, never measures latency,
 * and never exposes response bodies, headers, or the token. The single request
 * uses list/limit=1 which contacts only the repository endpoint.
 */
export async function runGitHubProviderNetworkDiagnostic(input: {
  repository: string;
  token?: string;
  transport: GitHubHttpTransport;
  productVersion: string;
}): Promise<GitHubProviderNetworkDiagnosticResult> {
  const authentication =
    tokenPresence(input.token) === "present" ? "token-present" : "unauthenticated";
  const provider = createGitHubProvider({
    transport: input.transport,
    productVersion: input.productVersion,
  });
  const result = await provider.execute(
    {
      providerId: "github",
      action: "list",
      query: input.repository,
      limit: 1,
    },
    { requestId: "provider-diagnostic" },
  );
  if (result.ok) {
    return { ok: true, repository: input.repository, access: "ok", authentication };
  }
  return {
    ok: false,
    repository: input.repository,
    access: "failed",
    authentication,
    providerCode: result.code,
    message: result.message,
  };
}

/**
 * Resolve the effective GitHub repository/limit for a diagnostic run. Thin
 * wrapper over the pure provider resolver so the process layer has one entry
 * point. No environment, filesystem, or network access.
 */
export function resolveGitHubDiagnosticSettings(input: {
  config: ResolvedProviderConfig;
  repository?: string;
}): ReturnType<typeof resolveGitHubProviderSettings> {
  return resolveGitHubProviderSettings({
    config: input.config,
    overrides: input.repository !== undefined ? { repository: input.repository } : {},
  });
}
