// Pure, deterministic GitHub response validation and normalization. No I/O, no
// clock, no environment. Raw API objects are never retained: every normalized
// item is built field by field from validated inputs. Bodies are raw Markdown,
// bounded to GITHUB_MAX_BODY_CHARS. Item URLs must be github.com URLs or are
// omitted. Node IDs, API URLs, clone URLs, and nested raw objects never leak.

import type { KernelWarning, NormalizedProviderItem } from "@oh-my-pm/contracts";
import {
  GITHUB_MAX_BODY_CHARS,
  GITHUB_MAX_COMBINED_COMMENT_CHARS,
  GITHUB_MAX_COMBINED_REVIEW_CHARS,
  GITHUB_MAX_COMBINED_REVIEW_COMMENT_CHARS,
  GITHUB_MAX_COMMENT_BODY_CHARS,
  GITHUB_MAX_COMMENTS,
  GITHUB_MAX_REVIEW_BODY_CHARS,
  GITHUB_MAX_REVIEW_COMMENT_BODY_CHARS,
  GITHUB_MAX_REVIEW_COMMENT_PATH_CHARS,
  GITHUB_MAX_REVIEW_COMMENTS,
  GITHUB_MAX_REVIEWS,
} from "./constants.js";

// --- Small validated readers (never trust arbitrary JSON) -----------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readInteger(value: unknown): number | undefined {
  const n = readNumber(value);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

// Strip control characters (except none are kept) from short display strings.
function sanitizeLine(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      result += " ";
    } else {
      result += char;
    }
  }
  return result.trim();
}

/** Bound a raw Markdown body; returns the bounded body and a truncation flag. */
function boundBody(value: string): { body: string; truncated: boolean } {
  if (value.length <= GITHUB_MAX_BODY_CHARS) {
    return { body: value, truncated: false };
  }
  return { body: value.slice(0, GITHUB_MAX_BODY_CHARS), truncated: true };
}

/** Only accept an https://github.com/... URL; otherwise omit. */
function validGitHubUrl(value: unknown): string | undefined {
  const str = readString(value);
  if (str === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(str);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    return undefined;
  }
  return url.toString();
}

/** Normalize labels from GitHub's string or {name} object form. */
function normalizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const entry of raw) {
    let name: string | undefined;
    if (typeof entry === "string") {
      name = entry;
    } else if (isRecord(entry)) {
      name = readString(entry["name"]);
    }
    if (name === undefined) continue;
    const trimmed = sanitizeLine(name);
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    labels.push(trimmed);
  }
  return labels;
}

/** Extract assignee logins (API order), first-occurrence deduplicated. */
function normalizeAssignees(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const logins: string[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const login = readString(entry["login"]);
    if (login === undefined) continue;
    const trimmed = sanitizeLine(login);
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    logins.push(trimmed);
  }
  return logins;
}

// --- Public normalization result types -------------------------------------

export type GitHubNormalizedResult = {
  item: NormalizedProviderItem;
  warnings: KernelWarning[];
};

// --- Repository -------------------------------------------------------------

/**
 * Normalize a validated repository response into a "record" item. Returns null
 * when a required identity field is missing (repository identity is required).
 */
