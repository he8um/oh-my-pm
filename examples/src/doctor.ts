import type { CliExecutionResult } from "@oh-my-pm/cli";
import { runCli } from "@oh-my-pm/cli";
import { createExampleRuntime } from "./runtime.js";

export function runDoctorBriefExample(): Promise<CliExecutionResult> {
  return runCli(["doctor"], { runtime: createExampleRuntime() });
}

export function runDoctorMarkdownExample(): Promise<CliExecutionResult> {
  return runCli(["doctor", "--markdown"], { runtime: createExampleRuntime() });
}
