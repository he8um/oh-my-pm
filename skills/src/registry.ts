import type { SkillId, SkillInputEnvelope } from "@oh-my-pm/contracts";
import { createHandoffSkill } from "./create-handoff.js";
import { createDeriveNextTasksSkill } from "./derive-next-tasks.js";
import { createExtractRisksSkill } from "./extract-risks.js";
import { OMP_S_UNKNOWN_SKILL, failSkillOutput } from "./helpers.js";
import { createReviewChangesSkill } from "./review-changes.js";
import { createSummarizeStatusSkill } from "./summarize-status.js";
import type { Skill, SkillDescriptor, SkillRegistry } from "./types.js";

function builtInSkills(): Skill[] {
  return [
    createSummarizeStatusSkill(),
    createExtractRisksSkill(),
    createDeriveNextTasksSkill(),
    createHandoffSkill(),
    createReviewChangesSkill(),
  ];
}

/** Registry over a fixed skill set; duplicate ids keep the first skill. */
export function createSkillRegistry(skills?: readonly Skill[]): SkillRegistry {
  const source = skills ?? builtInSkills();
  const byId = new Map<SkillId, Skill>();
  const descriptors: SkillDescriptor[] = [];

  for (const skill of source) {
    if (!byId.has(skill.descriptor.id)) {
      byId.set(skill.descriptor.id, skill);
      descriptors.push(skill.descriptor);
    }
  }

  return {
    list(): readonly SkillDescriptor[] {
      return descriptors;
    },
    get(id: SkillId): Skill | undefined {
      return byId.get(id);
    },
    execute(input: SkillInputEnvelope) {
      const skill = byId.get(input.skillId);
      if (skill === undefined) {
        return failSkillOutput(
          input.skillId,
          OMP_S_UNKNOWN_SKILL,
          `unknown skill: ${input.skillId}`,
        );
      }
      return skill.execute(input);
    },
  };
}

export function createDefaultSkillRegistry(): SkillRegistry {
  return createSkillRegistry();
}
