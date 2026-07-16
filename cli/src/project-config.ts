// Explicit read-only Node CLI boundary for local project configuration. It may
// read node:fs and node:path but never writes, never follows a symlinked
// config, never searches parent directories, never executes code, never reads
// environment variables, and never performs network access. It considers only
// `<project-root>/oh-my-pm.config.json`.

import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
  loadMarkdownProjectDocuments,
} from "./node-project-documents.js";
import type { ProjectDocumentLoadResult } from "./node-project-documents.js";
import {
  DEFAULT_PROJECT_DOCUMENT_INCLUDE,
  validateLocalProjectConfig,
} from "./project-document-rules.js";
import type {
  LocalProjectConfigErrorCode,
  ResolvedLocalProjectDocumentConfig,
} from "./project-document-rules.js";

export const OH_MY_PM_PROJECT_CONFIG_FILENAME = "oh-my-pm.config.json";
export const OH_MY_PM_PROJECT_CONFIG_VERSION = 1;

const MAX_CONFIG_BYTES = 64 * 1024;

export type LocalProjectConfigLoadResult =
  | {
      ok: true;
      exists: boolean;
      displayPath: string;
      config: ResolvedLocalProjectDocumentConfig;
    }
  | {
      ok: false;
      exists: true;
      displayPath: string;
      code: LocalProjectConfigErrorCode;
      message: string;
    };

const LIMIT_DEFAULTS = {
  maxFiles: DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  maxBytesPerFile: DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  maxTotalBytes: DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
};

/** Resolved defaults preserving current loader behavior when config is absent. */
function defaultResolvedConfig(): ResolvedLocalProjectDocumentConfig {
  const resolved = validateLocalProjectConfig({ version: 1 }, LIMIT_DEFAULTS);
  // A bare `{ version: 1 }` always validates; this branch is unreachable but
  // keeps the function total without a non-null assertion.
  return resolved.ok
    ? resolved.config
    : { include: [...DEFAULT_PROJECT_DOCUMENT_INCLUDE], exclude: [], ...LIMIT_DEFAULTS };
}

/** Join the user root and the config filename for display, never absolute. */
function displayConfigPath(root: string): string {
  const normalized = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${normalized}/${OH_MY_PM_PROJECT_CONFIG_FILENAME}`;
}

/**
 * Load and resolve `<root>/oh-my-pm.config.json`. Absent config resolves to
 * defaults with exists=false. Invalid config returns a structured failure. The
 * result never carries raw JSON text or an absolute path.
 */
export function loadLocalProjectConfig(root: string): LocalProjectConfigLoadResult {
  const displayPath = displayConfigPath(root);
  const resolvedRoot = resolve(root);
  const configPath = resolve(resolvedRoot, OH_MY_PM_PROJECT_CONFIG_FILENAME);

  let stat;
  try {
    stat = lstatSync(configPath);
  } catch {
    // Missing config is normal: fall back to defaults.
    return { ok: true, exists: false, displayPath, config: defaultResolvedConfig() };
  }

  // A symlinked or non-regular config is rejected, never followed.
  if (!stat.isFile()) {
    return {
      ok: false,
      exists: true,
      displayPath,
      code: "project_config_read_failed",
      message: "config path is not a regular file",
    };
  }
  if (stat.size > MAX_CONFIG_BYTES) {
    return {
      ok: false,
      exists: true,
      displayPath,
      code: "project_config_read_failed",
      message: `config exceeds the maximum size of ${MAX_CONFIG_BYTES} bytes`,
    };
  }

  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    return {
      ok: false,
      exists: true,
      displayPath,
      code: "project_config_read_failed",
      message: "config could not be read",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      exists: true,
      displayPath,
      code: "project_config_invalid_json",
      message: "config is not valid JSON",
    };
  }

  const validation = validateLocalProjectConfig(parsed, LIMIT_DEFAULTS);
  if (!validation.ok) {
    return {
      ok: false,
      exists: true,
      displayPath,
      code: validation.code,
      message: validation.message,
    };
  }

  return { ok: true, exists: true, displayPath, config: validation.config };
}

export type ConfiguredProjectDocumentLoadResult =
  | {
      ok: true;
      configExists: boolean;
      configDisplayPath: string;
      config: ResolvedLocalProjectDocumentConfig;
      documents: ProjectDocumentLoadResult;
    }
  | {
      ok: false;
      configDisplayPath: string;
      code: LocalProjectConfigErrorCode;
      message: string;
    };

/**
 * Load the local project config then the Markdown documents it selects. Stops
 * on a config failure before any document reading. Read-only: no writes, no
 * logging, no network.
 */
export function loadConfiguredMarkdownProjectDocuments(
  root: string,
): ConfiguredProjectDocumentLoadResult {
  const configResult = loadLocalProjectConfig(root);
  if (!configResult.ok) {
    return {
      ok: false,
      configDisplayPath: configResult.displayPath,
      code: configResult.code,
      message: configResult.message,
    };
  }

  const documents = loadMarkdownProjectDocuments(root, {
    include: configResult.config.include,
    exclude: configResult.config.exclude,
    maxFiles: configResult.config.maxFiles,
    maxBytesPerFile: configResult.config.maxBytesPerFile,
    maxTotalBytes: configResult.config.maxTotalBytes,
  });

  return {
    ok: true,
    configExists: configResult.exists,
    configDisplayPath: configResult.displayPath,
    config: configResult.config,
    documents,
  };
}
