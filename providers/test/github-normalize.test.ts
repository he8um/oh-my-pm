import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GITHUB_MAX_BODY_CHARS,
  normalizeIssue,
  normalizeIssueOrPullRequest,
  normalizePullRequest,
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
