import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";
import {
  createGitHubRuntimeRequest,
  formatRuntimeResponse,
  loadProviderConfig,
  readGitHubTokenFromEnvironment,
} from "@oh-my-pm/cli";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import {
  createGitHubProvider,
  createNodeGitHubHttpTransport,
  createProviderRegistry,
  resolveGitHubProviderSettings,
} from "@oh-my-pm/providers";
import type { GitHubHttpTransport, ResolvedProviderConfig } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import type { McpGitHubOperation, McpGitHubToolExecution, McpGitHubToolName } from "./types.js";

// Deterministic runtime identity for the GitHub MCP surface. The live github
// tools resolve the invocation timestamp once at the tool-call boundary; the
// fixed value below is an explicitly named test fixture only, never the
// production default. Overdue classification uses the resolved invocation time.
export const MCP_GITHUB_RUNTIME_VERSION = "0.2.0-alpha.0";
/** Fixed timestamp for deterministic tests only; not a production default. */
export const MCP_GITHUB_TEST_NOW = "2026-01-01T00:00:00.000Z";
export const MCP_GITHUB_DEFAULT_LIMIT = 50;
const MCP_GITHUB_MIN_LIMIT = 1;
const MCP_GITHUB_MAX_LIMIT = 100;

const OPERATION_TO_TOOL: Readonly<Record<McpGitHubOperation, McpGitHubToolName>> = {
  brief: "github_project_brief",
  risks: "github_project_risks",
  next: "github_project_next",
  handoff: "github_project_handoff",
};

const TOOL_TO_OPERATION: Readonly<Record<McpGitHubToolName, McpGitHubOperation>> = {
  github_project_brief: "brief",
  github_project_risks: "risks",
  github_project_next: "next",
  github_project_handoff: "handoff",
};

export function toolNameForGitHubOperation(operation: McpGitHubOperation): McpGitHubToolName {
  return OPERATION_TO_TOOL[operation];
}

export function githubOperationForToolName(toolName: McpGitHubToolName): McpGitHubOperation {
  return TOOL_TO_OPERATION[toolName];
}

export type ExecuteMcpGitHubToolOptions = {
  /** Injected transport wins so tests stay offline. */
  transport?: GitHubHttpTransport;
  /** Injected token; when omitted the ambient environment is read. */
  token?: string;
  env?: Readonly<Record<string, string | undefined>>;
  /** Injected platform for provider-config resolution (defaults to process). */
  platform?: NodeJS.Platform;
  /** Injected cwd for relative provider-config paths (defaults to process). */
  cwd?: string;
  /**
   * Directly injected provider configuration. When set it takes precedence and
   * no provider-config file is read; used by offline unit tests.
   */
  providerConfig?: ResolvedProviderConfig;
  /**
   * Explicit invocation timestamp for deterministic tests. Takes precedence
   * over `clock`. When neither is set, the runner reads the real clock once at
   * the tool-call boundary.
   */
  now?: string;
  /** Injected real-clock accessor; read at most once per tool call. */
  clock?: () => string;
};

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractOutput(response: RuntimeResponse): JsonValue | undefined {
  if (!isRecord(response.data)) return undefined;
  const output = response.data["output"];
  return output === undefined ? undefined : output;
}

function ambientEnv(): Readonly<Record<string, string | undefined>> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}

type NodeProcess = { platform?: NodeJS.Platform; cwd?: () => string };
function ambientPlatform(): NodeJS.Platform {
  return (globalThis as { process?: NodeProcess }).process?.platform ?? "linux";
}
function ambientCwd(): string {
  const proc = (globalThis as { process?: NodeProcess }).process;
  return typeof proc?.cwd === "function" ? proc.cwd() : "/";
}

/**
 * Resolve provider configuration for a GitHub MCP tool call. A directly
 * injected config wins (offline unit tests). Otherwise the read-only loader
 * resolves the environment/OS-standard location — the agent cannot supply an
 * arbitrary config path. Returns null config when a present config is invalid.
 */
function resolveMcpProviderConfig(
  options: ExecuteMcpGitHubToolOptions | undefined,
): { config: ResolvedProviderConfig | null; message?: string } {
  if (options?.providerConfig !== undefined) {
    return { config: options.providerConfig };
  }
  const load = loadProviderConfig({
    env: options?.env ?? ambientEnv(),
    platform: options?.platform ?? ambientPlatform(),
    cwd: options?.cwd ?? ambientCwd(),
  });
  if (!load.ok) {
    return { config: null, message: load.message };
  }
  return { config: load.config };
}

/** Sanitized public source list from the normalized provider responses. */
export type McpGitHubSource = {
  type: "issue" | "pullRequest";
  number: number;
  title: string;
  state: string;
  url?: string;
};

export type McpGitHubSourceSummary = {
  total: number;
  repositories: number;
  issues: number;
  pullRequests: number;
};

