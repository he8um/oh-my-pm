// Provider diagnostics use cases.
//
// Orchestrates the offline provider status and doctor reports and, only when a
// caller explicitly confirms it, the single optional read-only network check.
// The report builders themselves live in `provider-diagnostics.ts`; this module
// owns the sequencing and the fail-closed rules around them.
//
// Offline by default. A token is read only to report its PRESENCE — its value
// never enters a report, a message, or a result.

import type { GitHubHttpTransport, ResolvedProviderConfig } from "@oh-my-pm/providers";
import { resolveGitHubProviderSettings } from "@oh-my-pm/providers";
import {
  buildOfflineDoctorReport,
  buildProviderStatusReport,
  runGitHubProviderNetworkDiagnostic,
} from "./provider-diagnostics.js";
import type { ProviderDoctorReport, ProviderStatusReport } from "./provider-diagnostics.js";
import type { ProviderConfigSource } from "./node/provider-config.js";

/**
 * The outcome of resolving provider configuration. `ok: false` means a present
 * configuration was unreadable or invalid — a controlled failure, never a
 * reason to fall back silently to defaults on the network path.
 */
export type ProviderConfigResolution = {
  /** Effective configuration; defaults when none was found. */
  config: ResolvedProviderConfig;
  /** False when a present configuration was unreadable or invalid. */
  ok: boolean;
  /** Sanitized reason when `ok` is false. */
  message?: string;
  /** Where the configuration came from, for reporting. */
  source: ProviderConfigSource | "defaults";
  /** Whether a configuration file was present. */
  exists: boolean;
  /** Display path, never a resolved absolute path. */
  displayPath: string;
};

export type ProviderDiagnosticsDeps = {
  /** Resolves provider configuration (injected; the Node surface supplies it). */
  resolveProviderConfig: () => ProviderConfigResolution;
  /** Token presence probe. Returns the token only so presence can be derived. */
  readToken: () => string | undefined;
  /** Node version for the runtime.node-version check. */
  nodeVersion: () => string;
  /** Whether the WASM Kernel binding is configured. */
  kernelConfigured: () => boolean;
  /** Runtime identity used when constructing a live transport. */
  version: string;
  /** Injected transport for the optional network check (offline tests). */
  transport?: GitHubHttpTransport;
  /** Builds a live transport when none is injected. */
  createTransport?: (token: string | undefined) => GitHubHttpTransport;
};

/** A diagnostics result plus whether the caller should treat it as a failure. */
export type ProviderStatusResult = {
  readonly ok: boolean;
  readonly report: ProviderStatusReport;
};

export type ProviderDoctorResult = {
  readonly ok: boolean;
  readonly report: ProviderDoctorReport;
};

/**
 * Read-only provider status. Always offline. An unreadable or invalid present
 * configuration yields `ok: false` with a report that still describes what was
 * resolvable.
 */
export function getProviderStatus(deps: ProviderDiagnosticsDeps): ProviderStatusResult {
  const resolution = deps.resolveProviderConfig();
  const report = buildProviderStatusReport({
    config: resolution.config,
    configSource: resolution.source,
    configExists: resolution.exists,
    configValid: resolution.ok,
    token: deps.readToken(),
  });
  report.config.displayPath = resolution.displayPath;
  return { ok: resolution.ok, report };
}

export type ProviderDoctorInput = {
  /** Run the one optional read-only network check. Requires explicit consent. */
  confirmNetwork: boolean;
  /** Restrict the network check to a provider; only `github` is supported. */
  provider?: "github";
  /** Explicit repository override for the network check. */
  repository?: string;
};

/**
 * Provider doctor. The offline checks always run first and always complete. The
 * single optional network request happens only for `github` with explicit
 * confirmation, and only after the offline checks and repository resolution
 * succeed.
 */
export async function runProviderDoctor(
  input: ProviderDoctorInput,
  deps: ProviderDiagnosticsDeps,
): Promise<ProviderDoctorResult> {
  const resolution = deps.resolveProviderConfig();

  if (!resolution.ok) {
    const report = buildOfflineDoctorReport({
      configLoaded: false,
      configValid: false,
      ...(resolution.message !== undefined ? { configErrorMessage: resolution.message } : {}),
      config: resolution.config,
      token: deps.readToken(),
      nodeVersion: deps.nodeVersion(),
      kernelConfigured: deps.kernelConfigured(),
    });
    return { ok: false, report };
  }

  const report = buildOfflineDoctorReport({
    configLoaded: true,
    configValid: true,
    config: resolution.config,
    token: deps.readToken(),
    nodeVersion: deps.nodeVersion(),
    kernelConfigured: deps.kernelConfigured(),
  });

  const isNetworkDoctor = input.provider === "github" && input.confirmNetwork;
  if (!isNetworkDoctor) {
    return { ok: report.ok, report };
  }

  // Resolve the effective repository before any transport is constructed, so an
  // unresolved repository never reaches the network.
  const settings = resolveGitHubProviderSettings({
    config: resolution.config,
    overrides: input.repository !== undefined ? { repository: input.repository } : {},
  });
  if (!settings.ok) {
    report.checks.push({
      id: "provider.github.network",
      status: "fail",
      message: settings.message,
    });
    report.ok = false;
    if (report.github !== undefined) report.github.access = "failed";
    return { ok: false, report };
  }

  const token = deps.readToken();
  const transport =
    deps.transport ??
    deps.createTransport?.(token) ??
    (() => {
      throw new Error("no GitHub transport available for the network diagnostic");
    })();

  const diagnostic = await runGitHubProviderNetworkDiagnostic({
    repository: settings.repository,
    ...(token !== undefined ? { token } : {}),
    transport,
    productVersion: deps.version,
  });

  report.networkAttempted = true;
  report.github = {
    repository: settings.repository,
    limit: settings.limit,
    authentication: diagnostic.authentication,
    access: diagnostic.ok ? "ok" : "failed",
  };

  if (diagnostic.ok) {
    report.checks.push({
      id: "provider.github.access",
      status: "ok",
      message: "repository metadata access succeeded",
    });
    return { ok: true, report };
  }

  report.github.providerCode = diagnostic.providerCode;
  report.ok = false;
  report.checks.push({
    id: "provider.github.access",
    status: "fail",
    message: `${diagnostic.providerCode}: ${diagnostic.message}`,
  });
  return { ok: false, report };
}