export function normalizeRepository(slug: string, raw: unknown): GitHubNormalizedResult | null {
  if (!isRecord(raw)) return null;
  const fullName = readString(raw["full_name"]) ?? slug;
  const [ownerFromSlug, repoFromSlug] = slug.split("/");
  const owner = isRecord(raw["owner"]) ? readString(raw["owner"]["login"]) : undefined;

  const description = readString(raw["description"]);
  const isPrivate = readBoolean(raw["private"]) ?? false;
  const archived = readBoolean(raw["archived"]) ?? false;
  const disabled = readBoolean(raw["disabled"]) ?? false;
  const defaultBranch = readString(raw["default_branch"]);
  const openIssues = readInteger(raw["open_issues_count"]) ?? 0;
  const createdAt = readString(raw["created_at"]);
  const updatedAt = readString(raw["updated_at"]);
  const pushedAt = readString(raw["pushed_at"]);
  const url = validGitHubUrl(raw["html_url"]);

  const status = archived ? "archived" : disabled ? "disabled" : "active";
  const visibility = isPrivate ? "private" : "public";

  // Deterministic, concise Markdown-like body. Optional lines omitted.
  const bodyLines = [`Repository: ${slug}`];
  if (description !== undefined && sanitizeLine(description) !== "") {
    bodyLines.push(`Description: ${sanitizeLine(description)}`);
  }
  bodyLines.push(`Visibility: ${visibility}`);
  if (defaultBranch !== undefined) {
    bodyLines.push(`Default branch: ${sanitizeLine(defaultBranch)}`);
  }
  bodyLines.push(`Open issues and pull requests: ${openIssues}`);
  bodyLines.push(`Archived: ${archived ? "yes" : "no"}`);

  const tags = ["repository", visibility];
  if (archived) tags.push("archived");
  if (disabled) tags.push("disabled");

  const data: Record<string, unknown> = {
    repository: slug,
    kind: "repository",
    body: bodyLines.join("\n"),
    status,
    owner: owner ?? ownerFromSlug ?? "",
    tags,
    openIssuesCount: openIssues,
  };
  if (defaultBranch !== undefined) data["defaultBranch"] = sanitizeLine(defaultBranch);
  if (createdAt !== undefined) data["createdAt"] = createdAt;
  if (updatedAt !== undefined) data["updatedAt"] = updatedAt;
  if (pushedAt !== undefined) data["pushedAt"] = pushedAt;

  const item: NormalizedProviderItem = {
    id: `github:repository:${slug}`,
    type: "record",
    title: fullName === slug ? slug : `${ownerFromSlug}/${repoFromSlug}`,
    source: "github",
    data: data as NormalizedProviderItem["data"],
  };
  if (url !== undefined) item.url = url;

  return { item, warnings: [] };
}

// --- Issue / Pull request ---------------------------------------------------

type IssueCommon = {
  number: number;
  title: string;
  bodyRaw: string;
  truncated: boolean;
  htmlUrl: string | undefined;
  author: string | undefined;
  assignees: string[];
  labels: string[];
  milestone: string | undefined;
  due: string | undefined;
  createdAt: string | undefined;
  updatedAt: string | undefined;
  closedAt: string | undefined;
  comments: number;
  locked: boolean;
  isPullRequest: boolean;
  stateRaw: string | undefined;
  draft: boolean | undefined;
};

/** Validate the common issue/PR fields; null when identity is missing. */
function readIssueCommon(raw: unknown): IssueCommon | null {
  if (!isRecord(raw)) return null;
  const number = readInteger(raw["number"]);
  const title = readString(raw["title"]);
  if (number === undefined || title === undefined) {
    return null;
  }
  const bodyValue = readString(raw["body"]) ?? "";
  const { body, truncated } = boundBody(bodyValue);
  const author = isRecord(raw["user"]) ? readString(raw["user"]["login"]) : undefined;
  const milestone = isRecord(raw["milestone"])
    ? readString(raw["milestone"]["title"])
    : undefined;
  const due = isRecord(raw["milestone"]) ? readString(raw["milestone"]["due_on"]) : undefined;

  return {
    number,
    title: sanitizeLine(title),
    bodyRaw: body,
    truncated,
    htmlUrl: validGitHubUrl(raw["html_url"]),
    author: author === undefined ? undefined : sanitizeLine(author),
    assignees: normalizeAssignees(raw["assignees"]),
    labels: normalizeLabels(raw["labels"]),
    milestone: milestone === undefined ? undefined : sanitizeLine(milestone),
    due,
    createdAt: readString(raw["created_at"]),
    updatedAt: readString(raw["updated_at"]),
    closedAt: readString(raw["closed_at"]),
    comments: readInteger(raw["comments"]) ?? 0,
    locked: readBoolean(raw["locked"]) ?? false,
    isPullRequest: raw["pull_request"] !== undefined,
    stateRaw: readString(raw["state"]),
    draft: readBoolean(raw["draft"]),
  };
}

