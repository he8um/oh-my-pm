import { describe, expect, it } from "vitest";
import { extractNextTaskCandidates, extractRiskCandidates } from "../src/index.js";
import type { TextItem } from "../src/index.js";

const NOW = "2026-03-01T00:00:00.000Z";

// A GitHub item-comment note: source=github, type=note, kind=issueComment.
function comment(over: Partial<TextItem> & { body: string }): TextItem {
  return {
    id: "github:owner/repo:item:7:comment:1",
    title: "Comment by @alice",
    source: "github",
    type: "note",
    kind: "issueComment",
    repository: "owner/repo",
    parentNumber: 7,
    parentType: "issue",
    parentStatus: "open",
    author: "alice",
    ...over,
  } as TextItem;
}

const risks = (items: TextItem[]) => extractRiskCandidates({ explicitRisks: [], items, now: NOW });
const tasks = (items: TextItem[]) => extractNextTaskCandidates({ explicitTasks: [], items, now: NOW });

describe("github comment risks", () => {
  it("extracts an explicit blocker marker as a high github_comment risk", () => {
    const r = risks([comment({ body: "Blocker: the deploy pipeline is down" })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.source).toBe("github-comment");
    expect(r[0]!.severity).toBe("high");
    expect(r[0]!.reason).toBe("github_comment:marker:blocker");
    expect(r[0]!.title).toBe("the deploy pipeline is down");
    expect(r[0]!.author).toBe("alice");
    expect(r[0]!.repository).toBe("owner/repo");
    expect(r[0]!.number).toBe(7);
    // Distinct composite id survives dedupe against the parent item.
    expect(r[0]!.id).toBe("github:owner/repo:item:7:comment:1#risk-1");
  });

  it("extracts risks under recognized risk headings (blockers/risks/dependencies)", () => {
    const body = ["## Blockers", "- CI is red", "## Dependencies", "- waiting on infra"].join("\n");
    const r = risks([comment({ body })]);
    const reasons = r.map((x) => x.reason);
    expect(reasons).toContain("github_comment:heading:blockers");
    expect(reasons).toContain("github_comment:heading:dependencies");
  });

  it("extracts a Persian risk marker", () => {
    const r = risks([comment({ body: "ریسک: ممکن است انتشار به تعویق بیفتد" })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.reason).toBe("github_comment:marker:risk");
    expect(r[0]!.severity).toBe("medium");
  });

  it("does NOT treat arbitrary prose or a comment title as a risk", () => {
    const r = risks([comment({ title: "Comment by @alice about a blocker", body: "I think this might be risky and dangerous." })]);
    expect(r).toHaveLength(0);
  });
});

describe("github comment tasks", () => {
  it("extracts an unchecked checkbox as a github_comment task", () => {
    const t = tasks([comment({ body: "- [ ] follow up with the vendor" })]);
    expect(t).toHaveLength(1);
    expect(t[0]!.source).toBe("github-comment");
    expect(t[0]!.reason).toBe("github_comment:marker:task");
    expect(t[0]!.title).toBe("follow up with the vendor");
    expect(t[0]!.id).toBe("github:owner/repo:item:7:comment:1#task-1");
  });

  it("extracts an explicit action marker and a Persian action marker", () => {
    const en = tasks([comment({ body: "Action: rotate the credentials" })]);
    expect(en[0]!.reason).toBe("github_comment:marker:action");
    const fa = tasks([comment({ id: "github:owner/repo:item:7:comment:2", body: "اقدام: کلیدها را عوض کنید" })]);
    expect(fa[0]!.source).toBe("github-comment");
    expect(fa[0]!.reason.startsWith("github_comment:")).toBe(true);
  });

  it("extracts items under a recognized action heading", () => {
    const body = ["## Next Steps", "- draft the migration plan", "- schedule the review"].join("\n");
    const t = tasks([comment({ body })]);
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.every((x) => x.source === "github-comment")).toBe(true);
  });

  it("does NOT extract tasks when the parent issue is closed", () => {
    const t = tasks([comment({ parentStatus: "closed", body: "- [ ] this should not become a task" })]);
    expect(t).toHaveLength(0);
  });

  it("does NOT extract tasks when the parent PR is merged, but does for an open PR", () => {
    const merged = tasks([comment({ parentType: "pullRequest", parentStatus: "merged", body: "- [ ] nope" })]);
    expect(merged).toHaveLength(0);
    const openPr = tasks([comment({ parentType: "pullRequest", parentStatus: "open", body: "- [ ] yes please" })]);
    expect(openPr).toHaveLength(1);
    const draftPr = tasks([comment({ id: "github:owner/repo:item:7:comment:9", parentType: "pullRequest", parentStatus: "draft", body: "- [ ] draft ok" })]);
    expect(draftPr).toHaveLength(1);
  });

  it("does NOT treat arbitrary prose as a task", () => {
    const t = tasks([comment({ body: "We should probably do something about this next." })]);
    expect(t).toHaveLength(0);
  });
});

describe("comments are never top-level issues/PRs/repositories", () => {
  it("a comment note never produces a github-issue/pull-request/repository classification", () => {
    const c = comment({ body: "Blocker: x\n- [ ] do y" });
    const r = risks([c]);
    const t = tasks([c]);
    expect(r.every((x) => x.source === "github-comment")).toBe(true);
    expect(t.every((x) => x.source === "github-comment")).toBe(true);
  });

  it("produces deterministic, repeatable output for the same input", () => {
    const c = comment({ body: "## Risks\n- flaky tests\n## Actions\n- [ ] fix them" });
    expect(JSON.stringify(risks([c]))).toBe(JSON.stringify(risks([c])));
    expect(JSON.stringify(tasks([c]))).toBe(JSON.stringify(tasks([c])));
  });
});
