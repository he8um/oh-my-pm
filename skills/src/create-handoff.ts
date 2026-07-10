import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import {
  OMP_S_INVALID_INPUT,
  OMP_S_SKILL_MISMATCH,
  failSkillOutput,
  isDoneItem,
  okSkillOutput,
  skillInputObject,
} from "./helpers.js";
import type { HandoffResult, Skill, TextItem } from "./types.js";

const MAX_SECTION_ITEMS = 5;

function titlesOrFallback(items: readonly string[], fallback: string): string[] {
  return items.length > 0 ? items.slice(0, MAX_SECTION_ITEMS) : [fallback];
}

export function createHandoffSkill(): Skill {
  return {
    descriptor: {
      id: "createHandoff",
      name: "Create handoff",
      deterministic: true,
      readOnly: true,
    },
    execute(input: SkillInputEnvelope) {
      if (input.skillId !== "createHandoff") {
        return failSkillOutput(
          "createHandoff",
          OMP_S_SKILL_MISMATCH,
          `expected skillId createHandoff, received ${input.skillId}`,
        );
      }
      const parsed = skillInputObject(input);
      if (parsed === null) {
        return failSkillOutput(
          "createHandoff",
          OMP_S_INVALID_INPUT,
          "skill input must be an object",
        );
      }

      const openSource: TextItem[] = [...(parsed.tasks ?? []), ...(parsed.items ?? [])];
      const openTitles = openSource.filter((item) => !isDoneItem(item)).map((item) => item.title);

      const result: HandoffResult = {
        title: parsed.title ?? "Project handoff",
        sections: [
          {
            heading: "Summary",
            items: [parsed.summary ?? "No summary provided."],
          },
          {
            heading: "Open Tasks",
            items: titlesOrFallback(openTitles, "No open tasks."),
          },
          {
            heading: "Risks",
            items: titlesOrFallback(
              (parsed.risks ?? []).map((item) => item.title),
              "No risks listed.",
            ),
          },
          {
            heading: "Decisions",
            items: titlesOrFallback(
              (parsed.decisions ?? []).map((item) => item.title),
              "No decisions listed.",
            ),
          },
        ],
        generatedAt: input.context.now,
      };

      return okSkillOutput("createHandoff", result);
    },
  };
}
