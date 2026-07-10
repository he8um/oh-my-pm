import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import {
  OMP_S_INVALID_INPUT,
  OMP_S_SKILL_MISMATCH,
  failSkillOutput,
  isBlockedItem,
  isDoneItem,
  okSkillOutput,
  skillInputObject,
} from "./helpers.js";
import type { NextTasksResult, Skill } from "./types.js";

const MAX_TASKS = 5;

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

      const seen = new Set<string>();
      const tasks: NextTasksResult["tasks"] = [];
      const add = (id: string, title: string, reason: string) => {
        if (tasks.length < MAX_TASKS && !seen.has(id)) {
          seen.add(id);
          tasks.push({ id, title, reason });
        }
      };

      for (const task of parsed.tasks ?? []) {
        add(task.id, task.title, "explicit");
      }
      for (const item of parsed.items ?? []) {
        if (isDoneItem(item) || isBlockedItem(item)) {
          continue;
        }
        add(item.id, item.title, item.due !== undefined ? "open_with_due" : "open_item");
      }

      const result: NextTasksResult = { tasks };
      return okSkillOutput("deriveNextTasks", result);
    },
  };
}