function truncationWarning(truncated: boolean): KernelWarning[] {
  return truncated
    ? [{ code: "github_body_truncated", message: "an item body was truncated" }]
    : [];
}

/** Normalize an issue (not a pull request). Null when identity is missing. */
export function normalizeIssue(slug: string, raw: unknown): GitHubNormalizedResult | null {
  const common = readIssueCommon(raw);
  if (common === null) return null;
  const status = common.stateRaw === "closed" ? "closed" : "open";
  const tags = ["issue", ...common.labels];
  const data: Record<string, unknown> = {
    repository: slug,
    number: common.number,
    kind: "issue",
    body: common.bodyRaw,
    status,
    owner: common.assignees[0] ?? "",
    assignees: common.assignees,
    tags,
    labels: common.labels,
    comments: common.comments,
    locked: common.locked,
  };
  if (common.author !== undefined) data["author"] = common.author;
  if (common.milestone !== undefined) data["milestone"] = common.milestone;
  if (common.due !== undefined) data["due"] = common.due;
  if (common.createdAt !== undefined) data["createdAt"] = common.createdAt;
  if (common.updatedAt !== undefined) data["updatedAt"] = common.updatedAt;
  if (common.closedAt !== undefined) data["closedAt"] = common.closedAt;

  const item: NormalizedProviderItem = {
    id: `github:issue:${slug}#${common.number}`,
    type: "issue",
    title: `#${common.number} ${common.title}`,
    source: "github",
    data: data as NormalizedProviderItem["data"],
  };
  if (common.htmlUrl !== undefined) item.url = common.htmlUrl;
  return { item, warnings: truncationWarning(common.truncated) };
}

export type PullRequestDetail = {
  merged: boolean;
  mergedAt: string | undefined;
  draft: boolean;
  baseRef: string | undefined;
  headRef: string | undefined;
  requestedReviewers: string[];
  additions: number | undefined;
  deletions: number | undefined;
  changedFiles: number | undefined;
};

/** Extract the additional validated pull-request detail fields. */
export function readPullRequestDetail(raw: unknown): PullRequestDetail {
  if (!isRecord(raw)) {
    return {
      merged: false,
      mergedAt: undefined,
      draft: false,
      baseRef: undefined,
      headRef: undefined,
      requestedReviewers: [],
      additions: undefined,
      deletions: undefined,
      changedFiles: undefined,
    };
  }
  const base = isRecord(raw["base"]) ? readString(raw["base"]["ref"]) : undefined;
  const head = isRecord(raw["head"]) ? readString(raw["head"]["ref"]) : undefined;
  const reviewers = Array.isArray(raw["requested_reviewers"])
    ? normalizeAssignees(raw["requested_reviewers"])
    : [];
  return {
    merged: readBoolean(raw["merged"]) ?? false,
    mergedAt: readString(raw["merged_at"]),
    draft: readBoolean(raw["draft"]) ?? false,
    baseRef: base === undefined ? undefined : sanitizeLine(base),
    headRef: head === undefined ? undefined : sanitizeLine(head),
    requestedReviewers: reviewers,
    additions: readInteger(raw["additions"]),
    deletions: readInteger(raw["deletions"]),
    changedFiles: readInteger(raw["changed_files"]),
  };
}

/**
 * Normalize a pull request. `issueRaw` is the issues-endpoint object; the
 * optional `detail` merges enriched fields from the pulls endpoint.
 */
