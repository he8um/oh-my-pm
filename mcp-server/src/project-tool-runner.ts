import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";
import {
  createRuntimeRequest,
  formatRuntimeResponse,
  loadConfiguredMarkdownProjectDocuments,
} from "@oh-my-pm/cli";
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
export const MCP_PROJECT_RUNTIME_VERSION = "0.2.0-alpha.0";
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

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Safely extract response.data.output; undefined when it is not present. */
function extractOutput(response: RuntimeResponse): JsonValue | undefined {
  if (!isRecord(response.data)) {
    return undefined;
  }
  const output = response.data["output"];
  return output === undefined ? undefined : output;
}

/**
 * Execute one read-only local project workflow through the same pipeline as the
 * CLI: config-aware Markdown loading, a single local provider, the deterministic
 * CLI request factory, and the real WASM Kernel. Never writes, logs, or reaches
 * the network, and never resolves or returns an absolute path.
 */
export async function executeMcpProjectTool(
  operation: McpProjectOperation,
  root: string,
): Promise<McpProjectToolExecution> {
  if (root.trim() === "") {
    return {
      ok: false,
      operation,
      root,
      code: "project_root_not_found",
      message: "project root must not be empty",
    };
  }

  const configured = loadConfiguredMarkdownProjectDocuments(root);
  if (!configured.ok) {
    return {
      ok: false,
      operation,
      root,
      code: "project_config_invalid",
      message: `invalid project config: ${configured.configDisplayPath} (${configured.code})`,
    };
  }

  const documents = configured.documents;
  if (!documents.ok) {
    const rootCode = documents.warnings[0]?.code;
    if (rootCode === "project_root_not_found") {
      return {
        ok: false,
        operation,
        root,
        code: "project_root_not_found",
        message: `project root was not found: ${root}`,
      };
    }
    if (rootCode === "project_root_not_directory") {
      return {
        ok: false,
        operation,
        root,
        code: "project_root_not_directory",
        message: `project root is not a directory: ${root}`,
      };
    }
    return {
      ok: false,
      operation,
      root,
      code: "project_documents_empty",
      message: `no markdown project documents matched under: ${root}`,
    };
  }

  if (documents.filesLoaded === 0) {
    return {
      ok: false,
      operation,
      root,
      code: "project_documents_empty",
      message: `no markdown project documents matched under: ${root}`,
    };
  }

  const providers = createProviderRegistry([
    createLocalProvider({ items: documents.items }),
  ]);
  const runtime = createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers,
    skills: createDefaultSkillRegistry(),
    version: MCP_PROJECT_RUNTIME_VERSION,
    now: MCP_PROJECT_RUNTIME_NOW,
  });

  // The request text and provider request mapping come from the shared CLI
  // factory, keeping CLI and MCP intent routing aligned. The root never enters
  // the Runtime payload.
  const request = createRuntimeRequest(operation);
  const response = await runtime.handle(request);

  if (!response.ok) {
    const code = response.error?.code ?? "unknown";
    const message = response.error?.message ?? "runtime execution failed";
    return {
      ok: false,
      operation,
      root,
      code: "project_runtime_failed",
      message: `${code}: ${message}`,
    };
  }

  const output = extractOutput(response);
  if (output === undefined) {
    return {
      ok: false,
      operation,
      root,
      code: "project_output_invalid",
      message: "runtime response did not include a tool output",
    };
  }

  const markdown = formatRuntimeResponse(response, "markdown");

  return {
    ok: true,
    operation,
    root,
    documents: {
      filesScanned: documents.filesScanned,
      filesMatched: documents.filesMatched,
      filesExcluded: documents.filesExcluded,
      filesLoaded: documents.filesLoaded,
      totalBytes: documents.totalBytes,
      configExists: configured.configExists,
    },
    output,
    markdown,
    runtimeResponse: response,
  };
}
