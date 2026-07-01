import type { LinearConfig } from "./config.js";
import { httpStatusToError, graphqlErrorToError } from "./errors.js";
import type { LinearErrorResponse } from "./errors.js";

export interface LinearResponse<T> {
  data: T | null;
  error: LinearErrorResponse | null;
  headers: Record<string, string | null>;
}

interface GraphQLResponseBody<T> {
  data?: T;
  errors?: { message: string }[];
}

// Minimal Linear GraphQL client. Makes no network calls on import or startup.
// All requests are triggered only by explicit tool invocations.
// Sends only read-only queries — never a GraphQL mutation.
export class LinearClient {
  private readonly config: LinearConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: LinearConfig, fetchFn: typeof fetch = globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "oh-my-pm-mcp-server",
    };
    if (this.config.token) {
      headers["Authorization"] = this.config.token;
    }
    return headers;
  }

  async query<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<LinearResponse<T>> {
    try {
      const response = await this.fetchFn(this.config.apiBaseUrl, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({ query, variables }),
      });

      const responseHeaders: Record<string, string | null> = {
        "x-ratelimit-requests-remaining": response.headers.get(
          "x-ratelimit-requests-remaining"
        ),
      };

      if (!response.ok) {
        return {
          data: null,
          error: httpStatusToError(response.status),
          headers: responseHeaders,
        };
      }

      const body = (await response.json()) as GraphQLResponseBody<T>;

      if (body.errors && body.errors.length > 0) {
        return {
          data: null,
          error: graphqlErrorToError(body.errors[0]!.message),
          headers: responseHeaders,
        };
      }

      return { data: body.data ?? null, error: null, headers: responseHeaders };
    } catch (_err) {
      return {
        data: null,
        error: {
          status: "error",
          error_code: "network_error",
          message: "Network error connecting to Linear API. Check connectivity.",
        },
        headers: {},
      };
    }
  }

  get teamId(): string { return this.config.teamId; }
  get workspaceId(): string | null { return this.config.workspaceId; }
  get projectId(): string | null { return this.config.projectId; }
}
