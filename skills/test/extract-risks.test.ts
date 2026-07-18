import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createExtractRisksSkill } from "../src/index.js";
import type { RiskSummary } from "../src/index.js";

const skill = createExtractRisksSkill();

function envelope(input: SkillInputEnvelope["input"], now = "2026-03-01T00:00:00.000Z"): SkillInputEnvelope {
  return { skillId: "extractRisks", context: { locale: "en", now }, input };
}

function risksOf(input: SkillInputEnvelope["input"], now?: string): RiskSummary["risks"] {
  return (skill.execute(envelope(input, now)).output as RiskSummary).risks;
}

/** A local Markdown document item as the Runtime would supply it. */
function doc(id: string, body: string) {
  return { id, title: id, source: "local", type: "document", body };
}

/** A normalized GitHub issue/PR item as plan-utils would supply it. */
function gh(over: Record<string, unknown>) {
  return { source: "github", ...over };
}

describe("extractRisks — Markdown", () => {
  it("extracts line-level risks from a Blockers heading, not the document title", () => {
    const risks = risksOf({
      items: [doc("d1", "# Project\n\n## Blockers\n\n- The vendor build is blocked.\n- Certs are missing.")],
    });
    expect(risks).toEqual([
      {
        id: "d1#risk-1",
        title: "The vendor build is blocked.",
        severity: "high",
        reason: "markdown_heading:blockers",
        source: "markdown",
      },
      {
        id: "d1#risk-2",
        title: "Certs are missing.",
        severity: "high",
        reason: "markdown_heading:blockers",
        source: "markdown",
      },
    ]);
  });

  it("classifies risk and dependency headings by severity", () => {
    const risks = risksOf({
      items: [
        doc("d1", "## Risks\n\n- Scope creep."),
        doc("d2", "## Dependencies\n\n- Waiting on the API team."),
      ],
    });
    expect(risks.map((r) => [r.reason, r.severity])).toEqual([
      ["markdown_heading:risks", "medium"],
      ["markdown_heading:dependencies", "medium"],
    ]);
  });

  it("supports Persian risk headings and markers", () => {
    const risks = risksOf({
      items: [
        doc("fa1", "## موانع\n\n- تأمین‌کننده تأخیر دارد."),
        doc("fa2", "مانع: انتشار مسدود شده است."),
      ],
    });
    expect(risks.map((r) => [r.id, r.reason, r.severity])).toEqual([
      ["fa1#risk-1", "markdown_heading:blockers", "high"],
      ["fa2#risk-1", "markdown_marker:blocker", "high"],
    ]);
  });

  it("recognizes explicit risk markers with the prefix stripped from the title", () => {
    const risks = risksOf({ items: [doc("d1", "Risk: Third-party latency may spike.")] });
    expect(risks).toEqual([
      {
        id: "d1#risk-1",
        title: "Third-party latency may spike.",
        severity: "medium",
        reason: "markdown_marker:risk",
        source: "markdown",
      },
    ]);
  });

  it("excludes checked (resolved) risk-section items", () => {
    const risks = risksOf({
      items: [doc("d1", "## Risks\n\n- [ ] Open risk item.\n- [x] Resolved risk item.")],
    });
    expect(risks.map((r) => r.title)).toEqual(["Open risk item."]);
  });

  it("ignores fenced code blocks", () => {
    const risks = risksOf({
      items: [doc("d1", "## Risks\n\n```\n- This looks like a risk but is code.\n```\n\n- Real risk.")],
    });
    expect(risks.map((r) => r.title)).toEqual(["Real risk."]);
  });

  it("uses a narrative paragraph only when the risk section has no list items", () => {
    const paragraphOnly = risksOf({ items: [doc("d1", "## Risks\n\nThe schedule is at risk.")] });
    expect(paragraphOnly.map((r) => r.title)).toEqual(["The schedule is at risk."]);
    const withList = risksOf({ items: [doc("d2", "## Risks\n\nPreamble.\n\n- The item.")] });
    expect(withList.map((r) => r.title)).toEqual(["The item."]);
  });
});

