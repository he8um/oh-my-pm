// Conventional CLI help text. Pure and fully deterministic: the text is built
// from static structure only — no filesystem, environment, network, clock,
// randomness, colors, paging, or localization. Help never reads a token and
// never creates a file or an application-data directory.
//
// The help surface is a description of the CLI that already exists; it adds no
// command, option, or behavior of its own.

import { MEMORY_SUBCOMMANDS } from "./memory-types.js";

/** Help topics: the top level plus every namespace that has its own grammar. */
export const HELP_TOPICS = [
  "top",
  "status",
  "doctor",
  "plan",
  "brief",
  "risks",
  "next",
  "handoff",
  "install-preview",
  "github",
  "providers",
  "memory",
  "mcp-config",
] as const;

export type HelpTopic = (typeof HELP_TOPICS)[number];

/** Whether an argument is one of the two conventional help flags. */
export function isHelpFlag(arg: string): boolean {
  return arg === "--help" || arg === "-h";
}

/**
 * Resolve a help request from a raw argument vector, or null when help was not
 * requested. `--help`/`-h` anywhere selects help; the topic is the first
 * non-flag token when it names a known topic, otherwise the top level. Pure.
 */
export function resolveHelpRequest(args: readonly string[]): HelpTopic | null {
  let requested = false;
  let topic: HelpTopic = "top";
  let topicSeen = false;
  for (const arg of args) {
    if (isHelpFlag(arg)) {
      requested = true;
      continue;
    }
    if (!topicSeen && !arg.startsWith("-")) {
      topicSeen = true;
      if ((HELP_TOPICS as readonly string[]).includes(arg) && arg !== "top") {
        topic = arg as HelpTopic;
      }
    }
  }
  return requested ? topic : null;
}

const OUTPUT_MODES = [
  "  (default)     brief human-readable text",
  "  --json        deterministic JSON",
  "  --markdown    Markdown",
];

const EXIT_CODES = [
  "  0    success",
  "  1    runtime execution failed",
  "  2    invalid command, invalid option, or a controlled precondition failure",
];

