export {
  OMP_R_GRAPH_VALIDATION_FAILED,
  OMP_R_HANDLER_FAILED,
  OMP_R_MISSING_CONTEXT,
  OMP_R_PROVIDER_FAILED,
  OMP_R_SKILL_FAILED,
  OMP_R_UNSUPPORTED_REQUEST_KIND,
  OMP_R_VALIDATION_FAILED,
  failureResponse,
  runtimeError,
} from "./errors.js";
export { handlePlanRequest } from "./plan.js";
export {
  notesFromPlannerContext,
  providerItemsToTextItems,
  providerRequestFromNode,
  skillIdForIntent,
  skillInputForPlan,
} from "./plan-utils.js";
export type { RuntimeTextItem } from "./plan-utils.js";
export { createRuntime } from "./runtime.js";
export type {
  Runtime,
  RuntimeDeps,
  RuntimeFailureInput,
  RuntimePlanData,
  RuntimePlanNodeResult,
} from "./types.js";

// The separate Project Brain Runtime API (capture/compare/timeline), added in
// v0.3 Phase 3 and shipped since v0.3.0. It is reached through the application
// layer's memory orchestrator, which backs the seven `omp memory`
// subcommands and the read-only project_changes and project_timeline MCP tools.
//
// The existing createRuntime() and Runtime.handle() behavior above is separate
// and unchanged: Runtime.handle() still dispatches only status, doctor, and
// plan, and never learns a capture or compare request kind.
export {
  createProjectBrainRuntime,
  createProviderRegistryObservationPort,
  isProjectBrainRuntimeError,
  PROJECT_BRAIN_RUNTIME_ERROR_CODES,
  ProjectBrainRuntimeError,
} from "./projectbrain/index.js";
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
  ProjectBrainRuntimeErrorCode,
  ProjectBrainRuntimeErrorEnvelope,
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
} from "./projectbrain/index.js";
