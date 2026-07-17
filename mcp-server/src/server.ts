import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { executeMcpProjectTool, projectOperationForToolName } from "./project-tool-runner.js";
import type {
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

export type McpProjectRisksOutput = {
  risks: Array<{
    id: string;
    title: string;
    severity: "low" | "medium" | "high";
    reason: string;
  }>;
};

export type McpProjectRisksResult = {
  operation: "risks";
  root: string;
  documents: McpPublicProjectDocuments;
  result: McpProjectRisksOutput;
};

export type McpProjectNextOutput = {
  tasks: Array<{ id: string; title: string; reason: string }>;
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
        z.object({ id: z.string(), title: z.string(), reason: z.string() }).strict(),
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
    risks.push({ id, title, severity, reason });
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
    const { id, title, reason } = raw;
    if (typeof id !== "string" || typeof title !== "string" || typeof reason !== "string") {
      return null;
    }
    tasks.push({ id, title, reason });
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
) => McpProjectToolExecution;

export type CreateOhMyPmMcpServerOptions = {
  executeProjectTool?: McpProjectToolExecutor;
};

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
function handleProjectTool(
  execute: McpProjectToolExecutor,
  toolName: McpProjectToolName,
  root: string,
  project: (execution: McpProjectToolSuccess) => Record<string, unknown> | null,
): ToolResult {
  const operation = projectOperationForToolName(toolName);
  let execution: McpProjectToolExecution;
  try {
    execution = execute(operation, root);
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

export function createOhMyPmMcpServer(options?: CreateOhMyPmMcpServerOptions): McpServer {
  const execute = options?.executeProjectTool ?? executeMcpProjectTool;

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

  return server;
}

export async function startOhMyPmMcpStdioServer(): Promise<void> {
  const server = createOhMyPmMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