export function normalizePullRequest(
  slug: string,
  issueRaw: unknown,
  detail?: PullRequestDetail,
): GitHubNormalizedResult | null {
  const common = readIssueCommon(issueRaw);
  if (common === null) return null;

  const draft = detail?.draft ?? common.draft ?? false;
  const merged = detail?.merged ?? false;
  let status: "draft" | "open" | "merged" | "closed";
  if (merged) {
    status = "merged";
  } else if (common.stateRaw === "closed") {
    status = "closed";
  } else if (draft) {
    status = "draft";
  } else {
    status = "open";
  }

  const tags = ["pull-request", ...common.labels];
  if (draft) tags.push("draft");
  if (merged) tags.push("merged");

  const data: Record<string, unknown> = {
    repository: slug,
    number: common.number,
    kind: "pullRequest",
    body: common.bodyRaw,
    status,
    owner: common.assignees[0] ?? "",
    assignees: common.assignees,
    tags,
    labels: common.labels,
    comments: common.comments,
    locked: common.locked,
  };
  if (common.author !== undefined) data["author"] = common.author;
  if (common.milestone !== undefined) data["milestone"] = common.milestone;
  if (common.due !== undefined) data["due"] = common.due;
  if (common.createdAt !== undefined) data["createdAt"] = common.createdAt;
  if (common.updatedAt !== undefined) data["updatedAt"] = common.updatedAt;
  if (common.closedAt !== undefined) data["closedAt"] = common.closedAt;
  if (detail !== undefined) {
    if (detail.mergedAt !== undefined) data["mergedAt"] = detail.mergedAt;
    if (detail.baseRef !== undefined) data["baseBranch"] = detail.baseRef;
    if (detail.headRef !== undefined) data["headBranch"] = detail.headRef;
    if (detail.requestedReviewers.length > 0) {
      data["requestedReviewers"] = detail.requestedReviewers;
    }
    if (detail.additions !== undefined) data["additions"] = detail.additions;
    if (detail.deletions !== undefined) data["deletions"] = detail.deletions;
    if (detail.changedFiles !== undefined) data["changedFiles"] = detail.changedFiles;
  }

  const item: NormalizedProviderItem = {
    id: `github:pull-request:${slug}#${common.number}`,
    type: "pullRequest",
    title: `#${common.number} ${common.title}`,
    source: "github",
    data: data as NormalizedProviderItem["data"],
  };
  if (common.htmlUrl !== undefined) item.url = common.htmlUrl;
  return { item, warnings: truncationWarning(common.truncated) };
}

/**
 * Normalize a single issues-endpoint element, dispatching to the pull-request
 * normalizer when the element carries a `pull_request` field.
 */
export function normalizeIssueOrPullRequest(
  slug: string,
  raw: unknown,
): GitHubNormalizedResult | null {
  if (isRecord(raw) && raw["pull_request"] !== undefined) {
    return normalizePullRequest(slug, raw);
  }
  return normalizeIssue(slug, raw);
}

// --- Item conversation comments ---------------------------------------------

export type GitHubCommentParent = {
  slug: string;
  number: number;
  parentType: "issue" | "pullRequest";
  parentStatus: string;
};

/** Bound a comment body to the per-comment ceiling; report truncation. */
function boundCommentBody(value: string): { body: string; truncated: boolean } {
  if (value.length <= GITHUB_MAX_COMMENT_BODY_CHARS) {
    return { body: value, truncated: false };
  }
  return { body: value.slice(0, GITHUB_MAX_COMMENT_BODY_CHARS), truncated: true };
}

/**
 * Normalize the ordinary issue/PR conversation comments for one parent item
 * into `note` items, in API order, preserving the earliest comments first.
 * Applies the comment-count, per-comment-body, and combined-body ceilings, and
 * drops records missing an integer id. Raw API objects are never retained.
 * Returns the notes plus stable warnings for any truncation or invalid record.
 */
