import type { CliOutputMode } from "@oh-my-pm/contracts";
import { formatCliError, formatRuntimeResponse } from "./format.js";
import { formatInstallerPreview, runInstallerPreview } from "./install-preview.js";
import { parseCliArgs } from "./parser.js";
import { createGitHubRuntimeRequest, createRuntimeRequest } from "./request.js";
import type { CliDeps, CliExecutionResult, RuntimeRequestFactory } from "./types.js";

export const OMP_C_RUNTIME_FAILED = "OMP-C-3003";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Sanitized provider/runtime failure code from a failed GitHub response. */
function githubFailureCode(response: { data?: unknown; error?: { code?: string } }): string {
  if (isRecord(response.data) && typeof response.data["providerCode"] === "string") {
    return response.data["providerCode"];
  }
  return response.error?.code ?? OMP_C_RUNTIME_FAILED;
}

/** Stable, sanitized message for a failed GitHub response. */
function githubFailureMessage(response: { data?: unknown; error?: { message?: string } }): string {
  if (isRecord(response.data) && typeof response.data["message"] === "string") {
    return response.data["message"];
  }
  return response.error?.message ?? "github workflow failed";
}

/** Best-effort output mode for error reporting when parsing failed. */
function inferOutputMode(args: readonly string[]): CliOutputMode {
  let mode: CliOutputMode = "brief";
  for (const arg of args) {
    if (arg === "--json") mode = "json";
    if (arg === "--markdown") mode = "markdown";
  }
  return mode;
}

export async function runCli(
  args: readonly string[],
  deps: CliDeps,
  requestFactory?: RuntimeRequestFactory,
): Promise<CliExecutionResult> {
  const parsed = parseCliArgs(args);

  if (!parsed.ok) {
    return {
      ok: false,
      exitCode: 2,
      stdout: "",
      stderr: formatCliError(parsed.code, parsed.message, inferOutputMode(args)),
    };
  }

  // install-preview is a local dry-run command; it never reaches the Runtime.
  if (parsed.command === "install-preview") {
    const result = runInstallerPreview(parsed.input ?? "");
    return {
      ok: result.ok,
      exitCode: result.ok ? 0 : 1,
      stdout: formatInstallerPreview(result, parsed.outputMode),
      stderr: "",
    };
  }

  // github routes through the same Runtime with a provider-backed request. The
  // runtime supplied by the process adapter carries the GitHub provider; the
  // request itself never contains a token, headers, or an API URL.
  if (parsed.command === "github") {
    try {
      const request = createGitHubRuntimeRequest(
        parsed.operation,
        parsed.repository,
        parsed.limit,
        "cli",
      );
      const response = await deps.runtime.handle(request);
      return {
        ok: response.ok,
        exitCode: response.ok ? 0 : 2,
        stdout: response.ok ? formatRuntimeResponse(response, parsed.outputMode) : "",
        stderr: response.ok
          ? ""
          : formatCliError(
              githubFailureCode(response),
              githubFailureMessage(response),
              parsed.outputMode,
            ),
        response,
      };
    } catch {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: formatCliError(OMP_C_RUNTIME_FAILED, "runtime execution failed", parsed.outputMode),
      };
    }
  }

  try {
    const factory = requestFactory ?? createRuntimeRequest;
    const response = await deps.runtime.handle(factory(parsed.command, parsed.input));
    return {
      ok: response.ok,
      exitCode: response.ok ? 0 : 1,
      stdout: formatRuntimeResponse(response, parsed.outputMode),
      stderr: "",
      response,
    };
  } catch {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: formatCliError(OMP_C_RUNTIME_FAILED, "runtime execution failed", parsed.outputMode),
    };
  }
}
