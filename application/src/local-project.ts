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
import { FIXED_LOCAL_INSTANT } from "./execution-context.js";
import type { ExecutionContext } from "./execution-context.js";
import { createRuntimeRequest } from "./request.js";
import { applicationResult } from "./result.js";
import type { ApplicationResult, SourceDescriptor } from "./result.js";
import { diagnosticForCode } from "./taxonomy.js";
import type {
  ProjectDocumentSummary,
  ProjectWorkflowErrorCode,
  ProjectWorkflowOperation,
  ProjectWorkflowResult,
} from "./types.js";

/**
 * Fixed identity for the deterministic local pipeline. Local workflows never
 * read a real clock, so repeated runs over unchanged documents are
 * byte-identical.
 *
 * Re-exported from the single definition in execution-context.ts rather than
 * restated. The CLI previously carried its own `LOCAL_FIXED_NOW` holding this
 * same value for this same reason; two constants that must agree but are
 * declared apart are a drift waiting to happen. Kept as a named export because
 * it is already part of the application surface.
 */
export const LOCAL_WORKFLOW_FIXED_NOW = FIXED_LOCAL_INSTANT;

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

  const loaded = loadLocalProjectDocuments(root, deps.loadDocuments);
  if (!loaded.ok) {
    return { ok: false, operation, root, code: loaded.code, message: loaded.message };
  }

  const runtime =
    deps.createRuntime?.(loaded.items) ?? defaultLocalRuntime(loaded.items, deps.version);

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

  return { ok: true, operation, root, documents: loaded.documents, output, response };
}

/**
 * Load the configured local Markdown documents for a project root, classifying
 * every failure once. Shared by callers that need the loaded items rather than
 * a full workflow result, so document-load error classification is never
 * duplicated across presentation surfaces.
 *
 * The messages are the exact strings the CLI has always emitted; they are part
 * of the observable stderr contract.
 */
export function loadLocalProjectDocuments(
  root: string,
  load: ProjectDocumentLoader,
):
  | { ok: true; items: LocalProviderItemInput[]; documents: ProjectDocumentSummary }
  | { ok: false; code: ProjectWorkflowErrorCode; message: string } {
  const configured = load(root);
  if (!configured.ok) {
    return {
      ok: false,
      code: "project_config_invalid",
      message: `invalid project config: ${configured.configDisplayPath} (${configured.code})`,
    };
  }
  const documents = configured.documents;
  if (!documents.ok) {
    const notDirectory = documents.warnings[0]?.code === "project_root_not_directory";
    return {
      ok: false,
      code: notDirectory ? "project_root_not_directory" : "project_root_not_found",
      message: `${notDirectory ? "project root is not a directory" : "project root was not found"}: ${root}`,
    };
  }
  if (documents.filesLoaded === 0) {
    return {
      ok: false,
      code: "project_documents_empty",
      message: `no markdown project documents matched under: ${root}`,
    };
  }
  return {
    ok: true,
    items: documents.items,
    documents: {
      filesScanned: documents.filesScanned,
      filesMatched: documents.filesMatched,
      filesExcluded: documents.filesExcluded,
      filesLoaded: documents.filesLoaded,
      totalBytes: documents.totalBytes,
      configExists: configured.configExists,
    },
  };
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

// ---------------------------------------------------------------------------
// The application-boundary envelope.
// ---------------------------------------------------------------------------

/**
 * The semantic payload of a successful local workflow.
 *
 * As with the GitHub family, the raw `RuntimeResponse` stays out of the
 * envelope: it is runtime-shaped and would make an internal type part of a
 * contract both surfaces serialize. The document summary IS included -- it is
 * derived, bounded, and already public on the MCP surface.
 */
export type LocalWorkflowData = {
  readonly operation: ProjectWorkflowOperation;
  readonly root: string;
  readonly documents: ProjectDocumentSummary;
  readonly output: JsonValue;
};

/**
 * Execute a local workflow and describe it as an `ApplicationResult`.
 *
 * Wraps `runLocalProjectWorkflow` rather than replacing it, so both describe
 * the same single execution and cannot drift. The local family takes no
 * cancellation signal: these are bounded reads of a configured Markdown set,
 * and adding cancellation machinery to a fast finite walk would be unused
 * complexity. The context is still required, because `generatedAt` must come
 * from an injected clock on every surface.
 */
export async function runLocalProjectApplication(
  operation: ProjectWorkflowOperation,
  root: string,
  deps: LocalProjectDeps,
  context: ExecutionContext,
): Promise<ApplicationResult<LocalWorkflowData | null>> {
  const result = await runLocalProjectWorkflow(operation, root, deps);
  const generated = context.now().toISOString();

  // The root is echoed exactly as the caller supplied it. `assertSafeSourceDescriptor`
  // would reject a resolved absolute path here, which is the guarantee that
  // makes this descriptor safe to serialize on both surfaces.
  const source: SourceDescriptor = { kind: "local-project", reference: result.root };

  if (!result.ok) {
    return applicationResult<LocalWorkflowData | null>({
      operation: `project.${operation}`,
      generatedAt: generated,
      source,
      data: null,
      diagnostics: [diagnosticForCode(result.code, result.message)],
    });
  }

  return applicationResult<LocalWorkflowData>({
    operation: `project.${operation}`,
    generatedAt: generated,
    source,
    data: {
      operation: result.operation,
      root: result.root,
      documents: result.documents,
      output: result.output,
    },
  });
}