export function normalizeIssueComments(
  parent: GitHubCommentParent,
  raw: unknown,
): { items: NormalizedProviderItem[]; warnings: KernelWarning[] } {
  const items: NormalizedProviderItem[] = [];
  const warnings: KernelWarning[] = [];
  if (!Array.isArray(raw)) {
    return { items, warnings };
  }

  let invalidSeen = false;
  let perCommentTruncated = false;
  let combinedTruncated = false;
  let countDropped = false;
  let combined = 0;

  for (const entry of raw) {
    if (items.length >= GITHUB_MAX_COMMENTS) {
      // More comments than the ceiling: preserve the earliest, drop the rest.
      if (Array.isArray(raw) && raw.length > GITHUB_MAX_COMMENTS) countDropped = true;
      break;
    }
    if (!isRecord(entry)) {
      invalidSeen = true;
      continue;
    }
    const commentId = readInteger(entry["id"]);
    if (commentId === undefined) {
      invalidSeen = true;
      continue;
    }
    const authorRaw = isRecord(entry["user"]) ? readString(entry["user"]["login"]) : undefined;
    const author = authorRaw === undefined ? "" : sanitizeLine(authorRaw);
    const associationRaw = readString(entry["author_association"]);
    const association = associationRaw === undefined ? undefined : sanitizeLine(associationRaw);
    const url = validGitHubUrl(entry["html_url"]);
    const createdAt = readString(entry["created_at"]);
    const updatedAt = readString(entry["updated_at"]);

    let { body, truncated } = boundCommentBody(readString(entry["body"]) ?? "");
    if (truncated) perCommentTruncated = true;
    // Enforce the combined-body ceiling, preserving earlier comments in full.
    if (combined + body.length > GITHUB_MAX_COMBINED_COMMENT_CHARS) {
      const remaining = Math.max(0, GITHUB_MAX_COMBINED_COMMENT_CHARS - combined);
      body = body.slice(0, remaining);
      combinedTruncated = true;
    }
    combined += body.length;

    const data: Record<string, unknown> = {
      kind: "issueComment",
      repository: parent.slug,
      parentNumber: parent.number,
      parentType: parent.parentType,
      parentStatus: parent.parentStatus,
      author,
      body,
    };
    if (association !== undefined) data["authorAssociation"] = association;
    if (createdAt !== undefined) data["createdAt"] = createdAt;
    if (updatedAt !== undefined) data["updatedAt"] = updatedAt;

    const item: NormalizedProviderItem = {
      id: `github:${parent.slug}:item:${parent.number}:comment:${commentId}`,
      type: "note",
      title: `Comment by @${author}`,
      source: "github",
      data: data as NormalizedProviderItem["data"],
    };
    if (url !== undefined) item.url = url;
    items.push(item);
  }

  if (invalidSeen) {
    warnings.push({
      code: "github_comment_invalid",
      message: "a comment record was invalid and was skipped",
    });
  }
  if (perCommentTruncated) {
    warnings.push({ code: "github_comment_body_truncated", message: "a comment body was truncated" });
  }
  if (combinedTruncated) {
    warnings.push({
      code: "github_comments_combined_truncated",
      message: "combined comment bodies were truncated",
    });
  }
  if (countDropped) {
    warnings.push({
      code: "github_comments_count_truncated",
      message: "some comments were dropped beyond the comment limit",
    });
  }
  return { items, warnings };
}

// --- Pull-request review submissions ----------------------------------------

/** Canonical, sanitized review state; raw GitHub state strings never leak. */
export type GitHubReviewState =
  | "approved"
  | "changesRequested"
  | "commented"
  | "dismissed"
  | "pending"
  | "unknown";

export type GitHubReviewParent = {
  slug: string;
  number: number;
  parentStatus: string;
};

