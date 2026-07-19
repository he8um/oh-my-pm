import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createHandoffSkill } from "../src/index.js";
import type { HandoffResult } from "../src/index.js";

const skill = createHandoffSkill();

function envelope(input: SkillInputEnvelope["input"]): SkillInputEnvelope {
  return { skillId: "createHandoff", context: { locale: "en", now: "2026-07-10" }, input };
}

function handoffOf(input: SkillInputEnvelope["input"]): HandoffResult {
  return skill.execute(envelope(input)).output as HandoffResult;
}

/** Fixture-like generic Markdown documents, in loader order. */
function fixtureItems() {
  return [
    {
      id: "README.md",
      title: "Riverline Field Guide",
      body: [
        "# Riverline Field Guide",
        "",
        "## Current objective",
        "",
        "Ship the printable spring edition of the trail guide.",
      ].join("\n"),
    },
    {
      id: "docs/decisions.md",
      title: "Decisions",
      body: [
        "# Decisions",
        "",
        "- Decision: the spring edition ships as a single printed volume, not two",
        "  booklets.",
        "- Decided by: Jordan",
        "- Date: 2026-03-02",
      ].join("\n"),
    },
    {
      id: "docs/risks.md",
      title: "Delivery Constraints",
      body: [
        "# Delivery Constraints",
        "",
        "Neutral intro prose that must not become a risk line.",
        "",
        "- The printing quote is blocked until the paper supplier responds",
        "  (owner: Jordan).",
        "- The updated cover artwork approval is urgent and due this week",
        "  (owner: Sam).",
        "- Elevation data licensing is an external dependency that still needs a final",
        "  confirmation (owner: Alex).",
        "- A courier strike could cause a delay for the sample shipment",
        "  (owner: Jordan).",
      ].join("\n"),
    },
    {
      id: "docs/status.md",
      title: "Status",
      body: [
        "# Status",
        "",
        "## Active",
        "",
        "- Sam is drafting the campsite section.",
        "- Alex is rendering the elevation maps.",
        "",
        "## Blocked",
        "",
        "- The printing quote is blocked waiting on the paper supplier (owner: Jordan).",
        "",
        "## Next milestone",
        "",
        "- Print-ready draft of the full guide at the end of the month.",
        "",
        "## Next actions",
        "",
        "- [ ] Confirm final paper stock with the supplier.",
        "- [ ] Export the elevation maps for print.",
        "- [ ] Assemble the print-ready guide draft.",
        "- [x] Approve the map legend.",
      ].join("\n"),
    },
  ];
}

describe("createHandoff over Markdown project context", () => {
  it("builds the exact four fixture sections", () => {
    const result = handoffOf({
      title: "create project handoff",
      summary: "create project handoff",
      items: fixtureItems(),
    });
    expect(result.title).toBe("Riverline Field Guide");
    expect(result.sections).toEqual([
      {
        heading: "Summary",
        items: [
          "Ship the printable spring edition of the trail guide.",
          "Sam is drafting the campsite section.",
          "Alex is rendering the elevation maps.",
          "Print-ready draft of the full guide at the end of the month.",
        ],
      },
      {
        heading: "Open Tasks",
        items: [
          "Confirm final paper stock with the supplier.",
          "Export the elevation maps for print.",
          "Assemble the print-ready guide draft.",
        ],
      },
      {
        heading: "Risks",
        items: [
          "The printing quote is blocked until the paper supplier responds (owner: Jordan).",
          "The updated cover artwork approval is urgent and due this week (owner: Sam).",
          "Elevation data licensing is an external dependency that still needs a final confirmation (owner: Alex).",
          "A courier strike could cause a delay for the sample shipment (owner: Jordan).",
          "The printing quote is blocked waiting on the paper supplier (owner: Jordan).",
        ],
      },
      {
        heading: "Decisions",
        items: [
          "Decision: the spring edition ships as a single printed volume, not two booklets.",
          "Decided by: Jordan",
          "Date: 2026-03-02",
        ],
      },
    ]);
    expect(result.generatedAt).toBe("2026-07-10");
  });

  it("infers the title from the first document and ignores the request string", () => {
    const result = handoffOf({ title: "create project handoff", items: fixtureItems() });
    expect(result.title).toBe("Riverline Field Guide");
  });

  it("excludes checked tasks and plain document titles from open tasks", () => {
    const result = handoffOf({ items: fixtureItems() });
    const openTasks = result.sections[1]?.items ?? [];
    expect(openTasks).not.toContain("Approve the map legend.");
    expect(openTasks).not.toContain("Riverline Field Guide");
    expect(openTasks).not.toContain("Status");
  });

  it("does not surface the neutral risk preamble paragraph", () => {
    const result = handoffOf({ items: fixtureItems() });
    const risks = result.sections[2]?.items ?? [];
    expect(risks).not.toContain("Neutral intro prose that must not become a risk line.");
  });

  it("caps each section at five items", () => {
    const body = ["# Risks", ...Array.from({ length: 8 }, (_, i) => `- Risk ${i}`)].join("\n");
    const result = handoffOf({ items: [{ id: "docs/r.md", title: "R", body }] });
    expect(result.sections[2]?.items).toHaveLength(5);
  });

  it("dedupes deterministically within a section", () => {
    const body = ["# Decisions", "- Same call", "- Same call", "- Other call"].join("\n");
    const result = handoffOf({ items: [{ id: "docs/d.md", title: "D", body }] });
    expect(result.sections[3]?.items).toEqual(["Same call", "Other call"]);
  });

  it("reads the generated timestamp from the input context", () => {
    const result = skill.execute({
      skillId: "createHandoff",
      context: { locale: "en", now: "2030-01-02T03:04:05.000Z" },
      input: { items: fixtureItems() },
    }).output as HandoffResult;
    expect(result.generatedAt).toBe("2030-01-02T03:04:05.000Z");
  });

  it("does not mutate the input items", () => {
    const input = { items: fixtureItems() };
    const snapshot = JSON.parse(JSON.stringify(input));
    handoffOf(input);
    expect(input).toEqual(snapshot);
  });
});

