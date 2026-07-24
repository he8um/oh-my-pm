// Pure, strict parsers for GitHub repository identifiers and provider queries.
// No filesystem, environment, clock, or network access. Repository input is a
// bare "owner/repository"; URLs, git specs, .git suffixes, query strings,
// fragments, backslashes, and path-traversal segments are all rejected.

import type {
  GitHubFetchQueryResult,
  GitHubListQueryResult,
  GitHubListSource,
  GitHubQueryKind,
  GitHubQueryState,
  GitHubRepositoryRef,
  GitHubRepositoryRefResult,
  GitHubSearchQueryResult,
} from "./types.js";

const MAX_SEGMENT_LENGTH = 100;
const MAX_SEARCH_TERMS_LENGTH = 256;

// Bounds for the optional item-comment count. Comments are disabled by default;
// when enabled the limit defaults to 20 and must be an integer in 1..50. A
// single page of at most 50 comments is ever requested — no pagination.
export const DEFAULT_GITHUB_COMMENT_LIMIT = 20;
export const MIN_GITHUB_COMMENT_LIMIT = 1;
export const MAX_GITHUB_COMMENT_LIMIT = 50;

// Bounds for the optional pull-request review count. Reviews are disabled by
// default; when enabled the limit defaults to 10 and must be an integer in
// 1..20. A single page of at most 20 reviews is ever requested — no pagination.
export const DEFAULT_GITHUB_REVIEW_LIMIT = 10;
export const MIN_GITHUB_REVIEW_LIMIT = 1;
export const MAX_GITHUB_REVIEW_LIMIT = 20;

// Bounds for the optional inline review-comment count. Review comments are
// disabled by default; when enabled the limit defaults to 10 and must be an
// integer in 1..20. A single page of at most 20 review comments is ever
// requested — no pagination.
export const DEFAULT_GITHUB_REVIEW_COMMENT_LIMIT = 10;
export const MIN_GITHUB_REVIEW_COMMENT_LIMIT = 1;
export const MAX_GITHUB_REVIEW_COMMENT_LIMIT = 20;

// Conservative GitHub-compatible segment: letters, numbers, "_", "-", ".".
// Path traversal (".", "..") and empty segments are rejected separately.
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

// Search scope qualifiers the caller may not set; the provider injects scope
// (repository, state, and issue/PR kind). User search terms may not override
// any of these.
const FORBIDDEN_SEARCH_QUALIFIERS = ["repo:", "org:", "user:", "is:", "type:", "state:"];

const LIST_SOURCES: readonly GitHubListSource[] = [
  "overview",
  "repository",
  "issues",
  "pull-requests",
];
const QUERY_STATES: readonly GitHubQueryState[] = ["open", "closed", "all"];
const QUERY_KINDS: readonly GitHubQueryKind[] = ["all", "issues", "pull-requests"];

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

// --- Canonical query builders ----------------------------------------------

/**
 * Build the canonical internal list query:
 *   owner/repository::source=<source>&state=<state>
 * `repository` always encodes state=open for a deterministic shape; provider
 * execution ignores the state for the repository source.
 */
export function buildGitHubListQuery(input: {
  repository: string;
  source: GitHubListSource;
  state: GitHubQueryState;
}): string {
  const params = new URLSearchParams();
  params.set("source", input.source);
  params.set("state", input.source === "repository" ? "open" : input.state);
  return `${input.repository}::${params.toString()}`;
}

/**
 * Build the canonical internal search query:
 *   owner/repository::state=<state>&kind=<kind>&q=<encoded terms>
 * Terms are always URL-encoded; scope (repository/state/kind) is provider-owned.
 */
export function buildGitHubSearchQuery(input: {
  repository: string;
  terms: string;
  state: GitHubQueryState;
  kind: GitHubQueryKind;
}): string {
  const params = new URLSearchParams();
  params.set("state", input.state);
  params.set("kind", input.kind);
  params.set("q", input.terms);
  return `${input.repository}::${params.toString()}`;
}

