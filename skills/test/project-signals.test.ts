import { describe, expect, it } from "vitest";
import {
  classifyGitHubNextTask,
  classifyGitHubRisk,
  extractNextTaskCandidates,
  extractRiskCandidates,
  isOverdue,
  normalizeSignalText,
  normalizeSignalToken,
  parseComparableInstant,
} from "../src/index.js";
import type { TextItem } from "../src/index.js";

const NOW = "2026-03-01T00:00:00.000Z";

describe("normalizeSignalText", () => {
  it("trims, lowercases, and drops one trailing colon", () => {
    expect(normalizeSignalText("  Risks:  ")).toBe("risks");
  });
  it("unifies Arabic yeh/kaf to Persian and ZWNJ to a space", () => {
    // Arabic yeh (U+064A) and kaf (U+0643) fold to Persian forms.
    expect(normalizeSignalText("يك")).toBe(normalizeSignalText("یک"));
    // ZWNJ becomes a normal space then collapses.
    expect(normalizeSignalText("a‌b")).toBe("a b");
  });
  it("collapses internal whitespace", () => {
    expect(normalizeSignalText("a   b\tc")).toBe("a b c");
  });
});

describe("normalizeSignalToken", () => {
  it("folds underscores, slashes, and repeated dashes to a single dash", () => {
    expect(normalizeSignalToken("Priority_High")).toBe("priority-high");
    expect(normalizeSignalToken("waiting on")).toBe("waiting-on");
    expect(normalizeSignalToken("needs--info")).toBe("needs-info");
  });
});

describe("parseComparableInstant and isOverdue", () => {
  it("anchors a date-only value to end-of-day UTC", () => {
    expect(parseComparableInstant("2026-01-01")).toBe(Date.UTC(2026, 0, 1, 23, 59, 59, 999));
  });
  it("accepts the leap day and rejects an invalid one", () => {
    expect(parseComparableInstant("2028-02-29")).not.toBeNull();
    expect(parseComparableInstant("2027-02-29")).toBeNull();
    expect(parseComparableInstant("2026-02-30")).toBeNull();
    expect(parseComparableInstant("2026-13-01")).toBeNull();
  });
  it("requires a timezone on timestamps", () => {
    expect(parseComparableInstant("2026-01-01T12:00:00Z")).not.toBeNull();
    expect(parseComparableInstant("2026-01-01T12:00:00+03:30")).not.toBeNull();
    expect(parseComparableInstant("2026-01-01T12:00:00")).toBeNull();
  });
  it("computes overdue strictly and disables inference for an invalid now", () => {
    expect(isOverdue("2026-02-01", NOW)).toBe(true);
    expect(isOverdue("2026-03-01", "2026-03-01")).toBe(false); // equal, not before
    expect(isOverdue("2026-04-01", NOW)).toBe(false);
    expect(isOverdue("2026-02-01", "not-a-date")).toBe(false);
    expect(isOverdue(undefined, NOW)).toBe(false);
  });
});

function gh(over: Partial<TextItem>): TextItem {
  return { id: "x", title: "T", source: "github", ...over } as TextItem;
}

describe("classifyGitHubRisk precedence", () => {
  it("prefers overdue over labels", () => {
    const risk = classifyGitHubRisk(
      gh({ id: "i#1", type: "issue", status: "open", due: "2026-01-01", labels: ["risk"] }),
      NOW,
    );
    expect(risk?.reason).toBe("github_due:overdue");
  });
  it("prefers blocked state over a high label", () => {
    const risk = classifyGitHubRisk(gh({ id: "i#2", type: "issue", status: "blocked", labels: ["critical"] }), NOW);
    expect(risk?.reason).toBe("github_state:blocked");
  });
  it("falls through label tiers to a bounded title phrase", () => {
    expect(classifyGitHubRisk(gh({ id: "i#3", type: "issue", status: "open", title: "#3 security incident" }), NOW)?.reason).toBe(
      "github_title:security",
    );
    expect(classifyGitHubRisk(gh({ id: "i#4", type: "issue", status: "open", title: "#4 nothing here" }), NOW)).toBeNull();
  });
  it("does not fire on unblocked or riskless", () => {
    expect(classifyGitHubRisk(gh({ id: "i#5", type: "issue", status: "open", title: "#5 unblocked and riskless" }), NOW)).toBeNull();
  });
});

describe("classifyGitHubNextTask eligibility", () => {
  it("includes an open issue and a draft PR", () => {
    expect(classifyGitHubNextTask(gh({ id: "i#1", type: "issue", status: "open" }), NOW)?.reason).toBe("github_issue:open");
    expect(
      classifyGitHubNextTask(gh({ id: "p#2", type: "pullRequest", kind: "pullRequest", status: "draft" }), NOW)?.reason,
    ).toBe("github_pull_request:draft");
  });
  it("excludes closed, blocked, and no-action items", () => {
    expect(classifyGitHubNextTask(gh({ id: "i#3", type: "issue", status: "closed" }), NOW)).toBeNull();
    expect(classifyGitHubNextTask(gh({ id: "i#4", type: "issue", status: "blocked" }), NOW)).toBeNull();
    expect(classifyGitHubNextTask(gh({ id: "i#5", type: "issue", status: "open", labels: ["wontfix"] }), NOW)).toBeNull();
  });
  it("derives priority from overdue, labels, due, and requested reviewers", () => {
    expect(classifyGitHubNextTask(gh({ id: "i#6", type: "issue", status: "open", due: "2026-01-01" }), NOW)?.priority).toBe("high");
    expect(classifyGitHubNextTask(gh({ id: "i#7", type: "issue", status: "open", labels: ["dependency"] }), NOW)?.priority).toBe("medium");
    expect(classifyGitHubNextTask(gh({ id: "i#8", type: "issue", status: "open", due: "2026-12-01" }), NOW)?.priority).toBe("medium");
    expect(
      classifyGitHubNextTask(gh({ id: "p#9", type: "pullRequest", kind: "pullRequest", status: "open", requestedReviewers: ["r"] }), NOW)?.priority,
    ).toBe("medium");
    expect(classifyGitHubNextTask(gh({ id: "i#10", type: "issue", status: "open" }), NOW)?.priority).toBe("low");
  });
});

describe("extract ordering and dedupe", () => {
  it("orders risks: explicit, markdown, github, and dedupes by id", () => {
    const risks = extractRiskCandidates({
      explicitRisks: [{ id: "e1", title: "Explicit" }],
      items: [
        { id: "d1", title: "d1", source: "local", type: "document", body: "## Risks\n\n- MD risk." },
        gh({ id: "gh1", type: "issue", status: "blocked", title: "#1 x" }),
      ],
      now: NOW,
    });
    expect(risks.map((r) => r.source)).toEqual(["structured", "markdown", "github-issue"]);
  });

  it("produces deep-equal output for identical input", () => {
    const input = {
      explicitTasks: [] as TextItem[],
      items: [{ id: "d1", title: "d1", source: "local", type: "document", body: "- [ ] A\n- [ ] B" } as TextItem],
      now: NOW,
    };
    expect(extractNextTaskCandidates(input)).toEqual(extractNextTaskCandidates(input));
  });
});
