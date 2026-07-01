import type { JiraConfig } from "./config.js";
import { httpStatusToError } from "./errors.js";
import type { JiraErrorResponse } from "./errors.js";

export interface JiraResponse<T> {
  data: T | null;
  error: JiraErrorResponse | null;
  headers: Record<string, string | null>;
}

// Minimal Jira Cloud REST client. Makes no network calls on import or startup.
// All requests are triggered only by explicit tool invocations.
// Issues only GET requests — never POST, PUT, PATCH, or DELETE.
export class JiraClient {
  private readonly config: JiraConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: JiraConfig, fetchFn: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "oh-my-pm-mcp-server",
    };
    if (this.config.email && this.config.token) {
      const credentials = Buffer.from(`${this.config.email}:${this.config.token}`).toString(
        "base64"
      );
      headers["Authorization"] = `Basic ${credentials}`;
    }
    return headers;
  }

  async get<T>(path: string): Promise<JiraResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: this.buildHeaders(),
      });

      const responseHeaders: Record<string, string | null> = {
        "x-ratelimit-remaining": response.headers.get("x-ratelimit-remaining"),
        "retry-after": response.headers.get("retry-after"),
      };

      if (!response.ok) {
        return {
          data: null,
          error: httpStatusToError(response.status, responseHeaders["retry-after"]),
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
          message: "Network error connecting to Jira API. Check connectivity.",
        },
        headers: {},
      };
    }
  }

  get baseUrl(): string { return this.config.baseUrl; }
  get projectKey(): string { return this.config.projectKey; }
  get boardId(): string | null { return this.config.boardId; }
}
