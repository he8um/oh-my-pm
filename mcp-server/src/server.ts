import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { executeMcpGitHubTool, githubOperationForToolName } from "./github-tool-runner.js";
import { executeMcpProjectTool, projectOperationForToolName } from "./project-tool-runner.js";
import type {
  McpGitHubOperation,
  McpGitHubToolExecution,
  McpGitHubToolName,
  McpGitHubToolSuccess,
  McpProjectOperation,
  McpProjectToolExecution,
  McpProjectToolName,
  McpProjectToolSuccess,
} from "./types.js";

export const OH_MY_PM_MCP_SERVER_NAME = "oh-my-pm";
export const OH_MY_PM_MCP_SERVER_VERSION = "0.2.0-alpha.0";

// --- Public structured result shapes -------------------------------------

export type McpPublicProjectDocuments = {
  filesMatched: number;
  filesExcluded: number;
  filesLoaded: number;
  totalBytes: number;
  configExists: boolean;
};

export type McpProjectBriefOutput = {
  title: string;
  summary: string;
  counts: { total: number; done: number; blocked: number; open: number };
  highlights: string[];
  generatedAt: string;
};

export type McpProjectBriefResult = {
  operation: "brief";
  root: string;
  documents: McpPublicProjectDocuments;
  result: McpProjectBriefOutput;
};

export type McpSignalSource =
  | "structured"
  | "markdown"
  | "github-repository"
  | "github-issue"
  | "github-pull-request"
  | "generic";

export type McpSignalItemType =
  | "task"
  | "document"
  | "issue"
  | "pullRequest"
  | "record"
  | "note"
  | "unknown";

export type McpSignalMetadata = {
  source?: McpSignalSource;
  sourceType?: McpSignalItemType;
  url?: string;
  owner?: string;
  due?: string;
  repository?: string;
  number?: number;
};

export type McpProjectRisksOutput = {
  risks: Array<
    {
      id: string;
      title: string;
      severity: "low" | "medium" | "high";
      reason: string;
    } & McpSignalMetadata
  >;
};

export type McpProjectRisksResult = {
  operation: "risks";
  root: string;
  documents: McpPublicProjectDocuments;
  result: McpProjectRisksOutput;
};

export type McpProjectNextOutput = {
  tasks: Array<
    {
      id: string;
      title: string;
      reason: string;
      priority?: "low" | "medium" | "high";
    } & McpSignalMetadata
  >;
};

export type McpProjectNextResult = {
  operation: "next";
  root: string;
  documents: McpPublicProjectDocuments;
  result: McpProjectNextOutput;
};

export type McpProjectHandoffOutput = {
  title: string;
  sections: Array<{ heading: string; items: string[] }>;
  generatedAt: string;
};

export type McpProjectHandoffResult = {
  operation: "handoff";
  root: string;
  documents: McpPublicProjectDocuments;
  result: McpProjectHandoffOutput;
};

// --- Zod schemas (input + strict output) ---------------------------------

const rootInputShape = {
  root: z
    .string()
    .trim()
    .min(1)
    .default(".")
    .describe("Local project directory containing Markdown project documents"),
} as const;

const documentsSchema = z
  .object({
    filesMatched: z.number().int(),
    filesExcluded: z.number().int(),
    filesLoaded: z.number().int(),
    totalBytes: z.number().int(),
    configExists: z.boolean(),
  })
  .strict();

const briefOutputShape = {
  operation: z.literal("brief"),
  root: z.string(),
  documents: documentsSchema,
  result: z
    .object({
      title: z.string(),
      summary: z.string(),
      counts: z
        .object({
          total: z.number().int(),
          done: z.number().int(),
          blocked: z.number().int(),
          open: z.number().int(),
        })
        .strict(),
      highlights: z.array(z.string()),
      generatedAt: z.string(),
    })
    .strict(),
} as const;

// Optional public provenance shared by risk and next-task entries. Never
// includes body text, labels, provider responses, or transport metadata.
const signalMetadataShape = {
  source: z
    .enum(["structured", "markdown", "github-repository", "github-issue", "github-pull-request", "generic"])
    .optional(),
  sourceType: z
    .enum(["task", "document", "issue", "pullRequest", "record", "note", "unknown"])
    .optional(),
  url: z.string().optional(),
  owner: z.string().optional(),
  due: z.string().optional(),
  repository: z.string().optional(),
  number: z.number().int().optional(),
} as const;

const risksOutputShape = {
  operation: z.literal("risks"),
  root: z.string(),
  documents: documentsSchema,
  result: z
    .object({
      risks: z.array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            severity: z.enum(["low", "medium", "high"]),
            reason: z.string(),
            ...signalMetadataShape,
          })
          .strict(),
      ),
    })
    .strict(),
} as const;

