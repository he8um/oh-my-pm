// @oh-my-pm/cli — the command-line presentation adapter.
//
// The CLI owns argument parsing, help, command selection, terminal output
// modes, CLI-specific formatting, exit-code mapping, the stdout/stderr process
// boundary, and command-name compatibility behavior. Shared application
// orchestration lives in @oh-my-pm/application; this package adapts its typed
// results to a terminal.

// --- CLI execution and grammar ---------------------------------------------
export { OMP_C_RUNTIME_FAILED, runCli } from "./cli.js";
export {
  GITHUB_CLI_DEFAULT_LIMIT,
  OMP_C_INVALID_COMMAND,
  OMP_C_INVALID_OPTION,
  parseCliArgs,
} from "./parser.js";
export { runLocalCliProcess } from "./local-process.js";
export type { LocalCliProcessOptions, LocalCliProcessResult } from "./local-process.js";
export type {
  CliCommand,
  CliDeps,
  CliExecutionResult,
  CliParseResult,
  GitHubCliOperation,
  RuntimeCliCommand,
  RuntimeRequestFactory,
} from "./types.js";

// --- terminal rendering ----------------------------------------------------
export { formatCliError, formatRuntimeResponse } from "@oh-my-pm/application";
export { formatProviderDoctorReport, formatProviderStatusReport } from "./provider-format.js";
export { HELP_TOPICS, formatHelp, isHelpFlag, resolveHelpRequest } from "./help.js";
export type { HelpTopic } from "./help.js";

// --- memory grammar and rendering ------------------------------------------
export { parseMemoryCommand } from "./memory-parser.js";
export { formatMemoryOutcome, memoryOutcomeExitCode } from "./memory-format.js";

// --- installed MCP client configuration ------------------------------------
export {
  MCP_CONFIG_COMMAND_NAME,
  MCP_CONFIG_DEFAULT_SERVER_NAME,
  MCP_CONFIG_LEGACY_COMMAND_NAMES,
  MCP_CONFIG_READ_ONLY_TOOLS,
  buildMcpClientConfig,
  candidateInstalledBinDirectories,
  classifyMcpConfigCommand,
  formatMcpClientConfig,
  installedMcpCommandFileName,
  isValidMcpServerName,
  legacyMcpConfigGuidance,
  parseMcpConfigArgs,
  resolveInstalledMcpCommand,
  runMcpConfigCommand,
} from "./mcp-config.js";
export type {
  McpClientConfig,
  McpCommandResolution,
  McpCommandResolutionInput,
  McpConfigCommandClassification,
  McpConfigCommandResult,
  McpConfigOutputMode,
  McpConfigParseResult,
} from "./mcp-config.js";

// --- command-name compatibility --------------------------------------------
// v0.6: the canonical `omp*` command names, the two alias classes, and the
// warning helper shared by every compatibility wrapper.
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
} from "@oh-my-pm/application";
export type { CommandAliasClass } from "@oh-my-pm/application";

// --- installer preview -----------------------------------------------------
export { formatInstallerPreview, runInstallerPreview } from "./install-preview.js";
export type { InstallerPreviewResult } from "./install-preview.js";

// --- application pass-throughs ---------------------------------------------
// Re-exports ONLY. These symbols are implemented in @oh-my-pm/application and
// are surfaced here so existing workspace consumers and the examples package
// keep a stable import site. This block contains no implementation, and no new
// consumer should reach shared logic through the CLI: import it from
// @oh-my-pm/application (or /node) directly. The boundary tests fail the build
// if the MCP server imports this package.
export {
  DEFAULT_PROJECT_DOCUMENT_EXCLUDE,
  DEFAULT_PROJECT_DOCUMENT_INCLUDE,
  DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
  GITHUB_FIXED_API_VERSION,
  GITHUB_FIXED_METHOD,
  GITHUB_FIXED_ORIGIN,
  MAX_PROJECT_ID_BYTES,
  MEMORY_DEFAULT_HISTORY_LIMIT,
  MEMORY_DEFAULT_LOCALE,
  MEMORY_DEFAULT_STALE_AFTER_SECONDS,
  MEMORY_MAX_FUTURE_SKEW_SECONDS,
  MEMORY_MAX_HISTORY_LIMIT,
  MEMORY_MAX_STALE_AFTER_SECONDS,
  MEMORY_MIN_HISTORY_LIMIT,
  MEMORY_MIN_STALE_AFTER_SECONDS,
  MEMORY_SUBCOMMANDS,
  buildOfflineDoctorReport,
  buildProviderStatusReport,
  createGitHubRuntimeRequest,
  createPreviewMemoryPort,
  createRuntimeRequest,
  loadMemoryProjectDocuments,
  localMarkdownObservationRequest,
  matchesLocalProjectDocumentPattern,
  matchesLocalProjectDocumentRules,
  resolveExplicitProjectId,
  resolveGitHubDiagnosticSettings,
  runGitHubProviderNetworkDiagnostic,
  runMemoryProcess,
  tokenPresence,
  validateLocalProjectConfig,
  validateLocalProjectDocumentPattern,
  validateProjectId,
} from "@oh-my-pm/application";
export type {
  GitHubProviderNetworkDiagnosticResult,
  LocalProjectConfig,
  LocalProjectConfigErrorCode,
  LocalProjectDocumentConfig,
  MemoryCliCommand,
  MemoryCliParseResult,
  MemoryCommandOutcome,
  MemoryProcessOptions,
  MemoryStore,
  MemoryStoreStatus,
  MemorySubcommand,
  OfflineDoctorInput,
  PreviewCommitProjection,
  PreviewMemoryStoreReads,
  ProviderDiagnosticCheck,
  ProviderDiagnosticStatus,
  ProviderDoctorReport,
  ProviderStatusInput,
  ProviderStatusReport,
  ProviderTokenState,
  ResolvedLocalProjectDocumentConfig,
} from "@oh-my-pm/application";
export {
  GITHUB_TOKEN_ENV,
  MAX_PROVIDER_CONFIG_BYTES,
  OH_MY_PM_PROJECT_CONFIG_FILENAME,
  OH_MY_PM_PROJECT_CONFIG_VERSION,
  OH_MY_PM_PROVIDER_CONFIG_ENV,
  OH_MY_PM_PROVIDER_CONFIG_FILENAME,
  loadConfiguredMarkdownProjectDocuments,
  loadLocalProjectConfig,
  loadMarkdownProjectDocuments,
  loadProviderConfig,
  readGitHubTokenFromEnvironment,
  resolveProviderConfigLocation,
} from "@oh-my-pm/application/node";
export type {
  ConfiguredProjectDocumentLoadResult,
  LocalProjectConfigLoadResult,
  ProjectDocumentLoadOptions,
  ProjectDocumentLoadResult,
  ProjectDocumentLoadWarning,
  ProjectDocumentLoadWarningCode,
  ProviderConfigLoadErrorCode,
  ProviderConfigLoadResult,
  ProviderConfigLocation,
  ProviderConfigResolutionInput,
  ProviderConfigSource,
} from "@oh-my-pm/application/node";
