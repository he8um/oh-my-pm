// v0.4 — the lazy, optional Project Timeline capability loader.
//
// This is the ONLY composition path that turns the read-only `project_timeline`
// tool on. It is used exclusively by stdio startup, never by
// createOhMyPmMcpServer (which stays synchronous and registers the tool only
// when an executor is passed). When @oh-my-pm/project-memory cannot be resolved
// — the intended case for a bundle that excludes the package — the loader
// returns undefined and the server preserves its smaller tool surface. No stderr
// warning is emitted: the fallback is intentional compatibility behavior, not an
// error.

import { runProjectTimeline } from "./project-timeline-runner.js";
import type { ProjectTimelineRunnerOptions } from "./project-timeline-runner.js";
import type { McpProjectTimelineExecutor } from "./project-timeline-types.js";

/** Options for the optional loader (production supplies only the clock). */
export type LoadProjectTimelineExecutorOptions = {
  /** A pre-built executor wins and skips the capability probe (tests). */
  readonly executor?: McpProjectTimelineExecutor;
  /** The real clock, supplied by the process boundary. */
  readonly clock?: () => string;
  /** Test-only runner injection forwarded to every invocation. */
  readonly runnerOptions?: ProjectTimelineRunnerOptions;
};

/**
 * Resolve an optional read-only `project_timeline` executor.
 *
 *  - an injected executor is used directly;
 *  - otherwise the Project Memory package is probed via a dynamic import; if it
 *    resolves, a default executor bound to the read-only runner is returned;
 *  - if the package is unavailable, undefined is returned and the tool is not
 *    registered.
 */
export async function loadOptionalProjectTimelineExecutor(
  options?: LoadProjectTimelineExecutorOptions,
): Promise<McpProjectTimelineExecutor | undefined> {
  if (options?.executor !== undefined) return options.executor;

  // Probe the Project Memory capability without statically importing it. A
  // resolution failure (package absent from the bundle) is the intended
  // fallback and is swallowed silently.
  try {
    await import("@oh-my-pm/project-memory");
  } catch {
    return undefined;
  }

  const runnerOptions: ProjectTimelineRunnerOptions = {
    ...(options?.clock !== undefined ? { clock: options.clock } : {}),
    ...(options?.runnerOptions ?? {}),
  };
  return (input) => runProjectTimeline(input, runnerOptions);
}
