import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
  normalizeIssue,
  normalizeIssueComments,
  normalizeIssueOrPullRequest,
  normalizePullRequest,
  normalizePullRequestReviewComments,
  normalizePullRequestReviews,
  normalizeRepository,
  readPullRequestDetail,
} from "../src/index.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "github");
const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));

const SLUG = "riverline/field-guide";

function dataOf(result: { item: { data: unknown } } | null): Record<string, unknown> {
  if (result === null) throw new Error("expected a normalized result");
  return result.item.data as Record<string, unknown>;
}

describe("normalizeRepository", () => {
  it("produces a record item with a deterministic body and tags", () => {
    const result = normalizeRepository(SLUG, load("repository.json"));
    expect(result).not.toBeNull();
    const item = result!.item;
    expect(item.id).toBe(`github:repository:${SLUG}`);
    expect(item.type).toBe("record");
    expect(item.title).toBe(SLUG);
    expect(item.url).toBe("https://github.com/riverline/field-guide");
    const data = dataOf(result);
    expect(data.kind).toBe("repository");
    expect(data.status).toBe("active");
    expect(data.tags).toEqual(["repository", "public"]);
    expect(data.openIssuesCount).toBe(5);
    expect(String(data.body)).toContain("Repository: riverline/field-guide");
    expect(String(data.body)).toContain("Visibility: public");
    expect(String(data.body)).toContain("Default branch: main");
  });

  it("omits an invalid html url and returns null on missing object", () => {
    const raw = load("repository.json") as Record<string, unknown>;
    raw.html_url = "ftp://example.com/x";
    const result = normalizeRepository(SLUG, raw);
    expect(result!.item.url).toBeUndefined();
    expect(normalizeRepository(SLUG, "not-an-object")).toBeNull();
  });

  it("marks archived repositories", () => {
    const raw = load("repository.json") as Record<string, unknown>;
    raw.archived = true;
    const data = dataOf(normalizeRepository(SLUG, raw));
    expect(data.status).toBe("archived");
    expect(data.tags).toContain("archived");
  });
});

describe("normalizeIssue", () => {
  it("normalizes an issue with assignees, labels, milestone, and due", () => {
    const result = normalizeIssue(SLUG, load("issue.json"));
    const item = result!.item;
    expect(item.id).toBe(`github:issue:${SLUG}#42`);
    expect(item.type).toBe("issue");
    expect(item.title).toBe("#42 Trail markers missing near the north fork");
    const data = dataOf(result);
    expect(data.status).toBe("open");
    expect(data.owner).toBe("ranger-mika");
    expect(data.assignees).toEqual(["ranger-mika", "trail-ops"]);
    expect(data.labels).toEqual(["safety", "field-work"]);
    expect(data.tags).toEqual(["issue", "safety", "field-work"]);
    expect(data.milestone).toBe("Season Opening");
    expect(data.due).toBe("2026-04-01T00:00:00Z");
    expect(data.author).toBe("ranger-mika");
  });

  it("returns null when identity fields are missing", () => {
    expect(normalizeIssue(SLUG, { title: "no number" })).toBeNull();
    expect(normalizeIssue(SLUG, { number: 1 })).toBeNull();
  });

  it("truncates an oversized body and warns", () => {
    const raw = { number: 5, title: "big", body: "x".repeat(GITHUB_MAX_BODY_CHARS + 500), state: "open" };
    const result = normalizeIssue(SLUG, raw);
    const data = dataOf(result);
    expect(String(data.body).length).toBe(GITHUB_MAX_BODY_CHARS);
    expect(result!.warnings.some((w) => w.code === "github_body_truncated")).toBe(true);
  });

  it("accepts string-form labels and dedupes", () => {
    const raw = {
      number: 6,
      title: "labels",
      state: "open",
      labels: ["a", "a", { name: "b" }, { name: "b" }],
    };
    const data = dataOf(normalizeIssue(SLUG, raw));
    expect(data.labels).toEqual(["a", "b"]);
  });
});

