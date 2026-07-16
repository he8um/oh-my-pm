// Explicit Node CLI boundary: read-only Markdown project document loading.
// This is the only CLI source file allowed to import node:fs and node:path,
// and it reads only. It never writes, never follows symbolic links, never
// leaves the resolved root, and never logs or persists document content.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { LocalProviderItemInput } from "@oh-my-pm/providers";

export type ProjectDocumentLoadWarningCode =
  | "project_root_not_found"
  | "project_root_not_directory"
  | "project_document_skipped_too_large"
  | "project_document_total_limit_reached"
  | "project_document_read_failed";

export type ProjectDocumentLoadWarning = {
  code: ProjectDocumentLoadWarningCode;
  path?: string;
};

export type ProjectDocumentLoadOptions = {
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxTotalBytes?: number;
};

export type ProjectDocumentLoadResult = {
  ok: boolean;
  root: string;
  items: LocalProviderItemInput[];
  filesScanned: number;
  filesLoaded: number;
  totalBytes: number;
  warnings: ProjectDocumentLoadWarning[];
};

export const DEFAULT_PROJECT_DOCUMENT_MAX_FILES = 200;
export const DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE = 256 * 1024;
export const DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;

const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  ".next",
  ".turbo",
  ".cache",
]);

const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;

function hasMarkdownExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  return candidatePath === rootPath || candidatePath.startsWith(rootPath + sep);
}

function toRelativePosixPath(rootPath: string, absolutePath: string): string {
  const relative = absolutePath.slice(rootPath.length + 1).split(sep).join("/");
  return relative === "" ? "." : relative;
}

type DocumentCandidate = {
  absolutePath: string;
  relativePath: string;
};

/** Depth-first, lexicographically ordered candidate collection. */
function collectCandidates(
  rootPath: string,
  directoryPath: string,
  candidates: DocumentCandidate[],
  warnings: ProjectDocumentLoadWarning[],
): void {
  let entries;
  try {
    entries = readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    warnings.push({
      code: "project_document_read_failed",
      path: toRelativePosixPath(rootPath, directoryPath),
    });
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const absolutePath = resolve(directoryPath, entry.name);
    if (!isInsideRoot(rootPath, absolutePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      collectCandidates(rootPath, absolutePath, candidates, warnings);
      continue;
    }
    if (entry.isFile() && hasMarkdownExtension(entry.name)) {
      candidates.push({
        absolutePath,
        relativePath: toRelativePosixPath(rootPath, absolutePath),
      });
    }
  }
}

/** First markdown H1 in the document, then the filename, never empty. */
function documentTitle(content: string, relativePath: string): string {
  for (const line of content.split(/\r?\n/)) {
    const match = /^#\s+(.*)$/.exec(line);
    if (match !== null) {
      const heading = (match[1] ?? "").trim();
      if (heading !== "") {
        return heading;
      }
    }
  }
  const fileName = relativePath.split("/").pop() ?? relativePath;
  const withoutExtension = fileName.replace(/\.(md|markdown)$/i, "").trim();
  return withoutExtension === "" ? relativePath : withoutExtension;
}

function rootFailure(
  root: string,
  code: ProjectDocumentLoadWarningCode,
): ProjectDocumentLoadResult {
  return {
    ok: false,
    root,
    items: [],
    filesScanned: 0,
    filesLoaded: 0,
    totalBytes: 0,
    warnings: [{ code, path: root }],
  };
}

/** Read-only, deterministic, root-confined Markdown project document loader. */
export function loadMarkdownProjectDocuments(
  root: string,
  options?: ProjectDocumentLoadOptions,
): ProjectDocumentLoadResult {
  const maxFiles = options?.maxFiles ?? DEFAULT_PROJECT_DOCUMENT_MAX_FILES;
  const maxBytesPerFile = options?.maxBytesPerFile ?? DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE;
  const maxTotalBytes = options?.maxTotalBytes ?? DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES;

  const resolvedRoot = resolve(root);
  let rootStat;
  try {
    rootStat = statSync(resolvedRoot);
  } catch {
    return rootFailure(root, "project_root_not_found");
  }
  if (!rootStat.isDirectory()) {
    return rootFailure(root, "project_root_not_directory");
  }

  const warnings: ProjectDocumentLoadWarning[] = [];
  const candidates: DocumentCandidate[] = [];
  collectCandidates(resolvedRoot, resolvedRoot, candidates, warnings);
  candidates.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );

  const items: LocalProviderItemInput[] = [];
  let filesScanned = 0;
  let totalBytes = 0;
  for (const candidate of candidates) {
    filesScanned += 1;
    if (items.length >= maxFiles) {
      warnings.push({
        code: "project_document_total_limit_reached",
        path: candidate.relativePath,
      });
      break;
    }
    let contentBuffer;
    try {
      contentBuffer = readFileSync(candidate.absolutePath);
    } catch {
      warnings.push({ code: "project_document_read_failed", path: candidate.relativePath });
      continue;
    }
    const bytes = contentBuffer.byteLength;
    if (bytes > maxBytesPerFile) {
      warnings.push({ code: "project_document_skipped_too_large", path: candidate.relativePath });
      continue;
    }
    if (totalBytes + bytes > maxTotalBytes) {
      warnings.push({
        code: "project_document_total_limit_reached",
        path: candidate.relativePath,
      });
      break;
    }
    const content = contentBuffer.toString("utf8");
    items.push({
      id: candidate.relativePath,
      type: "document",
      title: documentTitle(content, candidate.relativePath),
      data: {
        path: candidate.relativePath,
        content,
        bytes,
      },
    });
    totalBytes += bytes;
  }

  return {
    ok: true,
    root,
    items,
    filesScanned,
    filesLoaded: items.length,
    totalBytes,
    warnings,
  };
}
