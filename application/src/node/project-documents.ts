// Explicit Node application boundary: read-only Markdown project document
// loading. This is one of the few application source files allowed to import
// node:fs and node:path, and it reads only. It never writes, never follows
// symbolic links, never leaves the resolved root, and never logs or persists
// document content.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { LocalProviderItemInput } from "@oh-my-pm/providers";
import {
  DEFAULT_PROJECT_DOCUMENT_EXCLUDE,
  DEFAULT_PROJECT_DOCUMENT_INCLUDE,
  matchesLocalProjectDocumentRules,
} from "../project-document-rules.js";
import {
  DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
} from "../project-document-limits.js";

export type ProjectDocumentLoadWarningCode =
  | "project_root_not_found"
  | "project_root_not_directory"
  | "project_document_skipped_too_large"
  | "project_document_total_limit_reached"
  | "project_document_depth_limit_reached"
  | "project_document_read_failed";

export type ProjectDocumentLoadWarning = {
  code: ProjectDocumentLoadWarningCode;
  path?: string;
};

export type ProjectDocumentLoadOptions = {
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxTotalBytes?: number;
  include?: readonly string[];
  exclude?: readonly string[];
};

export type ProjectDocumentLoadResult = {
  ok: boolean;
  root: string;
  items: LocalProviderItemInput[];
  filesScanned: number;
  filesMatched: number;
  filesExcluded: number;
  filesLoaded: number;
  totalBytes: number;
  warnings: ProjectDocumentLoadWarning[];
};

// Re-exported so existing consumers of the Node loader keep a single import
// site; the values themselves live in the Node-free core limits module.
export {
  DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE,
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES,
};

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

/**
 * Maximum directory depth the walk will traverse, matching the bound the
 * privacy key scanners already use. Symlinks are skipped so cycles are
 * impossible and the byte budget bounds reading, but a pathologically deep tree
 * could still exhaust the stack. The root is depth 0; depth 128 is traversed,
 * and recursion into depth 129 is refused with a warning. Internal by design:
 * this is a stack-safety bound, not a user-tunable limit.
 */
const MAX_DIRECTORY_DEPTH = 128;

function hasMarkdownExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  return candidatePath === rootPath || candidatePath.startsWith(rootPath + sep);
}

function toRelativePosixPath(rootPath: string, absolutePath: string): string {
  const relative = absolutePath
    .slice(rootPath.length + 1)
    .split(sep)
    .join("/");
  return relative === "" ? "." : relative;
}

type DocumentCandidate = {
  absolutePath: string;
  relativePath: string;
};

/**
 * Depth-first, lexicographically ordered candidate collection, bounded to
 * MAX_DIRECTORY_DEPTH. `depth` is the depth of `directoryPath` itself: the root
 * is 0. A directory beyond the bound is neither entered nor enumerated, so no
 * file below it becomes a candidate and none is read; traversal continues with
 * siblings, so one pathological subtree never fails the whole load.
 */
function collectCandidates(
  rootPath: string,
  directoryPath: string,
  candidates: DocumentCandidate[],
  warnings: ProjectDocumentLoadWarning[],
  depth: number,
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
      if (depth + 1 > MAX_DIRECTORY_DEPTH) {
        // Refuse the subtree without enumerating it: the counts stay a faithful
        // description of what the bounded traversal actually discovered.
        warnings.push({
          code: "project_document_depth_limit_reached",
          path: toRelativePosixPath(rootPath, absolutePath),
        });
        continue;
      }
      collectCandidates(rootPath, absolutePath, candidates, warnings, depth + 1);
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
    filesMatched: 0,
    filesExcluded: 0,
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
  collectCandidates(resolvedRoot, resolvedRoot, candidates, warnings, 0);
  candidates.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );

  // filesScanned counts Markdown candidates discovered before selection. Only
  // when include/exclude rules are supplied are they applied to the normalized
  // relative path before any content is read, so excluded files are never read
  // and never count toward limits. With no rules supplied the loader preserves
  // its original behavior: every case-insensitive Markdown candidate matches.
  const filesScanned = candidates.length;
  const rulesSupplied = options?.include !== undefined || options?.exclude !== undefined;
  let matched: DocumentCandidate[];
  if (rulesSupplied) {
    const include = [...(options?.include ?? DEFAULT_PROJECT_DOCUMENT_INCLUDE)];
    const exclude = [...(options?.exclude ?? DEFAULT_PROJECT_DOCUMENT_EXCLUDE)];
    matched = candidates.filter((candidate) =>
      matchesLocalProjectDocumentRules(candidate.relativePath, { include, exclude }),
    );
  } else {
    matched = candidates;
  }
  const filesMatched = matched.length;
  const filesExcluded = filesScanned - filesMatched;

  const items: LocalProviderItemInput[] = [];
  let totalBytes = 0;
  for (const candidate of matched) {
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
    filesMatched,
    filesExcluded,
    filesLoaded: items.length,
    totalBytes,
    warnings,
  };
}
