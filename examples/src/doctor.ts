import type { CliExecutionResult } from "@oh-my-pm/cli";
import { runCli } from "@oh-my-pm/cli";
import { createExampleRuntime } from "./runtime.js";

export function runDoctorBriefExample(): CliExecutionResult {
  return runCli(["doctor"], { runtime: createExampleRuntime() });
}

export function runDoctorMarkdownExample(): CliExecutionResult {
  return runCli(["doctor", "--markdown"], { runtime: createExampleRuntime() });
}
