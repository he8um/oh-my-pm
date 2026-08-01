// Project Brain Runtime API (v0.3 Phase 3) — a separate programmatic surface.
//
// This barrel is re-exported from `@oh-my-pm/runtime` under a distinct namespace
// so callers can construct a Project Brain Runtime without touching the existing
// `createRuntime()` / `Runtime.handle()` API. No CLI or MCP surface invokes it.

export { createProjectBrainRuntime } from "./runtime.js";
export { createProviderRegistryObservationPort } from "./observation.js";
export {
  PROJECT_BRAIN_RUNTIME_ERROR_CODES,
  ProjectBrainRuntimeError,
  isProjectBrainRuntimeError,
} from "./errors.js";
export type { ProjectBrainRuntimeErrorCode, ProjectBrainRuntimeErrorEnvelope } from "./errors.js";
export type {
  CaptureCoverageEntry,
  CaptureProjectInput,
  CaptureProjectResult,
  CompareProjectInput,
  CompareProjectResult,
  CompareStatus,
  MemoryCommitInput,
  MemoryCommitResult,
  MemoryManifest,
  MemorySnapshotSummary,
  ProjectBrainKernelPort,
  ProjectBrainRuntime,
  ProjectBrainRuntimeDeps,
  ProjectBrainTraceEntry,
  ProjectIdentitySeedCaptureInput,
  ProjectMemoryPort,
  ProjectObservationPort,
  ProjectObservationRequest,
  ProjectObservationResult,
  ProjectStateDeriver,
  TimelineProjectInput,
  TimelineProjectResult,
  TimelineStatus,
} from "./types.js";
