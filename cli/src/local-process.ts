import {
  executeProjectMemoryCommand,
  getProviderStatus,
  loadLocalProjectDocuments,
  runProviderDoctor,
} from "@oh-my-pm/application";
import type { MemoryProcessOptions, ProviderDiagnosticsDeps } from "@oh-my-pm/application";
import {
  createNodeProviderDiagnosticsDeps,
  loadConfiguredMarkdownProjectDocuments,
} from "@oh-my-pm/application/node";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import type {
  GitHubHttpTransport,
  LocalProviderItemInput,
  Provider,
  ResolvedProviderConfig,
} from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { runCli } from "./cli.js";
import { runGitHubCliCommand } from "./github-process.js";
import { formatHelp, resolveHelpRequest } from "./help.js";
import { runMcpConfigCommand } from "./mcp-config.js";
import { installedCommandExists } from "./mcp-config-resolve.js";
import { formatMemoryOutcome, memoryOutcomeExitCode } from "./memory-format.js";
import { parseCliArgs } from "./parser.js";
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
  /**
   * Injected GitHub token, forwarded to the application Node boundary. When
   * omitted, that boundary reads the environment lazily inside its transport
   * factory; this adapter never reads it.
   */
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
  /**
   * Process id used to derive the memory operation id. Injected in tests for
   * determinism; production reads the real process id at this boundary.
   */
  processId?: number;
  /**
   * Injected memory store factory (offline tests). When set, the memory command
   * uses it instead of dynamically importing the Node Project Memory adapter.
   */
  memoryStoreFactory?: MemoryProcessOptions["storeFactory"];
  /**
   * The CLI entry-script path, read at the process boundary. The `mcp-config`
   * command infers the installed prefix from it; nothing else uses it. When
   * omitted the ambient entry script is used.
   */
  entryScriptPath?: string;
  /**
   * Existence predicate for the installed sibling MCP command, used only by
   * `mcp-config`. Injected by tests to stay offline and platform-independent;
   * production uses the read-only stat boundary (mcp-config-resolve.ts).
   */
  commandExists?: (path: string) => boolean;
};

// Default local runtime identity. Deterministic: no real clock, no randomness.
// The fixed clock is used for every local/offline workflow so byte-identical
// output is guaranteed regardless of when the command runs.
const DEFAULT_VERSION = "0.5.2";
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

type NodeProcess = { platform?: NodeJS.Platform; cwd?: () => string; argv?: string[] };
function ambientProcess(): NodeProcess {
  return (globalThis as { process?: NodeProcess }).process ?? {};
}
/**
 * The entry-script path of the running CLI process. Read only here, at the
 * process boundary, and consumed only by `mcp-config` to infer the installed
 * prefix. It is never printed and never used to resolve project documents.
 */
function ambientEntryScriptPath(): string {
  return ambientProcess().argv?.[1] ?? "";
}
function ambientPlatform(): NodeJS.Platform {
  return ambientProcess().platform ?? "linux";
}
type ParsedProviders = Extract<ReturnType<typeof parseCliArgs>, { command: "providers" }>;

/**
 * Node dependencies for the provider diagnostics use cases, assembled from this
 * adapter's injectable options. The CLI supplies the boundary values; the
 * application layer owns the sequencing and the fail-closed rules.
 */
function providerDiagnosticsDeps(
  parsed: ParsedProviders,
  options: LocalCliProcessOptions | undefined,
  version: string,
): ProviderDiagnosticsDeps {
  return createNodeProviderDiagnosticsDeps({
    version,
    ...(parsed.providerConfigPath !== undefined
      ? { providerConfigPath: parsed.providerConfigPath }
      : {}),
    ...(options?.providerConfig !== undefined ? { providerConfig: options.providerConfig } : {}),
    ...(options?.env !== undefined ? { env: options.env } : {}),
    ...(options?.platform !== undefined ? { platform: options.platform } : {}),
    ...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options?.githubToken !== undefined ? { githubToken: options.githubToken } : {}),
    ...(options?.githubTransport !== undefined
      ? { githubTransport: options.githubTransport }
      : {}),
  });
}

/**
 * Render `providers status` and `providers doctor`. The diagnostics themselves
 * come from the shared application use cases; this function only maps the typed
 * result to a terminal rendering and an exit code, and never writes partial
 * stdout before completion.
 */
