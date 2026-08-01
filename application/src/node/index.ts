// @oh-my-pm/application/node — the explicit Node boundary.
//
// The only application surface allowed to touch node:fs, node:path, and the
// ambient process. Everything here is read-only with respect to the analyzed
// project: it never writes a project file, never follows a symlinked config,
// never searches parent directories, and never executes project code.
//
// Node filesystem objects never leak into domain results: these adapters return
// plain data, and a result may name a caller-supplied reference but never a
// resolved absolute path.

// --- read-only project document loading ------------------------------------
export {
  DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
  loadMarkdownProjectDocuments,
} from "./project-documents.js";
export type {
  ProjectDocumentLoadOptions,
  ProjectDocumentLoadResult,
  ProjectDocumentLoadWarning,
  ProjectDocumentLoadWarningCode,
} from "./project-documents.js";

// --- local project configuration -------------------------------------------
export {
  OH_MY_PM_PROJECT_CONFIG_FILENAME,
  OH_MY_PM_PROJECT_CONFIG_VERSION,
  loadConfiguredMarkdownProjectDocuments,
  loadLocalProjectConfig,
} from "./project-config.js";
export type {
  ConfiguredProjectDocumentLoadResult,
  LocalProjectConfigLoadResult,
} from "./project-config.js";

// --- provider configuration ------------------------------------------------
export {
  MAX_PROVIDER_CONFIG_BYTES,
  OH_MY_PM_PROVIDER_CONFIG_ENV,
  OH_MY_PM_PROVIDER_CONFIG_FILENAME,
  loadProviderConfig,
  resolveProviderConfigLocation,
} from "./provider-config.js";
export type {
  ProviderConfigLoadErrorCode,
  ProviderConfigLoadResult,
  ProviderConfigLocation,
  ProviderConfigResolutionInput,
  ProviderConfigSource,
} from "./provider-config.js";

// --- GitHub token boundary -------------------------------------------------
export { GITHUB_TOKEN_ENV, readGitHubTokenFromEnvironment } from "./github-token.js";

// --- composed Node dependencies --------------------------------------------
export {
  createNodeGitHubProjectDeps,
  createNodeLocalProjectDeps,
  createNodeProviderDiagnosticsDeps,
  nodeKernelConfigured,
  nodeVersion,
  resolveNodeProviderConfig,
} from "./deps.js";
export type { NodeDepsOptions, NodeGitHubProjectDepsOptions } from "./deps.js";
