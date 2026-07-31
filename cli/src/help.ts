// Conventional CLI help text. Pure and fully deterministic: the text is built
// from static structure only — no filesystem, environment, network, clock,
// randomness, colors, paging, or localization. Help never reads a token and
// never creates a file or an application-data directory.
//
// The help surface is a description of the CLI that already exists; it adds no
// command, option, or behavior of its own.

import { CANONICAL_CLI_COMMAND } from "./command-surface.js";
import { MEMORY_SUBCOMMANDS } from "./memory-types.js";

// The canonical CLI command, bound once so every usage line, example, and
// namespace pointer in this file renders the same name. Help never presents a
// deprecated compatibility alias as an equal alternative: a legacy wrapper
// prints this same canonical help after its stderr deprecation warning.
const CLI = CANONICAL_CLI_COMMAND;

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
    `  ${CLI} <command> [options]`,
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
    `  ${CLI} status`,
    `  ${CLI} brief . --markdown`,
    `  ${CLI} github risks owner/repo --limit 20`,
    `  ${CLI} providers status --json`,
    `  ${CLI} memory status --json`,
    `  ${CLI} mcp-config`,
    "",
    `Run \`${CLI} <namespace> --help\` for namespace details.`,
  ]);
}

function githubHelp(): string {
  return block([
    "Usage:",
    `  ${CLI} github <brief|risks|next|handoff> [owner/repo] [options]`,
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
    `  ${CLI} github brief owner/repo`,
    `  ${CLI} github risks owner/repo --limit 20 --json`,
    `  ${CLI} github next owner/repo --state open --include-comments`,
  ]);
}

function providersHelp(): string {
  return block([
    "Usage:",
    `  ${CLI} providers status [options]`,
    `  ${CLI} providers doctor [github [owner/repo]] [options]`,
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
    `  ${CLI} providers status`,
    `  ${CLI} providers status --json`,
    `  ${CLI} providers doctor`,
    `  ${CLI} providers doctor github owner/repo --confirm-network`,
  ]);
}

function memoryHelp(): string {
  return block([
    "Usage:",
    `  ${CLI} memory <${MEMORY_SUBCOMMANDS.join("|")}> [options]`,
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
    "  timeline     list the derived history of project changes (read-only)",
    "",
    "Common options:",
    "  --project-id <id>      explicit project identity",
    "  --data-dir <path>      explicit local data directory",
    "  --apply                perform the operation instead of previewing it",
    "  --confirm              required with `delete --apply`",
    "  --limit <n>            entries to list (history, timeline)",
    "  -h, --help             show this help",
    "",
    "Timeline options:",
    "  --before-sequence <n>  page before this capture sequence",
    "  --category <value>     filter by change category",
    "  --kind <value>         filter by item kind",
    "",
    "Output modes:",
    ...OUTPUT_MODES,
    "",
    "Exit codes:",
    ...EXIT_CODES,
    "",
    "Examples:",
    `  ${CLI} memory status --json`,
    `  ${CLI} memory capture --root .`,
    `  ${CLI} memory capture --root . --apply`,
    `  ${CLI} memory changes --markdown`,
    `  ${CLI} memory history --limit 5`,
    `  ${CLI} memory timeline --project-id my-project`,
    `  ${CLI} memory timeline --project-id my-project --kind risk --limit 10`,
  ]);
}

function mcpConfigHelp(): string {
  return block([
    "Usage:",
    `  ${CLI} mcp-config [--json|--markdown] [--name <name>]`,
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
    `  ${CLI} mcp-config`,
    `  ${CLI} mcp-config --markdown`,
    `  ${CLI} mcp-config --name my-project`,
  ]);
}

function projectCommandHelp(command: string, summary: string): string {
  return block([
    "Usage:",
    `  ${CLI} ${command} [root] [--json|--markdown]`,
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
    `  ${CLI} ${command}`,
    `  ${CLI} ${command} . --markdown`,
  ]);
}

function simpleCommandHelp(command: string, summary: string): string {
  return block([
    "Usage:",
    `  ${CLI} ${command} [--json|--markdown]`,
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
    `  ${CLI} ${command}`,
    `  ${CLI} ${command} --json`,
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
        `  ${CLI} plan <request> [--json|--markdown]`,
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
        `  ${CLI} plan ship the release`,
        `  ${CLI} plan "reduce onboarding time" --json`,
      ]);
    case "install-preview":
      return block([
        "Usage:",
        `  ${CLI} install-preview <root> [--json|--markdown]`,
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
        `  ${CLI} install-preview .`,
        `  ${CLI} install-preview . --json`,
      ]);
    case "top":
      return topHelp();
  }
}