describe("normalizePullRequest", () => {
  it("classifies a pull request from the issues endpoint", () => {
    const issues = load("issues.json") as unknown[];
    const prElement = issues[1];
    const result = normalizeIssueOrPullRequest(SLUG, prElement);
    expect(result!.item.type).toBe("pullRequest");
    expect(result!.item.id).toBe(`github:pull-request:${SLUG}#47`);
  });

  it("merges pull-request detail fields", () => {
    const issueElement = (load("issues.json") as unknown[])[1];
    const detail = readPullRequestDetail(load("pull-request.json"));
    const result = normalizePullRequest(SLUG, issueElement, detail);
    const data = dataOf(result);
    expect(data.kind).toBe("pullRequest");
    expect(data.status).toBe("draft");
    expect(data.baseBranch).toBe("main");
    expect(data.headBranch).toBe("legend-appendix");
    expect(data.requestedReviewers).toEqual(["editor-rune"]);
    expect(data.additions).toBe(120);
    expect(data.deletions).toBe(4);
    expect(data.changedFiles).toBe(3);
    expect(data.tags).toContain("pull-request");
    expect(data.tags).toContain("draft");
  });
});

describe("normalized item safety", () => {
  it("never leaks node ids, api urls, or clone urls", () => {
    const results = [
      normalizeRepository(SLUG, load("repository.json")),
      normalizeIssue(SLUG, load("issue.json")),
      normalizePullRequest(SLUG, (load("issues.json") as unknown[])[1], readPullRequestDetail(load("pull-request.json"))),
    ];
    for (const result of results) {
      const serialized = JSON.stringify(result!.item);
      expect(serialized).not.toContain("node_id");
      expect(serialized).not.toContain("api.github.com");
      expect(serialized).not.toContain(".git\"");
      expect(serialized).not.toContain("R_fixture");
    }
  });

  it("uses only github.com canonical URLs", () => {
    const item = normalizeIssue(SLUG, load("issue.json"))!.item;
    expect(item.url?.startsWith("https://github.com/")).toBe(true);
  });
});

