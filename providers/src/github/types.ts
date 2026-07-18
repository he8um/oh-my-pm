// GitHub provider type surface: the narrow injected HTTP transport contract and
// the pure parser result shapes. No production code in this module reads the
// environment, the clock, the filesystem, or the network.

export type GitHubHttpRequest = {
  method: "GET";
  url: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type GitHubHttpResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
};

export type GitHubHttpTransport = {
  request(request: GitHubHttpRequest): Promise<GitHubHttpResponse>;
};

// --- Parser result shapes --------------------------------------------------

export type GitHubRepositoryRef = {
  owner: string;
  repository: string;
  /** Canonical "owner/repository". */
  slug: string;
};

export type GitHubRepositoryRefResult =
  | { ok: true; ref: GitHubRepositoryRef }
  | { ok: false; reason: string };

export type GitHubListQueryResult =
  | { ok: true; ref: GitHubRepositoryRef }
  | { ok: false; reason: string };

export type GitHubSearchQueryResult =
  | { ok: true; ref: GitHubRepositoryRef; terms: string }
  | { ok: false; reason: string };

export type GitHubFetchQueryResult =
  | { ok: true; ref: GitHubRepositoryRef; number: number }
  | { ok: false; reason: string };
