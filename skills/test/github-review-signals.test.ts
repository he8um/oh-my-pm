import { describe, expect, it } from "vitest";
import { extractNextTaskCandidates, extractRiskCandidates } from "../src/index.js";
import type { TextItem } from "../src/index.js";

const NOW = "2026-03-01T00:00:00.000Z";

// A GitHub pull-request review note: source=github, type=note,
// kind=pullRequestReview.
function review(over: Partial<TextItem> & { reviewState: string }): TextItem {
  return {
    id: "github:owner/repo:pull-request:7:review:1",
    title: `Review by @alice: ${over.reviewState}`,
    source: "github",
    type: "note",
    kind: "pullRequestReview",
    repository: "owner/repo",
    parentNumber: 7,
    parentType: "pullRequest",
    parentStatus: "open",
    author: "alice",
    body: "",
    ...over,
  } as TextItem;
}

// A GitHub inline review comment note.
function reviewComment(over: Partial<TextItem> & { body: string }): TextItem {
  return {
    id: "github:owner/repo:pull-request:7:review-comment:1",
    title: "Review comment by @alice on src/app.ts",
    source: "github",
    type: "note",
    kind: "pullRequestReviewComment",
    repository: "owner/repo",
    parentNumber: 7,
    parentType: "pullRequest",
    parentStatus: "open",
    author: "alice",
    filePath: "src/app.ts",
    line: 42,
    ...over,
  } as TextItem;
}

const risks = (items: TextItem[]) => extractRiskCandidates({ explicitRisks: [], items, now: NOW });
const tasks = (items: TextItem[]) => extractNextTaskCandidates({ explicitTasks: [], items, now: NOW });

describe("review-state-derived signals", () => {
  it("open PR + changesRequested yields a high state risk and a high state task", () => {
    const item = review({ reviewState: "changesRequested" });
    const r = risks([item]);
    const t = tasks([item]);
    expect(r).toHaveLength(1);
    expect(r[0]!.source).toBe("github-review");
    expect(r[0]!.severity).toBe("high");
    expect(r[0]!.reason).toBe("github_review:changes_requested");
    expect(r[0]!.title).toBe("Changes requested by @alice");
    expect(r[0]!.id).toBe("github:owner/repo:pull-request:7:review:1#state-risk");
    expect(t).toHaveLength(1);
    expect(t[0]!.priority).toBe("high");
    expect(t[0]!.reason).toBe("github_review:address_changes_requested");
    expect(t[0]!.title).toBe("Address changes requested by @alice");
  });

  it("draft PR + changesRequested still yields a high state risk and task", () => {
    const item = review({ reviewState: "changesRequested", parentStatus: "draft" });
    expect(risks([item])).toHaveLength(1);
    expect(tasks([item])).toHaveLength(1);
  });

  it("closed/merged PR + changesRequested yields no state risk or task", () => {
    for (const parentStatus of ["closed", "merged"]) {
      const item = review({ reviewState: "changesRequested", parentStatus });
      expect(risks([item]), parentStatus).toHaveLength(0);
      expect(tasks([item]), parentStatus).toHaveLength(0);
    }
  });

  it("approved / commented / dismissed / pending / unknown yield no state risk or task", () => {
    for (const reviewState of ["approved", "commented", "dismissed", "pending", "unknown"]) {
      const item = review({ reviewState });
      expect(risks([item]), reviewState).toHaveLength(0);
      expect(tasks([item]), reviewState).toHaveLength(0);
    }
  });
});

