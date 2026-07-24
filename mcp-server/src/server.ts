import type { ProviderDoctorReport, ProviderStatusReport } from "@oh-my-pm/cli";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { executeMcpGitHubTool, githubOperationForToolName } from "./github-tool-runner.js";
import { executeMcpProjectTool, projectOperationForToolName } from "./project-tool-runner.js";
import {
  executeMcpGitHubProviderDiagnostics,
  executeMcpProviderStatus,
} from "./provider-diagnostics-runner.js";
import type {
  McpGitHubOperation,
  McpGitHubToolExecution,
  McpGitHubToolInput,
  McpGitHubToolName,
  McpGitHubToolSuccess,
  McpProjectOperation,
  McpProjectToolExecution,
  McpProjectToolName,
  McpProjectToolSuccess,
} from "./types.js";

export const OH_MY_PM_MCP_SERVER_NAME = "oh-my-pm";
export const OH_MY_PM_MCP_SERVER_VERSION = "0.2.0-rc.1";

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
  input: McpGitHubToolInput,
) => Promise<McpGitHubToolExecution>;

export type McpProviderStatusExecutor = () => ProviderStatusReport;

export type McpGitHubProviderDiagnosticsExecutor = (
  input: { repository?: string; confirmNetwork?: boolean },
) => Promise<ProviderDoctorReport>;

export type CreateOhMyPmMcpServerOptions = {
  executeProjectTool?: McpProjectToolExecutor;
  executeGitHubTool?: McpGitHubToolExecutor;
  executeProviderStatus?: McpProviderStatusExecutor;
  executeGitHubProviderDiagnostics?: McpGitHubProviderDiagnosticsExecutor;
};

// GitHub tool input/output schemas. Input is a strict owner/repo plus an
// optional 1..100 limit; there is no token, API-URL, arbitrary-query, or local
// root field. Output carries a sanitized source list only — never raw bodies,
// provider responses, planner input, task graph, or Runtime trace.
// Repository and limit are optional: provider configuration may supply the
// defaults. There is no token, API-URL, config-path, or header input.
const githubInputShape = {
  repository: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Target GitHub repository in owner/repository form; falls back to the configured default when omitted",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of repository/issue/pull-request items (1..100)"),
  source: z
    .enum(["overview", "repository", "issues", "pull-requests", "item", "search"])
    .optional()
    .describe("Which context to analyze; falls back to the configured default source"),
  state: z
    .enum(["open", "closed", "all"])
    .optional()
    .describe("Item state selection for overview/issues/pull-requests/search"),
  number: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Issue or pull-request number; required by the item source"),
  query: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .optional()
    .describe("Repository-scoped search text; required by the search source"),
  kind: z
    .enum(["all", "issues", "pull-requests"])
    .optional()
    .describe("Search result kind filter for the search source"),
  includeComments: z
    .boolean()
    .optional()
    .describe("Include ordinary conversation comments for the item source (disabled by default)"),
  commentLimit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum item comments when includeComments is set (1..50, default 20)"),
  includeReviews: z
    .boolean()
    .optional()
    .describe(
      "Include pull-request review submissions for the item source; the item must be a pull request (disabled by default)",
    ),
  reviewLimit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Maximum pull-request reviews when includeReviews is set (1..20, default 10)"),
  includeReviewComments: z
    .boolean()
    .optional()
    .describe(
      "Include inline pull-request review comments for the item source; the item must be a pull request (disabled by default)",
    ),
  reviewCommentLimit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Maximum inline review comments when includeReviewComments is set (1..20, default 10)",
    ),
} as const;

