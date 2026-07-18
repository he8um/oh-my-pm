import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import {
  createGitHubProvider,
  createLocalProvider,
  createNodeGitHubHttpTransport,
  createProviderRegistry,
} from "@oh-my-pm/providers";
import type { GitHubHttpTransport, LocalProviderItemInput, Provider } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { runCli } from "./cli.js";
import { readGitHubTokenFromEnvironment } from "./github-token.js";
import { loadConfiguredMarkdownProjectDocuments } from "./project-config.js";
import { parseCliArgs } from "./parser.js";

export type LocalCliProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type LocalCliProcessOptions = {
  version?: string;
  now?: string;
  /** Injected GitHub token; when omitted the adapter reads it from the env. */
  githubToken?: string;
  /** Injected GitHub transport; when set it takes precedence (offline tests). */
  githubTransport?: GitHubHttpTransport;
  /** Injected environment map for the token read (defaults to the ambient env). */
  env?: Readonly<Record<string, string | undefined>>;
};

// Default local runtime identity. Deterministic: no real clock, no randomness.
const DEFAULT_VERSION = "0.2.0-alpha.0";
const DEFAULT_NOW = "2026-01-01T00:00:00.000Z";

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

/**
 * Run the OH MY PM CLI process against the real WASM Kernel and return a
 * structured result. Local commands (status/doctor/plan/brief/risks/next/
 * handoff over Markdown) are deterministic, offline, and never read the
 * environment. The github command builds a read-only GitHub provider whose
 * transport is either injected (offline tests) or constructed for the live
 * command with an optional token read from the environment.
 */
export async function runLocalCliProcess(
  args: readonly string[],
  options?: LocalCliProcessOptions,
): Promise<LocalCliProcessResult> {
  const version = options?.version ?? DEFAULT_VERSION;
  const now = options?.now ?? DEFAULT_NOW;

  const parsed = parseCliArgs([...args]);
  let providerItems: LocalProviderItemInput[] = [...SEED_ITEMS];
  const providers: Provider[] = [];

  if (parsed.ok && parsed.command === "github") {
    // Injected transport wins (tests stay offline); otherwise build the live
    // transport with a token read only now, only for this explicit command.
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
    const root = parsed.input ?? ".";
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

  const result = await runCli([...args], { runtime });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