function projectSources(response: RuntimeResponse): {
  summary: McpGitHubSourceSummary;
  sources: McpGitHubSource[];
} {
  const summary: McpGitHubSourceSummary = {
    total: 0,
    repositories: 0,
    issues: 0,
    pullRequests: 0,
  };
  const sources: McpGitHubSource[] = [];
  if (!isRecord(response.data)) return { summary, sources };
  const providerResponses = response.data["providerResponses"];
  if (!Array.isArray(providerResponses)) return { summary, sources };
  for (const providerResponse of providerResponses) {
    if (!isRecord(providerResponse) || !Array.isArray(providerResponse["items"])) continue;
    for (const item of providerResponse["items"]) {
      if (!isRecord(item)) continue;
      summary.total += 1;
      const type = item["type"];
      const data = isRecord(item["data"]) ? item["data"] : {};
      if (type === "record") {
        summary.repositories += 1;
        continue;
      }
      if (type !== "issue" && type !== "pullRequest") continue;
      if (type === "issue") summary.issues += 1;
      else summary.pullRequests += 1;
      const number = data["number"];
      const status = data["status"];
      const titleValue = item["title"];
      const urlValue = item["url"];
      const source: McpGitHubSource = {
        type,
        number: typeof number === "number" ? number : 0,
        title: typeof titleValue === "string" ? titleValue : "",
        state: typeof status === "string" ? status : "",
      };
      if (typeof urlValue === "string") source.url = urlValue;
      sources.push(source);
    }
  }
  return { summary, sources };
}

/**
 * Execute one read-only GitHub workflow through the shared pipeline: strict
 * repository validation, the shared CLI GitHub request factory, and the real
 * WASM Kernel. The transport is injected (offline tests) or constructed for the
 * live call with an optional token read only here, at the tool-call boundary.
 * Returns a sanitized public projection: never a token, header, raw body, raw
 * provider response, planner input, task graph, or Runtime trace.
 */
export async function executeMcpGitHubTool(
  operation: McpGitHubOperation,
  repository: string | undefined,
  limit: number | undefined,
  options?: ExecuteMcpGitHubToolOptions,
): Promise<McpGitHubToolExecution> {
  const requestedRepository = repository ?? "";

  // 1. Resolve provider configuration (agent cannot supply a config path). An
  // invalid present config fails before any transport construction.
  const resolved = resolveMcpProviderConfig(options);
  if (resolved.config === null) {
    return {
      ok: false,
      operation,
      repository: requestedRepository,
      code: "github_invalid_config",
      message: resolved.message ?? "provider configuration is invalid",
    };
  }

  // 2. Resolve effective repository/limit; a disabled provider or unresolved
  // repository fails here, before any transport is built.
  const settings = resolveGitHubProviderSettings({
    config: resolved.config,
    overrides: {
      ...(repository !== undefined ? { repository } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
  });
  if (!settings.ok) {
    const code =
      settings.code === "github_provider_disabled"
        ? "github_provider_disabled"
        : settings.code === "github_limit_invalid"
          ? "github_invalid_limit"
          : "github_invalid_repository";
    return { ok: false, operation, repository: requestedRepository, code, message: settings.message };
  }
  const resolvedRepository = settings.repository;
  const resolvedLimit = settings.limit;
  if (
    !Number.isInteger(resolvedLimit) ||
    resolvedLimit < MCP_GITHUB_MIN_LIMIT ||
    resolvedLimit > MCP_GITHUB_MAX_LIMIT
  ) {
    return {
      ok: false,
      operation,
      repository: resolvedRepository,
      code: "github_invalid_limit",
      message: "limit must be an integer in 1..100",
    };
  }

  let transport = options?.transport;
  if (transport === undefined) {
    const token =
      options?.token ?? readGitHubTokenFromEnvironment(options?.env ?? ambientEnv());
    transport = createNodeGitHubHttpTransport({ token, productVersion: MCP_GITHUB_RUNTIME_VERSION });
  }

  // Resolve the invocation timestamp exactly once, at this explicit tool-call
  // boundary: an injected `now`, then an injected `clock`, then the real clock.
  // Overdue classification uses this value.
  const now = options?.now ?? options?.clock?.() ?? new Date().toISOString();

  const providers = createProviderRegistry([
    createGitHubProvider({ transport, productVersion: MCP_GITHUB_RUNTIME_VERSION }),
  ]);
  const runtime = createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers,
    skills: createDefaultSkillRegistry(),
    version: MCP_GITHUB_RUNTIME_VERSION,
    now,
  });

  const request = createGitHubRuntimeRequest(operation, resolvedRepository, resolvedLimit, "mcp");
  const response = await runtime.handle(request);

  if (!response.ok) {
    const code =
      isRecord(response.data) && typeof response.data["providerCode"] === "string"
        ? response.data["providerCode"]
        : (response.error?.code ?? "github_runtime_failed");
    const message =
      isRecord(response.data) && typeof response.data["message"] === "string"
        ? response.data["message"]
        : (response.error?.message ?? "github workflow failed");
    return { ok: false, operation, repository: resolvedRepository, code, message };
  }

  const output = extractOutput(response);
  if (output === undefined) {
    return {
      ok: false,
      operation,
      repository: resolvedRepository,
      code: "github_output_invalid",
      message: "runtime response did not include a tool output",
    };
  }

  const { summary, sources } = projectSources(response);
  const markdown = formatRuntimeResponse(response, "markdown");

  return {
    ok: true,
    operation,
    repository: resolvedRepository,
    sourceSummary: summary,
    sources: sources.slice(0, resolvedLimit),
    output,
    markdown,
  };
}
