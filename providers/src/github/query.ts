// Pure, strict parsers for GitHub repository identifiers and provider queries.
// No filesystem, environment, clock, or network access. Repository input is a
// bare "owner/repository"; URLs, git specs, .git suffixes, query strings,
// fragments, backslashes, and path-traversal segments are all rejected.

import type {
  GitHubFetchQueryResult,
  GitHubListQueryResult,
  GitHubRepositoryRef,
  GitHubRepositoryRefResult,
  GitHubSearchQueryResult,
} from "./types.js";

const MAX_SEGMENT_LENGTH = 100;
const MAX_SEARCH_TERMS_LENGTH = 256;

// Conservative GitHub-compatible segment: letters, numbers, "_", "-", ".".
// Path traversal (".", "..") and empty segments are rejected separately.
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

// Search scope qualifiers the caller may not set; the provider injects scope.
const FORBIDDEN_SEARCH_QUALIFIERS = ["repo:", "org:", "user:"];

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function validateSegment(segment: string): string | null {
  if (segment === "") return "empty path segment";
  if (segment === "." || segment === "..") return "path traversal segment";
  if (segment.length > MAX_SEGMENT_LENGTH) return "path segment too long";
  if (!SEGMENT_PATTERN.test(segment)) return "invalid characters in path segment";
  return null;
}

/** Parse a bare "owner/repository" identifier. Strict and pure. */
export function parseGitHubRepository(value: string): GitHubRepositoryRefResult {
  if (typeof value !== "string" || value === "") {
    return { ok: false, reason: "repository is required" };
  }
  if (value !== value.trim()) {
    return { ok: false, reason: "repository must not contain surrounding whitespace" };
  }
  if (hasControlCharacters(value)) {
    return { ok: false, reason: "repository contains control characters" };
  }
  if (value.includes("\\")) {
    return { ok: false, reason: "repository must not contain a backslash" };
  }
  if (value.includes("://") || value.startsWith("git@")) {
    return { ok: false, reason: "repository must not be a URL or git spec" };
  }
  if (value.includes("?") || value.includes("#")) {
    return { ok: false, reason: "repository must not contain a query string or fragment" };
  }
  if (value.startsWith("/") || value.endsWith("/")) {
    return { ok: false, reason: "repository must not have a leading or trailing slash" };
  }
  if (value.endsWith(".git")) {
    return { ok: false, reason: "repository must not end with .git" };
  }
  const segments = value.split("/");
  if (segments.length !== 2) {
    return { ok: false, reason: "repository must be exactly owner/repository" };
  }
  const owner = segments[0] ?? "";
  const repository = segments[1] ?? "";
  const ownerError = validateSegment(owner);
  if (ownerError !== null) {
    return { ok: false, reason: `owner: ${ownerError}` };
  }
  const repoError = validateSegment(repository);
  if (repoError !== null) {
    return { ok: false, reason: `repository: ${repoError}` };
  }
  const ref: GitHubRepositoryRef = { owner, repository, slug: `${owner}/${repository}` };
  return { ok: true, ref };
}

/** list query grammar: owner/repository */
export function parseGitHubListQuery(query: string): GitHubListQueryResult {
  return parseGitHubRepository(query);
}

/** search query grammar: owner/repository::terms */
export function parseGitHubSearchQuery(query: string): GitHubSearchQueryResult {
  if (typeof query !== "string" || query === "") {
    return { ok: false, reason: "search query is required" };
  }
  const separatorIndex = query.indexOf("::");
  if (separatorIndex === -1) {
    return { ok: false, reason: "search query must be owner/repository::terms" };
  }
  const repositoryPart = query.slice(0, separatorIndex);
  const termsPart = query.slice(separatorIndex + 2);
  const repoResult = parseGitHubRepository(repositoryPart);
  if (!repoResult.ok) {
    return { ok: false, reason: repoResult.reason };
  }
  const terms = termsPart.trim();
  if (terms === "") {
    return { ok: false, reason: "search terms are required" };
  }
  if (terms.length > MAX_SEARCH_TERMS_LENGTH) {
    return { ok: false, reason: "search terms are too long" };
  }
  if (hasControlCharacters(terms)) {
    return { ok: false, reason: "search terms contain control characters" };
  }
  const lowered = terms.toLowerCase();
  for (const qualifier of FORBIDDEN_SEARCH_QUALIFIERS) {
    if (lowered.includes(qualifier)) {
      return { ok: false, reason: `search terms must not contain the scope qualifier ${qualifier}` };
    }
  }
  return { ok: true, ref: repoResult.ref, terms };
}

/** fetch query grammar: owner/repository#number */
export function parseGitHubFetchQuery(query: string): GitHubFetchQueryResult {
  if (typeof query !== "string" || query === "") {
    return { ok: false, reason: "fetch query is required" };
  }
  const hashIndex = query.indexOf("#");
  if (hashIndex === -1) {
    return { ok: false, reason: "fetch query must be owner/repository#number" };
  }
  const repositoryPart = query.slice(0, hashIndex);
  const numberPart = query.slice(hashIndex + 1);
  const repoResult = parseGitHubRepository(repositoryPart);
  if (!repoResult.ok) {
    return { ok: false, reason: repoResult.reason };
  }
  // Positive base-10 integer only: no leading "+", no decimal, no zero, safe.
  if (!/^[1-9][0-9]*$/.test(numberPart)) {
    return { ok: false, reason: "fetch number must be a positive integer" };
  }
  const parsed = Number(numberPart);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { ok: false, reason: "fetch number is out of range" };
  }
  return { ok: true, ref: repoResult.ref, number: parsed };
}