describe("extractRisks — explicit structured", () => {
  it("includes explicit risks with severity from status/tags/title", () => {
    const risks = risksOf({
      risks: [
        { id: "r1", title: "Vendor unclear" },
        { id: "r2", title: "Infra", status: "blocked" },
      ],
    });
    expect(risks).toEqual([
      { id: "r1", title: "Vendor unclear", severity: "low", reason: "explicit", source: "structured" },
      { id: "r2", title: "Infra", severity: "high", reason: "explicit", source: "structured" },
    ]);
  });
});

describe("extractRisks — GitHub", () => {
  it("maps a blocker label to a high blocked risk with public metadata", () => {
    const risks = risksOf({
      items: [
        gh({
          id: "github:issue:o/r#7",
          type: "issue",
          title: "#7 Flaky pipeline",
          status: "open",
          labels: ["blocker"],
          url: "https://github.com/o/r/issues/7",
          repository: "o/r",
          number: 7,
        }),
      ],
    });
    expect(risks).toEqual([
      {
        id: "github:issue:o/r#7",
        title: "#7 Flaky pipeline",
        severity: "high",
        reason: "github_state:blocked",
        source: "github-issue",
        sourceType: "issue",
        url: "https://github.com/o/r/issues/7",
        repository: "o/r",
        number: 7,
      },
    ]);
  });

  it("treats an overdue open issue as a high overdue risk", () => {
    const risks = risksOf(
      {
        items: [
          gh({ id: "github:issue:o/r#8", type: "issue", title: "#8 Late", status: "open", due: "2026-02-01", repository: "o/r", number: 8 }),
        ],
      },
      "2026-03-01T00:00:00.000Z",
    );
    expect(risks[0]?.reason).toBe("github_due:overdue");
    expect(risks[0]?.severity).toBe("high");
  });

  it("recognizes a risk heading inside a GitHub body", () => {
    const risks = risksOf({
      items: [
        gh({ id: "github:issue:o/r#9", type: "issue", title: "#9 Investigate", status: "open", body: "## Risks\n\n- External dependency.", repository: "o/r", number: 9 }),
      ],
    });
    expect(risks[0]?.reason).toBe("github_body:risk");
    expect(risks[0]?.severity).toBe("medium");
  });

  it("creates one risk per GitHub issue even with several signals", () => {
    const risks = risksOf({
      items: [
        gh({ id: "github:issue:o/r#10", type: "issue", title: "#10 Critical blocked", status: "blocked", labels: ["blocker", "critical"], repository: "o/r", number: 10 }),
      ],
    });
    expect(risks).toHaveLength(1);
  });

  it("maps archived and disabled repository records to risks", () => {
    const risks = risksOf({
      items: [
        gh({ id: "github:repository:o/a", type: "record", kind: "repository", title: "o/a", status: "archived", repository: "o/a" }),
        gh({ id: "github:repository:o/d", type: "record", kind: "repository", title: "o/d", status: "disabled", repository: "o/d" }),
      ],
    });
    expect(risks.map((r) => [r.reason, r.severity])).toEqual([
      ["github_repository:archived", "medium"],
      ["github_repository:disabled", "high"],
    ]);
  });

  it("does not treat unblocked/riskless as blocked/risk (false-positive guard)", () => {
    const risks = risksOf({
      items: [
        gh({ id: "github:issue:o/r#11", type: "issue", title: "#11 Now unblocked and riskless", status: "open", repository: "o/r", number: 11 }),
      ],
    });
    expect(risks).toEqual([]);
  });
});

describe("extractRisks — limits and purity", () => {
  it("caps at 20 risks", () => {
    const items = Array.from({ length: 30 }, (_v, i) =>
      gh({ id: `github:issue:o/r#${i + 1}`, type: "issue", title: `#${i + 1} blocked`, status: "blocked", repository: "o/r", number: i + 1 }),
    );
    expect(risksOf({ items }).length).toBe(20);
  });

  it("is deterministic across repeated runs and does not mutate input", () => {
    const input = { items: [doc("d1", "## Risks\n\n- One.\n- Two.")] };
    const snapshot = JSON.parse(JSON.stringify(input));
    const first = risksOf(structuredClone(input));
    const second = risksOf(structuredClone(input));
    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
  });

  it("rejects the wrong skill id", () => {
    const out = skill.execute({ skillId: "deriveNextTasks", context: { locale: "en", now: "t0" }, input: {} });
    expect(out.ok).toBe(false);
  });
});