/** Map a raw GitHub review state to the canonical enum. */
function mapReviewState(raw: string | undefined): { state: GitHubReviewState; unknown: boolean } {
  switch (raw) {
    case "APPROVED":
      return { state: "approved", unknown: false };
    case "CHANGES_REQUESTED":
      return { state: "changesRequested", unknown: false };
    case "COMMENTED":
      return { state: "commented", unknown: false };
    case "DISMISSED":
      return { state: "dismissed", unknown: false };
    case "PENDING":
      return { state: "pending", unknown: false };
    default:
      return { state: "unknown", unknown: true };
  }
}

/** Human-readable display state for a review title. */
function reviewDisplayState(state: GitHubReviewState): string {
  switch (state) {
    case "approved":
      return "approved";
    case "changesRequested":
      return "changes requested";
    case "commented":
      return "commented";
    case "dismissed":
      return "dismissed";
    case "pending":
      return "pending";
    default:
      return "unknown";
  }
}

/** Bound a review body to the per-review ceiling; report truncation. */
function boundReviewBody(value: string): { body: string; truncated: boolean } {
  if (value.length <= GITHUB_MAX_REVIEW_BODY_CHARS) {
    return { body: value, truncated: false };
  }
  return { body: value.slice(0, GITHUB_MAX_REVIEW_BODY_CHARS), truncated: true };
}

/**
 * Normalize a pull request's review submissions into `note` items, in API order,
 * preserving the earliest reviews first. Applies the review-count, per-review-
 * body, and combined-body ceilings, and drops records missing a positive-safe-
 * integer id. Raw API objects, node IDs, commit IDs, nested users, links, and raw
 * state strings are never retained. Returns the notes plus stable warnings.
 */
export function normalizePullRequestReviews(
  parent: GitHubReviewParent,
  raw: unknown,
): { items: NormalizedProviderItem[]; warnings: KernelWarning[] } {
  const items: NormalizedProviderItem[] = [];
  const warnings: KernelWarning[] = [];
  if (!Array.isArray(raw)) {
    return { items, warnings };
  }

  let invalidSeen = false;
  let stateUnknownSeen = false;
  let perReviewTruncated = false;
  let combinedTruncated = false;
  let countDropped = false;
  let combined = 0;

  for (const entry of raw) {
    if (items.length >= GITHUB_MAX_REVIEWS) {
      if (raw.length > GITHUB_MAX_REVIEWS) countDropped = true;
      break;
    }
    if (!isRecord(entry)) {
      invalidSeen = true;
      continue;
    }
    const reviewId = readInteger(entry["id"]);
    if (reviewId === undefined || !Number.isSafeInteger(reviewId) || reviewId <= 0) {
      invalidSeen = true;
      continue;
    }
    const authorRaw = isRecord(entry["user"]) ? readString(entry["user"]["login"]) : undefined;
    const author =
      authorRaw === undefined || sanitizeLine(authorRaw) === "" ? "unknown" : sanitizeLine(authorRaw);
    const associationRaw = readString(entry["author_association"]);
    const association = associationRaw === undefined ? undefined : sanitizeLine(associationRaw);
    const url = validGitHubUrl(entry["html_url"]);
    const submittedAt = readString(entry["submitted_at"]);
    const { state, unknown } = mapReviewState(readString(entry["state"]));
    if (unknown) stateUnknownSeen = true;

    let { body, truncated } = boundReviewBody(readString(entry["body"]) ?? "");
    if (truncated) perReviewTruncated = true;
    if (combined + body.length > GITHUB_MAX_COMBINED_REVIEW_CHARS) {
      const remaining = Math.max(0, GITHUB_MAX_COMBINED_REVIEW_CHARS - combined);
      body = body.slice(0, remaining);
      combinedTruncated = true;
    }
    combined += body.length;

    const data: Record<string, unknown> = {
      kind: "pullRequestReview",
      repository: parent.slug,
      parentNumber: parent.number,
      parentType: "pullRequest",
      parentStatus: parent.parentStatus,
      author,
      reviewState: state,
      body,
    };
    if (association !== undefined) data["authorAssociation"] = association;
    if (submittedAt !== undefined) data["submittedAt"] = submittedAt;

    const item: NormalizedProviderItem = {
      id: `github:${parent.slug}:pull-request:${parent.number}:review:${reviewId}`,
      type: "note",
      title: `Review by @${author}: ${reviewDisplayState(state)}`,
      source: "github",
      data: data as NormalizedProviderItem["data"],
    };
    if (url !== undefined) item.url = url;
    items.push(item);
  }

  if (invalidSeen) {
    warnings.push({ code: "github_review_invalid", message: "a review record was invalid and was skipped" });
  }
  if (stateUnknownSeen) {
    warnings.push({ code: "github_review_state_unknown", message: "a review had an unrecognized state" });
  }
  if (perReviewTruncated) {
    warnings.push({ code: "github_review_body_truncated", message: "a review body was truncated" });
  }
  if (combinedTruncated) {
    warnings.push({
      code: "github_reviews_combined_truncated",
      message: "combined review bodies were truncated",
    });
  }
  if (countDropped) {
    warnings.push({
      code: "github_reviews_count_truncated",
      message: "some reviews were dropped beyond the review limit",
    });
  }
  return { items, warnings };
}