/**
 * Build the fetch query. Two shapes:
 *   - short legacy form when no optional context is enabled:
 *       `owner/repository#number`
 *   - explicit form emitting only the enabled parameters in the canonical order
 *     `comments`, `reviews`, `review-comments`, e.g.
 *       `owner/repository#number::comments=20&reviews=10&review-comments=10`
 * The short form is always emitted when every optional context is disabled so
 * the legacy grammar round-trips unchanged.
 */
export function buildGitHubFetchQuery(input: {
  repository: string;
  number: number;
  includeComments?: boolean;
  commentLimit?: number;
  includeReviews?: boolean;
  reviewLimit?: number;
  includeReviewComments?: boolean;
  reviewCommentLimit?: number;
}): string {
  const params: string[] = [];
  if (input.includeComments === true) {
    params.push(`comments=${input.commentLimit ?? DEFAULT_GITHUB_COMMENT_LIMIT}`);
  }
  if (input.includeReviews === true) {
    params.push(`reviews=${input.reviewLimit ?? DEFAULT_GITHUB_REVIEW_LIMIT}`);
  }
  if (input.includeReviewComments === true) {
    params.push(`review-comments=${input.reviewCommentLimit ?? DEFAULT_GITHUB_REVIEW_COMMENT_LIMIT}`);
  }
  if (params.length === 0) {
    return `${input.repository}#${input.number}`;
  }
  return `${input.repository}#${input.number}::${params.join("&")}`;
}

// --- Query parsers ----------------------------------------------------------

/**
 * Parse the encoded parameter portion after the `::` separator, enforcing no
 * duplicate keys, no unknown keys, and no empty values. Returns a plain map or
 * an error reason.
 */
function parseParams(
  encoded: string,
  allowed: readonly string[],
): { ok: true; values: Map<string, string> } | { ok: false; reason: string } {
  const values = new Map<string, string>();
  const parts = encoded.split("&");
  for (const part of parts) {
    if (part === "") {
      return { ok: false, reason: "empty query parameter" };
    }
    const eq = part.indexOf("=");
    if (eq === -1) {
      return { ok: false, reason: "query parameter is missing a value" };
    }
    const rawKey = part.slice(0, eq);
    const rawValue = part.slice(eq + 1);
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey);
      value = decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      return { ok: false, reason: "malformed query parameter encoding" };
    }
    if (!allowed.includes(key)) {
      return { ok: false, reason: "unknown query parameter" };
    }
    if (values.has(key)) {
      return { ok: false, reason: "duplicate query parameter" };
    }
    values.set(key, value);
  }
  return { ok: true, values };
}

/**
 * Parse the list query. Two accepted forms:
 *   - legacy: `owner/repository` (resolves to source=overview, state=open)
 *   - canonical: `owner/repository::source=<source>&state=<state>`
 */
export function parseGitHubListQuery(query: string): GitHubListQueryResult {
  if (typeof query !== "string" || query === "") {
    return { ok: false, reason: "list query is required" };
  }
  const separatorIndex = query.indexOf("::");
  if (separatorIndex === -1) {
    // Legacy bare repository form.
    const repoResult = parseGitHubRepository(query);
    if (!repoResult.ok) return { ok: false, reason: repoResult.reason };
    return { ok: true, ref: repoResult.ref, source: "overview", state: "open" };
  }
  const repositoryPart = query.slice(0, separatorIndex);
  const paramsPart = query.slice(separatorIndex + 2);
  const repoResult = parseGitHubRepository(repositoryPart);
  if (!repoResult.ok) return { ok: false, reason: repoResult.reason };
  if (paramsPart.includes("::")) {
    return { ok: false, reason: "list query contains a repeated separator" };
  }
  const parsed = parseParams(paramsPart, ["source", "state"]);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const sourceRaw = parsed.values.get("source");
  const stateRaw = parsed.values.get("state") ?? "open";
  if (sourceRaw === undefined || !(LIST_SOURCES as readonly string[]).includes(sourceRaw)) {
    return { ok: false, reason: "invalid list source" };
  }
  if (!(QUERY_STATES as readonly string[]).includes(stateRaw)) {
    return { ok: false, reason: "invalid list state" };
  }
  return {
    ok: true,
    ref: repoResult.ref,
    source: sourceRaw as GitHubListSource,
    state: stateRaw as GitHubQueryState,
  };
}

