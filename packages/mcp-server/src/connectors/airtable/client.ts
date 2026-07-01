import type { AirtableConfig } from "./config.js";
import { httpStatusToError } from "./errors.js";
import type { AirtableErrorResponse } from "./errors.js";

export interface AirtableResponse<T> {
  data: T | null;
  error: AirtableErrorResponse | null;
  headers: Record<string, string | null>;
}

// Minimal Airtable REST client. Makes no network calls on import or startup.
// All requests are triggered only by explicit tool invocations.
export class AirtableClient {
  private readonly config: AirtableConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: AirtableConfig, fetchFn: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "oh-my-pm-mcp-server",
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  async get<T>(path: string, apiRoot: string = this.config.apiBaseUrl): Promise<AirtableResponse<T>> {
    const url = `${apiRoot}${path}`;
    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: this.buildHeaders(),
      });

      const responseHeaders: Record<string, string | null> = {};

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
          message: "Network error connecting to Airtable API. Check connectivity.",
        },
        headers: {},
      };
    }
  }

  get baseId(): string { return this.config.baseId; }
  get tableId(): string | null { return this.config.tableId; }
  get tableName(): string | null { return this.config.tableName; }
}