// --- Inline pull-request review comments ------------------------------------

/** Bound a review-comment body to its per-comment ceiling; report truncation. */
function boundReviewCommentBody(value: string): { body: string; truncated: boolean } {
  if (value.length <= GITHUB_MAX_REVIEW_COMMENT_BODY_CHARS) {
    return { body: value, truncated: false };
  }
  return { body: value.slice(0, GITHUB_MAX_REVIEW_COMMENT_BODY_CHARS), truncated: true };
}

/**
 * Sanitize a display file path: strip control characters, trim whitespace, and
 * cap at 512 characters. This is display provenance only; it is never resolved
 * against the local filesystem or read. Returns the bounded path and truncation.
 */
function boundFilePath(value: string): { path: string; truncated: boolean } {
  const sanitized = sanitizeLine(value);
  if (sanitized.length <= GITHUB_MAX_REVIEW_COMMENT_PATH_CHARS) {
    return { path: sanitized, truncated: false };
  }
  return { path: sanitized.slice(0, GITHUB_MAX_REVIEW_COMMENT_PATH_CHARS), truncated: true };
}

/** Read a positive-safe-integer line field, or undefined when invalid. */
function readPositiveLine(value: unknown): number | undefined {
  const n = readInteger(value);
  if (n === undefined || !Number.isSafeInteger(n) || n <= 0) return undefined;
  return n;
}

/** Normalize a LEFT/RIGHT side to lowercase, omitting anything else. */
function readSide(value: unknown): "left" | "right" | undefined {
  const raw = readString(value);
  if (raw === "LEFT") return "left";
  if (raw === "RIGHT") return "right";
  return undefined;
}

/**
 * Normalize a pull request's inline review comments into `note` items, in API
 * order, preserving the earliest comments first. Applies the count, per-comment-
 * body, combined-body, and file-path ceilings, and drops records missing a
 * positive-safe-integer id. diff_hunk, commit IDs, positions, node IDs, links,
 * nested users, and reactions are never retained. Returns notes plus warnings.
 */
