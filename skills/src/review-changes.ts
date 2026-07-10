import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import {
  OMP_S_INVALID_INPUT,
  OMP_S_SKILL_MISMATCH,
  failSkillOutput,
  itemSearchText,
  okSkillOutput,
  skillInputObject,
} from "./helpers.js";
import type { ReviewChangesResult, Skill, TextItem } from "./types.js";

const CLASSIFICATION_RULES: readonly {
  classification: "blocked" | "added" | "updated";
  keywords: readonly string[];
}[] = [
  { classification: "blocked", keywords: ["blocked", "blocker"] },
  { classification: "added", keywords: ["added", "new", "created"] },
  { classification: "updated", keywords: ["updated", "changed", "modified"] },
];

function classify(item: TextItem): ReviewChangesResult["changes"][number]["classification"] {
  const text = itemSearchText(item);
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.classification;
    }
  }
  return "unknown";
}

export function createReviewChangesSkill(): Skill {
  return {
    descriptor: {
      id: "reviewChanges",
      name: "Review changes",
      deterministic: true,
      readOnly: true,
    },
    execute(input: SkillInputEnvelope) {
      if (input.skillId !== "reviewChanges") {
        return failSkillOutput(
          "reviewChanges",
          OMP_S_SKILL_MISMATCH,
          `expected skillId reviewChanges, received ${input.skillId}`,
        );
      }
      const parsed = skillInputObject(input);
      if (parsed === null) {
        return failSkillOutput(
          "reviewChanges",
          OMP_S_INVALID_INPUT,
          "skill input must be an object",
        );
      }

      const source = parsed.changes ?? parsed.items ?? [];
      const result: ReviewChangesResult = {
        changes: source.map((item) => ({
          id: item.id,
          title: item.title,
          classification: classify(item),
        })),
      };

      return okSkillOutput("reviewChanges", result);
    },
  };
}
