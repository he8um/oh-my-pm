import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createSummarizeStatusSkill } from "../src/index.js";
import type { StatusSummary } from "../src/index.js";

const skill = createSummarizeStatusSkill();

function envelope(input: SkillInputEnvelope["input"]): SkillInputEnvelope {
  return { skillId: "summarizeStatus", context: { locale: "en", now: "2026-01-01" }, input };
}

const items = [
  { id: "1", title: "Ship login", status: "done" },
  { id: "2", title: "Fix signup", status: "blocked" },
  { id: "3", title: "Write docs", status: "open" },
  { id: "4", title: "Review PR", tags: ["blocked"] },
];

describe("summarizeStatus", () => {
  it("counts total, done, blocked, and open", () => {
    const result = skill.execute(envelope({ items }));
    expect(result.ok).toBe(true);
    const output = result.output as StatusSummary;
    expect(output.counts).toEqual({ total: 4, done: 1, blocked: 2, open: 1 });
  });

  it("prefers notes for highlights", () => {
    const result = skill.execute(envelope({ items, notes: ["n1", "n2", "n3", "n4"] }));
    expect((result.output as StatusSummary).highlights).toEqual(["n1", "n2", "n3"]);
  });

  it("falls back to item titles for highlights", () => {
    const result = skill.execute(envelope({ items }));
    expect((result.output as StatusSummary).highlights).toEqual([
      "Ship login",
      "Fix signup",
      "Write docs",
    ]);
  });

  it("uses context.now and defaults title/summary", () => {
    const output = skill.execute(envelope({})).output as StatusSummary;
    expect(output.generatedAt).toBe("2026-01-01");
    expect(output.title).toBe("Project status");
    expect(output.summary).toBe("");
  });

  it("rejects a mismatched skill id", () => {
    const result = skill.execute({ ...envelope({}), skillId: "extractRisks" });
    expect(result.ok).toBe(false);
    expect(result.warnings?.[0]?.code).toBe("OMP-S-5002");
  });

  it("rejects non-object input", () => {
    const result = skill.execute(envelope(7));
    expect(result.ok).toBe(false);
    expect(result.warnings?.[0]?.code).toBe("OMP-S-5003");
  });
});

describe("summarizeStatus excludes GitHub item comments", () => {
  const comment = {
    id: "github:owner/repo:item:7:comment:1",
    title: "Comment by @alice",
    source: "github",
    type: "note",
    kind: "issueComment",
    body: "This looks blocked and done to me",
    status: "open",
  };

  it("comment notes never change total/open/done/blocked counts", () => {
    const withComment = skill.execute(envelope({ items: [...items, comment] }));
    const withoutComment = skill.execute(envelope({ items }));
    const a = (withComment.output as StatusSummary).counts;
    const b = (withoutComment.output as StatusSummary).counts;
    expect(a).toEqual(b);
  });

  it("comment titles never become highlights", () => {
    const result = skill.execute(envelope({ items: [comment] }));
    const output = result.output as StatusSummary;
    expect(output.highlights).not.toContain("Comment by @alice");
    expect(output.counts.total).toBe(0);
  });
});

describe("summarizeStatus excludes GitHub reviews and review comments", () => {
  const review = {
    id: "github:owner/repo:pull-request:7:review:1",
    title: "Review by @alice: changes requested",
    source: "github",
    type: "note",
    kind: "pullRequestReview",
    reviewState: "changesRequested",
    body: "This is blocked and done to me",
    status: "open",
  };
  const reviewComment = {
    id: "github:owner/repo:pull-request:7:review-comment:1",
    title: "Review comment by @alice on src/app.ts",
    source: "github",
    type: "note",
    kind: "pullRequestReviewComment",
    body: "blocked done",
    status: "open",
  };

  it("review and review-comment notes never change the counts", () => {
    const withReviews = skill.execute(envelope({ items: [...items, review, reviewComment] }));
    const withoutReviews = skill.execute(envelope({ items }));
    expect((withReviews.output as StatusSummary).counts).toEqual(
      (withoutReviews.output as StatusSummary).counts,
    );
  });

  it("review titles never become highlights and never count as top-level items", () => {
    const result = skill.execute(envelope({ items: [review, reviewComment] }));
    const output = result.output as StatusSummary;
    expect(output.highlights).not.toContain("Review by @alice: changes requested");
    expect(output.highlights).not.toContain("Review comment by @alice on src/app.ts");
    expect(output.counts.total).toBe(0);
  });
});
