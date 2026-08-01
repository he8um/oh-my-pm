// @oh-my-pm/application — the shared application boundary.
//
// CLI, MCP, and any future presentation surface consume these use cases. This
// root surface is presentation-neutral and Node-free: it parses no argv,
// produces no help, writes to no stream, calls no process.exit, knows no
// executable name and no MCP protocol, renders no terminal text or HTML, and
// starts no server.
//
// Node-specific adapters live behind `@oh-my-pm/application/node`.

// --- shared types ----------------------------------------------------------
export type {
  ProjectDocumentSummary,
  ProjectWorkflowErrorCode,
  ProjectWorkflowFailure,
  ProjectWorkflowOperation,
  ProjectWorkflowResult,
  ProjectWorkflowSuccess,
  RuntimeWorkflowCommand,
} from "./types.js";

// --- structured errors -----------------------------------------------------
export { looksLikeAbsolutePath, sanitizedErrorCode } from "./errors.js";

// --- deterministic runtime requests ----------------------------------------
export { createGitHubRuntimeRequest, createRuntimeRequest } from "./request.js";
export type { GitHubWorkflowRequestInput } from "./request.js";

// --- bounded document limits -----------------------------------------------
export {
  DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
} from "./project-document-limits.js";

// --- local project document rules and identity -----------------------------
export {
  DEFAULT_PROJECT_DOCUMENT_EXCLUDE,
  DEFAULT_PROJECT_DOCUMENT_INCLUDE,
  MAX_PROJECT_ID_BYTES,
  matchesLocalProjectDocumentPattern,
  matchesLocalProjectDocumentRules,
  validateLocalProjectConfig,
  validateLocalProjectDocumentPattern,
  validateProjectId,
} from "./project-document-rules.js";
export type {
  LocalProjectConfig,
  LocalProjectConfigErrorCode,
  LocalProjectDocumentConfig,
  ResolvedLocalProjectDocumentConfig,
} from "./project-document-rules.js";

// --- local project workflows -----------------------------------------------
export {
  LOCAL_WORKFLOW_FIXED_NOW,
  getLocalProjectBrief,
  getLocalProjectHandoff,
  getLocalProjectNextActions,
  getLocalProjectRisks,
  loadLocalProjectDocuments,
  runLocalProjectWorkflow,
} from "./local-project.js";
export type {
  ConfiguredDocumentLoad,
  LocalProjectDeps,
  ProjectDocumentLoader,
} from "./local-project.js";

// --- GitHub project workflows ----------------------------------------------
export {
  getGitHubProjectBrief,
  getGitHubProjectHandoff,
  getGitHubProjectNextActions,
  getGitHubProjectRisks,
  runGitHubProjectWorkflow,
} from "./github-project.js";
export type {
  GitHubProjectDeps,
  GitHubWorkflowErrorCode,
  GitHubWorkflowFailure,
  GitHubWorkflowInput,
  GitHubWorkflowResult,
  GitHubWorkflowSuccess,
} from "./github-project.js";

// --- provider diagnostics --------------------------------------------------
export { getProviderStatus, runProviderDoctor } from "./provider-diagnostics-usecase.js";
export type {
  ProviderConfigResolution,
  ProviderDiagnosticsDeps,
  ProviderDoctorInput,
  ProviderDoctorResult,
  ProviderStatusResult,
} from "./provider-diagnostics-usecase.js";
export {
  GITHUB_FIXED_API_VERSION,
  GITHUB_FIXED_METHOD,
  GITHUB_FIXED_ORIGIN,
  buildOfflineDoctorReport,
  buildProviderStatusReport,
  githubSourceSelectionCapability,
  resolveGitHubDiagnosticSettings,
  runGitHubProviderNetworkDiagnostic,
  tokenPresence,
} from "./provider-diagnostics.js";
export type {
  GitHubProviderNetworkDiagnosticResult,
  GitHubSourceSelectionCapability,
  OfflineDoctorInput,
  ProviderDiagnosticCheck,
  ProviderDiagnosticStatus,
  ProviderDoctorReport,
  ProviderStatusInput,
  ProviderStatusReport,
  ProviderTokenState,
} from "./provider-diagnostics.js";

// --- Project Memory --------------------------------------------------------
export {
  applyProjectCapture,
  applyProjectDelete,
  applyProjectExport,
  executeProjectMemoryCommand,
  getProjectChanges,
  getProjectMemoryHistory,
  getProjectMemoryStatus,
  getProjectTimeline,
  previewProjectCapture,
  previewProjectDelete,
  previewProjectExport,
} from "./project-memory.js";
export type { ProjectMemoryDeps } from "./project-memory.js";
export { runMemoryProcess } from "./memory-process.js";
export type { MemoryProcessOptions, MemoryStore } from "./memory-process.js";
// The memory command model and its outcome types are a single cohesive
// vocabulary shared by every surface; re-exported whole so a new bound or
// outcome variant never needs a parallel edit here.
export * from "./memory-types.js";

// --- Project Memory capture preview ----------------------------------------
export { createPreviewMemoryPort } from "./memory-preview.js";
export type {
  PreviewCommitProjection,
  PreviewMemoryStoreReads,
  StoredSnapshotSummaryLike,
} from "./memory-preview.js";
export {
  LOCAL_MARKDOWN_INCLUDED_SCOPE,
  LOCAL_MARKDOWN_OBSERVATION_ID,
  LOCAL_MARKDOWN_SOURCE_IDENTITY,
  loadMemoryProjectDocuments,
  localMarkdownObservationRequest,
  resolveExplicitProjectId,
} from "./memory-project.js";
export type {
  MemoryDocumentLoad,
  MemoryDocumentLoadErrorCode,
  MemoryIdentityErrorCode,
  MemoryIdentityResult,
} from "./memory-project.js";
