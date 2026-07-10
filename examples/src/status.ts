import type { CliExecutionResult } from "@oh-my-pm/cli";
import { runCli } from "@oh-my-pm/cli";
import { createExampleRuntime } from "./runtime.js";

export function runStatusBriefExample(): CliExecutionResult {
  return runCli(["status"], { runtime: createExampleRuntime() });
}

export function runStatusJsonExample(): CliExecutionResult {
  return runCli(["status", "--json"], { runtime: createExampleRuntime() });
}