function block(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

function topHelp(): string {
  return block([
    "OH MY PM — local project intelligence for structured project delivery.",
    "",
    "Usage:",
    "  oh-my-pm <command> [options]",
    "",
    "Project commands:",
    "  status                    report runtime and kernel status",
    "  doctor                    run offline self-diagnostics",
    "  plan <request>            derive a plan from a short request",
    "  brief [root]              summarize the project at [root] (default: .)",
    "  risks [root]              report project risks at [root] (default: .)",
    "  next [root]               report the next actions at [root] (default: .)",
    "  handoff [root]            produce a handoff summary at [root] (default: .)",
    "",
    "Namespaces:",
    "  github <op> [repo]        run a workflow over a GitHub repository",
    "  providers <sub>           inspect provider configuration and health",
    "  memory <sub>              local Project Brain memory (read-first)",
    "",
    "Other commands:",
    "  install-preview <root>    preview a local installation (dry run)",
    "  mcp-config                print an MCP client configuration",
    "",
    "Options:",
    "  -h, --help                show help for the CLI or a namespace",
    "",
    "Output modes:",
    ...OUTPUT_MODES,
    "",
    "Exit codes:",
    ...EXIT_CODES,
    "",
    "Examples:",
    "  oh-my-pm status",
    "  oh-my-pm brief . --markdown",
    "  oh-my-pm github risks owner/repo --limit 20",
    "  oh-my-pm providers status --json",
    "  oh-my-pm memory status --json",
    "  oh-my-pm mcp-config",
    "",
    "Run `oh-my-pm <namespace> --help` for namespace details.",
  ]);
}

function githubHelp(): string {
  return block([
    "Usage:",
    "  oh-my-pm github <brief|risks|next|handoff> [owner/repo] [options]",
    "",
    "Reads a GitHub repository through the read-only provider. The repository and",
    "limits may come from provider configuration when not given explicitly.",
    "",
    "Options:",
    "  --limit <n>                    items to read (1..100)",
    "  --source <mode>                source selection mode",
    "  --state <open|closed|all>      item state",
    "  --kind <all|issues|pull-requests>",
    "  --number <n>                   a single item number",
    "  --query <text>                 a search query",
    "  --include-comments             include comments",
    "  --comment-limit <n>            comments per item (1..50)",
    "  --include-reviews              include pull-request reviews",
    "  --review-limit <n>             reviews per pull request (1..20)",
    "  --include-review-comments      include inline review comments",
    "  --review-comment-limit <n>     inline review comments (1..20)",
    "  --provider-config <path>       explicit provider configuration file",
    "  -h, --help                     show this help",
    "",
    "Output modes:",
    ...OUTPUT_MODES,
    "",
    "Exit codes:",
    ...EXIT_CODES,
    "",
    "Examples:",
    "  oh-my-pm github brief owner/repo",
    "  oh-my-pm github risks owner/repo --limit 20 --json",
    "  oh-my-pm github next owner/repo --state open --include-comments",
  ]);
}

function providersHelp(): string {
  return block([
    "Usage:",
    "  oh-my-pm providers status [options]",
    "  oh-my-pm providers doctor [github [owner/repo]] [options]",
    "",
    "Inspects provider configuration and health. Both subcommands are offline by",
    "default; no token value is ever printed.",
    "",
    "Options:",
    "  --provider-config <path>   explicit provider configuration file",
    "  --confirm-network          allow one read-only request",
    "                             (`providers doctor github` only)",
    "  -h, --help                 show this help",
    "",
    "Output modes:",
    ...OUTPUT_MODES,
    "",
    "Exit codes:",
    ...EXIT_CODES,
    "",
    "Examples:",
    "  oh-my-pm providers status",
    "  oh-my-pm providers status --json",
    "  oh-my-pm providers doctor",
    "  oh-my-pm providers doctor github owner/repo --confirm-network",
  ]);
}

function memoryHelp(): string {
  return block([
    "Usage:",
    `  oh-my-pm memory <${MEMORY_SUBCOMMANDS.join("|")}> [options]`,
    "",
    "Local Project Brain memory. Every subcommand is preview-first: a mutating",
    "operation runs only with an explicit --apply, and `delete --apply` also",
    "requires --confirm. Memory stays on this machine and never leaves it.",
    "",
    "Subcommands:",
    "  capture      observe the project and preview or store a snapshot",
    "  changes      compare the two most recent snapshots",
    "  status       report the local store state",
    "  history      list recent snapshots",
    "  export       write a snapshot export to an explicit destination",
    "  delete       remove stored snapshots",
    "",
    "Common options:",
    "  --project <id>         explicit project identity",
    "  --root <path>          project root to observe (default: .)",
    "  --data-dir <path>      explicit local data directory",
    "  --apply                perform the operation instead of previewing it",
    "  --confirm              required with `delete --apply`",
    "  --limit <n>            history entries to list",
    "  -h, --help             show this help",
    "",
    "Output modes:",
    ...OUTPUT_MODES,
    "",
    "Exit codes:",
    ...EXIT_CODES,
    "",
    "Examples:",
    "  oh-my-pm memory status --json",
    "  oh-my-pm memory capture --root .",
    "  oh-my-pm memory capture --root . --apply",
    "  oh-my-pm memory changes --markdown",
    "  oh-my-pm memory history --limit 5",
  ]);
}

function mcpConfigHelp(): string {
  return block([
    "Usage:",
    "  oh-my-pm mcp-config [--json|--markdown] [--name <name>]",
    "",
    "Prints a generic stdio MCP client configuration for the installed OH MY PM",
    "MCP server. The configuration is a preview only: no client file is written,",
    "no project file is touched, and no token, credential, environment value, or",
    "project path is included. The installed prefix is inferred automatically.",
    "",
    "Options:",
    "  --json           JSON output (default)",
    "  --markdown       Markdown wrapper around the JSON",
    "  --name <name>    server key (default: oh-my-pm)",
    "  -h, --help       show this help",
    "",
    "Exit codes:",
    "  0    configuration printed",
    "  2    invalid argument, or the installed MCP executable was not found",
    "",
    "Examples:",
    "  oh-my-pm mcp-config",
    "  oh-my-pm mcp-config --markdown",
    "  oh-my-pm mcp-config --name my-project",
  ]);
}

function projectCommandHelp(command: string, summary: string): string {
  return block([
    "Usage:",
    `  oh-my-pm ${command} [root] [--json|--markdown]`,
    "",
    summary,
    "The project root defaults to the current directory and is read only.",
    "",
    "Options:",
    "  -h, --help    show this help",
    "",
    "Output modes:",
    ...OUTPUT_MODES,
    "",
    "Exit codes:",
    ...EXIT_CODES,
    "",
    "Examples:",
    `  oh-my-pm ${command}`,
    `  oh-my-pm ${command} . --markdown`,
  ]);
}

function simpleCommandHelp(command: string, summary: string): string {
  return block([
    "Usage:",
    `  oh-my-pm ${command} [--json|--markdown]`,
    "",
    summary,
    "",
    "Options:",
    "  -h, --help    show this help",
    "",
    "Output modes:",
    ...OUTPUT_MODES,
    "",
    "Exit codes:",
    ...EXIT_CODES,
    "",
    "Examples:",
    `  oh-my-pm ${command}`,
    `  oh-my-pm ${command} --json`,
  ]);
}

/**
 * Render the help text for a topic. Deterministic: the same topic always yields
 * byte-identical output ending with exactly one newline.
 */
export function formatHelp(topic: HelpTopic): string {
  switch (topic) {
    case "github":
      return githubHelp();
    case "providers":
      return providersHelp();
    case "memory":
      return memoryHelp();
    case "mcp-config":
      return mcpConfigHelp();
    case "brief":
      return projectCommandHelp("brief", "Summarizes the project at [root].");
    case "risks":
      return projectCommandHelp("risks", "Reports the risks recorded for the project at [root].");
    case "next":
      return projectCommandHelp("next", "Reports the next actions for the project at [root].");
    case "handoff":
      return projectCommandHelp("handoff", "Produces a handoff summary for the project at [root].");
    case "status":
      return simpleCommandHelp("status", "Reports runtime and kernel status.");
    case "doctor":
      return simpleCommandHelp("doctor", "Runs offline self-diagnostics.");
    case "plan":
      return block([
        "Usage:",
        "  oh-my-pm plan <request> [--json|--markdown]",
        "",
        "Derives a plan from a short free-text request. The request is one or more",
        "words and is never written to disk.",
        "",
        "Options:",
        "  -h, --help    show this help",
        "",
        "Output modes:",
        ...OUTPUT_MODES,
        "",
        "Exit codes:",
        ...EXIT_CODES,
        "",
        "Examples:",
        "  oh-my-pm plan ship the release",
        '  oh-my-pm plan "reduce onboarding time" --json',
      ]);
    case "install-preview":
      return block([
        "Usage:",
        "  oh-my-pm install-preview <root> [--json|--markdown]",
        "",
        "Previews a local installation under <root>. This is always a dry run: it",
        "writes nothing and installs nothing.",
        "",
        "Options:",
        "  -h, --help    show this help",
        "",
        "Output modes:",
        ...OUTPUT_MODES,
        "",
        "Exit codes:",
        ...EXIT_CODES,
        "",
        "Examples:",
        "  oh-my-pm install-preview .",
        "  oh-my-pm install-preview . --json",
      ]);
    case "top":
      return topHelp();
  }
}