async function runProvidersCommand(
  parsed: ParsedProviders,
  options: LocalCliProcessOptions | undefined,
  version: string,
): Promise<LocalCliProcessResult> {
  const deps = providerDiagnosticsDeps(parsed, options, version);

  if (parsed.subcommand === "status") {
    const { ok, report } = getProviderStatus(deps);
    return {
      exitCode: ok ? 0 : 2,
      stdout: formatProviderStatusReport(report, parsed.outputMode),
      stderr: "",
    };
  }

  const { ok, report } = await runProviderDoctor(
    {
      confirmNetwork: parsed.confirmNetwork,
      ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
      ...(parsed.repository !== undefined ? { repository: parsed.repository } : {}),
    },
    deps,
  );
  return {
    exitCode: ok ? 0 : 2,
    stdout: formatProviderDoctorReport(report, parsed.outputMode),
    stderr: "",
  };
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

  // Help is resolved before the parser so `--help` never becomes an unsupported
  // option, and before any command runs so help performs no work at all: no
  // filesystem, environment, token, network, clock, or write access. It always
  // succeeds with exit 0, prints to stdout only, and never touches stderr.
  const helpTopic = resolveHelpRequest(args);
  if (helpTopic !== null) {
    return { exitCode: 0, stdout: formatHelp(helpTopic), stderr: "" };
  }

  // mcp-config is a local, read-only, print-only command. It resolves the
  // installed sibling executable from this process's own installed location and
  // never reaches the parser, the Runtime, a provider, or the network.
  if (args.length > 0 && args[0] === "mcp-config") {
    return runMcpConfigCommand(args.slice(1), {
      entryScriptPath: options?.entryScriptPath ?? ambientEntryScriptPath(),
      platform: options?.platform ?? ambientPlatform(),
      commandExists: options?.commandExists ?? installedCommandExists,
    });
  }

  const parsed = parseCliArgs([...args]);

  // The providers command is handled entirely here: config resolution,
  // diagnostics, and formatting. It never routes through runCli.
  if (parsed.ok && parsed.command === "providers") {
    return runProvidersCommand(parsed, options, version);
  }

  // The memory command is handled entirely here: identity/data-dir resolution,
  // local Markdown observation, Project Brain Runtime composition, the Phase 2
  // store (lazily imported on this path only), and formatting. It never routes
  // through runCli. Successful results go to stdout; failures to stderr.
  if (parsed.ok && parsed.command === "memory") {
    const memoryOptions: MemoryProcessOptions = {
      ...(options?.now !== undefined ? { now: options.now } : {}),
      ...(options?.clock !== undefined ? { clock: options.clock } : {}),
      ...(options?.processId !== undefined ? { processId: options.processId } : {}),
      ...(options?.memoryStoreFactory !== undefined
        ? { storeFactory: options.memoryStoreFactory }
        : {}),
    };
    const outcome = await executeProjectMemoryCommand(parsed.memory, memoryOptions);
    const exitCode = memoryOutcomeExitCode(outcome);
    const rendered = formatMemoryOutcome(outcome, parsed.outputMode);
    // No partial stdout before a failed mutating operation: a failure renders to
    // stderr only; a success renders to stdout only.
    if (outcome.ok) {
      return { exitCode, stdout: rendered, stderr: "" };
    }
    return { exitCode, stdout: "", stderr: rendered };
  }

  // The github command is handled entirely by the focused CLI GitHub adapter,
  // which routes through the shared @oh-my-pm/application GitHub use case. It
  // never reaches the local Runtime composition below, so this module builds no
  // GitHub provider, transport, or Runtime for it.
  if (parsed.ok && parsed.command === "github") {
    return runGitHubCliCommand(parsed, parsed.outputMode, {
      version,
      ...(options?.now !== undefined ? { now: options.now } : {}),
      ...(options?.clock !== undefined ? { clock: options.clock } : {}),
      ...(options?.githubToken !== undefined ? { githubToken: options.githubToken } : {}),
      ...(options?.githubTransport !== undefined
        ? { githubTransport: options.githubTransport }
        : {}),
      ...(options?.env !== undefined ? { env: options.env } : {}),
      ...(options?.platform !== undefined ? { platform: options.platform } : {}),
      ...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options?.providerConfig !== undefined ? { providerConfig: options.providerConfig } : {}),
    });
  }

  let providerItems: LocalProviderItemInput[] = [...SEED_ITEMS];
  const providers: Provider[] = [];

  // Local/offline workflows always use the fixed clock; this module never reads
  // the clock itself (see validate-boundaries).
  const now = LOCAL_FIXED_NOW;

  if (parsed.ok && PROJECT_COMMANDS.has(parsed.command)) {
    // The document load and its failure classification are the shared
    // application behavior; this adapter only renders the outcome. Errors report
    // the root exactly as the user typed it, never a resolved internal absolute
    // path, and never any document content or config text.
    const root = "input" in parsed ? (parsed.input ?? ".") : ".";
    const loaded = loadLocalProjectDocuments(root, loadConfiguredMarkdownProjectDocuments);
    if (!loaded.ok) {
      return { exitCode: 2, stdout: "", stderr: `${loaded.message}\n` };
    }
    providerItems = loaded.items;
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

  const result = await runCli([...args], { runtime });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
