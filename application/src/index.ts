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

// --- public command names --------------------------------------------------
// The invoked executable names are a shared vocabulary, not a CLI-private
// detail: the MCP alias wrappers need the same warning text. This module is pure
// -- no filesystem, environment, network, clock, or randomness -- and
// tools/validate-command-surface.mjs pins it against command-surface.json.
export {
  CANONICAL_CLI_COMMAND,
  CANONICAL_INSTALLER_COMMAND,
  CANONICAL_MCP_COMMAND,
  COMMAND_CANONICAL_SINCE,
  COMMAND_COMPATIBILITY_SINCE,
  COMMAND_DEPRECATED_SINCE,
  COMPATIBILITY_CLI_COMMANDS,
  COMPATIBILITY_INSTALLER_COMMANDS,
  COMPATIBILITY_MCP_COMMANDS,
  DEPRECATED_CLI_COMMANDS,
  DEPRECATED_INSTALLER_COMMANDS,
  DEPRECATED_MCP_COMMANDS,
  canonicalCommandForAlias,
  commandAliasClass,
  commandAliasWarning,
} from "./command-surface.js";
export type { CommandAliasClass } from "./command-surface.js";

// --- runtime response projection -------------------------------------------
// Presentation-neutral rendering of a RuntimeResponse into the JSON, Markdown,
// and brief projections. Shared because CLI stdout and the MCP Markdown field
// must render a given response identically; the CLI adds only its own
// error-string formatting on top.
export { formatCliError, formatRuntimeResponse } from "./response-format.js";

// --- structured errors -----------------------------------------------------
export { looksLikeAbsolutePath, sanitizedErrorCode } from "./errors.js";

// --- the shared application result contract --------------------------------
// v0.5.4: the shared identity for a result at the application boundary. The
// per-use-case results (ProjectWorkflowResult, GitHubWorkflowResult) keep their
// exact shapes; this envelope describes them uniformly so a consumer can ask
// "where did this come from?" without knowing which use case it called.
export {
  APPLICATION_RESULT_SCHEMA_VERSION,
  DIAGNOSTIC_SEVERITIES,
  SOURCE_KINDS,
  applicationResult,
  applicationResultToJson,
  assertSafeSourceDescriptor,
  orderedResult,
  unsafeValueReason,
} from "./result.js";
export type {
  ApplicationResult,
  Diagnostic,
  DiagnosticSeverity,
  ProvenanceRecord,
  SourceDescriptor,
  SourceKind,
} from "./result.js";

// --- the repository-wide error taxonomy ------------------------------------
// Classifies the EXISTING public failure codes; it renames none of them. The
// CLI exit codes here are the ones the CLI already returns, per the policy
// documented in cli/src/help.ts.
export {
  CODE_CATEGORIES,
  ERROR_CATEGORIES,
  EXIT_INVOCATION_OR_PRECONDITION,
  EXIT_RUNTIME_FAILED,
  EXIT_SUCCESS,
  categoryContract,
  categoryOfCode,
  diagnosticForCode,
  exitCodeForCode,
  mcpIsErrorForCode,
} from "./taxonomy.js";
export type { CategoryContract, ErrorCategory } from "./taxonomy.js";

// --- provider diagnostics, projected into the unified model ----------------
// The provider report types stay exactly as they are: they are returned
// directly as MCP tool results, so their shape is a public contract. These
// helpers project them into the unified Diagnostic vocabulary for consumers
// that want one model across every use case.
export {
  diagnosticFromProviderCheck,
  diagnosticsFromDoctorReport,
  hasError,
  severityOfProviderStatus,
} from "./diagnostics-adapter.js";

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
