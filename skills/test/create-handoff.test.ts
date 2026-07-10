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

describe("createHandoff", () => {
  it("builds all four sections with content", () => {
    const result = handoffOf({
      title: "Sprint 12 handoff",
      summary: "Auth work is on track.",
      tasks: [{ id: "t1", title: "Finish token refresh" }],
      items: [
        { id: "i1", title: "Done thing", status: "done" },
        { id: "i2", title: "Open thing" },
      ],
      risks: [{ id: "r1", title: "Vendor delay" }],
      decisions: [{ id: "d1", title: "Use serde tagging" }],
    });
    expect(result.title).toBe("Sprint 12 handoff");
    expect(result.sections).toEqual([
      { heading: "Summary", items: ["Auth work is on track."] },
      { heading: "Open Tasks", items: ["Finish token refresh", "Open thing"] },
      { heading: "Risks", items: ["Vendor delay"] },
      { heading: "Decisions", items: ["Use serde tagging"] },
    ]);
    expect(result.generatedAt).toBe("2026-07-10");
  });

  it("uses fallback text for empty sections", () => {
    const result = handoffOf({});
    expect(result.title).toBe("Project handoff");
    expect(result.sections).toEqual([
      { heading: "Summary", items: ["No summary provided."] },
      { heading: "Open Tasks", items: ["No open tasks."] },
      { heading: "Risks", items: ["No risks listed."] },
      { heading: "Decisions", items: ["No decisions listed."] },
    ]);
  });

  it("caps open tasks at five", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, title: `Item ${i}` }));
    const result = handoffOf({ items });
    expect(result.sections[1]?.items).toHaveLength(5);
  });
});
