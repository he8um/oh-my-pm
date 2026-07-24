import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import {
  OMP_S_INVALID_INPUT,
  OMP_S_SKILL_MISMATCH,
  failSkillOutput,
  okSkillOutput,
  skillInputObject,
} from "./helpers.js";
import { extractRiskCandidates } from "./project-signals.js";
import type { RiskCandidate } from "./project-signals.js";
import type { RiskSummary, Skill } from "./types.js";

/** Project a risk candidate into the public RiskSummary entry (no body/labels). */
function toRiskEntry(candidate: RiskCandidate): RiskSummary["risks"][number] {
  const entry: RiskSummary["risks"][number] = {
    id: candidate.id,
    title: candidate.title,
    severity: candidate.severity,
    reason: candidate.reason,
    source: candidate.source,
  };
  if (candidate.sourceType !== undefined) entry.sourceType = candidate.sourceType;
  if (candidate.url !== undefined) entry.url = candidate.url;
  if (candidate.owner !== undefined) entry.owner = candidate.owner;
  if (candidate.author !== undefined) entry.author = candidate.author;
  if (candidate.reviewState !== undefined) entry.reviewState = candidate.reviewState;
  if (candidate.filePath !== undefined) entry.filePath = candidate.filePath;
  if (candidate.line !== undefined) entry.line = candidate.line;
  if (candidate.due !== undefined) entry.due = candidate.due;
  if (candidate.repository !== undefined) entry.repository = candidate.repository;
  if (candidate.number !== undefined) entry.number = candidate.number;
  return entry;
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

      const candidates = extractRiskCandidates({
        explicitRisks: parsed.risks ?? [],
        items: parsed.items ?? [],
        now: input.context.now,
      });

      const summary: RiskSummary = { risks: candidates.map(toRiskEntry) };
      return okSkillOutput("extractRisks", summary);
    },
  };
}
