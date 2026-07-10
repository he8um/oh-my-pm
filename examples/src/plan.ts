import type { CliExecutionResult } from "@oh-my-pm/cli";
import { runCli } from "@oh-my-pm/cli";
import { createExampleRuntime } from "./runtime.js";

export function runPlanBriefExample(): CliExecutionResult {
  return runCli(["plan", "review", "risks"], { runtime: createExampleRuntime() });
}

export function runPlanMarkdownExample(): CliExecutionResult {
  return runCli(["plan", "create", "handoff", "--markdown"], {
    runtime: createExampleRuntime(),
  });
}

export function runPlanJsonExample(): CliExecutionResult {
  return runCli(["plan", "derive", "next", "tasks", "--json"], {
    runtime: createExampleRuntime(),
  });
}

/**
 * Provider-backed planning: the custom request factory adds providerRequests
 * so the Runtime reads from the injected local provider before the skill runs.
 */
export function runProviderBackedPlanJsonExample(): CliExecutionResult {
  return runCli(
    ["plan", "review", "risks", "--json"],
    { runtime: createExampleRuntime() },
    (command, input) => ({
      id: `cli-${command}`,
      kind: "plan",
      locale: "en",
      payload: {
        source: "cli",
        request: input ?? "review risks",
        context: {
          providerRequests: [
            {
              providerId: "local",
              action: "search",
              query: "blocked",
              limit: 5,
            },
          ],
          notes: ["Example note from CLI plan context"],
        },
      },
    }),
  );
}
