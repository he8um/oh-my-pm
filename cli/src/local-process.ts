import { createNodeWasmKernelApi, describeKernelBinding } from "@oh-my-pm/kernel";
import {
  createGitHubProvider,
  createLocalProvider,
  createNodeGitHubHttpTransport,
  createProviderRegistry,
  resolveGitHubProviderSettings,
} from "@oh-my-pm/providers";
import type {
  GitHubHttpTransport,
  LocalProviderItemInput,
  Provider,
  ResolvedProviderConfig,
} from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { runCli } from "./cli.js";
import { readGitHubTokenFromEnvironment } from "./github-token.js";
import { loadConfiguredMarkdownProjectDocuments } from "./project-config.js";
import { parseCliArgs } from "./parser.js";
import { loadProviderConfig } from "./provider-config.js";
import type { ProviderConfigLoadResult } from "./provider-config.js";
import {
  buildOfflineDoctorReport,
  buildProviderStatusReport,
  runGitHubProviderNetworkDiagnostic,
} from "./provider-diagnostics.js";
import {
  formatProviderDoctorReport,
  formatProviderStatusReport,
} from "./provider-format.js";

export type LocalCliProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type LocalCliProcessOptions = {
  version?: string;
  /**
   * Explicit invocation timestamp. Injected in tests to keep the live GitHub
   * command deterministic; local commands ignore it and always use the fixed
   * offline clock. When omitted on the github path, the injected `clock` (or
   * the bug-guard fixed fallback) supplies the value.
   */
  now?: string;
  /**
   * Real-clock accessor for the live GitHub command only. The bin wrapper
   * supplies an ISO-timestamp accessor read from the process boundary; it is
   * called at most once and only for the explicit github command. Local
   * commands never call it.
   */
  clock?: () => string;
  /** Injected GitHub token; when omitted the adapter reads it from the env. */
  githubToken?: string;
  /** Injected GitHub transport; when set it takes precedence (offline tests). */
  githubTransport?: GitHubHttpTransport;
  /** Injected environment map for the token read (defaults to the ambient env). */
  env?: Readonly<Record<string, string | undefined>>;
  /** Injected platform for provider-config resolution (defaults to process). */
  platform?: NodeJS.Platform;
  /** Injected cwd for relative provider-config paths (defaults to process). */
  cwd?: string;
  /**
   * Directly injected provider configuration. When set it takes precedence and
   * no provider-config file is read; used by offline unit tests.
   */
  providerConfig?: ResolvedProviderConfig;
};

// Default local runtime identity. Deterministic: no real clock, no randomness.
// The fixed clock is used for every local/offline workflow so byte-identical
// output is guaranteed regardless of when the command runs.
const DEFAULT_VERSION = "0.2.0-alpha.0";
const LOCAL_FIXED_NOW = "2026-01-01T00:00:00.000Z";

// Seed items for the commands that do not read project documents
// (status/doctor/plan). Project workflows replace these with loaded documents.
const SEED_ITEMS: LocalProviderItemInput[] = [
  {
    id: "task-1",
    type: "task",
    title: "Finalize project roadmap",
    data: { status: "open", owner: "PM", due: "2026-01-10", tags: ["planning"] },
  },
  {
    id: "risk-1",
    type: "task",
    title: "Blocked dependency on design review",
    data: { status: "blocked", owner: "Design", tags: ["blocked", "risk"] },
  },
  {
    id: "task-2",
    type: "task",
    title: "Prepare launch handoff",
    data: { status: "open", owner: "Ops", tags: ["handoff"] },
  },
];

const PROJECT_COMMANDS: ReadonlySet<string> = new Set(["brief", "risks", "next", "handoff"]);

// The environment is read ONLY on the explicit github command path, ONLY to
// obtain the optional OH_MY_PM_GITHUB_TOKEN, and ONLY when no token/transport
// is injected. All local-only commands never touch the environment. This is
// the approved CLI process-adapter token boundary (see validate-boundaries).
function ambientEnv(): Readonly<Record<string, string | undefined>> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}

type NodeProcess = { platform?: NodeJS.Platform; cwd?: () => string };
function ambientProcess(): NodeProcess {
  return (globalThis as { process?: NodeProcess }).process ?? {};
}
function ambientPlatform(): NodeJS.Platform {
  return ambientProcess().platform ?? "linux";
}
function ambientCwd(): string {
  const proc = ambientProcess();
  return typeof proc.cwd === "function" ? proc.cwd() : "/";
}

/**
 * Resolve provider configuration for the github/providers commands. A directly
 * injected config wins (offline unit tests). Otherwise the read-only loader
 * resolves the explicit/env/OS-standard location. Never reads a token.
 */