const nextOutputShape = {
  operation: z.literal("next"),
  root: z.string(),
  documents: documentsSchema,
  result: z
    .object({
      tasks: z.array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            reason: z.string(),
            priority: z.enum(["low", "medium", "high"]).optional(),
            ...signalMetadataShape,
          })
          .strict(),
      ),
    })
    .strict(),
} as const;

const handoffOutputShape = {
  operation: z.literal("handoff"),
  root: z.string(),
  documents: documentsSchema,
  result: z
    .object({
      title: z.string(),
      sections: z.array(
        z.object({ heading: z.string(), items: z.array(z.string()) }).strict(),
      ),
      generatedAt: z.string(),
    })
    .strict(),
} as const;

// --- Strict output projectors --------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicDocuments(execution: McpProjectToolSuccess): McpPublicProjectDocuments {
  const d = execution.documents;
  return {
    filesMatched: d.filesMatched,
    filesExcluded: d.filesExcluded,
    filesLoaded: d.filesLoaded,
    totalBytes: d.totalBytes,
    configExists: d.configExists,
  };
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    result.push(entry);
  }
  return result;
}

export function projectBriefResult(
  execution: McpProjectToolSuccess,
): McpProjectBriefResult | null {
  const output = execution.output;
  if (!isRecord(output)) return null;
  const { title, summary, counts, highlights, generatedAt } = output;
  if (typeof title !== "string" || typeof summary !== "string") return null;
  if (typeof generatedAt !== "string") return null;
  if (!isRecord(counts)) return null;
  const { total, done, blocked, open } = counts;
  if (
    typeof total !== "number" ||
    typeof done !== "number" ||
    typeof blocked !== "number" ||
    typeof open !== "number"
  ) {
    return null;
  }
  const highlightList = asStringArray(highlights);
  if (highlightList === null) return null;
  return {
    operation: "brief",
    root: execution.root,
    documents: publicDocuments(execution),
    result: {
      title,
      summary,
      counts: { total, done, blocked, open },
      highlights: highlightList,
      generatedAt,
    },
  };
}

const SIGNAL_SOURCES = new Set([
  "structured",
  "markdown",
  "github-repository",
  "github-issue",
  "github-pull-request",
  "generic",
]);
const SIGNAL_ITEM_TYPES = new Set([
  "task",
  "document",
  "issue",
  "pullRequest",
  "record",
  "note",
  "unknown",
]);

/** Extract only the public, safe provenance fields from a raw signal entry. */
function signalMetadata(raw: Record<string, unknown>): McpSignalMetadata {
  const meta: McpSignalMetadata = {};
  if (typeof raw["source"] === "string" && SIGNAL_SOURCES.has(raw["source"])) {
    meta.source = raw["source"] as McpSignalSource;
  }
  if (typeof raw["sourceType"] === "string" && SIGNAL_ITEM_TYPES.has(raw["sourceType"])) {
    meta.sourceType = raw["sourceType"] as McpSignalItemType;
  }
  if (typeof raw["url"] === "string") meta.url = raw["url"];
  if (typeof raw["owner"] === "string") meta.owner = raw["owner"];
  if (typeof raw["due"] === "string") meta.due = raw["due"];
  if (typeof raw["repository"] === "string") meta.repository = raw["repository"];
  if (typeof raw["number"] === "number" && Number.isInteger(raw["number"])) {
    meta.number = raw["number"];
  }
  return meta;
}

export function projectRisksResult(
  execution: McpProjectToolSuccess,
): McpProjectRisksResult | null {
  const output = execution.output;
  if (!isRecord(output) || !Array.isArray(output["risks"])) return null;
  const risks: McpProjectRisksOutput["risks"] = [];
  for (const raw of output["risks"]) {
    if (!isRecord(raw)) return null;
    const { id, title, severity, reason } = raw;
    if (typeof id !== "string" || typeof title !== "string" || typeof reason !== "string") {
      return null;
    }
    if (severity !== "low" && severity !== "medium" && severity !== "high") return null;
    risks.push({ id, title, severity, reason, ...signalMetadata(raw) });
  }
  return {
    operation: "risks",
    root: execution.root,
    documents: publicDocuments(execution),
    result: { risks },
  };
}

