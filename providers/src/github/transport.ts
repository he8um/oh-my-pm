// Production GitHub HTTP transport, built on Node.js 20+ built-in fetch. This
// is the single provider module allowed to touch the network. It performs
// GET-only, same-origin (api.github.com), read-only requests with a hard
// timeout, a response-byte ceiling enforced before JSON parsing, manual and
// bounded same-origin redirect handling, and strict response-header filtering.
// It never retries, never persists cookies, never forwards arbitrary caller
// headers, and never exposes response bodies in thrown errors.

import {
  GITHUB_ACCEPT,
  GITHUB_API_HOSTNAME,
  GITHUB_API_VERSION,
} from "./constants.js";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "./types.js";

const MAX_REDIRECTS = 2;

// Only these response headers are retained; everything else is dropped so that
// no sensitive or unnecessary header reaches Runtime, CLI, or MCP output.
const RETAINED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-ratelimit-resource",
  "retry-after",
  "location",
];

class GitHubTransportError extends Error {
  readonly kind: "transport" | "invalid-response";
  constructor(kind: "transport" | "invalid-response", message: string) {
    // The message is a fixed, sanitized label — never a raw body or header.
    super(message);
    this.name = "GitHubTransportError";
    this.kind = kind;
  }
}

export { GitHubTransportError };

function isSameOrigin(url: URL): boolean {
  return url.protocol === "https:" && url.hostname === GITHUB_API_HOSTNAME;
}

function filterResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of RETAINED_RESPONSE_HEADERS) {
    const value = headers.get(key);
    if (value !== null) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Read the response body with a hard byte ceiling, decode as UTF-8, and parse
 * JSON. An empty body yields `undefined`; a body exceeding the ceiling or
 * failing to parse throws an invalid-response error. Never returns raw text.
 */
async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
  const body = response.body;
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;

  if (body === null) {
    // No stream: fall back to arrayBuffer, still bounded.
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new GitHubTransportError("invalid-response", "response exceeded size limit");
    }
    text = decoder.decode(buffer);
  } else {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new GitHubTransportError("invalid-response", "response exceeded size limit");
        }
        text += decoder.decode(value, { stream: true });
      }
    }
    text += decoder.decode();
  }

  const trimmed = text.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new GitHubTransportError("invalid-response", "response body was not valid JSON");
  }
}

/**
 * Create a production transport. The token (when a non-empty trimmed string) is
 * injected once as a Bearer Authorization header; an absent/empty token yields
 * unauthenticated requests. The product version populates the User-Agent.
 */
export function createNodeGitHubHttpTransport(options: {
  token?: string | undefined;
  productVersion: string;
  fetchImpl?: typeof fetch;
}): GitHubHttpTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = typeof options.token === "string" ? options.token.trim() : "";
  const userAgent = `oh-my-pm/${options.productVersion}`;

  function baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: GITHUB_ACCEPT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": userAgent,
    };
    if (token !== "") {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  return {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      if (request.method !== "GET") {
        throw new GitHubTransportError("transport", "only GET requests are permitted");
      }

      let currentUrl: URL;
      try {
        currentUrl = new URL(request.url);
      } catch {
        throw new GitHubTransportError("transport", "request URL is invalid");
      }
      if (!isSameOrigin(currentUrl)) {
        throw new GitHubTransportError("transport", "request origin is not permitted");
      }

      let redirects = 0;
      // The provided headers already come from the provider's own builder; the
      // transport re-applies its safe base headers and never forwards
      // arbitrary caller headers on redirect.
      for (;;) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), request.timeoutMs);
        let response: Response;
        try {
          response = await fetchImpl(currentUrl.toString(), {
            method: "GET",
            headers: baseHeaders(),
            redirect: "manual",
            signal: controller.signal,
          });
        } catch {
          throw new GitHubTransportError("transport", "request failed to complete");
        } finally {
          clearTimeout(timer);
        }

        // Manual redirect handling: bounded, same-origin only.
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (location === null) {
            throw new GitHubTransportError("transport", "redirect without a location");
          }
          if (redirects >= MAX_REDIRECTS) {
            throw new GitHubTransportError("transport", "too many redirects");
          }
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, currentUrl);
          } catch {
            throw new GitHubTransportError("transport", "redirect location is invalid");
          }
          if (!isSameOrigin(nextUrl)) {
            throw new GitHubTransportError("transport", "cross-origin redirect is not permitted");
          }
          redirects += 1;
          currentUrl = nextUrl;
          continue;
        }

        const headers = filterResponseHeaders(response.headers);
        const body = await readJsonBounded(response, request.maxResponseBytes);
        return { status: response.status, headers, body };
      }
    },
  };
}