export function normalizePullRequestReviewComments(
  parent: GitHubReviewParent,
  raw: unknown,
): { items: NormalizedProviderItem[]; warnings: KernelWarning[] } {
  const items: NormalizedProviderItem[] = [];
  const warnings: KernelWarning[] = [];
  if (!Array.isArray(raw)) {
    return { items, warnings };
  }

  let invalidSeen = false;
  let perCommentTruncated = false;
  let combinedTruncated = false;
  let countDropped = false;
  let pathTruncated = false;
  let combined = 0;

  for (const entry of raw) {
    if (items.length >= GITHUB_MAX_REVIEW_COMMENTS) {
      if (raw.length > GITHUB_MAX_REVIEW_COMMENTS) countDropped = true;
      break;
    }
    if (!isRecord(entry)) {
      invalidSeen = true;
      continue;
    }
    const commentId = readInteger(entry["id"]);
    if (commentId === undefined || !Number.isSafeInteger(commentId) || commentId <= 0) {
      invalidSeen = true;
      continue;
    }
    const authorRaw = isRecord(entry["user"]) ? readString(entry["user"]["login"]) : undefined;
    const author =
      authorRaw === undefined || sanitizeLine(authorRaw) === "" ? "unknown" : sanitizeLine(authorRaw);
    const associationRaw = readString(entry["author_association"]);
    const association = associationRaw === undefined ? undefined : sanitizeLine(associationRaw);
    const url = validGitHubUrl(entry["html_url"]);
    const createdAt = readString(entry["created_at"]);
    const updatedAt = readString(entry["updated_at"]);

    const pathRaw = readString(entry["path"]);
    let filePath: string | undefined;
    if (pathRaw !== undefined) {
      const bounded = boundFilePath(pathRaw);
      if (bounded.truncated) pathTruncated = true;
      filePath = bounded.path === "" ? undefined : bounded.path;
    }

    const line = readPositiveLine(entry["line"]);
    const startLine = readPositiveLine(entry["start_line"]);
    const side = readSide(entry["side"]);
    const startSide = readSide(entry["start_side"]);

    let { body, truncated } = boundReviewCommentBody(readString(entry["body"]) ?? "");
    if (truncated) perCommentTruncated = true;
    if (combined + body.length > GITHUB_MAX_COMBINED_REVIEW_COMMENT_CHARS) {
      const remaining = Math.max(0, GITHUB_MAX_COMBINED_REVIEW_COMMENT_CHARS - combined);
      body = body.slice(0, remaining);
      combinedTruncated = true;
    }
    combined += body.length;

    const data: Record<string, unknown> = {
      kind: "pullRequestReviewComment",
      repository: parent.slug,
      parentNumber: parent.number,
      parentType: "pullRequest",
      parentStatus: parent.parentStatus,
      author,
      body,
    };
    if (association !== undefined) data["authorAssociation"] = association;
    if (filePath !== undefined) data["filePath"] = filePath;
    if (line !== undefined) data["line"] = line;
    if (startLine !== undefined) data["startLine"] = startLine;
    if (side !== undefined) data["side"] = side;
    if (startSide !== undefined) data["startSide"] = startSide;
    if (createdAt !== undefined) data["createdAt"] = createdAt;
    if (updatedAt !== undefined) data["updatedAt"] = updatedAt;

    const titlePath = filePath ?? "unknown";
    const item: NormalizedProviderItem = {
      id: `github:${parent.slug}:pull-request:${parent.number}:review-comment:${commentId}`,
      type: "note",
      title: `Review comment by @${author} on ${titlePath}`,
      source: "github",
      data: data as NormalizedProviderItem["data"],
    };
    if (url !== undefined) item.url = url;
    items.push(item);
  }

  if (invalidSeen) {
    warnings.push({
      code: "github_review_comment_invalid",
      message: "a review comment record was invalid and was skipped",
    });
  }
  if (perCommentTruncated) {
    warnings.push({
      code: "github_review_comment_body_truncated",
      message: "a review comment body was truncated",
    });
  }
  if (combinedTruncated) {
    warnings.push({
      code: "github_review_comments_combined_truncated",
      message: "combined review comment bodies were truncated",
    });
  }
  if (countDropped) {
    warnings.push({
      code: "github_review_comments_count_truncated",
      message: "some review comments were dropped beyond the review comment limit",
    });
  }
  if (pathTruncated) {
    warnings.push({
      code: "github_review_comment_path_truncated",
      message: "a review comment file path was truncated",
    });
  }
  return { items, warnings };
}
