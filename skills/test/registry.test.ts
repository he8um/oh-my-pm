import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createDefaultSkillRegistry, createSkillRegistry, createSummarizeStatusSkill } from "../src/index.js";
import type { Skill } from "../src/index.js";

function envelope(skillId: SkillInputEnvelope["skillId"]): SkillInputEnvelope {
  return { skillId, context: { locale: "en", now: "t0" }, input: {} };
}

describe("skill registry", () => {
  it("lists the five built-in skills in stable order", () => {
    const registry = createDefaultSkillRegistry();
    expect(registry.list().map((d) => d.id)).toEqual([
      "summarizeStatus",
      "extractRisks",
      "deriveNextTasks",
      "createHandoff",
      "reviewChanges",
    ]);
    expect(registry.list().every((d) => d.deterministic && d.readOnly)).toBe(true);
  });

  it("returns skills by id", () => {
    const registry = createDefaultSkillRegistry();
    expect(registry.get("extractRisks")?.descriptor.name).toBe("Extract risks");
  });

  it("delegates execution to the matching skill", () => {
    const registry = createDefaultSkillRegistry();
    const result = registry.execute(envelope("summarizeStatus"));
    expect(result.ok).toBe(true);
    expect(result.skillId).toBe("summarizeStatus");
  });

  it("fails closed for a missing skill", () => {
    const registry = createSkillRegistry([createSummarizeStatusSkill()]);
    const result = registry.execute(envelope("extractRisks"));
    expect(result.ok).toBe(false);
    expect(result.warnings?.[0]?.code).toBe("OMP-S-5001");
  });

  it("keeps the first skill on duplicate ids", () => {
    const impostor: Skill = {
      descriptor: {
        id: "summarizeStatus",
        name: "Impostor",
        deterministic: true,
        readOnly: true,
      },
      execute() {
        throw new Error("duplicate skill must never be reached");
      },
    };
    const registry = createSkillRegistry([createSummarizeStatusSkill(), impostor]);
    expect(registry.get("summarizeStatus")?.descriptor.name).toBe("Summarize status");
    expect(registry.execute(envelope("summarizeStatus")).ok).toBe(true);
  });
});
