// GitHub read-only provider. Orchestrates the injected transport, the strict
// query parsers, and the pure normalizers. GET-only. Maps HTTP status and
// transport errors to the stable OMP-P-40xx taxonomy. Never returns raw bodies,
// headers, or tokens; failures use an empty response with one sanitized warning.

import type {
  KernelWarning,
  NormalizedProviderItem,
  NormalizedProviderResponse,
  ProviderRequest,
} from "@oh-my-pm/contracts";
import {
  OMP_P_ACCESS_FORBIDDEN,
  OMP_P_AUTHENTICATION_FAILED,
  OMP_P_INVALID_REQUEST,
  OMP_P_INVALID_RESPONSE,
  OMP_P_RATE_LIMITED,
  OMP_P_RESOURCE_NOT_FOUND,
  OMP_P_TRANSPORT_FAILED,
  OMP_P_UNSUPPORTED_ACTION,
  emptyProviderResponse,
  providerFailure,
  providerWarning,
} from "../errors.js";
import type { Provider, ProviderResult } from "../types.js";
import {
  GITHUB_ACCEPT,
  GITHUB_API_ORIGIN,
  GITHUB_API_VERSION,
  GITHUB_DEFAULT_LIMIT,
  GITHUB_MAX_LIMIT,
  GITHUB_MAX_RESPONSE_BYTES,
  GITHUB_REQUEST_TIMEOUT_MS,
} from "./constants.js";
import {
  type GitHubCommentParent,
  type GitHubReviewParent,
  normalizeIssue,
  normalizeIssueComments,
  normalizeIssueOrPullRequest,
  normalizePullRequest,
  normalizePullRequestReviewComments,
  normalizePullRequestReviews,
  normalizeRepository,
  readPullRequestDetail,
} from "./normalize.js";
import { parseGitHubFetchQuery, parseGitHubListQuery, parseGitHubSearchQuery } from "./query.js";
import { GitHubTransportError } from "./transport.js";
import type {
  GitHubHttpResponse,
  GitHubHttpTransport,
  GitHubListSource,
  GitHubQueryKind,
  GitHubQueryState,
} from "./types.js";

const RATE_LIMIT_WARN_THRESHOLD = 10;

type GetResult =
  | { ok: true; response: GitHubHttpResponse }
  | { ok: false; result: ProviderResult };

function resolveLimit(limit: number | undefined): number | null {
  if (limit === undefined) return GITHUB_DEFAULT_LIMIT;
  if (typeof limit !== "number" || !Number.isInteger(limit)) return null;
  if (limit < 1 || limit > GITHUB_MAX_LIMIT) return null;
  return limit;
}

/** Deterministic request headers (no token here; the transport injects auth). */
function requestHeaders(productVersion: string): Record<string, string> {
  return {
    Accept: GITHUB_ACCEPT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": `oh-my-pm/${productVersion}`,
  };
}

