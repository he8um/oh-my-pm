import type { CliExecutionResult } from "@oh-my-pm/cli";
import { runCli } from "@oh-my-pm/cli";
import { createExampleRuntime } from "./runtime.js";

export function runStatusBriefExample(): Promise<CliExecutionResult> {
  return runCli(["status"], { runtime: createExampleRuntime() });
}

export function runStatusJsonExample(): Promise<CliExecutionResult> {
  return runCli(["status", "--json"], { runtime: createExampleRuntime() });
}
