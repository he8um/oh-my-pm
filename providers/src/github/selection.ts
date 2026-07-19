// Pure, strict GitHub source-selection model. No filesystem, environment,
// network, or clock access, and no mutation. It maps user/tool overrides plus
// resolved configuration defaults onto a canonical, validated selection, and
// builds the internal provider request from that selection. Invalid explicit
// input fails closed with a stable code/message and never falls back to a
// default. Inherited configuration defaults must never make repository or item
// selections invalid, so explicitness is tracked by option presence, not by a
// value happening to match a default.

import type { ProviderRequest } from "@oh-my-pm/contracts";
import {
  DEFAULT_GITHUB_COMMENT_LIMIT,
  MAX_GITHUB_COMMENT_LIMIT,
  MIN_GITHUB_COMMENT_LIMIT,
  buildGitHubFetchQuery,
  buildGitHubListQuery,
  buildGitHubSearchQuery,
} from "./query.js";

export {
  DEFAULT_GITHUB_COMMENT_LIMIT,
  MAX_GITHUB_COMMENT_LIMIT,
  MIN_GITHUB_COMMENT_LIMIT,
} from "./query.js";

export const GITHUB_SOURCE_MODES = [
  "overview",
  "repository",
  "issues",
  "pull-requests",
  "item",
  "search",
] as const;

export type GitHubSourceMode = (typeof GITHUB_SOURCE_MODES)[number];

export const GITHUB_SOURCE_STATES = ["open", "closed", "all"] as const;

export type GitHubSourceState = (typeof GITHUB_SOURCE_STATES)[number];

export const GITHUB_SEARCH_KINDS = ["all", "issues", "pull-requests"] as const;

export type GitHubSearchKind = (typeof GITHUB_SEARCH_KINDS)[number];

// Only these sources may be configuration defaults; item and search require
// per-invocation data (a number or a query) and can never be a stored default.
export const GITHUB_CONFIGURABLE_SOURCES = [
  "overview",
  "repository",
  "issues",
  "pull-requests",
] as const;

export type GitHubConfigurableSource = (typeof GITHUB_CONFIGURABLE_SOURCES)[number];

export const GITHUB_SOURCE_QUERY_MAX = 256;

export type GitHubSourceSelection =
  | { mode: "overview"; state: GitHubSourceState; limit: number }
  | { mode: "repository" }
  | { mode: "issues"; state: GitHubSourceState; limit: number }
  | { mode: "pull-requests"; state: GitHubSourceState; limit: number }
  | { mode: "item"; number: number; includeComments: boolean; commentLimit: number }
  | {
      mode: "search";
      query: string;
      state: GitHubSourceState;
      kind: GitHubSearchKind;
      limit: number;
    };

export type GitHubSourceSelectionOverrides = {
  source?: GitHubSourceMode;
  state?: GitHubSourceState;
  number?: number;
  query?: string;
  kind?: GitHubSearchKind;
  limit?: number;
  includeComments?: boolean;
  commentLimit?: number;
};

export type GitHubSourceSelectionErrorCode =
  | "github_source_invalid"
  | "github_state_invalid"
  | "github_number_required"
  | "github_number_invalid"
  | "github_query_required"
  | "github_query_invalid"
  | "github_kind_invalid"
  | "github_option_not_applicable"
  | "github_comments_not_applicable"
  | "github_comment_limit_not_applicable"
  | "github_comment_limit_invalid";

export type GitHubSourceSelectionResult =
  | { ok: true; selection: GitHubSourceSelection }
  | { ok: false; code: GitHubSourceSelectionErrorCode; message: string };

export type GitHubSourceSelectionDefaults = {
  source: GitHubConfigurableSource;
  state: GitHubSourceState;
  limit: number;
};

function fail(
  code: GitHubSourceSelectionErrorCode,
  message: string,
): { ok: false; code: GitHubSourceSelectionErrorCode; message: string } {
  return { ok: false, code, message };
}

function isSourceMode(value: string): value is GitHubSourceMode {
  return (GITHUB_SOURCE_MODES as readonly string[]).includes(value);
}

function isSourceState(value: string): value is GitHubSourceState {
  return (GITHUB_SOURCE_STATES as readonly string[]).includes(value);
}

