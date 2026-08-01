// v0.3 Phase 4 — explicit project identity and local Markdown observation setup.
//
// Resolves the explicit project id (CLI flag → project config → controlled
// error) and prepares the single required local-Markdown observation for
// capture/compare. Pure composition over the existing read-only config/document
// loader and the pure identity validator; this module itself touches no Node
// built-in (document/config reads flow through the allow-listed CLI boundary).

import type { LocalProviderItemInput } from "@oh-my-pm/providers";
import type { ProjectObservationRequest } from "@oh-my-pm/runtime";
import { loadConfiguredMarkdownProjectDocuments } from "./node/project-config.js";
import type { ConfiguredProjectDocumentLoadResult } from "./node/project-config.js";
import { validateProjectId } from "./project-document-rules.js";

/** The required local-Markdown observation contract for capture. */
export const LOCAL_MARKDOWN_OBSERVATION_ID = "local-markdown";
export const LOCAL_MARKDOWN_SOURCE_IDENTITY = "local-markdown";
export const LOCAL_MARKDOWN_INCLUDED_SCOPE = "configured-documents";

/** Stable, sanitized identity-resolution error codes. */
export type MemoryIdentityErrorCode = "memory_project_id_missing" | "memory_project_id_invalid";

export type MemoryIdentityResult =
  | { ok: true; projectId: string; source: "flag" | "config" }
  | { ok: false; code: MemoryIdentityErrorCode; message: string };

/**
 * Resolve the explicit project id. Resolution order: an explicit CLI value wins;
 * otherwise the project config's `projectId`; otherwise a controlled error. The
 * id is never derived from a path, username, host, or environment, and is never
 * written back to config.
 */
export function resolveExplicitProjectId(
  flagProjectId: string | undefined,
  configProjectId: string | undefined,
): MemoryIdentityResult {
  if (flagProjectId !== undefined) {
    const validated = validateProjectId(flagProjectId);
    if (!validated.ok) {
      return { ok: false, code: "memory_project_id_invalid", message: validated.message };
    }
    return { ok: true, projectId: validated.projectId, source: "flag" };
  }
  if (configProjectId !== undefined) {
    // A config projectId is already validated by the config loader, but we
    // re-validate defensively so an unexpected value never reaches the store.
    const validated = validateProjectId(configProjectId);
    if (!validated.ok) {
      return { ok: false, code: "memory_project_id_invalid", message: validated.message };
    }
    return { ok: true, projectId: validated.projectId, source: "config" };
  }
  return {
    ok: false,
    code: "memory_project_id_missing",
    message: "no project id: pass --project-id or set projectId in oh-my-pm.config.json",
  };
}

/** The single observation request over the configured local Markdown documents. */
export function localMarkdownObservationRequest(): ProjectObservationRequest {
  return {
    observationId: LOCAL_MARKDOWN_OBSERVATION_ID,
    // The local provider lists every loaded document item.
    request: { providerId: "local", action: "list", query: "." },
    sourceIdentity: LOCAL_MARKDOWN_SOURCE_IDENTITY,
    includedScope: LOCAL_MARKDOWN_INCLUDED_SCOPE,
    required: true,
  };
}

/** Sanitized outcome codes for the configured document load. */
export type MemoryDocumentLoadErrorCode =
  "memory_project_config_invalid" | "memory_project_root_invalid" | "memory_no_documents";

export type MemoryDocumentLoad =
  | {
      ok: true;
      items: LocalProviderItemInput[];
      /** The configured project id, if the config declared one. */
      configProjectId?: string;
    }
  | {
      ok: false;
      code: MemoryDocumentLoadErrorCode;
      /** The user-typed root or config display path (never a resolved absolute path). */
      reference: string;
    };

/**
 * Load the configured local Markdown documents for the given project root and
 * surface the config's project id. Fails when no document matches (capture needs
 * a required source). Never returns a resolved absolute path.
 */
export function loadMemoryProjectDocuments(root: string): MemoryDocumentLoad {
  const configured: ConfiguredProjectDocumentLoadResult =
    loadConfiguredMarkdownProjectDocuments(root);
  if (!configured.ok) {
    return {
      ok: false,
      code: "memory_project_config_invalid",
      reference: configured.configDisplayPath,
    };
  }
  if (!configured.documents.ok) {
    return { ok: false, code: "memory_project_root_invalid", reference: root };
  }
  if (configured.documents.filesLoaded === 0) {
    return { ok: false, code: "memory_no_documents", reference: root };
  }
  const result: MemoryDocumentLoad = { ok: true, items: configured.documents.items };
  if (configured.config.projectId !== undefined) {
    return { ...result, configProjectId: configured.config.projectId };
  }
  return result;
}