describe("review body signals", () => {
  it("extracts an English risk heading as a github_review risk", () => {
    const item = review({ reviewState: "commented", body: "## Blockers\n- the migration is unsafe" });
    const r = risks([item]);
    expect(r.some((x) => x.reason === "github_review:heading:blockers" && x.source === "github-review")).toBe(true);
  });

  it("extracts a Persian risk heading as a github_review risk", () => {
    const item = review({ reviewState: "commented", body: "## موانع\n- ممکن است داده از دست برود" });
    const r = risks([item]);
    expect(r.some((x) => x.source === "github-review" && x.reason === "github_review:heading:blockers")).toBe(
      true,
    );
  });

  it("extracts an English action heading and a Persian action heading as tasks", () => {
    const en = tasks([review({ reviewState: "commented", body: "## Next Steps\n- rebase the branch" })]);
    expect(en.some((x) => x.source === "github-review")).toBe(true);
    const fa = tasks([
      review({
        id: "github:owner/repo:pull-request:7:review:2",
        reviewState: "commented",
        body: "## اقدامات\n- تست‌ها را اضافه کنید",
      }),
    ]);
    expect(fa.some((x) => x.source === "github-review")).toBe(true);
  });

  it("extracts an unchecked checkbox as a task and excludes a checked one", () => {
    const t = tasks([review({ reviewState: "commented", body: "- [ ] fix the leak\n- [x] already merged" })]);
    expect(t).toHaveLength(1);
    expect(t[0]!.title).toBe("fix the leak");
  });

  it("preserves a priority marker on a review body task", () => {
    const t = tasks([review({ reviewState: "commented", body: "## Actions\n- [P0] page the on-call" })]);
    expect(t[0]!.priority).toBe("high");
    expect(t[0]!.title).toBe("page the on-call");
  });

  it("does NOT extract body tasks when the parent PR is merged, but keeps historical body risks", () => {
    const merged = review({ reviewState: "commented", parentStatus: "merged", body: "## Blockers\n- data loss risk\n## Actions\n- [ ] nope" });
    expect(tasks([merged])).toHaveLength(0);
    expect(risks([merged]).some((x) => x.source === "github-review")).toBe(true);
  });

  it("does NOT treat arbitrary review prose or the generated title as a signal", () => {
    const item = review({ reviewState: "commented", title: "Review by @alice: changes requested", body: "This looks risky and dangerous to me." });
    expect(risks([item])).toHaveLength(0);
    expect(tasks([item])).toHaveLength(0);
  });
});

describe("review comment body signals", () => {
  it("extracts an explicit blocker marker with file/line provenance", () => {
    const r = risks([reviewComment({ body: "Blocker: this dereferences null" })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.source).toBe("github-review-comment");
    expect(r[0]!.reason).toBe("github_review_comment:marker:blocker");
    expect(r[0]!.filePath).toBe("src/app.ts");
    expect(r[0]!.line).toBe(42);
  });

  it("extracts an unchecked checkbox task only for an open/draft parent", () => {
    const open = tasks([reviewComment({ body: "- [ ] rename this variable" })]);
    expect(open).toHaveLength(1);
    expect(open[0]!.source).toBe("github-review-comment");
    const closed = tasks([reviewComment({ parentStatus: "closed", body: "- [ ] nope" })]);
    expect(closed).toHaveLength(0);
  });

  it("a review-comment note is never a state-derived risk (no reviewState field)", () => {
    const item = reviewComment({ body: "plain prose" });
    expect(risks([item])).toHaveLength(0);
  });
});

describe("reviews and review comments are never top-level items", () => {
  it("only ever produce github-review / github-review-comment sourced candidates", () => {
    const items = [
      review({ reviewState: "changesRequested", body: "## Risks\n- flaky" }),
      reviewComment({ body: "Blocker: x\n- [ ] y" }),
    ];
    const r = risks(items);
    const t = tasks(items);
    expect(r.every((x) => x.source === "github-review" || x.source === "github-review-comment")).toBe(true);
    expect(t.every((x) => x.source === "github-review" || x.source === "github-review-comment")).toBe(true);
  });

  it("produces deterministic, repeatable output", () => {
    const items = [
      review({ reviewState: "changesRequested", body: "## Actions\n- [ ] fix it" }),
      reviewComment({ body: "Risk: perf regression" }),
    ];
    expect(JSON.stringify(risks(items))).toBe(JSON.stringify(risks(items)));
    expect(JSON.stringify(tasks(items))).toBe(JSON.stringify(tasks(items)));
  });

  it("orders candidates by group: primary issue/PR, then comments, then reviews, then review comments", () => {
    const items: TextItem[] = [
      { id: "github:pull-request:owner/repo#7", title: "#7 PR", source: "github", type: "pullRequest", kind: "pullRequest", repository: "owner/repo", number: 7, status: "open", body: "## Blockers\n- primary blocker" } as TextItem,
      review({ reviewState: "changesRequested" }),
      reviewComment({ body: "Blocker: from the review comment" }),
    ];
    const r = risks(items);
    const sources = r.map((x) => x.source);
    // The primary PR risk comes before the review risk, which comes before the
    // review-comment risk.
    const iPr = sources.indexOf("github-pull-request");
    const iReview = sources.indexOf("github-review");
    const iReviewComment = sources.indexOf("github-review-comment");
    expect(iPr).toBeGreaterThanOrEqual(0);
    expect(iPr).toBeLessThan(iReview);
    expect(iReview).toBeLessThan(iReviewComment);
  });
});