export function projectNextResult(
  execution: McpProjectToolSuccess,
): McpProjectNextResult | null {
  const output = execution.output;
  if (!isRecord(output) || !Array.isArray(output["tasks"])) return null;
  const tasks: McpProjectNextOutput["tasks"] = [];
  for (const raw of output["tasks"]) {
    if (!isRecord(raw)) return null;
    const { id, title, reason, priority } = raw;
    if (typeof id !== "string" || typeof title !== "string" || typeof reason !== "string") {
      return null;
    }
    const task: McpProjectNextOutput["tasks"][number] = { id, title, reason, ...signalMetadata(raw) };
    if (priority === "low" || priority === "medium" || priority === "high") {
      task.priority = priority;
    }
    tasks.push(task);
  }
  return {
    operation: "next",
    root: execution.root,
    documents: publicDocuments(execution),
    result: { tasks },
  };
}

export function projectHandoffResult(
  execution: McpProjectToolSuccess,
): McpProjectHandoffResult | null {
  const output = execution.output;
  if (!isRecord(output) || !Array.isArray(output["sections"])) return null;
  const { title, generatedAt } = output;
  if (typeof title !== "string" || typeof generatedAt !== "string") return null;
  const sections: McpProjectHandoffOutput["sections"] = [];
  for (const raw of output["sections"]) {
    if (!isRecord(raw)) return null;
    if (typeof raw["heading"] !== "string") return null;
    const items = asStringArray(raw["items"]);
    if (items === null) return null;
    sections.push({ heading: raw["heading"], items });
  }
  return {
    operation: "handoff",
    root: execution.root,
    documents: publicDocuments(execution),
    result: { title, sections, generatedAt },
  };
}

// --- Server construction ---------------------------------------------------

export type McpProjectToolExecutor = (
  operation: McpProjectOperation,
  root: string,
) => Promise<McpProjectToolExecution>;

export type McpGitHubToolExecutor = (
  operation: McpGitHubOperation,
  repository: string,
  limit: number,
) => Promise<McpGitHubToolExecution>;

export type CreateOhMyPmMcpServerOptions = {
  executeProjectTool?: McpProjectToolExecutor;
  executeGitHubTool?: McpGitHubToolExecutor;
};

// GitHub tool input/output schemas. Input is a strict owner/repo plus an
// optional 1..100 limit; there is no token, API-URL, arbitrary-query, or local
// root field. Output carries a sanitized source list only — never raw bodies,
// provider responses, planner input, task graph, or Runtime trace.
const githubInputShape = {
  repository: z
    .string()
    .trim()
    .min(1)
    .describe("Target GitHub repository in owner/repository form"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Maximum number of repository/issue/pull-request items (1..100)"),
} as const;

const githubSourceSchema = z
  .object({
    type: z.enum(["issue", "pullRequest"]),
    number: z.number().int(),
    title: z.string(),
    state: z.string(),
    url: z.string().optional(),
  })
  .strict();

function githubOutputShape(operation: McpGitHubOperation) {
  return {
    ok: z.literal(true),
    operation: z.literal(operation),
    repository: z.string(),
    sourceSummary: z
      .object({
        total: z.number().int(),
        repositories: z.number().int(),
        issues: z.number().int(),
        pullRequests: z.number().int(),
      })
      .strict(),
    sources: z.array(githubSourceSchema),
    output: z.unknown(),
    markdown: z.string(),
  } as const;
}

function githubPublicResult(execution: McpGitHubToolSuccess): Record<string, unknown> {
  return {
    ok: true,
    operation: execution.operation,
    repository: execution.repository,
    sourceSummary: execution.sourceSummary,
    sources: execution.sources,
    output: execution.output,
    markdown: execution.markdown,
  };
}

const PROJECT_OUTPUT_INVALID_TEXT =
  "project_output_invalid: runtime output did not match the expected tool shape";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function errorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function successResult(markdown: string, structured: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: markdown }],
    structuredContent: structured,
  };
}

/** Run one tool operation and project it to a public MCP result. */
async function handleProjectTool(
  execute: McpProjectToolExecutor,
  toolName: McpProjectToolName,
  root: string,
  project: (execution: McpProjectToolSuccess) => Record<string, unknown> | null,
): Promise<ToolResult> {
  const operation = projectOperationForToolName(toolName);
  let execution: McpProjectToolExecution;
  try {
    execution = await execute(operation, root);
  } catch {
    // Unexpected programmer error at the executor boundary: never leak stack
    // traces or raw exception text.
    return errorResult("project_runtime_failed: unexpected local project tool failure");
  }
  if (!execution.ok) {
    return errorResult(`${execution.code}: ${execution.message}`);
  }
  const projected = project(execution);
  if (projected === null) {
    return errorResult(PROJECT_OUTPUT_INVALID_TEXT);
  }
  return successResult(execution.markdown, projected);
}

