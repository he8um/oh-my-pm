// Project Memory use cases.
//
// Named, typed entry points over the shared memory orchestrator
// (`memory-process.ts`). Each use case returns a structured
// `MemoryCommandOutcome` — never rendered text, never a process exit code.
// Mapping an outcome to an exit code or a terminal string is a presentation
// concern and belongs to the adapter.
//
// Preview and apply are separate use cases by design, mirroring the store's
// contract: a preview performs ZERO writes — it creates no data directory,
// acquires no lock, and writes no staging, manifest, record, or lock file. A
// preview is never implemented by writing and rolling back.

import { runMemoryProcess } from "./memory-process.js";
import type { MemoryProcessOptions } from "./memory-process.js";
import type {
  MemoryCaptureCommand,
  MemoryChangesCommand,
  MemoryCommandOutcome,
  MemoryDeleteCommand,
  MemoryExportCommand,
  MemoryHistoryCommand,
  MemoryStatusCommand,
  MemoryTimelineCommand,
} from "./memory-types.js";

export type ProjectMemoryDeps = MemoryProcessOptions;

/** The capture command without its `apply` flag; the use case supplies it. */
type CaptureRequest = Omit<MemoryCaptureCommand, "apply">;
/** The export command without its `apply` flag; the use case supplies it. */
type ExportRequest = Omit<MemoryExportCommand, "apply">;
/** The delete command without its `apply` flag; the use case supplies it. */
type DeleteRequest = Omit<MemoryDeleteCommand, "apply">;

/**
 * Project a capture without writing anything. Reports what a capture WOULD do,
 * including whether it would be idempotent, and touches no file.
 */
export function previewProjectCapture(
  request: CaptureRequest,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess({ ...request, apply: false }, deps);
}

/** Perform a capture, writing one snapshot bundle under the store's lock. */
export function applyProjectCapture(
  request: CaptureRequest,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess({ ...request, apply: true }, deps);
}

/** Read-only store status for a project. */
export function getProjectMemoryStatus(
  request: MemoryStatusCommand,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess(request, deps);
}

/** Read-only capture history for a project. */
export function getProjectMemoryHistory(
  request: MemoryHistoryCommand,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess(request, deps);
}

/** Read-only comparison between two captured snapshots. */
export function getProjectChanges(
  request: MemoryChangesCommand,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess(request, deps);
}

/** Read-only derived timeline over captured memory. */
export function getProjectTimeline(
  request: MemoryTimelineCommand,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess(request, deps);
}

/** Project an export without writing the destination. */
export function previewProjectExport(
  request: ExportRequest,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess({ ...request, apply: false }, deps);
}

/** Write the export to the requested destination. */
export function applyProjectExport(
  request: ExportRequest,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess({ ...request, apply: true }, deps);
}

/** Project a delete without removing anything. */
export function previewProjectDelete(
  request: DeleteRequest,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess({ ...request, apply: false }, deps);
}

/** Delete the project's stored memory. Requires explicit confirmation. */
export function applyProjectDelete(
  request: DeleteRequest,
  deps?: ProjectMemoryDeps,
): Promise<MemoryCommandOutcome> {
  return runMemoryProcess({ ...request, apply: true }, deps);
}

/**
 * Execute an already-parsed memory command. The adapter-facing entry point used
 * by the CLI, which parses the `apply` flag from its own grammar; the named
 * preview/apply use cases above are the preferred surface for new consumers.
 */
export { runMemoryProcess as executeProjectMemoryCommand };
