// Composed Node dependencies for the application use cases.
//
// The single place where the ambient process is consulted for the application
// layer: the environment (only for the optional GitHub token and the provider
// config path), the platform and cwd (only to resolve the provider config
// location), and the Node version (only for a diagnostic check). Each read is
// injectable so tests stay offline and platform-independent.
//
// This module reads the ambient process; it never writes to a stream, never
// calls process.exit, and never inspects process.argv.

import { createNodeWasmKernelApi, describeKernelBinding } from "@oh-my-pm/kernel";
import { createNodeGitHubHttpTransport, defaultProviderConfig } from "@oh-my-pm/providers";
import type { GitHubHttpTransport, ResolvedProviderConfig } from "@oh-my-pm/providers";
import type {
  GitHubProjectDeps,
  LocalProjectDeps,
  ProviderConfigResolution,
  ProviderDiagnosticsDeps,
} from "../index.js";
import { readGitHubTokenFromEnvironment } from "./github-token.js";
import { loadConfiguredMarkdownProjectDocuments } from "./project-config.js";
import { loadProviderConfig } from "./provider-config.js";

/** Injection points for the ambient process reads, all optional. */
export type NodeDepsOptions = {
  /** Runtime identity reported in responses and sent as the user agent. */
  version: string;
  /** Injected environment map (defaults to the ambient environment). */
  env?: Readonly<Record<string, string | undefined>>;
  /** Injected platform for provider-config resolution. */
  platform?: NodeJS.Platform;
  /** Injected cwd for relative provider-config paths. */
  cwd?: string;
  /** Explicit provider-config path; when set, no location search happens. */
  providerConfigPath?: string;
  /** Directly injected provider configuration; takes precedence over any file. */
  providerConfig?: ResolvedProviderConfig;
  /** Injected GitHub token; when omitted the environment is consulted. */
  githubToken?: string;
  /** Injected GitHub transport; takes precedence so tests stay offline. */
  githubTransport?: GitHubHttpTransport;
  /** Invocation timestamp accessor for the live GitHub path. */
  now?: () => string;
};

type NodeProcess = {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  cwd?: () => string;
  versions?: { node?: string };
};

function ambientProcess(): NodeProcess {
  return (globalThis as { process?: NodeProcess }).process ?? {};
}

function ambientEnv(): Readonly<Record<string, string | undefined>> {
  return ambientProcess().env ?? {};
}

function ambientPlatform(): NodeJS.Platform {
  return ambientProcess().platform ?? "linux";
}

function ambientCwd(): string {
  const proc = ambientProcess();
  return typeof proc.cwd === "function" ? proc.cwd() : "/";
}

/** Node version, read only for the runtime.node-version diagnostic. */
export function nodeVersion(): string {
  return ambientProcess().versions?.node ?? "unknown";
}

/** Whether the WASM Kernel binding is configured (runtime.kernel diagnostic). */
export function nodeKernelConfigured(): boolean {
  return describeKernelBinding(createNodeWasmKernelApi()).status === "configured";
}

/**
 * Resolve provider configuration through the read-only loader. A directly
 * injected configuration wins. A present-but-invalid configuration yields
 * `ok: false` with a sanitized message and safe defaults, so a caller can
 * report the failure without proceeding to the network.
 */
export function resolveNodeProviderConfig(
  options: NodeDepsOptions,
): ProviderConfigResolution {
  if (options.providerConfig !== undefined) {
    return {
      config: options.providerConfig,
      ok: true,
      source: "defaults",
      exists: false,
      displayPath: "defaults",
    };
  }
  const load = loadProviderConfig({
    ...(options.providerConfigPath !== undefined
      ? { explicitPath: options.providerConfigPath }
      : {}),
    env: options.env ?? ambientEnv(),
    platform: options.platform ?? ambientPlatform(),
    cwd: options.cwd ?? ambientCwd(),
  });
  if (!load.ok) {
    return {
      config: defaultProviderConfig(),
      ok: false,
      message: load.message,
      source: load.source,
      exists: load.exists,
      displayPath: load.displayPath,
    };
  }
  return {
    config: load.config,
    ok: true,
    source: load.source,
    exists: load.exists,
    displayPath: load.displayPath,
  };
}

/** The optional GitHub token: injected value first, then the environment. */
function resolveToken(options: NodeDepsOptions): string | undefined {
  return options.githubToken ?? readGitHubTokenFromEnvironment(options.env ?? ambientEnv());
}

/** Node dependencies for the local project workflows. */
export function createNodeLocalProjectDeps(options: NodeDepsOptions): LocalProjectDeps {
  return {
    loadDocuments: loadConfiguredMarkdownProjectDocuments,
    version: options.version,
  };
}

/** Node dependencies for the GitHub project workflows. */
export function createNodeGitHubProjectDeps(options: NodeDepsOptions): GitHubProjectDeps {
  const token = resolveToken(options);
  return {
    resolveProviderConfig: () => {
      const resolution = resolveNodeProviderConfig(options);
      return resolution.ok
        ? { config: resolution.config }
        : {
            config: null,
            ...(resolution.message !== undefined ? { message: resolution.message } : {}),
          };
    },
    ...(options.githubTransport !== undefined ? { transport: options.githubTransport } : {}),
    ...(token !== undefined ? { token } : {}),
    now: options.now ?? (() => new Date().toISOString()),
    version: options.version,
  };
}

/** Node dependencies for provider diagnostics. */
export function createNodeProviderDiagnosticsDeps(
  options: NodeDepsOptions,
): ProviderDiagnosticsDeps {
  return {
    resolveProviderConfig: () => resolveNodeProviderConfig(options),
    readToken: () => resolveToken(options),
    nodeVersion,
    kernelConfigured: nodeKernelConfigured,
    version: options.version,
    ...(options.githubTransport !== undefined ? { transport: options.githubTransport } : {}),
    createTransport: (token) =>
      createNodeGitHubHttpTransport({
        ...(token !== undefined ? { token } : {}),
        productVersion: options.version,
      }),
  };
}
