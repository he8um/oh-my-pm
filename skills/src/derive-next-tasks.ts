import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import {
  OMP_S_INVALID_INPUT,
  OMP_S_SKILL_MISMATCH,
  failSkillOutput,
  okSkillOutput,
  skillInputObject,
} from "./helpers.js";
import { extractNextTaskCandidates } from "./project-signals.js";
import type { NextTaskCandidate } from "./project-signals.js";
import type { NextTasksResult, Skill } from "./types.js";

/** Project a task candidate into the public NextTasks entry (no body/labels). */
function toTaskEntry(candidate: NextTaskCandidate): NextTasksResult["tasks"][number] {
  const entry: NextTasksResult["tasks"][number] = {
    id: candidate.id,
    title: candidate.title,
    reason: candidate.reason,
    source: candidate.source,
  };
  if (candidate.priority !== undefined) entry.priority = candidate.priority;
  if (candidate.sourceType !== undefined) entry.sourceType = candidate.sourceType;
  if (candidate.url !== undefined) entry.url = candidate.url;
  if (candidate.owner !== undefined) entry.owner = candidate.owner;
  if (candidate.due !== undefined) entry.due = candidate.due;
  if (candidate.repository !== undefined) entry.repository = candidate.repository;
  if (candidate.number !== undefined) entry.number = candidate.number;
  return entry;
}

export function createDeriveNextTasksSkill(): Skill {
  return {
    descriptor: {
      id: "deriveNextTasks",
      name: "Derive next tasks",
      deterministic: true,
      readOnly: true,
    },
    execute(input: SkillInputEnvelope) {
      if (input.skillId !== "deriveNextTasks") {
        return failSkillOutput(
          "deriveNextTasks",
          OMP_S_SKILL_MISMATCH,
          `expected skillId deriveNextTasks, received ${input.skillId}`,
        );
      }
      const parsed = skillInputObject(input);
      if (parsed === null) {
        return failSkillOutput(
          "deriveNextTasks",
          OMP_S_INVALID_INPUT,
          "skill input must be an object",
        );
      }

      const candidates = extractNextTaskCandidates({
        explicitTasks: parsed.tasks ?? [],
        items: parsed.items ?? [],
        now: input.context.now,
      });

      const result: NextTasksResult = { tasks: candidates.map(toTaskEntry) };
      return okSkillOutput("deriveNextTasks", result);
    },
  };
}