/** Run one GitHub tool operation and project it to a public MCP result. */
async function handleGitHubTool(
  execute: McpGitHubToolExecutor,
  toolName: McpGitHubToolName,
  repository: string,
  limit: number,
): Promise<ToolResult> {
  const operation = githubOperationForToolName(toolName);
  let execution: McpGitHubToolExecution;
  try {
    execution = await execute(operation, repository, limit);
  } catch {
    // Never leak stack traces or raw exception text (which could contain a URL
    // or token). A generic, stable public-safe message only.
    return errorResult("github_runtime_failed: unexpected GitHub tool failure");
  }
  if (!execution.ok) {
    return errorResult(`${execution.code}: ${execution.message}`);
  }
  return successResult(execution.markdown, githubPublicResult(execution));
}

export function createOhMyPmMcpServer(options?: CreateOhMyPmMcpServerOptions): McpServer {
  const execute = options?.executeProjectTool ?? executeMcpProjectTool;
  const executeGitHub = options?.executeGitHubTool ?? executeMcpGitHubTool;

  const server = new McpServer(
    {
      name: OH_MY_PM_MCP_SERVER_NAME,
      version: OH_MY_PM_MCP_SERVER_VERSION,
    },
    {
      instructions:
        "OH MY PM provides read-only local project intelligence from Markdown documents. All tools require a local project root, respect oh-my-pm.config.json, never modify files, and never upload project context.",
    },
  );

  server.registerTool(
    "project_brief",
    {
      title: "Project Brief",
      description:
        "Generate a deterministic read-only project status brief from local Markdown documents under the supplied root. Respects oh-my-pm.config.json and never modifies files or uploads project context.",
      inputSchema: rootInputShape,
      outputSchema: briefOutputShape,
    },
    ({ root }) => handleProjectTool(execute, "project_brief", root, projectBriefResult),
  );

  server.registerTool(
    "project_risks",
    {
      title: "Project Risks",
      description:
        "Detect deterministic document-level project risk signals from local Markdown documents under the supplied root. Respects oh-my-pm.config.json and never modifies files or uploads project context.",
      inputSchema: rootInputShape,
      outputSchema: risksOutputShape,
    },
    ({ root }) => handleProjectTool(execute, "project_risks", root, projectRisksResult),
  );

  server.registerTool(
    "project_next",
    {
      title: "Project Next Tasks",
      description:
        "Derive deterministic next tasks from unchecked Markdown checklist items under the supplied root. Respects oh-my-pm.config.json and never modifies files or uploads project context.",
      inputSchema: rootInputShape,
      outputSchema: nextOutputShape,
    },
    ({ root }) => handleProjectTool(execute, "project_next", root, projectNextResult),
  );

  server.registerTool(
    "project_handoff",
    {
      title: "Project Handoff",
      description:
        "Build a deterministic project handoff from local Markdown sections under the supplied root. Respects oh-my-pm.config.json and never modifies files or uploads project context.",
      inputSchema: rootInputShape,
      outputSchema: handoffOutputShape,
    },
    ({ root }) => handleProjectTool(execute, "project_handoff", root, projectHandoffResult),
  );

  // GitHub tools follow the local project tools. Registration performs no
  // network request; a GitHub request happens only when one of these is called.
  const githubTools: ReadonlyArray<{
    name: McpGitHubToolName;
    title: string;
    operation: McpGitHubOperation;
    description: string;
  }> = [
    {
      name: "github_project_brief",
      title: "GitHub Project Brief",
      operation: "brief",
      description:
        "Generate a read-only status brief for a GitHub repository from repository metadata plus open issues and pull requests. Read-only; performs an outbound GET request to api.github.com only when called.",
    },
    {
      name: "github_project_risks",
      title: "GitHub Project Risks",
      operation: "risks",
      description:
        "Detect risk signals for a GitHub repository from open issues and pull requests. Read-only; performs an outbound GET request to api.github.com only when called.",
    },
    {
      name: "github_project_next",
      title: "GitHub Project Next Tasks",
      operation: "next",
      description:
        "Derive next tasks for a GitHub repository from open issues and pull requests. Read-only; performs an outbound GET request to api.github.com only when called.",
    },
    {
      name: "github_project_handoff",
      title: "GitHub Project Handoff",
      operation: "handoff",
      description:
        "Build a handoff for a GitHub repository from open issues and pull requests. Read-only; performs an outbound GET request to api.github.com only when called.",
    },
  ];

  for (const tool of githubTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: githubInputShape,
        outputSchema: githubOutputShape(tool.operation),
      },
      ({ repository, limit }) =>
        handleGitHubTool(executeGitHub, tool.name, repository, limit ?? 50),
    );
  }

  return server;
}

export async function startOhMyPmMcpStdioServer(): Promise<void> {
  const server = createOhMyPmMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
