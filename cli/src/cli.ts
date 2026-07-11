import type { CliOutputMode } from "@oh-my-pm/contracts";
import { formatCliError, formatRuntimeResponse } from "./format.js";
import { formatInstallerPreview, runInstallerPreview } from "./install-preview.js";
import { parseCliArgs } from "./parser.js";
import { createRuntimeRequest } from "./request.js";
import type { CliDeps, CliExecutionResult, RuntimeRequestFactory } from "./types.js";

export const OMP_C_RUNTIME_FAILED = "OMP-C-3003";

/** Best-effort output mode for error reporting when parsing failed. */
function inferOutputMode(args: readonly string[]): CliOutputMode {
  let mode: CliOutputMode = "brief";
  for (const arg of args) {
    if (arg === "--json") mode = "json";
    if (arg === "--markdown") mode = "markdown";
  }
  return mode;
}

export function runCli(
  args: readonly string[],
  deps: CliDeps,
  requestFactory?: RuntimeRequestFactory,
): CliExecutionResult {
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

  try {
    const factory = requestFactory ?? createRuntimeRequest;
    const response = deps.runtime.handle(factory(parsed.command, parsed.input));
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