function isSearchKind(value: string): value is GitHubSearchKind {
  return (GITHUB_SEARCH_KINDS as readonly string[]).includes(value);
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function validNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validLimit(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

/**
 * Resolve a canonical GitHub source selection from configuration defaults plus
 * explicit overrides. The `overrides` object carries only explicitly supplied
 * values; an absent key inherits the corresponding default and is never treated
 * as user intent. Invalid explicit values fail closed.
 */
export function resolveGitHubSourceSelection(input: {
  defaults: GitHubSourceSelectionDefaults;
  overrides: GitHubSourceSelectionOverrides;
}): GitHubSourceSelectionResult {
  const { defaults, overrides } = input;

  // Validate any explicitly supplied enum/primitive before applicability rules,
  // so a bad value reports its specific error regardless of source.
  if (overrides.source !== undefined && !isSourceMode(overrides.source)) {
    return fail("github_source_invalid", "source must be one of the supported source modes");
  }
  if (overrides.state !== undefined && !isSourceState(overrides.state)) {
    return fail("github_state_invalid", "state must be open, closed, or all");
  }
  if (overrides.kind !== undefined && !isSearchKind(overrides.kind)) {
    return fail("github_kind_invalid", "kind must be all, issues, or pull-requests");
  }
  if (overrides.number !== undefined && !validNumber(overrides.number)) {
    return fail("github_number_invalid", "number must be a positive integer");
  }
  if (overrides.limit !== undefined && !validLimit(overrides.limit)) {
    // A malformed explicit limit is reported as not-applicable-style invalid
    // input; the parser already bounds --limit, this is a defensive guard.
    return fail("github_option_not_applicable", "limit must be an integer in 1..100");
  }
  if (overrides.query !== undefined) {
    const trimmed = overrides.query;
    if (trimmed.trim() === "") {
      return fail("github_query_required", "search query must not be empty");
    }
    if (trimmed.length > GITHUB_SOURCE_QUERY_MAX) {
      return fail("github_query_invalid", "search query is too long");
    }
    if (hasControlCharacters(trimmed)) {
      return fail("github_query_invalid", "search query contains control characters");
    }
  }

  // Validate an explicit comment limit's shape before applicability rules so a
  // malformed value reports its specific error regardless of source. Presence,
  // not value, marks explicitness: an inherited default never reaches here.
  if (
    overrides.commentLimit !== undefined &&
    (!Number.isInteger(overrides.commentLimit) ||
      overrides.commentLimit < MIN_GITHUB_COMMENT_LIMIT ||
      overrides.commentLimit > MAX_GITHUB_COMMENT_LIMIT)
  ) {
    return fail(
      "github_comment_limit_invalid",
      `--comment-limit must be an integer in ${MIN_GITHUB_COMMENT_LIMIT}..${MAX_GITHUB_COMMENT_LIMIT}`,
    );
  }

  const mode: GitHubSourceMode = overrides.source ?? defaults.source;
  const state: GitHubSourceState = overrides.state ?? defaults.state;
  const limit: number = overrides.limit ?? defaults.limit;

  // Comment options apply only to the item source. Reject them everywhere else
  // with a stable, path/token-free code; the item branch handles the valid case.
  if (mode !== "item") {
    if (overrides.includeComments !== undefined) {
      return fail(
        "github_comments_not_applicable",
        `--include-comments is not valid with --source ${mode}`,
      );
    }
    if (overrides.commentLimit !== undefined) {
      return fail(
        "github_comment_limit_not_applicable",
        `--comment-limit is not valid with --source ${mode}`,
      );
    }
  }

  switch (mode) {
    case "overview":
    case "issues":
    case "pull-requests": {
      if (overrides.number !== undefined) {
        return fail("github_option_not_applicable", `--number is not valid with --source ${mode}`);
      }
      if (overrides.query !== undefined) {
        return fail("github_option_not_applicable", `--query is not valid with --source ${mode}`);
      }
      if (overrides.kind !== undefined) {
        return fail("github_option_not_applicable", `--kind is not valid with --source ${mode}`);
      }
      return { ok: true, selection: { mode, state, limit } };
    }
    case "repository": {
      if (overrides.state !== undefined) {
        return fail("github_option_not_applicable", "--state is not valid with --source repository");
      }
      if (overrides.limit !== undefined) {
        return fail("github_option_not_applicable", "--limit is not valid with --source repository");
      }
      if (overrides.number !== undefined) {
        return fail("github_option_not_applicable", "--number is not valid with --source repository");
      }
      if (overrides.query !== undefined) {
        return fail("github_option_not_applicable", "--query is not valid with --source repository");
      }
      if (overrides.kind !== undefined) {
        return fail("github_option_not_applicable", "--kind is not valid with --source repository");
      }
      return { ok: true, selection: { mode: "repository" } };
    }
    case "item": {
      if (overrides.state !== undefined) {
        return fail("github_option_not_applicable", "--state is not valid with --source item");
      }
      if (overrides.limit !== undefined) {
        return fail("github_option_not_applicable", "--limit is not valid with --source item");
      }
      if (overrides.query !== undefined) {
        return fail("github_option_not_applicable", "--query is not valid with --source item");
      }
      if (overrides.kind !== undefined) {
        return fail("github_option_not_applicable", "--kind is not valid with --source item");
      }
      if (overrides.number === undefined) {
        return fail("github_number_required", "github item source requires --number");
      }
      // Comments are disabled by default. --comment-limit is only meaningful
      // alongside --include-comments; supplying it alone is invalid. When
      // comments are enabled the limit defaults to 20.
      const includeComments = overrides.includeComments === true;
      if (!includeComments && overrides.commentLimit !== undefined) {
        return fail(
          "github_comment_limit_invalid",
          "--comment-limit requires --include-comments",
        );
      }
      const commentLimit = includeComments
        ? (overrides.commentLimit ?? DEFAULT_GITHUB_COMMENT_LIMIT)
        : DEFAULT_GITHUB_COMMENT_LIMIT;
      return {
        ok: true,
        selection: { mode: "item", number: overrides.number, includeComments, commentLimit },
      };
    }
    case "search": {
      if (overrides.number !== undefined) {
        return fail("github_option_not_applicable", "--number is not valid with --source search");
      }
      if (overrides.query === undefined) {
        return fail("github_query_required", "github search source requires --query");
      }
      const kind: GitHubSearchKind = overrides.kind ?? "all";
      return {
        ok: true,
        selection: { mode: "search", query: overrides.query, state, kind, limit },
      };
    }
    default: {
      return fail("github_source_invalid", "source must be one of the supported source modes");
    }
  }
}

/**
 * Build the internal, read-only provider request for a resolved selection. The
 * request carries only a canonical query string and a bounded limit — never a
 * token, header, origin, config, environment value, clock, or arbitrary URL.
 */
export function createGitHubProviderRequest(input: {
  repository: string;
  selection: GitHubSourceSelection;
}): ProviderRequest {
  const { repository, selection } = input;
  switch (selection.mode) {
    case "overview":
      return {
        providerId: "github",
        action: "list",
        query: buildGitHubListQuery({ repository, source: "overview", state: selection.state }),
        limit: selection.limit,
      };
    case "repository":
      return {
        providerId: "github",
        action: "list",
        query: buildGitHubListQuery({ repository, source: "repository", state: "open" }),
        limit: 1,
      };
    case "issues":
      return {
        providerId: "github",
        action: "list",
        query: buildGitHubListQuery({ repository, source: "issues", state: selection.state }),
        limit: selection.limit,
      };
    case "pull-requests":
      return {
        providerId: "github",
        action: "list",
        query: buildGitHubListQuery({ repository, source: "pull-requests", state: selection.state }),
        limit: selection.limit,
      };
    case "item":
      return {
        providerId: "github",
        action: "fetch",
        query: buildGitHubFetchQuery({
          repository,
          number: selection.number,
          includeComments: selection.includeComments,
          commentLimit: selection.commentLimit,
        }),
        // The primary item plus, when comments are enabled, up to commentLimit
        // comment notes. A single comments page is ever requested.
        limit: selection.includeComments ? 1 + selection.commentLimit : 1,
      };
    case "search":
      return {
        providerId: "github",
        action: "search",
        query: buildGitHubSearchQuery({
          repository,
          terms: selection.query,
          state: selection.state,
          kind: selection.kind,
        }),
        limit: selection.limit,
      };
  }
}