function readIntHeader(headers: Readonly<Record<string, string>>, key: string): number | undefined {
  const raw = headers[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Build a rate-limit failure. The normalized response is empty with exactly one
 * sanitized warning. Rate-limit counters (resource/remaining/resetAt/
 * retryAfterSeconds) are numeric-only and appended to the stable message when
 * present, so no raw body or header object ever leaks.
 */
function rateLimitedFailure(headers: Readonly<Record<string, string>>): ProviderResult {
  const parts: string[] = [];
  const resource = headers["x-ratelimit-resource"];
  if (typeof resource === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(resource)) {
    parts.push(`resource=${resource}`);
  }
  const remaining = readIntHeader(headers, "x-ratelimit-remaining");
  if (remaining !== undefined) parts.push(`remaining=${remaining}`);
  const reset = readIntHeader(headers, "x-ratelimit-reset");
  if (reset !== undefined) parts.push(`resetAt=${reset}`);
  const retryAfter = readIntHeader(headers, "retry-after");
  if (retryAfter !== undefined) parts.push(`retryAfterSeconds=${retryAfter}`);
  const message =
    parts.length > 0
      ? `provider rate limit reached (${parts.join(", ")})`
      : "provider rate limit reached";
  return providerFailure("github", OMP_P_RATE_LIMITED, message);
}

/** Map an error HTTP status to the stable provider failure taxonomy. */
function failureForStatus(status: number, headers: Readonly<Record<string, string>>): ProviderResult {
  if (status === 401) {
    return providerFailure("github", OMP_P_AUTHENTICATION_FAILED);
  }
  if (status === 404 || status === 410) {
    return providerFailure("github", OMP_P_RESOURCE_NOT_FOUND);
  }
  if (status === 422) {
    return providerFailure("github", OMP_P_INVALID_REQUEST);
  }
  if (status === 429) {
    return rateLimitedFailure(headers);
  }
  if (status === 403) {
    const remaining = readIntHeader(headers, "x-ratelimit-remaining");
    const hasRetryAfter = headers["retry-after"] !== undefined;
    if (remaining === 0 || hasRetryAfter) {
      return rateLimitedFailure(headers);
    }
    return providerFailure("github", OMP_P_ACCESS_FORBIDDEN);
  }
  return providerFailure("github", OMP_P_TRANSPORT_FAILED);
}

/** A successful-status guard: 2xx passes; everything else becomes a failure. */
function ensureOk(response: GitHubHttpResponse): GetResult {
  if (response.status >= 200 && response.status < 300) {
    return { ok: true, response };
  }
  return { ok: false, result: failureForStatus(response.status, response.headers) };
}

export function createGitHubProvider(options: {
  transport: GitHubHttpTransport;
  productVersion?: string;
}): Provider {
  const transport = options.transport;
  const productVersion = options.productVersion ?? "0.0.0";
  const headers = requestHeaders(productVersion);

  async function get(url: string): Promise<GetResult> {
    let response: GitHubHttpResponse;
    try {
      response = await transport.request({
        method: "GET",
        url,
        headers,
        timeoutMs: GITHUB_REQUEST_TIMEOUT_MS,
        maxResponseBytes: GITHUB_MAX_RESPONSE_BYTES,
      });
    } catch (error) {
      if (error instanceof GitHubTransportError && error.kind === "invalid-response") {
        return { ok: false, result: providerFailure("github", OMP_P_INVALID_RESPONSE) };
      }
      return { ok: false, result: providerFailure("github", OMP_P_TRANSPORT_FAILED) };
    }
    return ensureOk(response);
  }

  function lowRateLimitWarning(headers: Readonly<Record<string, string>>): KernelWarning[] {
    const remaining = readIntHeader(headers, "x-ratelimit-remaining");
    if (remaining !== undefined && remaining < RATE_LIMIT_WARN_THRESHOLD) {
      return [providerWarning("github_rate_limit_low", "GitHub rate limit is running low")];
    }
    return [];
  }

  function success(
    items: NormalizedProviderItem[],
    warnings: KernelWarning[],
  ): ProviderResult {
    const response: NormalizedProviderResponse = { providerId: "github", items };
    if (warnings.length > 0) {
      response.warnings = warnings;
    }
    return { ok: true, response };
  }

  /** The GitHub search `is:` state qualifier for a selected state (all omits). */
  function stateQualifier(state: GitHubQueryState): string | null {
    if (state === "open") return "is:open";
    if (state === "closed") return "is:closed";
    return null;
  }

  /**
   * Run one read-only `GET /search/issues` page with a provider-owned scope
   * (repository + optional state + optional kind qualifier) followed by the
   * user terms, normalize the results, and return them. Scope qualifiers are
   * always emitted before the terms; the terms never override scope.
   */
  async function runIssueSearch(
    slug: string,
    scope: { state: GitHubQueryState; kind: GitHubQueryKind; terms: string },
    limit: number,
  ): Promise<ProviderResult> {
    const parts = [`repo:${slug}`];
    const stateQ = stateQualifier(scope.state);
    if (stateQ !== null) parts.push(stateQ);
    if (scope.kind === "issues") parts.push("is:issue");
    else if (scope.kind === "pull-requests") parts.push("is:pr");
    if (scope.terms !== "") parts.push(scope.terms);

    const searchUrl = new URL(`${GITHUB_API_ORIGIN}/search/issues`);
    searchUrl.searchParams.set("q", parts.join(" "));
    searchUrl.searchParams.set("sort", "updated");
    searchUrl.searchParams.set("order", "desc");
    searchUrl.searchParams.set("per_page", String(limit));
    searchUrl.searchParams.set("page", "1");
    const result = await get(searchUrl.toString());
    if (!result.ok) return result.result;
    const body = result.response.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return providerFailure("github", OMP_P_INVALID_RESPONSE);
    }
    const record = body as Record<string, unknown>;
    const rawItems = record["items"];
    if (!Array.isArray(rawItems)) {
      return providerFailure("github", OMP_P_INVALID_RESPONSE);
    }
    const items: NormalizedProviderItem[] = [];
    const warnings: KernelWarning[] = [...lowRateLimitWarning(result.response.headers)];
    for (const raw of rawItems.slice(0, limit)) {
      const norm = normalizeIssueOrPullRequest(slug, raw);
      if (norm === null) {
        return providerFailure("github", OMP_P_INVALID_RESPONSE);
      }
      items.push(norm.item);
      warnings.push(...norm.warnings);
    }
    if (record["incomplete_results"] === true) {
      warnings.push(
        providerWarning("github_incomplete_results", "GitHub reported incomplete search results"),
      );
    }
    return success(items.slice(0, limit), dedupeWarnings(warnings));
  }

  /** Fetch and normalize the repository metadata record item. */
  async function fetchRepositoryRecord(
    slug: string,
  ): Promise<
    | { ok: true; item: NormalizedProviderItem; warnings: KernelWarning[] }
    | { ok: false; result: ProviderResult }
  > {
    const repoResult = await get(`${GITHUB_API_ORIGIN}/repos/${slug}`);
    if (!repoResult.ok) return { ok: false, result: repoResult.result };
    const repoNorm = normalizeRepository(slug, repoResult.response.body);
    if (repoNorm === null) {
      return { ok: false, result: providerFailure("github", OMP_P_INVALID_RESPONSE) };
    }
    return {
      ok: true,
      item: repoNorm.item,
      warnings: [...repoNorm.warnings, ...lowRateLimitWarning(repoResult.response.headers)],
    };
  }

  /** overview: repository metadata plus state-selected issues/PRs. */
  async function handleOverview(
    slug: string,
    state: GitHubQueryState,
    limit: number,
  ): Promise<ProviderResult> {
    const repo = await fetchRepositoryRecord(slug);
    if (!repo.ok) return repo.result;
    const items: NormalizedProviderItem[] = [repo.item];
    const warnings: KernelWarning[] = [...repo.warnings];

    if (limit > 1) {
      const perPage = limit - 1;
      const listUrl = new URL(`${GITHUB_API_ORIGIN}/repos/${slug}/issues`);
      listUrl.searchParams.set("state", state);
      listUrl.searchParams.set("sort", "updated");
      listUrl.searchParams.set("direction", "desc");
      listUrl.searchParams.set("per_page", String(perPage));
      listUrl.searchParams.set("page", "1");
      const issuesResult = await get(listUrl.toString());
      if (!issuesResult.ok) return issuesResult.result;
      const body = issuesResult.response.body;
      if (!Array.isArray(body)) {
        return providerFailure("github", OMP_P_INVALID_RESPONSE);
      }
      for (const raw of body.slice(0, perPage)) {
        const norm = normalizeIssueOrPullRequest(slug, raw);
        if (norm === null) {
          return providerFailure("github", OMP_P_INVALID_RESPONSE);
        }
        items.push(norm.item);
        warnings.push(...norm.warnings);
      }
    }
    return success(items.slice(0, limit), dedupeWarnings(warnings));
  }

  async function handleList(query: string, limit: number): Promise<ProviderResult> {
    const parsed = parseGitHubListQuery(query);
    if (!parsed.ok) {
      return providerFailure("github", OMP_P_INVALID_REQUEST, "invalid repository identifier");
    }
    const { slug } = parsed.ref;
    const source: GitHubListSource = parsed.source;

    if (source === "repository") {
      // Exactly one request; repository metadata item only.
      const repo = await fetchRepositoryRecord(slug);
      if (!repo.ok) return repo.result;
      return success([repo.item], dedupeWarnings(repo.warnings));
    }
    if (source === "issues") {
      return runIssueSearch(slug, { state: parsed.state, kind: "issues", terms: "" }, limit);
    }
    if (source === "pull-requests") {
      return runIssueSearch(slug, { state: parsed.state, kind: "pull-requests", terms: "" }, limit);
    }
    // overview
    return handleOverview(slug, parsed.state, limit);
  }

  async function handleSearch(query: string, limit: number): Promise<ProviderResult> {
    const parsed = parseGitHubSearchQuery(query);
    if (!parsed.ok) {
      return providerFailure("github", OMP_P_INVALID_REQUEST, "invalid search query");
    }
    return runIssueSearch(
      parsed.ref.slug,
      { state: parsed.state, kind: parsed.kind, terms: parsed.terms },
      limit,
    );
  }

  /**
   * Fetch the ordinary conversation comments for one issue/PR: exactly one
   * read-only page of GET /repos/{slug}/issues/{number}/comments with
   * per_page=<limit>&page=1. No pagination, retry, or concurrency. On failure
   * the caller propagates the sanitized provider error (no silent fallback).
   */
  /** Read the normalized item's status string defensively (JsonValue data). */
  function statusOf(item: NormalizedProviderItem): string {
    const data = item.data;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const status = (data as Record<string, unknown>)["status"];
      if (typeof status === "string") return status;
    }
    return "open";
  }

  async function fetchIssueComments(
    parent: GitHubCommentParent,
    limit: number,
  ): Promise<
    | { ok: true; items: NormalizedProviderItem[]; warnings: KernelWarning[] }
    | { ok: false; result: ProviderResult }
  > {
    const url = new URL(`${GITHUB_API_ORIGIN}/repos/${parent.slug}/issues/${parent.number}/comments`);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("page", "1");
    const result = await get(url.toString());
    if (!result.ok) return { ok: false, result: result.result };
    const body = result.response.body;
    if (!Array.isArray(body)) {
      return { ok: false, result: providerFailure("github", OMP_P_INVALID_RESPONSE) };
    }
    const normalized = normalizeIssueComments(parent, body.slice(0, limit));
    return {
      ok: true,
      items: normalized.items,
      warnings: [...normalized.warnings, ...lowRateLimitWarning(result.response.headers)],
    };
  }

  /**
   * Fetch the review submissions for a confirmed pull request: exactly one
   * read-only page of GET /repos/{slug}/pulls/{number}/reviews with
   * per_page=<limit>&page=1. No pagination, retry, or concurrency. On failure the
   * caller propagates the sanitized provider error (no silent fallback).
   */
  async function fetchPullRequestReviews(
    parent: GitHubReviewParent,
    limit: number,
  ): Promise<
    | { ok: true; items: NormalizedProviderItem[]; warnings: KernelWarning[] }
    | { ok: false; result: ProviderResult }
  > {
    const url = new URL(`${GITHUB_API_ORIGIN}/repos/${parent.slug}/pulls/${parent.number}/reviews`);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("page", "1");
    const result = await get(url.toString());
    if (!result.ok) return { ok: false, result: result.result };
    const body = result.response.body;
    if (!Array.isArray(body)) {
      return { ok: false, result: providerFailure("github", OMP_P_INVALID_RESPONSE) };
    }
    const normalized = normalizePullRequestReviews(parent, body.slice(0, limit));
    return {
      ok: true,
      items: normalized.items,
      warnings: [...normalized.warnings, ...lowRateLimitWarning(result.response.headers)],
    };
  }

  /**
   * Fetch the inline review comments for a confirmed pull request: exactly one
   * read-only page of GET /repos/{slug}/pulls/{number}/comments with
   * per_page=<limit>&page=1. No pagination, retry, or concurrency. On failure the
   * caller propagates the sanitized provider error (no silent fallback).
   */
  async function fetchPullRequestReviewComments(
    parent: GitHubReviewParent,
    limit: number,
  ): Promise<
    | { ok: true; items: NormalizedProviderItem[]; warnings: KernelWarning[] }
    | { ok: false; result: ProviderResult }
  > {
    const url = new URL(`${GITHUB_API_ORIGIN}/repos/${parent.slug}/pulls/${parent.number}/comments`);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("page", "1");
    const result = await get(url.toString());
    if (!result.ok) return { ok: false, result: result.result };
    const body = result.response.body;
    if (!Array.isArray(body)) {
      return { ok: false, result: providerFailure("github", OMP_P_INVALID_RESPONSE) };
    }
    const normalized = normalizePullRequestReviewComments(parent, body.slice(0, limit));
    return {
      ok: true,
      items: normalized.items,
      warnings: [...normalized.warnings, ...lowRateLimitWarning(result.response.headers)],
    };
  }

  /**
   * A review option was requested but the selected item is an issue, not a pull
   * request. Fail immediately with the sanitized taxonomy, carrying the stable
   * `github_pull_request_required` reason identifier as the warning code. No PR
   * endpoint request (detail, reviews, comments, review comments) is ever made.
   */
  function pullRequestRequiredFailure(): ProviderResult {
    const message = "selected item is not a pull request";
    return {
      ok: false,
      code: OMP_P_INVALID_REQUEST,
      message,
      response: emptyProviderResponse("github", [
        providerWarning("github_pull_request_required", message),
      ]),
    };
  }

  async function handleFetch(query: string): Promise<ProviderResult> {
    const parsed = parseGitHubFetchQuery(query);
    if (!parsed.ok) {
      return providerFailure("github", OMP_P_INVALID_REQUEST, "invalid fetch query");
    }
    const { slug } = parsed.ref;
    const number = parsed.number;
    const includeComments = parsed.includeComments;
    const commentLimit = parsed.commentLimit;
    const includeReviews = parsed.includeReviews;
    const reviewLimit = parsed.reviewLimit;
    const includeReviewComments = parsed.includeReviewComments;
    const reviewCommentLimit = parsed.reviewCommentLimit;
    const anyReviewOption = includeReviews || includeReviewComments;

    // 1. GET issue (item identification). This is the only request made when an
    // issue is selected with review options enabled.
    const issueResult = await get(`${GITHUB_API_ORIGIN}/repos/${slug}/issues/${number}`);
    if (!issueResult.ok) return issueResult.result;
    const issueBody = issueResult.response.body;
    const warnings: KernelWarning[] = [...lowRateLimitWarning(issueResult.response.headers)];

    const isPr =
      typeof issueBody === "object" &&
      issueBody !== null &&
      !Array.isArray(issueBody) &&
      (issueBody as Record<string, unknown>)["pull_request"] !== undefined;

    // PR-only enforcement: when any review option is enabled and the item is not
    // a pull request, fail now. Ordinary comments are NOT fetched and no PR
    // endpoint request is made.
    if (!isPr && anyReviewOption) {
      return pullRequestRequiredFailure();
    }

    if (isPr) {
      // 2. GET PR detail.
      const prResult = await get(`${GITHUB_API_ORIGIN}/repos/${slug}/pulls/${number}`);
      if (!prResult.ok) return prResult.result;
      const detail = readPullRequestDetail(prResult.response.body);
      const norm = normalizePullRequest(slug, issueBody, detail);
      if (norm === null) {
        return providerFailure("github", OMP_P_INVALID_RESPONSE);
      }
      warnings.push(...norm.warnings, ...lowRateLimitWarning(prResult.response.headers));
      const items: NormalizedProviderItem[] = [norm.item];
      const parentStatus = statusOf(norm.item);
      if (includeComments) {
        // 3. GET issue comments (ordinary PR conversation comments).
        const comments = await fetchIssueComments(
          { slug, number, parentType: "pullRequest", parentStatus },
          commentLimit,
        );
        if (!comments.ok) return comments.result;
        items.push(...comments.items);
        warnings.push(...comments.warnings);
      }
      if (includeReviews) {
        // 4. GET PR reviews.
        const reviews = await fetchPullRequestReviews({ slug, number, parentStatus }, reviewLimit);
        if (!reviews.ok) return reviews.result;
        items.push(...reviews.items);
        warnings.push(...reviews.warnings);
      }
      if (includeReviewComments) {
        // 5. GET PR inline review comments.
        const reviewComments = await fetchPullRequestReviewComments(
          { slug, number, parentStatus },
          reviewCommentLimit,
        );
        if (!reviewComments.ok) return reviewComments.result;
        items.push(...reviewComments.items);
        warnings.push(...reviewComments.warnings);
      }
      return success(items, dedupeWarnings(warnings));
    }

    const norm = normalizeIssue(slug, issueBody);
    if (norm === null) {
      return providerFailure("github", OMP_P_INVALID_RESPONSE);
    }
    warnings.push(...norm.warnings);
    const items: NormalizedProviderItem[] = [norm.item];
    if (includeComments) {
      // 2. GET issue comments.
      const parentStatus = statusOf(norm.item);
      const comments = await fetchIssueComments(
        { slug, number, parentType: "issue", parentStatus },
        commentLimit,
      );
      if (!comments.ok) return comments.result;
      items.push(...comments.items);
      warnings.push(...comments.warnings);
    }
    return success(items, dedupeWarnings(warnings));
  }

  return {
    descriptor: {
      id: "github",
      name: "GitHub",
      readOnly: true,
      capabilities: [
        { action: "list", readOnly: true },
        { action: "search", readOnly: true },
        { action: "fetch", readOnly: true },
      ],
    },
    async execute(request: ProviderRequest): Promise<ProviderResult> {
      if (request.providerId !== "github") {
        return providerFailure(
          "github",
          OMP_P_INVALID_REQUEST,
          `github provider received a request for provider: ${request.providerId}`,
        );
      }
      const limit = resolveLimit(request.limit);
      if (limit === null) {
        return providerFailure("github", OMP_P_INVALID_REQUEST, "limit must be an integer in 1..100");
      }
      switch (request.action) {
        case "list":
          return handleList(request.query, limit);
        case "search":
          return handleSearch(request.query, limit);
        case "fetch":
          return handleFetch(request.query);
        default:
          return providerFailure(
            "github",
            OMP_P_UNSUPPORTED_ACTION,
            `unsupported provider action: ${String(request.action)}`,
          );
      }
    },
  };
}

/** Deterministic first-occurrence dedupe of warnings by code+message. */
function dedupeWarnings(warnings: readonly KernelWarning[]): KernelWarning[] {
  const seen = new Set<string>();
  const result: KernelWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.code} ${warning.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(warning);
  }
  return result;
}
