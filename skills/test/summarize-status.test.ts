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
