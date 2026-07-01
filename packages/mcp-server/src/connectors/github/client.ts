import type { GitHubConfig } from "./config.js";
import { httpStatusToError } from "./errors.js";
import type { GitHubErrorResponse } from "./errors.js";

export interface GitHubResponse<T> {
  data: T | null;
  error: GitHubErrorResponse | null;
  headers: Record<string, string | null>;
}

// Minimal GitHub REST client. Makes no network calls on import or startup.
// All requests are triggered only by explicit tool invocations.
export class GitHubClient {
  private readonly config: GitHubConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: GitHubConfig, fetchFn: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "oh-my-pm-mcp-server",
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  async get<T>(path: string): Promise<GitHubResponse<T>> {
    const url = `${this.config.apiBaseUrl}${path}`;
    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: this.buildHeaders(),
      });

      const responseHeaders: Record<string, string | null> = {
        "x-ratelimit-remaining": response.headers.get("x-ratelimit-remaining"),
        "x-ratelimit-limit": response.headers.get("x-ratelimit-limit"),
        "x-ratelimit-reset": response.headers.get("x-ratelimit-reset"),
      };

      if (!response.ok) {
        return {
          data: null,
          error: httpStatusToError(response.status, this.config.token !== null),
          headers: responseHeaders,
        };
      }

      const data = (await response.json()) as T;
      return { data, error: null, headers: responseHeaders };
    } catch (_err) {
      return {
        data: null,
        error: {
          status: "error",
          error_code: "network_error",
          message: "Network error connecting to GitHub API. Check connectivity.",
        },
        headers: {},
      };
    }
  }

  get owner(): string { return this.config.owner; }
  get repo(): string { return this.config.repo; }
}
