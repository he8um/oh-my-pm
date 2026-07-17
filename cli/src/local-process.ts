import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import type { LocalProviderItemInput } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { runCli } from "./cli.js";
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
};

// Default local runtime identity. Deterministic: no real clock, no randomness.
const DEFAULT_VERSION = "0.1.0";
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

/**
 * Run the local OH MY PM CLI process against the real WASM Kernel and return a
 * structured result. Deterministic and side-effect-free: it does not write to
 * process streams, read environment variables, use the current time, or reach
 * the network. Project commands load documents through the config-aware loader;
 * other commands use the local seed items.
 */
export function runLocalCliProcess(
  args: readonly string[],
  options?: LocalCliProcessOptions,
): LocalCliProcessResult {
  const version = options?.version ?? DEFAULT_VERSION;
  const now = options?.now ?? DEFAULT_NOW;

  const parsed = parseCliArgs([...args]);
  let providerItems: LocalProviderItemInput[] = [...SEED_ITEMS];

  if (parsed.ok && PROJECT_COMMANDS.has(parsed.command)) {
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

  const runtime = createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers: createProviderRegistry([createLocalProvider({ items: providerItems })]),
    skills: createDefaultSkillRegistry(),
    version,
    now,
  });

  const result = runCli([...args], { runtime });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