describe("createHandoff direct explicit-caller compatibility", () => {
  it("uses explicit title, summary, tasks, risks, and decisions", () => {
    const result = handoffOf({
      title: "Sprint 12 handoff",
      summary: "Auth work is on track.",
      tasks: [{ id: "t1", title: "Finish token refresh" }],
      risks: [{ id: "r1", title: "Vendor delay" }],
      decisions: [{ id: "d1", title: "Use serde tagging" }],
    });
    expect(result.title).toBe("Sprint 12 handoff");
    expect(result.sections).toEqual([
      { heading: "Summary", items: ["Auth work is on track."] },
      { heading: "Open Tasks", items: ["Finish token refresh"] },
      { heading: "Risks", items: ["Vendor delay"] },
      { heading: "Decisions", items: ["Use serde tagging"] },
    ]);
  });

  it("includes explicit tasks before markdown checkbox tasks", () => {
    const result = handoffOf({
      tasks: [{ id: "t1", title: "Explicit first" }],
      items: [{ id: "docs/s.md", title: "S", body: "# Tasks\n- [ ] Checkbox task" }],
    });
    expect(result.sections[1]?.items).toEqual(["Explicit first", "Checkbox task"]);
  });

  it("surfaces structured operational items that carry metadata", () => {
    const result = handoffOf({
      items: [
        { id: "op1", title: "Owned open work", owner: "sam" },
        { id: "op2", title: "Done work", status: "done" },
        { id: "op3", title: "Blocked work", status: "blocked" },
        { id: "op4", title: "Plain doc" },
      ],
    });
    expect(result.sections[1]?.items).toEqual(["Owned open work"]);
  });
});

describe("createHandoff fallbacks", () => {
  it("uses fallback text for every empty section", () => {
    const result = handoffOf({});
    expect(result.title).toBe("Project handoff");
    expect(result.sections).toEqual([
      { heading: "Summary", items: ["No project summary found."] },
      { heading: "Open Tasks", items: ["No open tasks."] },
      { heading: "Risks", items: ["No risks listed."] },
      { heading: "Decisions", items: ["No decisions listed."] },
    ]);
  });

  it("falls back to an explicit summary when no markdown summary exists", () => {
    const result = handoffOf({ summary: "Fallback summary line." });
    expect(result.sections[0]?.items).toEqual(["Fallback summary line."]);
  });

  it("rejects a mismatched skill id", () => {
    const output = skill.execute({
      skillId: "summarizeStatus",
      context: { locale: "en", now: "t0" },
      input: {},
    });
    expect(output.ok).toBe(false);
  });
});

describe("createHandoff with GitHub item comments", () => {
  const comment = (over: Record<string, unknown>) => ({
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
  });

  it("adds author-prefixed comment action items to Open Tasks", () => {
    const result = handoffOf({ items: [comment({ body: "- [ ] rotate the signing key" })] });
    const openTasks = result.sections.find((s) => s.heading === "Open Tasks")!;
    expect(openTasks.items.some((i) => i === "@alice: rotate the signing key")).toBe(true);
  });

  it("adds author-prefixed comment risks to Risks", () => {
    const result = handoffOf({ items: [comment({ body: "Blocker: staging is unreachable" })] });
    const riskSection = result.sections.find((s) => s.heading === "Risks")!;
    expect(riskSection.items.some((i) => i === "@alice: staging is unreachable")).toBe(true);
  });

  it("adds author-prefixed comment decisions to Decisions", () => {
    const body = ["## Decisions", "- ship behind a feature flag"].join("\n");
    const result = handoffOf({ items: [comment({ body })] });
    const decisions = result.sections.find((s) => s.heading === "Decisions")!;
    expect(decisions.items.some((i) => i === "@alice: ship behind a feature flag")).toBe(true);
  });

  it("comments do not change the project title or Summary", () => {
    const withComment = handoffOf({ items: [comment({ body: "Blocker: x" })], title: "My Project" });
    expect(withComment.title).toBe("My Project");
    const summary = withComment.sections.find((s) => s.heading === "Summary")!;
    expect(summary.items).toEqual(["No project summary found."]);
  });
});
