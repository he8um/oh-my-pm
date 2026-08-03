import {
  LOCAL_WORKFLOW_FIXED_NOW,
  executeProjectMemoryCommand,
  formatCliError,
  formatRuntimeResponse,
  getProviderStatus,
  runLocalProjectWorkflow,
  runProviderDoctor,
} from "@oh-my-pm/application";
import type {
  MemoryProcessOptions,
  ProjectWorkflowOperation,
  ProviderDiagnosticsDeps,
} from "@oh-my-pm/application";
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
import { OMP_C_RUNTIME_FAILED, runCli } from "./cli.js";
import { runGitHubCliCommand } from "./github-process.js";
import { formatHelp, resolveHelpRequest } from "./help.js";
import { runMcpConfigCommand } from "./mcp-config.js";
import { installedCommandExists } from "./mcp-config-resolve.js";
import { formatMemoryOutcome, memoryOutcomeExitCode } from "./memory-format.js";
import { parseCliArgs } from "./parser.js";
import { formatProviderDoctorReport, formatProviderStatusReport } from "./provider-format.js";

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
//
// The instant itself lives in @oh-my-pm/application (LOCAL_WORKFLOW_FIXED_NOW).
// This module previously declared its own LOCAL_FIXED_NOW holding the same
// value for the same reason; two constants that must agree but are declared
// apart will eventually disagree.
const DEFAULT_VERSION = "0.6.1";

// Seed items for the commands that do not read project documents
// (status/doctor/plan). The shared project workflows load their own documents
// through the application use case and never see these.
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

/**
 * The four SHARED project workflows, which route through the application use
 * case rather than this adapter's own Runtime.
 *
 * Typed as the application's own operation union, not a bare string set, so the
 * compiler proves the member list and the use case agree: adding a name here
 * that `runLocalProjectWorkflow` does not accept is a build error rather than a
 * runtime surprise.
 */
const PROJECT_COMMANDS: ReadonlySet<ProjectWorkflowOperation> = new Set([
  "brief",
  "risks",
  "next",
  "handoff",
] as const);

/** Whether a parsed command is one of the shared application workflows. */
function isSharedProjectWorkflow(command: string): command is ProjectWorkflowOperation {
  return PROJECT_COMMANDS.has(command as ProjectWorkflowOperation);
}

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
    ...(options?.githubTransport !== undefined ? { githubTransport: options.githubTransport } : {}),
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

  // The four SHARED project workflows go through the application use case, the
  // same one the MCP server calls. This adapter composes no Runtime for them
  // and only renders the outcome.
  //
  // Before v0.6.1 this path built its own Runtime, provider, and Kernel and
  // reached the same result by a second composition -- so the two surfaces
  // shared only the document loader and could drift apart in everything else.
  // tools/validate-application-boundary.mjs now fails if that duplication
  // returns.
  if (parsed.ok && isSharedProjectWorkflow(parsed.command)) {
    const root = "input" in parsed ? (parsed.input ?? ".") : ".";
    const workflow = await runLocalProjectWorkflow(parsed.command, root, {
      loadDocuments: loadConfiguredMarkdownProjectDocuments,
      version,
    });

    if (!workflow.ok) {
      // Failure rendering is unchanged and is deliberately code-driven rather
      // than uniform: a document-load or root problem is a precondition the
      // caller can fix (exit 2, message on stderr, nothing on stdout), while a
      // runtime failure is an execution failure the CLI has always reported
      // through the runtime response itself. Routing both through one branch
      // here would change one of the two observable behaviours.
      if (
        workflow.code === "project_runtime_failed" ||
        workflow.code === "project_output_invalid"
      ) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: formatCliError(
            OMP_C_RUNTIME_FAILED,
            "runtime execution failed",
            parsed.outputMode,
          ),
        };
      }
      return { exitCode: 2, stdout: "", stderr: `${workflow.message}\n` };
    }

    // The formatter consumes the RuntimeResponse exactly as before, so stdout
    // stays byte-identical. tests/e2e/public-golden.test.ts pins those bytes.
    return {
      exitCode: 0,
      stdout: formatRuntimeResponse(workflow.response, parsed.outputMode),
      stderr: "",
    };
  }

  // Everything below serves the intentionally CLI-only commands -- status,
  // doctor, and plan -- which have exactly one presentation consumer and are
  // deliberately NOT application-owned. See the $asymmetryComment on
  // @oh-my-pm/cli in packages.json.
  const providers: Provider[] = [createLocalProvider({ items: [...SEED_ITEMS] })];

  const runtime = createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers: createProviderRegistry(providers),
    skills: createDefaultSkillRegistry(),
    version,
    // Local/offline workflows always use the fixed clock; this module never
    // reads the clock itself (see validate-boundaries). The instant is the
    // application's single definition rather than a second local constant.
    now: LOCAL_WORKFLOW_FIXED_NOW,
  });

  const result = await runCli([...args], { runtime });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
