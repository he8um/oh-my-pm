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

// v0.3 Phase 3: the separate Project Brain Runtime API (capture/compare). This
// is a workspace/programmatic surface only; the existing createRuntime() and
// Runtime.handle() behavior above is unchanged, and no CLI or MCP surface
// invokes the Project Brain Runtime.
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
