// Pure string path helpers for installer planning. No Node path module and
// no filesystem access; every rule is deterministic string logic.

/**
 * Normalize a path: trim whitespace, use forward slashes, collapse duplicate
 * slashes, and drop a trailing slash except for the root `/`.
 */
export function normalizeInstallerPath(path: string): string {
  let normalized = path.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Whether a path is a safe package-relative path: non-empty, not absolute,
 * no drive letter, no `..` segment, no empty segment, and not home-relative.
 */
export function isSafeRelativePath(path: string): boolean {
  const normalized = normalizeInstallerPath(path);
  if (normalized.length === 0) {
    return false;
  }
  if (normalized.startsWith("/")) {
    return false;
  }
  if (/^[A-Za-z]:/.test(normalized)) {
    return false;
  }
  if (normalized.startsWith("~")) {
    return false;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return false;
  }
  if (segments.includes("..")) {
    return false;
  }
  return true;
}

/** Join a root and a relative path deterministically without double slashes. */
export function joinInstallerPath(root: string, relativePath: string): string {
  const normalizedRoot = normalizeInstallerPath(root);
  let normalizedRelative = normalizeInstallerPath(relativePath);
  if (normalizedRelative.startsWith("/")) {
    normalizedRelative = normalizedRelative.slice(1);
  }
  if (normalizedRoot === "/") {
    return `/${normalizedRelative}`;
  }
  return `${normalizedRoot}/${normalizedRelative}`;
}

/**
 * Validate package file paths. Each reason appears at most once:
 * `unsafe_package_file_path`, then `duplicate_package_file_path`.
 */
export function validatePackageFilePaths(files: readonly string[]): string[] {
  const reasons: string[] = [];
  if (files.some((file) => !isSafeRelativePath(file))) {
    reasons.push("unsafe_package_file_path");
  }
  const normalized = files.map(normalizeInstallerPath);
  if (new Set(normalized).size !== normalized.length) {
    reasons.push("duplicate_package_file_path");
  }
  return reasons;
}
