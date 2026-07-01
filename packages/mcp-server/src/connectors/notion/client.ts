import type { NotionConfig } from "./config.js";
import { httpStatusToError } from "./errors.js";
import type { NotionErrorResponse } from "./errors.js";

export interface NotionResponse<T> {
  data: T | null;
  error: NotionErrorResponse | null;
  headers: Record<string, string | null>;
}

const NOTION_API_VERSION = "2022-06-28";

// Read-only Notion REST client. Makes no network calls on import or startup.
// All requests are triggered only by explicit tool invocations.
//
// Notion's search and database-query endpoints are POST requests even
// though they are read-only — the request body carries filter/sort
// parameters, not a write payload. This client exposes exactly those two
// read-only POST paths via postQuery(), plus GET for everything else. It
// never calls a page/block/database create, update, append, or delete
// endpoint.
export class NotionClient {
  private readonly config: NotionConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: NotionConfig, fetchFn: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
      "User-Agent": "oh-my-pm-mcp-server",
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>
  ): Promise<NotionResponse<T>> {
    const url = `${this.config.apiBaseUrl}${path}`;
    try {
      const response = await this.fetchFn(url, {
        method,
        headers: this.buildHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const responseHeaders: Record<string, string | null> = {
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
          message: "Network error connecting to Notion API. Check connectivity.",
        },
        headers: {},
      };
    }
  }

  async get<T>(path: string): Promise<NotionResponse<T>> {
    return this.request<T>(path, "GET");
  }

  // Restricted to Notion's two read-only POST endpoints: /search and
  // /databases/{id}/query. Never used for any create/update/append/delete path.
  async postQuery<T>(path: string, body: Record<string, unknown>): Promise<NotionResponse<T>> {
    return this.request<T>(path, "POST", body);
  }

  get pageId(): string | null { return this.config.pageId; }
  get databaseId(): string | null { return this.config.databaseId; }
}