function resolveProviderConfig(
  explicitPath: string | undefined,
  options: LocalCliProcessOptions | undefined,
): { config: ResolvedProviderConfig; load: ProviderConfigLoadResult | null } {
  if (options?.providerConfig !== undefined) {
    return { config: options.providerConfig, load: null };
  }
  const load = loadProviderConfig({
    ...(explicitPath !== undefined ? { explicitPath } : {}),
    env: options?.env ?? ambientEnv(),
    platform: options?.platform ?? ambientPlatform(),
    cwd: options?.cwd ?? ambientCwd(),
  });
  return { config: load.ok ? load.config : defaultConfigForFailure(), load };
}

// A load failure still needs a config object for downstream reporting; the
// defaults are safe because a failed load never proceeds to the network.
function defaultConfigForFailure(): ResolvedProviderConfig {
  return {
    version: 1,
    providers: { local: { enabled: true }, github: { enabled: true, defaultLimit: 50 } },
  };
}

type ParsedProviders = Extract<ReturnType<typeof parseCliArgs>, { command: "providers" }>;

/**
 * Node version accessor read only inside this process adapter. Deterministic
 * across a run; used only for the runtime.node-version diagnostic.
 */
function nodeVersion(): string {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return proc?.versions?.node ?? "unknown";
}

/**
 * Handle `providers status` and `providers doctor`. Offline by default; the one
 * optional network request happens only for `providers doctor github` with
 * --confirm-network. Never writes partial stdout before completion.
 */
