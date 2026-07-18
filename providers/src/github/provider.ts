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
  normalizeIssue,
  normalizeIssueOrPullRequest,
  normalizePullRequest,
  normalizeRepository,
  readPullRequestDetail,
} from "./normalize.js";
import { parseGitHubFetchQuery, parseGitHubListQuery, parseGitHubSearchQuery } from "./query.js";
import { GitHubTransportError } from "./transport.js";
import type { GitHubHttpResponse, GitHubHttpTransport } from "./types.js";

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

  async function handleList(query: string, limit: number): Promise<ProviderResult> {
    const parsed = parseGitHubListQuery(query);
    if (!parsed.ok) {
      return providerFailure("github", OMP_P_INVALID_REQUEST, "invalid repository identifier");
    }
    const { slug } = parsed.ref;
    const repoResult = await get(`${GITHUB_API_ORIGIN}/repos/${slug}`);
    if (!repoResult.ok) return repoResult.result;
    const repoNorm = normalizeRepository(slug, repoResult.response.body);
    if (repoNorm === null) {
      return providerFailure("github", OMP_P_INVALID_RESPONSE);
    }

    const items: NormalizedProviderItem[] = [repoNorm.item];
    const warnings: KernelWarning[] = [...repoNorm.warnings, ...lowRateLimitWarning(repoResult.response.headers)];

    if (limit > 1) {
      const perPage = limit - 1;
      const listUrl = new URL(`${GITHUB_API_ORIGIN}/repos/${slug}/issues`);
      listUrl.searchParams.set("state", "open");
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

  async function handleSearch(query: string, limit: number): Promise<ProviderResult> {
    const parsed = parseGitHubSearchQuery(query);
    if (!parsed.ok) {
      return providerFailure("github", OMP_P_INVALID_REQUEST, "invalid search query");
    }
    const slug = parsed.ref.slug;
    const terms = parsed.terms;
    const searchUrl = new URL(`${GITHUB_API_ORIGIN}/search/issues`);
    searchUrl.searchParams.set("q", `repo:${slug} is:open ${terms}`);
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

  async function handleFetch(query: string): Promise<ProviderResult> {
    const parsed = parseGitHubFetchQuery(query);
    if (!parsed.ok) {
      return providerFailure("github", OMP_P_INVALID_REQUEST, "invalid fetch query");
    }
    const { slug } = parsed.ref;
    const number = parsed.number;
    const issueResult = await get(`${GITHUB_API_ORIGIN}/repos/${slug}/issues/${number}`);
    if (!issueResult.ok) return issueResult.result;
    const issueBody = issueResult.response.body;
    const warnings: KernelWarning[] = [...lowRateLimitWarning(issueResult.response.headers)];

    const isPr =
      typeof issueBody === "object" &&
      issueBody !== null &&
      !Array.isArray(issueBody) &&
      (issueBody as Record<string, unknown>)["pull_request"] !== undefined;

    if (isPr) {
      const prResult = await get(`${GITHUB_API_ORIGIN}/repos/${slug}/pulls/${number}`);
      if (!prResult.ok) return prResult.result;
      const detail = readPullRequestDetail(prResult.response.body);
      const norm = normalizePullRequest(slug, issueBody, detail);
      if (norm === null) {
        return providerFailure("github", OMP_P_INVALID_RESPONSE);
      }
      warnings.push(...norm.warnings, ...lowRateLimitWarning(prResult.response.headers));
      return success([norm.item], dedupeWarnings(warnings));
    }

    const norm = normalizeIssue(slug, issueBody);
    if (norm === null) {
      return providerFailure("github", OMP_P_INVALID_RESPONSE);
    }
    warnings.push(...norm.warnings);
    return success([norm.item], dedupeWarnings(warnings));
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
