import { formatRuntimeResponse, runLocalProjectWorkflow } from "@oh-my-pm/application";
import { loadConfiguredMarkdownProjectDocuments } from "@oh-my-pm/application/node";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import type {
  McpProjectOperation,
  McpProjectToolExecution,
  McpProjectToolName,
} from "./types.js";

// Deterministic runtime identity for the MCP server: no real clock, no
// randomness, no environment reads. Distinct from the CLI wrapper's value so
// the MCP surface is self-describing.
export const MCP_PROJECT_RUNTIME_VERSION = "0.5.1";
export const MCP_PROJECT_RUNTIME_NOW = "2026-01-01T00:00:00.000Z";

const OPERATION_TO_TOOL: Readonly<Record<McpProjectOperation, McpProjectToolName>> = {
  brief: "project_brief",
  risks: "project_risks",
  next: "project_next",
  handoff: "project_handoff",
};

const TOOL_TO_OPERATION: Readonly<Record<McpProjectToolName, McpProjectOperation>> = {
  project_brief: "brief",
  project_risks: "risks",
  project_next: "next",
  project_handoff: "handoff",
};

export function toolNameForProjectOperation(operation: McpProjectOperation): McpProjectToolName {
  return OPERATION_TO_TOOL[operation];
}

export function projectOperationForToolName(toolName: McpProjectToolName): McpProjectOperation {
  return TOOL_TO_OPERATION[toolName];
}

/**
 * Execute one read-only local project workflow.
 *
 * The pipeline itself -- config-aware Markdown loading, failure classification,
 * the deterministic request factory, and the Kernel -- is the shared
 * application use case, so the CLI and this tool cannot drift. This function
 * only supplies the MCP runtime identity and maps the typed result onto the
 * MCP execution shape. Never writes, logs, reaches the network, or returns a
 * resolved absolute path.
 */
export async function executeMcpProjectTool(
  operation: McpProjectOperation,
  root: string,
): Promise<McpProjectToolExecution> {
  const result = await runLocalProjectWorkflow(operation, root, {
    loadDocuments: loadConfiguredMarkdownProjectDocuments,
    createRuntime: (items) =>
      createRuntime({
        kernel: createNodeWasmKernelApi(),
        providers: createProviderRegistry([createLocalProvider({ items })]),
        skills: createDefaultSkillRegistry(),
        version: MCP_PROJECT_RUNTIME_VERSION,
        now: MCP_PROJECT_RUNTIME_NOW,
      }),
    version: MCP_PROJECT_RUNTIME_VERSION,
  });

  if (!result.ok) {
    return {
      ok: false,
      operation,
      root,
      code: result.code,
      message: result.message,
    };
  }

  // The Markdown rendering is the shared response projection, so a given
  // response renders identically here and on CLI stdout.
  return {
    ok: true,
    operation,
    root,
    documents: result.documents,
    output: result.output,
    markdown: formatRuntimeResponse(result.response, "markdown"),
    runtimeResponse: result.response,
  };
}