async function runProvidersCommand(
  parsed: ParsedProviders,
  options: LocalCliProcessOptions | undefined,
  version: string,
): Promise<LocalCliProcessResult> {
  const { config, load } = resolveProviderConfig(parsed.providerConfigPath, options);
  const configValid = load === null || load.ok;
  const configLoaded = configValid;

  // An unreadable/invalid explicit or environment configuration is a controlled
  // failure with exit 2. OS-standard absence is not a failure (load.ok).
  if (load !== null && !load.ok) {
    if (parsed.subcommand === "status") {
      const report = buildProviderStatusReport({
        config,
        configSource: load.source,
        configExists: load.exists,
        configValid: false,
        token: providerToken(options),
      });
      report.config.displayPath = load.displayPath;
      return {
        exitCode: 2,
        stdout: formatProviderStatusReport(report, parsed.outputMode),
        stderr: "",
      };
    }
    const report = buildOfflineDoctorReport({
      configLoaded,
      configValid: false,
      configErrorMessage: load.message,
      config,
      token: providerToken(options),
      nodeVersion: nodeVersion(),
      kernelConfigured: kernelConfigured(),
    });
    return { exitCode: 2, stdout: formatProviderDoctorReport(report, parsed.outputMode), stderr: "" };
  }

  const displayPath = load?.displayPath ?? "defaults";
  const configExists = load?.exists ?? false;
  const configSource = load?.source ?? "defaults";

  if (parsed.subcommand === "status") {
    const report = buildProviderStatusReport({
      config,
      configSource,
      configExists,
      configValid: true,
      token: providerToken(options),
    });
    report.config.displayPath = displayPath;
    return { exitCode: 0, stdout: formatProviderStatusReport(report, parsed.outputMode), stderr: "" };
  }

  // providers doctor: run the offline checks first, always.
  const report = buildOfflineDoctorReport({
    configLoaded: true,
    configValid: true,
    config,
    token: providerToken(options),
    nodeVersion: nodeVersion(),
    kernelConfigured: kernelConfigured(),
  });

  const isNetworkDoctor = parsed.provider === "github" && parsed.confirmNetwork;
  if (!isNetworkDoctor) {
    const exitCode = report.ok ? 0 : 2;
    return { exitCode, stdout: formatProviderDoctorReport(report, parsed.outputMode), stderr: "" };
  }

  // Network doctor: resolve the effective repository (explicit or configured),
  // require GitHub enabled, then perform exactly one read-only request.
  const settings = resolveGitHubProviderSettings({
    config,
    overrides: parsed.repository !== undefined ? { repository: parsed.repository } : {},
  });
  if (!settings.ok) {
    report.checks.push({
      id: "provider.github.network",
      status: "fail",
      message: settings.message,
    });
    report.ok = false;
    if (report.github !== undefined) report.github.access = "failed";
    return { exitCode: 2, stdout: formatProviderDoctorReport(report, parsed.outputMode), stderr: "" };
  }

  const token = providerToken(options);
  let transport = options?.githubTransport;
  if (transport === undefined) {
    transport = createNodeGitHubHttpTransport({ token, productVersion: version });
  }
  const diagnostic = await runGitHubProviderNetworkDiagnostic({
    repository: settings.repository,
    ...(token !== undefined ? { token } : {}),
    transport,
    productVersion: version,
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
    return { exitCode: 0, stdout: formatProviderDoctorReport(report, parsed.outputMode), stderr: "" };
  }
  report.github.providerCode = diagnostic.providerCode;
  report.ok = false;
  report.checks.push({
    id: "provider.github.access",
    status: "fail",
    message: `${diagnostic.providerCode}: ${diagnostic.message}`,
  });
  return { exitCode: 2, stdout: formatProviderDoctorReport(report, parsed.outputMode), stderr: "" };
}

/** Optional token presence used only for diagnostics reporting (never value). */
function providerToken(options: LocalCliProcessOptions | undefined): string | undefined {
  return options?.githubToken ?? readGitHubTokenFromEnvironment(options?.env ?? ambientEnv());
}

/** Whether the WASM Kernel binding is configured (for the runtime.kernel check). */
function kernelConfigured(): boolean {
  return describeKernelBinding(createNodeWasmKernelApi()).status === "configured";
}

/**
 * Run the OH MY PM CLI process against the real WASM Kernel and return a
 * structured result. Local commands (status/doctor/plan/brief/risks/next/
 * handoff over Markdown) are deterministic, offline, and never read the
 * environment or provider configuration. The github command resolves provider
 * configuration then builds a read-only GitHub provider whose transport is
 * either injected (offline tests) or constructed for the live command with an
 * optional token read from the environment. The providers command runs offline
 * diagnostics with one explicitly confirmed optional network check.
 */
export async function runLocalCliProcess(
  args: readonly string[],
  options?: LocalCliProcessOptions,
): Promise<LocalCliProcessResult> {
  const version = options?.version ?? DEFAULT_VERSION;

  const parsed = parseCliArgs([...args]);

  // The providers command is handled entirely here: config resolution,
  // diagnostics, and formatting. It never routes through runCli.
  if (parsed.ok && parsed.command === "providers") {
    return runProvidersCommand(parsed, options, version);
  }

  let providerItems: LocalProviderItemInput[] = [...SEED_ITEMS];
  const providers: Provider[] = [];

  // Local/offline workflows always use the fixed clock. The live github command
  // resolves the current timestamp exactly once, only after the command is
  // parsed, from the explicitly injected `now` or the injected real `clock`;
  // this module never reads the clock itself (see validate-boundaries).
  let now = LOCAL_FIXED_NOW;
  let githubOverride: { repository: string; limit: number } | undefined;

  if (parsed.ok && parsed.command === "github") {
    now = options?.now ?? options?.clock?.() ?? LOCAL_FIXED_NOW;

    // 1-3. Resolve provider config and effective repository/limit BEFORE any
    // token read or transport construction. A config/provider failure fails
    // closed here with exit 2 and never contacts the network.
    const { config, load } = resolveProviderConfig(parsed.providerConfigPath, options);
    if (load !== null && !load.ok) {
      return { exitCode: 2, stdout: "", stderr: `invalid provider config: ${load.message}\n` };
    }
    const settings = resolveGitHubProviderSettings({
      config,
      overrides: {
        ...(parsed.repository !== undefined ? { repository: parsed.repository } : {}),
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      },
    });
    if (!settings.ok) {
      return { exitCode: 2, stdout: "", stderr: `github provider: ${settings.message}\n` };
    }
    githubOverride = { repository: settings.repository, limit: settings.limit };

    // 4-5. Only now read the optional token and construct the transport.
    // Injected transport wins so tests stay offline.
    let transport = options?.githubTransport;
    if (transport === undefined) {
      const token =
        options?.githubToken ??
        readGitHubTokenFromEnvironment(options?.env ?? ambientEnv());
      transport = createNodeGitHubHttpTransport({ token, productVersion: version });
    }
    providers.push(createGitHubProvider({ transport, productVersion: version }));
  } else if (parsed.ok && PROJECT_COMMANDS.has(parsed.command)) {
    // Errors report the root exactly as the user typed it, never a resolved
    // internal absolute path, and never any document content or config text.
    const root = "input" in parsed ? (parsed.input ?? ".") : ".";
    const configured = loadConfiguredMarkdownProjectDocuments(root);
    if (!configured.ok) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: `invalid project config: ${configured.configDisplayPath} (${configured.code})\n`,
      };
    }
    if (!configured.documents.ok) {
      const reason =
        configured.documents.warnings[0]?.code === "project_root_not_directory"
          ? "project root is not a directory"
          : "project root was not found";
      return { exitCode: 2, stdout: "", stderr: `${reason}: ${root}\n` };
    }
    if (configured.documents.filesLoaded === 0) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: `no markdown project documents matched under: ${root}\n`,
      };
    }
    providerItems = configured.documents.items;
  }

  if (providers.length === 0) {
    providers.push(createLocalProvider({ items: providerItems }));
  }

  const runtime = createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers: createProviderRegistry(providers),
    skills: createDefaultSkillRegistry(),
    version,
    now,
  });

  const result = await runCli([...args], {
    runtime,
    ...(githubOverride !== undefined ? { github: githubOverride } : {}),
  });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