// A public comment metadata entry: identity and provenance only, never the
// comment body or any raw provider object.
const githubCommentSchema = z
  .object({
    id: z.string(),
    author: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

// A public review metadata entry: identity/state/provenance only, never the
// review body, diff hunk, commit id, or any raw provider object.
const githubReviewSchema = z
  .object({
    id: z.string(),
    author: z.string(),
    state: z.enum(["approved", "changesRequested", "commented", "dismissed", "pending", "unknown"]),
    submittedAt: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

// A public review-comment metadata entry: identity/file provenance only, never
// the body, diff hunk, commit id, or any raw provider object.
const githubReviewCommentSchema = z
  .object({
    id: z.string(),
    author: z.string(),
    filePath: z.string().optional(),
    line: z.number().int().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

const githubSourceSchema = z
  .object({
    type: z.enum(["issue", "pullRequest"]),
    number: z.number().int(),
    title: z.string(),
    state: z.string(),
    url: z.string().optional(),
    comments: z.array(githubCommentSchema).max(50).optional(),
    reviews: z.array(githubReviewSchema).max(20).optional(),
    reviewComments: z.array(githubReviewCommentSchema).max(20).optional(),
  })
  .strict();

const githubSelectionSchema = z
  .object({
    mode: z.enum(["overview", "repository", "issues", "pull-requests", "item", "search"]),
    state: z.enum(["open", "closed", "all"]).optional(),
    kind: z.enum(["all", "issues", "pull-requests"]).optional(),
    number: z.number().int().optional(),
    query: z.string().optional(),
    limit: z.number().int().optional(),
    includeComments: z.boolean().optional(),
    commentLimit: z.number().int().optional(),
    includeReviews: z.boolean().optional(),
    reviewLimit: z.number().int().optional(),
    includeReviewComments: z.boolean().optional(),
    reviewCommentLimit: z.number().int().optional(),
  })
  .strict();

function githubOutputShape(operation: McpGitHubOperation) {
  return {
    ok: z.literal(true),
    operation: z.literal(operation),
    repository: z.string(),
    selection: githubSelectionSchema,
    sourceSummary: z
      .object({
        total: z.number().int(),
        repositories: z.number().int(),
        issues: z.number().int(),
        pullRequests: z.number().int(),
        comments: z.number().int(),
        reviews: z.number().int(),
        reviewComments: z.number().int(),
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
    selection: execution.selection,
    sourceSummary: execution.sourceSummary,
    sources: execution.sources,
    output: execution.output,
    markdown: execution.markdown,
  };
}

// --- Provider diagnostics tool schemas -------------------------------------

const providerDiagnosticCheckSchema = z
  .object({
    id: z.string(),
    status: z.enum(["ok", "info", "warning", "fail"]),
    message: z.string(),
  })
  .strict();

// provider_status takes no input. Its output is the structured status report:
// resolved config source/existence/validity, per-provider read-only network
// posture and state, and token presence only — never a token value.
const providerStatusOutputShape = {
  schemaVersion: z.literal(1),
  config: z
    .object({
      source: z.enum(["explicit", "environment", "xdg", "home", "appdata", "defaults"]),
      exists: z.boolean(),
      displayPath: z.string(),
      valid: z.boolean(),
    })
    .strict(),
  providers: z.array(
    z
      .object({
        id: z.enum(["local", "github"]),
        enabled: z.boolean(),
        readOnly: z.literal(true),
        network: z.enum(["none", "explicit-opt-in"]),
        state: z.enum(["ready", "disabled", "needs-repository"]),
        defaultRepository: z.string().optional(),
        defaultLimit: z.number().int().optional(),
        defaultSource: z.enum(["overview", "repository", "issues", "pull-requests"]).optional(),
        defaultState: z.enum(["open", "closed", "all"]).optional(),
        token: z.enum(["not-applicable", "present", "absent"]),
        sourceSelection: z
          .object({
            defaultSource: z.enum(["overview", "repository", "issues", "pull-requests"]),
            defaultState: z.enum(["open", "closed", "all"]),
            modes: z.array(z.enum(["overview", "repository", "issues", "pull-requests", "item", "search"])),
            states: z.array(z.enum(["open", "closed", "all"])),
            searchKinds: z.array(z.enum(["all", "issues", "pull-requests"])),
            singleItemFetch: z.literal(true),
            singlePage: z.literal(true),
            comments: z
              .object({
                supported: z.literal(true),
                defaultEnabled: z.literal(false),
                defaultLimit: z.literal(20),
                maxLimit: z.literal(50),
                pagination: z.literal("single-page"),
              })
              .strict(),
            reviews: z
              .object({
                supported: z.literal(true),
                defaultEnabled: z.literal(false),
                defaultLimit: z.literal(10),
                maxLimit: z.literal(20),
                pagination: z.literal("single-page"),
              })
              .strict(),
            reviewComments: z
              .object({
                supported: z.literal(true),
                defaultEnabled: z.literal(false),
                defaultLimit: z.literal(10),
                maxLimit: z.literal(20),
                pagination: z.literal("single-page"),
              })
              .strict(),
            timelines: z.literal(false),
            pullRequestFiles: z.literal(false),
          })
          .strict()
          .optional(),
      })
      .strict(),
  ),
} as const;

// github_provider_diagnostics: optional repository (configured default may be
// used) and optional confirmNetwork (defaults false). No limit, token, config
// path, API URL, or header input.
const githubDiagnosticsInputShape = {
  repository: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Target GitHub repository in owner/repository form; falls back to the configured default"),
  confirmNetwork: z
    .boolean()
    .default(false)
    .describe("When true, perform exactly one read-only GET repository-metadata request"),
} as const;

const githubDiagnosticsOutputShape = {
  schemaVersion: z.literal(1),
  ok: z.boolean(),
  networkAttempted: z.boolean(),
  checks: z.array(providerDiagnosticCheckSchema),
  github: z
    .object({
      repository: z.string().optional(),
      limit: z.number().int().optional(),
      authentication: z.enum(["token-present", "unauthenticated"]),
      access: z.enum(["ok", "failed", "not-checked"]).optional(),
      providerCode: z.string().optional(),
    })
    .strict()
    .optional(),
} as const;

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
  input: McpGitHubToolInput,
): Promise<ToolResult> {
  const operation = githubOperationForToolName(toolName);
  let execution: McpGitHubToolExecution;
  try {
    execution = await execute(operation, input);
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
  const executeProviderStatus = options?.executeProviderStatus ?? executeMcpProviderStatus;
  const executeGitHubProviderDiagnostics =
    options?.executeGitHubProviderDiagnostics ?? executeMcpGitHubProviderDiagnostics;

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
      ({
        repository,
        limit,
        source,
        state,
        number,
        query,
        kind,
        includeComments,
        commentLimit,
        includeReviews,
        reviewLimit,
        includeReviewComments,
        reviewCommentLimit,
      }) =>
        handleGitHubTool(executeGitHub, tool.name, {
          ...(repository !== undefined ? { repository } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(source !== undefined ? { source } : {}),
          ...(state !== undefined ? { state } : {}),
          ...(number !== undefined ? { number } : {}),
          ...(query !== undefined ? { query } : {}),
          ...(kind !== undefined ? { kind } : {}),
          ...(includeComments !== undefined ? { includeComments } : {}),
          ...(commentLimit !== undefined ? { commentLimit } : {}),
          ...(includeReviews !== undefined ? { includeReviews } : {}),
          ...(reviewLimit !== undefined ? { reviewLimit } : {}),
          ...(includeReviewComments !== undefined ? { includeReviewComments } : {}),
          ...(reviewCommentLimit !== undefined ? { reviewCommentLimit } : {}),
        }),
    );
  }

  // Provider diagnostics tools follow the eight workflow tools, in this exact
  // order: provider_status then github_provider_diagnostics. Registration
  // performs no network request. The agent cannot supply a config path, token,
  // API URL, or custom headers.
  server.registerTool(
    "provider_status",
    {
      title: "Provider Status",
      description:
        "Report resolved provider configuration and token presence offline. Never accesses the network. Resolves configuration from the process environment or standard OS location; the agent cannot supply a config path.",
      inputSchema: {},
      outputSchema: providerStatusOutputShape,
    },
    () => {
      let report: ProviderStatusReport;
      try {
        report = executeProviderStatus();
      } catch {
        return errorResult("provider_status_failed: unexpected provider status failure");
      }
      return successResult(
        `provider status: ${report.config.valid ? "ready" : "invalid"}`,
        report as unknown as Record<string, unknown>,
      );
    },
  );

  server.registerTool(
    "github_provider_diagnostics",
    {
      title: "GitHub Provider Diagnostics",
      description:
        "Run offline GitHub provider diagnostics; with confirmNetwork it performs exactly one read-only GET repository-metadata request. No token, config path, API URL, or header input; the repository falls back to the configured default when omitted.",
      inputSchema: githubDiagnosticsInputShape,
      outputSchema: githubDiagnosticsOutputShape,
    },
    async ({ repository, confirmNetwork }) => {
      let report: ProviderDoctorReport;
      try {
        report = await executeGitHubProviderDiagnostics({
          ...(repository !== undefined ? { repository } : {}),
          confirmNetwork: confirmNetwork ?? false,
        });
      } catch {
        return errorResult("github_provider_diagnostics_failed: unexpected diagnostics failure");
      }
      return successResult(
        `github provider diagnostics: ${report.ok ? "ok" : "attention"}`,
        report as unknown as Record<string, unknown>,
      );
    },
  );

  return server;
}

export async function startOhMyPmMcpStdioServer(): Promise<void> {
  const server = createOhMyPmMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
