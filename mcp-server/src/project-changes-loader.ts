// v0.3 Phase 5 — the lazy, optional Project Memory capability loader.
//
// This is the ONLY composition path that turns the read-only `project_changes`
// tool on. It is used exclusively by stdio startup, never by createOhMyPmMcpServer
// (which stays synchronous and registers project_changes only when an executor
// is passed). When @oh-my-pm/project-memory cannot be resolved — the intended
// case for the legacy/current v0.2 bundle, which excludes the package — the
// loader returns undefined and the server preserves its exact ten-tool surface.
// No stderr warning is emitted: the ten-tool fallback is intentional
// compatibility behavior, not an error.

import { runProjectChanges } from "./project-changes-runner.js";
import type { ProjectChangesRunnerOptions } from "./project-changes-runner.js";
import type { McpProjectChangesExecutor } from "./project-changes-types.js";

/** Options for the optional loader (production supplies only the clock). */
export type LoadProjectChangesExecutorOptions = {
  /** A pre-built executor wins and skips the capability probe (tests). */
  readonly executor?: McpProjectChangesExecutor;
  /** The real clock, supplied by the process boundary. */
  readonly clock?: () => string;
  /** Test-only runner injection forwarded to every invocation. */
  readonly runnerOptions?: ProjectChangesRunnerOptions;
};

/**
 * Resolve an optional read-only `project_changes` executor.
 *
 *  - an injected executor is used directly;
 *  - otherwise the Project Memory package is probed via a dynamic import; if it
 *    resolves, a default executor bound to the read-only runner is returned;
 *  - if the package is unavailable (legacy bundle), undefined is returned and
 *    the ten-tool server is preserved.
 */
export async function loadOptionalProjectChangesExecutor(
  options?: LoadProjectChangesExecutorOptions,
): Promise<McpProjectChangesExecutor | undefined> {
  if (options?.executor !== undefined) return options.executor;

  // Probe the Project Memory capability without statically importing it. A
  // resolution failure (package absent from the bundle) is the intended
  // ten-tool fallback and is swallowed silently.
  try {
    await import("@oh-my-pm/project-memory");
  } catch {
    return undefined;
  }

  const runnerOptions: ProjectChangesRunnerOptions = {
    ...(options?.clock !== undefined ? { clock: options.clock } : {}),
    ...(options?.runnerOptions ?? {}),
  };
  return (input) => runProjectChanges(input, runnerOptions);
}
