import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import {
  OMP_S_INVALID_INPUT,
  OMP_S_SKILL_MISMATCH,
  failSkillOutput,
  itemSearchText,
  okSkillOutput,
  skillInputObject,
} from "./helpers.js";
import type { RiskSummary, Skill, TextItem } from "./types.js";

const RISK_KEYWORDS = [
  "risk",
  "blocked",
  "blocker",
  "delay",
  "dependency",
  "missing",
  "overdue",
  "urgent",
] as const;

const HIGH_SEVERITY = ["blocked", "blocker", "overdue", "urgent"] as const;
const MEDIUM_SEVERITY = ["delay", "dependency", "missing"] as const;

function firstKeyword(text: string): string | null {
  for (const keyword of RISK_KEYWORDS) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

function severityOf(text: string): "low" | "medium" | "high" {
  if (HIGH_SEVERITY.some((keyword) => text.includes(keyword))) {
    return "high";
  }
  if (MEDIUM_SEVERITY.some((keyword) => text.includes(keyword))) {
    return "medium";
  }
  return "low";
}

function riskEntry(item: TextItem, explicit: boolean): RiskSummary["risks"][number] | null {
  const text = itemSearchText(item);
  const keyword = firstKeyword(text);
  if (!explicit && keyword === null) {
    return null;
  }
  return {
    id: item.id,
    title: item.title,
    severity: severityOf(text),
    reason: keyword === null ? "explicit" : `keyword:${keyword}`,
  };
}

export function createExtractRisksSkill(): Skill {
  return {
    descriptor: {
      id: "extractRisks",
      name: "Extract risks",
      deterministic: true,
      readOnly: true,
    },
    execute(input: SkillInputEnvelope) {
      if (input.skillId !== "extractRisks") {
        return failSkillOutput(
          "extractRisks",
          OMP_S_SKILL_MISMATCH,
          `expected skillId extractRisks, received ${input.skillId}`,
        );
      }
      const parsed = skillInputObject(input);
      if (parsed === null) {
        return failSkillOutput(
          "extractRisks",
          OMP_S_INVALID_INPUT,
          "skill input must be an object",
        );
      }

      const seen = new Set<string>();
      const risks: RiskSummary["risks"] = [];
      const add = (entry: RiskSummary["risks"][number] | null) => {
        if (entry !== null && !seen.has(entry.id)) {
          seen.add(entry.id);
          risks.push(entry);
        }
      };

      for (const item of parsed.risks ?? []) {
        add(riskEntry(item, true));
      }
      for (const item of parsed.items ?? []) {
        add(riskEntry(item, false));
      }

      const summary: RiskSummary = { risks };
      return okSkillOutput("extractRisks", summary);
    },
  };
}