describe("normalizeIssueComments", () => {
  const parent = { slug: "owner/repo", number: 7, parentType: "issue" as const, parentStatus: "open" };
  const raw = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    body: `body-${id}`,
    user: { login: "alice" },
    author_association: "CONTRIBUTOR",
    html_url: `https://github.com/owner/repo/issues/7#issuecomment-${id}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...over,
  });

  it("normalizes comments to note items in API order with bounded provenance", () => {
    const { items, warnings } = normalizeIssueComments(parent, [raw(1), raw(2)]);
    expect(warnings).toHaveLength(0);
    expect(items.map((i) => i.id)).toEqual([
      "github:owner/repo:item:7:comment:1",
      "github:owner/repo:item:7:comment:2",
    ]);
    expect(items.every((i) => i.type === "note")).toBe(true);
    const d0 = items[0]!.data as Record<string, unknown>;
    expect(d0).toMatchObject({
      kind: "issueComment",
      repository: "owner/repo",
      parentNumber: 7,
      parentType: "issue",
      parentStatus: "open",
      author: "alice",
      authorAssociation: "CONTRIBUTOR",
      body: "body-1",
    });
    expect(items[0]!.url).toBe("https://github.com/owner/repo/issues/7#issuecomment-1");
  });

  it("skips invalid records (non-object / missing id) with a stable warning, preserving order", () => {
    const { items, warnings } = normalizeIssueComments(parent, [raw(1), "nope", { body: "no id" }, raw(4)]);
    expect(items.map((i) => (i.data as Record<string, unknown>).parentNumber)).toEqual([7, 7]);
    expect(items.map((i) => i.id)).toEqual([
      "github:owner/repo:item:7:comment:1",
      "github:owner/repo:item:7:comment:4",
    ]);
    expect(warnings.some((w) => w.code === "github_comment_invalid")).toBe(true);
  });

  it("truncates an over-long comment body with a warning", () => {
    const big = "x".repeat(GITHUB_MAX_COMMENT_BODY_CHARS + 100);
    const { items, warnings } = normalizeIssueComments(parent, [raw(1, { body: big })]);
    const body = (items[0]!.data as Record<string, unknown>).body as string;
    expect(body.length).toBe(GITHUB_MAX_COMMENT_BODY_CHARS);
    expect(warnings.some((w) => w.code === "github_comment_body_truncated")).toBe(true);
  });

  it("bounds the combined comment bodies, preserving earlier comments in full", () => {
    // Each body is half the per-comment ceiling; the combined ceiling is hit
    // before all are included in full.
    const size = GITHUB_MAX_COMMENT_BODY_CHARS;
    const count = Math.ceil(GITHUB_MAX_COMBINED_COMMENT_CHARS / size) + 2;
    const comments = Array.from({ length: count }, (_, i) => raw(i + 1, { body: "y".repeat(size) }));
    const { items, warnings } = normalizeIssueComments(parent, comments);
    const total = items.reduce((n, i) => n + ((i.data as Record<string, unknown>).body as string).length, 0);
    expect(total).toBeLessThanOrEqual(GITHUB_MAX_COMBINED_COMMENT_CHARS);
    // The first comment is preserved in full.
    expect(((items[0]!.data as Record<string, unknown>).body as string).length).toBe(size);
    expect(warnings.some((w) => w.code === "github_comments_combined_truncated")).toBe(true);
  });

  it("caps the comment count at the maximum and warns", () => {
    const comments = Array.from({ length: GITHUB_MAX_COMMENTS + 5 }, (_, i) => raw(i + 1, { body: "z" }));
    const { items, warnings } = normalizeIssueComments(parent, comments);
    expect(items).toHaveLength(GITHUB_MAX_COMMENTS);
    expect(warnings.some((w) => w.code === "github_comments_count_truncated")).toBe(true);
  });

  it("returns nothing for a non-array input", () => {
    expect(normalizeIssueComments(parent, null).items).toHaveLength(0);
    expect(normalizeIssueComments(parent, { not: "array" }).items).toHaveLength(0);
  });
});

describe("normalizePullRequestReviews", () => {
  const parent = { slug: "owner/repo", number: 7, parentStatus: "open" };
  const raw = (id: number, state: string, over: Record<string, unknown> = {}) => ({
    id,
    node_id: `MDE=${id}`,
    user: { login: "alice", id: 5, node_id: "U_1" },
    body: `body-${id}`,
    state,
    author_association: "MEMBER",
    submitted_at: "2026-02-01T00:00:00Z",
    commit_id: "deadbeef",
    html_url: `https://github.com/owner/repo/pull/7#pullrequestreview-${id}`,
    _links: { html: { href: "x" } },
    ...over,
  });

  it("maps all known states and drops raw state / node / user / commit data", () => {
    const states: Array<[string, string]> = [
      ["APPROVED", "approved"],
      ["CHANGES_REQUESTED", "changesRequested"],
      ["COMMENTED", "commented"],
      ["DISMISSED", "dismissed"],
      ["PENDING", "pending"],
    ];
    const { items, warnings } = normalizePullRequestReviews(
      parent,
      states.map(([s], i) => raw(i + 1, s)),
    );
    expect(items.map((i) => (i.data as Record<string, unknown>).reviewState)).toEqual(
      states.map(([, canonical]) => canonical),
    );
    expect(items[0]!.id).toBe("github:owner/repo:pull-request:7:review:1");
    expect(items[0]!.title).toBe("Review by @alice: approved");
    const d0 = items[0]!.data as Record<string, unknown>;
    expect(d0.parentType).toBe("pullRequest");
    expect(d0.state).toBeUndefined();
    expect(d0.node_id).toBeUndefined();
    expect(d0.user).toBeUndefined();
    expect(d0.commit_id).toBeUndefined();
    expect(d0._links).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("maps an unknown state to unknown with a stable warning", () => {
    const { items, warnings } = normalizePullRequestReviews(parent, [raw(1, "WEIRD_STATE")]);
    expect((items[0]!.data as Record<string, unknown>).reviewState).toBe("unknown");
    expect(warnings.some((w) => w.code === "github_review_state_unknown")).toBe(true);
  });

  it("skips a record with a missing/invalid id, preserving order and warning", () => {
    const { items, warnings } = normalizePullRequestReviews(parent, [
      raw(1, "APPROVED"),
      { state: "COMMENTED" },
      raw(0, "COMMENTED"),
      "nope",
      raw(4, "COMMENTED"),
    ]);
    expect(items.map((i) => i.id)).toEqual([
      "github:owner/repo:pull-request:7:review:1",
      "github:owner/repo:pull-request:7:review:4",
    ]);
    expect(warnings.some((w) => w.code === "github_review_invalid")).toBe(true);
  });

  it("falls back to the unknown author when the login is missing", () => {
    const { items } = normalizePullRequestReviews(parent, [raw(1, "APPROVED", { user: {} })]);
    expect((items[0]!.data as Record<string, unknown>).author).toBe("unknown");
  });

  it("accepts only a canonical github html url", () => {
    const { items } = normalizePullRequestReviews(parent, [
      raw(1, "APPROVED", { html_url: "https://evil.example/x" }),
    ]);
    expect(items[0]!.url).toBeUndefined();
  });

  it("truncates a per-review body and warns", () => {
    const big = "x".repeat(GITHUB_MAX_REVIEW_BODY_CHARS + 50);
    const { items, warnings } = normalizePullRequestReviews(parent, [raw(1, "APPROVED", { body: big })]);
    expect(((items[0]!.data as Record<string, unknown>).body as string).length).toBe(
      GITHUB_MAX_REVIEW_BODY_CHARS,
    );
    expect(warnings.some((w) => w.code === "github_review_body_truncated")).toBe(true);
  });

  it("bounds combined bodies and caps the count, preserving earliest first", () => {
    const size = GITHUB_MAX_REVIEW_BODY_CHARS;
    const many = Array.from({ length: GITHUB_MAX_REVIEWS + 5 }, (_, i) =>
      raw(i + 1, "COMMENTED", { body: "y".repeat(size) }),
    );
    const { items, warnings } = normalizePullRequestReviews(parent, many);
    expect(items).toHaveLength(GITHUB_MAX_REVIEWS);
    const total = items.reduce((n, i) => n + ((i.data as Record<string, unknown>).body as string).length, 0);
    expect(total).toBeLessThanOrEqual(GITHUB_MAX_COMBINED_REVIEW_CHARS);
    expect(warnings.some((w) => w.code === "github_reviews_combined_truncated")).toBe(true);
    expect(warnings.some((w) => w.code === "github_reviews_count_truncated")).toBe(true);
  });

  it("never mutates the input objects", () => {
    const input = [raw(1, "APPROVED")];
    const snapshot = JSON.stringify(input);
    normalizePullRequestReviews(parent, input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("returns nothing for a non-array input", () => {
    expect(normalizePullRequestReviews(parent, null).items).toHaveLength(0);
  });
});

describe("normalizePullRequestReviewComments", () => {
  const parent = { slug: "owner/repo", number: 7, parentStatus: "open" };
  const raw = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    node_id: `MDI=${id}`,
    user: { login: "alice" },
    body: `body-${id}`,
    path: "src/app.ts",
    line: 42,
    start_line: 40,
    side: "RIGHT",
    start_side: "RIGHT",
    diff_hunk: "@@ -1 +1 @@",
    commit_id: "cafe",
    original_commit_id: "beef",
    original_position: 3,
    position: 4,
    pull_request_review_id: 9,
    in_reply_to_id: 8,
    author_association: "MEMBER",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-02T00:00:00Z",
    html_url: `https://github.com/owner/repo/pull/7#discussion_r${id}`,
    ...over,
  });

  it("normalizes valid path/line metadata and never retains diff/commit data", () => {
    const { items, warnings } = normalizePullRequestReviewComments(parent, [raw(11)]);
    expect(warnings).toHaveLength(0);
    expect(items[0]!.id).toBe("github:owner/repo:pull-request:7:review-comment:11");
    expect(items[0]!.title).toBe("Review comment by @alice on src/app.ts");
    const d = items[0]!.data as Record<string, unknown>;
    expect(d).toMatchObject({
      kind: "pullRequestReviewComment",
      filePath: "src/app.ts",
      line: 42,
      startLine: 40,
      side: "right",
      startSide: "right",
      parentType: "pullRequest",
    });
    for (const forbidden of [
      "diff_hunk",
      "commit_id",
      "original_commit_id",
      "position",
      "original_position",
      "node_id",
      "pull_request_review_id",
      "in_reply_to_id",
      "user",
    ]) {
      expect(d[forbidden]).toBeUndefined();
    }
  });

  it("strips control characters from the file path", () => {
    const tab = String.fromCharCode(9);
    const { items } = normalizePullRequestReviewComments(parent, [raw(1, { path: `src${tab}/app.ts` })]);
    const cleaned = (items[0]!.data as Record<string, unknown>).filePath as string;
    expect(cleaned.includes(tab)).toBe(false);
  });

  it("truncates an over-long file path and warns", () => {
    const path = "x".repeat(GITHUB_MAX_REVIEW_COMMENT_PATH_CHARS + 20);
    const { items, warnings } = normalizePullRequestReviewComments(parent, [raw(1, { path })]);
    const fp = (items[0]!.data as Record<string, unknown>).filePath as string;
    expect(fp.length).toBe(GITHUB_MAX_REVIEW_COMMENT_PATH_CHARS);
    expect(warnings.some((w) => w.code === "github_review_comment_path_truncated")).toBe(true);
  });

  it("omits invalid line and unknown side values", () => {
    const { items } = normalizePullRequestReviewComments(parent, [
      raw(1, { line: 0, start_line: -3, side: "MIDDLE", start_side: "top" }),
    ]);
    const d = items[0]!.data as Record<string, unknown>;
    expect(d.line).toBeUndefined();
    expect(d.startLine).toBeUndefined();
    expect(d.side).toBeUndefined();
    expect(d.startSide).toBeUndefined();
  });

  it("skips an invalid record and warns", () => {
    const { items, warnings } = normalizePullRequestReviewComments(parent, [raw(1), { body: "no id" }, raw(3)]);
    expect(items.map((i) => i.id)).toEqual([
      "github:owner/repo:pull-request:7:review-comment:1",
      "github:owner/repo:pull-request:7:review-comment:3",
    ]);
    expect(warnings.some((w) => w.code === "github_review_comment_invalid")).toBe(true);
  });

  it("truncates a per-comment body, bounds the combined bodies, and caps the count", () => {
    const size = GITHUB_MAX_REVIEW_COMMENT_BODY_CHARS;
    const many = Array.from({ length: GITHUB_MAX_REVIEW_COMMENTS + 5 }, (_, i) =>
      raw(i + 1, { body: "y".repeat(size + 10) }),
    );
    const { items, warnings } = normalizePullRequestReviewComments(parent, many);
    expect(items).toHaveLength(GITHUB_MAX_REVIEW_COMMENTS);
    const total = items.reduce((n, i) => n + ((i.data as Record<string, unknown>).body as string).length, 0);
    expect(total).toBeLessThanOrEqual(GITHUB_MAX_COMBINED_REVIEW_COMMENT_CHARS);
    expect(warnings.some((w) => w.code === "github_review_comment_body_truncated")).toBe(true);
    expect(warnings.some((w) => w.code === "github_review_comments_combined_truncated")).toBe(true);
    expect(warnings.some((w) => w.code === "github_review_comments_count_truncated")).toBe(true);
  });

  it("never mutates the input objects", () => {
    const input = [raw(1)];
    const snapshot = JSON.stringify(input);
    normalizePullRequestReviewComments(parent, input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
