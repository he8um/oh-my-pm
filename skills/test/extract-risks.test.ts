import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createExtractRisksSkill } from "../src/index.js";
import type { RiskSummary } from "../src/index.js";

const skill = createExtractRisksSkill();

function envelope(input: SkillInputEnvelope["input"]): SkillInputEnvelope {
  return { skillId: "extractRisks", context: { locale: "en", now: "t0" }, input };
}

function risksOf(input: SkillInputEnvelope["input"]): RiskSummary["risks"] {
  return (skill.execute(envelope(input)).output as RiskSummary).risks;
}

describe("extractRisks", () => {
  it("includes explicit risks even without keywords", () => {
    expect(risksOf({ risks: [{ id: "r1", title: "Vendor unclear" }] })).toEqual([
      { id: "r1", title: "Vendor unclear", severity: "low", reason: "explicit" },
    ]);
  });

  it("extracts risk keywords from items", () => {
    const risks = risksOf({
      items: [
        { id: "1", title: "Deploy blocked by infra" },
        { id: "2", title: "All good here" },
      ],
    });
    expect(risks.map((r) => r.id)).toEqual(["1"]);
  });

  it("assigns severities", () => {
    const risks = risksOf({
      items: [
        { id: "h", title: "Release is overdue" },
        { id: "m", title: "External dependency on vendor" },
        { id: "l", title: "General risk noted" },
      ],
    });
    expect(risks.map((r) => r.severity)).toEqual(["high", "medium", "low"]);
  });

  it("reports the first matched keyword in order", () => {
    const risks = risksOf({
      items: [{ id: "1", title: "risk of delay", body: "blocked too" }],
    });
    expect(risks[0]?.reason).toBe("keyword:risk");
  });

  it("deduplicates by id with first occurrence winning", () => {
    const risks = risksOf({
      risks: [{ id: "1", title: "Explicit first" }],
      items: [{ id: "1", title: "risk duplicate" }],
    });
    expect(risks).toHaveLength(1);
    expect(risks[0]?.title).toBe("Explicit first");
  });

  it("keeps deterministic order: explicit risks then items", () => {
    const risks = risksOf({
      risks: [{ id: "r1", title: "Explicit" }],
      items: [
        { id: "i1", title: "urgent fix" },
        { id: "i2", title: "missing spec" },
      ],
    });
    expect(risks.map((r) => r.id)).toEqual(["r1", "i1", "i2"]);
  });
});