function validateTerms(terms: string): { ok: true; terms: string } | { ok: false; reason: string } {
  const trimmed = terms.trim();
  if (trimmed === "") return { ok: false, reason: "search terms are required" };
  if (trimmed.length > MAX_SEARCH_TERMS_LENGTH) {
    return { ok: false, reason: "search terms are too long" };
  }
  if (hasControlCharacters(trimmed)) {
    return { ok: false, reason: "search terms contain control characters" };
  }
  const lowered = trimmed.toLowerCase();
  for (const qualifier of FORBIDDEN_SEARCH_QUALIFIERS) {
    if (lowered.includes(qualifier)) {
      return { ok: false, reason: "search terms must not contain a scope qualifier" };
    }
  }
  return { ok: true, terms: trimmed };
}

/**
 * Parse the search query. Two accepted forms:
 *   - legacy: `owner/repository::terms` (state=open, kind=all)
 *   - canonical: `owner/repository::state=<state>&kind=<kind>&q=<encoded terms>`
 */
export function parseGitHubSearchQuery(query: string): GitHubSearchQueryResult {
  if (typeof query !== "string" || query === "") {
    return { ok: false, reason: "search query is required" };
  }
  const separatorIndex = query.indexOf("::");
  if (separatorIndex === -1) {
    return { ok: false, reason: "search query must be owner/repository::terms" };
  }
  const repositoryPart = query.slice(0, separatorIndex);
  const rest = query.slice(separatorIndex + 2);
  const repoResult = parseGitHubRepository(repositoryPart);
  if (!repoResult.ok) return { ok: false, reason: repoResult.reason };

  // Canonical form is recognized when the parameters begin with a known key.
  const isCanonical = /^(state|kind|q)=/.test(rest);
  if (isCanonical) {
    if (rest.includes("::")) {
      return { ok: false, reason: "search query contains a repeated separator" };
    }
    const parsed = parseParams(rest, ["state", "kind", "q"]);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    const stateRaw = parsed.values.get("state") ?? "open";
    const kindRaw = parsed.values.get("kind") ?? "all";
    const qRaw = parsed.values.get("q");
    if (!(QUERY_STATES as readonly string[]).includes(stateRaw)) {
      return { ok: false, reason: "invalid search state" };
    }
    if (!(QUERY_KINDS as readonly string[]).includes(kindRaw)) {
      return { ok: false, reason: "invalid search kind" };
    }
    if (qRaw === undefined) {
      return { ok: false, reason: "search terms are required" };
    }
    const termsResult = validateTerms(qRaw);
    if (!termsResult.ok) return { ok: false, reason: termsResult.reason };
    return {
      ok: true,
      ref: repoResult.ref,
      terms: termsResult.terms,
      state: stateRaw as GitHubQueryState,
      kind: kindRaw as GitHubQueryKind,
    };
  }

  // Legacy bare-terms form.
  const termsResult = validateTerms(rest);
  if (!termsResult.ok) return { ok: false, reason: termsResult.reason };
  return { ok: true, ref: repoResult.ref, terms: termsResult.terms, state: "open", kind: "all" };
}

/**
 * Read one recognized limit parameter, validating a strict positive integer in
 * [min, max]. Returns { enabled, limit } where a missing parameter is disabled
 * with the given default; a present, well-formed value is enabled.
 */
function readLimitParam(
  values: Map<string, string>,
  key: string,
  label: string,
  min: number,
  max: number,
  fallback: number,
): { ok: true; enabled: boolean; limit: number } | { ok: false; reason: string } {
  const raw = values.get(key);
  if (raw === undefined) {
    return { ok: true, enabled: false, limit: fallback };
  }
  if (!/^[1-9][0-9]*$/.test(raw)) {
    return { ok: false, reason: `${label} limit must be a positive integer` };
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < min || limit > max) {
    return { ok: false, reason: `${label} limit is out of range` };
  }
  return { ok: true, enabled: true, limit };
}

