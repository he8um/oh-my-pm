// MCP provider diagnostics runners. These resolve provider configuration from
// the process environment / OS-standard location only — an MCP agent can never
// supply a config path, a token, an API URL, or custom headers. The status
// runner never touches the network. The GitHub diagnostics runner is offline
// unless the caller explicitly sets confirmNetwork, in which case it performs
// exactly one read-only repository-metadata GET. Public results never expose a
// token value, absolute config path, raw config text, raw provider body,
// repository description, headers, Runtime trace, planner input, or graph.

import {
  buildOfflineDoctorReport,
  buildProviderStatusReport,
  loadProviderConfig,
  runGitHubProviderNetworkDiagnostic,
} from "@oh-my-pm/cli";
import type {
  ProviderConfigResolutionInput,
  ProviderDoctorReport,
  ProviderStatusReport,
} from "@oh-my-pm/cli";
import { describeKernelBinding, createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import {
  createNodeGitHubHttpTransport,
  defaultProviderConfig,
  resolveGitHubProviderSettings,
} from "@oh-my-pm/providers";
import type { GitHubHttpTransport, ResolvedProviderConfig } from "@oh-my-pm/providers";
import { readGitHubTokenFromEnvironment } from "@oh-my-pm/cli";

export const MCP_PROVIDER_DIAGNOSTICS_VERSION = "0.2.0-rc.1";

export type McpProviderDiagnosticsOptions = {
  /** Injected transport wins so tests stay offline. */
  transport?: GitHubHttpTransport;
  /** Injected token; when omitted the ambient environment is read. */
  token?: string;
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  cwd?: string;
  /** Directly injected provider configuration; wins and avoids fs reads. */
  providerConfig?: ResolvedProviderConfig;
};

type NodeProcess = { platform?: NodeJS.Platform; cwd?: () => string; versions?: { node?: string } };
function ambientEnv(): Readonly<Record<string, string | undefined>> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}
function ambientProcess(): NodeProcess {
  return (globalThis as { process?: NodeProcess }).process ?? {};
}
function nodeVersion(): string {
  return ambientProcess().versions?.node ?? "unknown";
}
function kernelConfigured(): boolean {
  return describeKernelBinding(createNodeWasmKernelApi()).status === "configured";
}

function resolutionInput(
  options: McpProviderDiagnosticsOptions | undefined,
): ProviderConfigResolutionInput {
  return {
    env: options?.env ?? ambientEnv(),
    platform: options?.platform ?? ambientProcess().platform ?? "linux",
    cwd:
      options?.cwd ??
      (typeof ambientProcess().cwd === "function" ? ambientProcess().cwd!() : "/"),
  };
}

type ResolvedConfig = {
  config: ResolvedProviderConfig;
  valid: boolean;
  exists: boolean;
  displayPath: string;
  source: ProviderStatusReport["config"]["source"];
  message?: string;
};

function resolveConfig(options: McpProviderDiagnosticsOptions | undefined): ResolvedConfig {
  if (options?.providerConfig !== undefined) {
    return {
      config: options.providerConfig,
      valid: true,
      exists: false,
      displayPath: "injected",
      source: "defaults",
    };
  }
  const load = loadProviderConfig(resolutionInput(options));
  if (load.ok) {
    return {
      config: load.config,
      valid: true,
      exists: load.exists,
      displayPath: load.displayPath,
      source: load.source,
    };
  }
  return {
    config: defaultProviderConfig(),
    valid: false,
    exists: load.exists,
    displayPath: load.displayPath,
    source: load.source,
    message: load.message,
  };
}

function providerToken(options: McpProviderDiagnosticsOptions | undefined): string | undefined {
  return options?.token ?? readGitHubTokenFromEnvironment(options?.env ?? ambientEnv());
}

/**
 * provider_status: offline, network-free. Resolves configuration from the
 * process environment/OS location and reports token presence only.
 */
export function executeMcpProviderStatus(
  options?: McpProviderDiagnosticsOptions,
): ProviderStatusReport {
  const resolved = resolveConfig(options);
  const report = buildProviderStatusReport({
    config: resolved.config,
    configSource: resolved.source,
    configExists: resolved.exists,
    configValid: resolved.valid,
    token: providerToken(options),
  });
  report.config.displayPath = resolved.displayPath;
  return report;
}

export type McpGitHubProviderDiagnosticsInput = {
  repository?: string;
  confirmNetwork?: boolean;
};

/**
 * github_provider_diagnostics: offline GitHub checks by default; with
 * confirmNetwork it performs exactly one read-only repository-metadata GET.
 */
export async function executeMcpGitHubProviderDiagnostics(
  input: McpGitHubProviderDiagnosticsInput,
  options?: McpProviderDiagnosticsOptions,
): Promise<ProviderDoctorReport> {
  const resolved = resolveConfig(options);
  const report = buildOfflineDoctorReport({
    configLoaded: resolved.valid,
    configValid: resolved.valid,
    ...(resolved.message !== undefined ? { configErrorMessage: resolved.message } : {}),
    config: resolved.config,
    token: providerToken(options),
    nodeVersion: nodeVersion(),
    kernelConfigured: kernelConfigured(),
  });

  if (input.confirmNetwork !== true) {
    return report;
  }

  const settings = resolveGitHubProviderSettings({
    config: resolved.config,
    overrides: input.repository !== undefined ? { repository: input.repository } : {},
  });
  if (!settings.ok) {
    report.ok = false;
    report.checks.push({ id: "provider.github.network", status: "fail", message: settings.message });
    if (report.github !== undefined) report.github.access = "failed";
    return report;
  }

  const token = providerToken(options);
  const transport =
    options?.transport ??
    createNodeGitHubHttpTransport({ token, productVersion: MCP_PROVIDER_DIAGNOSTICS_VERSION });
  const diagnostic = await runGitHubProviderNetworkDiagnostic({
    repository: settings.repository,
    ...(token !== undefined ? { token } : {}),
    transport,
    productVersion: MCP_PROVIDER_DIAGNOSTICS_VERSION,
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
    return report;
  }
  report.ok = false;
  report.github.providerCode = diagnostic.providerCode;
  report.checks.push({
    id: "provider.github.access",
    status: "fail",
    message: `${diagnostic.providerCode}: ${diagnostic.message}`,
  });
  return report;
}
