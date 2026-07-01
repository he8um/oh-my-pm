import type { ClickUpConfig } from "./config.js";
import { httpStatusToError } from "./errors.js";
import type { ClickUpErrorResponse } from "./errors.js";

export interface ClickUpResponse<T> {
  data: T | null;
  error: ClickUpErrorResponse | null;
  headers: Record<string, string | null>;
}

// Minimal ClickUp REST client. Makes no network calls on import or startup.
// All requests are triggered only by explicit tool invocations.
export class ClickUpClient {
  private readonly config: ClickUpConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: ClickUpConfig, fetchFn: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "oh-my-pm-mcp-server",
    };
    if (this.config.token) {
      headers["Authorization"] = this.config.token;
    }
    return headers;
  }

  async get<T>(path: string): Promise<ClickUpResponse<T>> {
    const url = `${this.config.apiBaseUrl}${path}`;
    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: this.buildHeaders(),
      });

      const responseHeaders: Record<string, string | null> = {
        "x-ratelimit-remaining": response.headers.get("x-ratelimit-remaining"),
        "x-ratelimit-limit": response.headers.get("x-ratelimit-limit"),
      };

      if (!response.ok) {
        return {
          data: null,
          error: httpStatusToError(response.status),
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
          message: "Network error connecting to ClickUp API. Check connectivity.",
        },
        headers: {},
      };
    }
  }

  get workspaceId(): string { return this.config.workspaceId; }
  get spaceId(): string | null { return this.config.spaceId; }
  get folderId(): string | null { return this.config.folderId; }
  get listId(): string | null { return this.config.listId; }
}