/**
 * fetch query grammar. Two accepted forms:
 *   - legacy: `owner/repository#number` (all optional context disabled, limits
 *     default)
 *   - explicit: `owner/repository#number::comments=<limit>&reviews=<limit>&review-comments=<limit>`
 *     where each present limit is a positive integer in its own range (comments
 *     1..50, reviews 1..20, review-comments 1..20). Only the enabled parameters
 *     need appear, always in the canonical order comments, reviews,
 *     review-comments.
 * Only `comments`, `reviews`, and `review-comments` are recognized; unknown,
 * duplicate, empty, malformed, repeated-separator, or out-of-range forms are
 * rejected. Legacy forms resolve to every optional context disabled with
 * default limits.
 */
export function parseGitHubFetchQuery(query: string): GitHubFetchQueryResult {
  if (typeof query !== "string" || query === "") {
    return { ok: false, reason: "fetch query is required" };
  }
  const separatorIndex = query.indexOf("::");
  const fetchPart = separatorIndex === -1 ? query : query.slice(0, separatorIndex);
  const paramsPart = separatorIndex === -1 ? undefined : query.slice(separatorIndex + 2);

  const hashIndex = fetchPart.indexOf("#");
  if (hashIndex === -1) {
    return { ok: false, reason: "fetch query must be owner/repository#number" };
  }
  const repositoryPart = fetchPart.slice(0, hashIndex);
  const numberPart = fetchPart.slice(hashIndex + 1);
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

  // Legacy bare form: every optional context disabled with default limits.
  if (paramsPart === undefined) {
    return {
      ok: true,
      ref: repoResult.ref,
      number: parsed,
      includeComments: false,
      commentLimit: DEFAULT_GITHUB_COMMENT_LIMIT,
      includeReviews: false,
      reviewLimit: DEFAULT_GITHUB_REVIEW_LIMIT,
      includeReviewComments: false,
      reviewCommentLimit: DEFAULT_GITHUB_REVIEW_COMMENT_LIMIT,
    };
  }

  if (paramsPart.includes("::")) {
    return { ok: false, reason: "fetch query contains a repeated separator" };
  }
  const parsedParams = parseParams(paramsPart, ["comments", "reviews", "review-comments"]);
  if (!parsedParams.ok) return { ok: false, reason: parsedParams.reason };
  if (parsedParams.values.size === 0) {
    return { ok: false, reason: "fetch query parameters must include a recognized parameter" };
  }

  const comments = readLimitParam(
    parsedParams.values,
    "comments",
    "comments",
    MIN_GITHUB_COMMENT_LIMIT,
    MAX_GITHUB_COMMENT_LIMIT,
    DEFAULT_GITHUB_COMMENT_LIMIT,
  );
  if (!comments.ok) return { ok: false, reason: comments.reason };
  const reviews = readLimitParam(
    parsedParams.values,
    "reviews",
    "reviews",
    MIN_GITHUB_REVIEW_LIMIT,
    MAX_GITHUB_REVIEW_LIMIT,
    DEFAULT_GITHUB_REVIEW_LIMIT,
  );
  if (!reviews.ok) return { ok: false, reason: reviews.reason };
  const reviewComments = readLimitParam(
    parsedParams.values,
    "review-comments",
    "review comments",
    MIN_GITHUB_REVIEW_COMMENT_LIMIT,
    MAX_GITHUB_REVIEW_COMMENT_LIMIT,
    DEFAULT_GITHUB_REVIEW_COMMENT_LIMIT,
  );
  if (!reviewComments.ok) return { ok: false, reason: reviewComments.reason };

  return {
    ok: true,
    ref: repoResult.ref,
    number: parsed,
    includeComments: comments.enabled,
    commentLimit: comments.limit,
    includeReviews: reviews.enabled,
    reviewLimit: reviews.limit,
    includeReviewComments: reviewComments.enabled,
    reviewCommentLimit: reviewComments.limit,
  };
}
