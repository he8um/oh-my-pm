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

// Canonical source/state/kind values carried by parsed queries. These mirror
// the public selection enums but are duplicated here to keep the query module
// free of a dependency on the selection module (selection depends on query).
export type GitHubListSource = "overview" | "repository" | "issues" | "pull-requests";
export type GitHubQueryState = "open" | "closed" | "all";
export type GitHubQueryKind = "all" | "issues" | "pull-requests";

export type GitHubListQueryResult =
  | { ok: true; ref: GitHubRepositoryRef; source: GitHubListSource; state: GitHubQueryState }
  | { ok: false; reason: string };

export type GitHubSearchQueryResult =
  | {
      ok: true;
      ref: GitHubRepositoryRef;
      terms: string;
      state: GitHubQueryState;
      kind: GitHubQueryKind;
    }
  | { ok: false; reason: string };

export type GitHubFetchQueryResult =
  | {
      ok: true;
      ref: GitHubRepositoryRef;
      number: number;
      includeComments: boolean;
      commentLimit: number;
      includeReviews: boolean;
      reviewLimit: number;
      includeReviewComments: boolean;
      reviewCommentLimit: number;
    }
  | { ok: false; reason: string };
