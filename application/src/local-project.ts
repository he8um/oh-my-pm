// Local project workflow use cases.
//
// The single shared implementation of the four read-only local workflows
// (brief, risks, next, handoff) over configured local Markdown documents. Both
// the CLI and the MCP server call these; neither re-implements the pipeline.
//
// Deterministic and offline: a fixed clock, no randomness, no environment read,
// no network, and no write. The project root never enters the Runtime payload,
// and no result carries a resolved absolute path or raw document content.

import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import type { LocalProviderItemInput } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import type { Runtime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { createRuntimeRequest } from "./request.js";
import type {
  ProjectDocumentSummary,
  ProjectWorkflowOperation,
  ProjectWorkflowResult,
} from "./types.js";

/**
 * Fixed identity for the deterministic local pipeline. Local workflows never
 * read a real clock, so repeated runs over unchanged documents are
 * byte-identical.
 */
export const LOCAL_WORKFLOW_FIXED_NOW = "2026-01-01T00:00:00.000Z";

/**
 * The configured-document loader this use case depends on. Injected so the core
 * surface stays Node-free and tests can supply documents without a filesystem;
 * `@oh-my-pm/application/node` provides the real implementation.
 */
export type ConfiguredDocumentLoad =
  | {
      ok: true;
      configExists: boolean;
      configDisplayPath: string;
      documents: {
        ok: boolean;
        items: LocalProviderItemInput[];
        filesScanned: number;
        filesMatched: number;
        filesExcluded: number;
        filesLoaded: number;
        totalBytes: number;
        warnings: readonly { code: string }[];
      };
    }
  | {
      ok: false;
      configDisplayPath: string;
      code: string;
    };

export type ProjectDocumentLoader = (root: string) => ConfiguredDocumentLoad;

export type LocalProjectDeps = {
  /** Loads the configured local Markdown documents for a project root. */
  loadDocuments: ProjectDocumentLoader;
  /**
   * Runtime factory. Defaults to the deterministic local Runtime over the real
   * WASM Kernel; injected in tests to stay offline and fast.
   */
  createRuntime?: (items: LocalProviderItemInput[]) => Runtime;
  /** Runtime identity reported in responses. */
  version: string;
};

/** The deterministic local Runtime used when no factory is injected. */
function defaultLocalRuntime(items: LocalProviderItemInput[], version: string): Runtime {
  return createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers: createProviderRegistry([createLocalProvider({ items })]),
    skills: createDefaultSkillRegistry(),
    version,
    now: LOCAL_WORKFLOW_FIXED_NOW,
  });
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Safely extract `response.data.output`; undefined when absent. */
function extractOutput(response: RuntimeResponse): JsonValue | undefined {
  if (!isRecord(response.data)) {
    return undefined;
  }
  const output = response.data["output"];
  return output === undefined ? undefined : output;
}

/**
 * Execute one read-only local project workflow: config-aware Markdown loading,
 * a single local provider, the deterministic request factory, and the Kernel.
 *
 * Every failure is a structured value with a sanitized message. The returned
 * root is always the caller-supplied string, never a resolved path.
 */
export async function runLocalProjectWorkflow(
  operation: ProjectWorkflowOperation,
  root: string,
  deps: LocalProjectDeps,
): Promise<ProjectWorkflowResult> {
  if (root.trim() === "") {
    return {
      ok: false,
      operation,
      root,
      code: "project_root_not_found",
      message: "project root must not be empty",
    };
  }

  const configured = deps.loadDocuments(root);
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
    if (rootCode === "project_root_not_directory") {
      return {
        ok: false,
        operation,
        root,
        code: "project_root_not_directory",
        message: `project root is not a directory: ${root}`,
      };
    }
    if (rootCode === "project_root_not_found") {
      return {
        ok: false,
        operation,
        root,
        code: "project_root_not_found",
        message: `project root was not found: ${root}`,
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

  const runtime =
    deps.createRuntime?.(documents.items) ?? defaultLocalRuntime(documents.items, deps.version);

  // The request text and provider request mapping come from the shared factory,
  // keeping every surface's intent routing aligned. The root never enters the
  // Runtime payload.
  const response = await runtime.handle(createRuntimeRequest(operation));

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

  const summary: ProjectDocumentSummary = {
    filesScanned: documents.filesScanned,
    filesMatched: documents.filesMatched,
    filesExcluded: documents.filesExcluded,
    filesLoaded: documents.filesLoaded,
    totalBytes: documents.totalBytes,
    configExists: configured.configExists,
  };

  return { ok: true, operation, root, documents: summary, output, response };
}

/** Read-only status brief for a local project. */
export function getLocalProjectBrief(
  root: string,
  deps: LocalProjectDeps,
): Promise<ProjectWorkflowResult> {
  return runLocalProjectWorkflow("brief", root, deps);
}

/** Read-only risk review for a local project. */
export function getLocalProjectRisks(
  root: string,
  deps: LocalProjectDeps,
): Promise<ProjectWorkflowResult> {
  return runLocalProjectWorkflow("risks", root, deps);
}

/** Read-only derived next actions for a local project. */
export function getLocalProjectNextActions(
  root: string,
  deps: LocalProjectDeps,
): Promise<ProjectWorkflowResult> {
  return runLocalProjectWorkflow("next", root, deps);
}

/** Read-only handoff for a local project. */
export function getLocalProjectHandoff(
  root: string,
  deps: LocalProjectDeps,
): Promise<ProjectWorkflowResult> {
  return runLocalProjectWorkflow("handoff", root, deps);
}
