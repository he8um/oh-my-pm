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
import type { NextTasksResult, Skill, TextItem } from "./types.js";

const MAX_TASKS = 5;

// Single-line unchecked checklist entries: -, *, or + bullets, optional
// leading whitespace, optional spaces inside the empty brackets, and a
// non-empty title. Checked entries ([x]/[X]) intentionally do not match.
const UNCHECKED_TASK_LINE = /^\s*[-*+]\s+\[\s*\]\s+(.+)$/;

type MarkdownTaskCandidate = {
  id: string;
  title: string;
  reason: "markdown_unchecked_task";
};

/** Unchecked Markdown checklist entries from an item body, in line order. */
function markdownUncheckedTasks(item: TextItem): MarkdownTaskCandidate[] {
  if (item.body === undefined) {
    return [];
  }
  const candidates: MarkdownTaskCandidate[] = [];
  let sequence = 0;
  for (const line of item.body.split(/\r?\n/)) {
    const match = UNCHECKED_TASK_LINE.exec(line);
    if (match === null) {
      continue;
    }
    const title = (match[1] ?? "").trim();
    if (title === "") {
      continue;
    }
    sequence += 1;
    candidates.push({
      id: `${item.id}#task-${sequence}`,
      title,
      reason: "markdown_unchecked_task",
    });
  }
  return candidates;
}

/** Structured fallback applies only to items carrying operational metadata. */
function hasOperationalField(item: TextItem): boolean {
  return (
    item.status !== undefined ||
    item.owner !== undefined ||
    item.due !== undefined ||
    (item.tags !== undefined && item.tags.length > 0)
  );
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
        for (const candidate of markdownUncheckedTasks(item)) {
          add(candidate.id, candidate.title, candidate.reason);
        }
      }
      for (const item of parsed.items ?? []) {
        // Generic titles alone are not tasks: the structured fallback needs
        // at least one operational field and skips done/blocked items.
        if (!hasOperationalField(item) || isDoneItem(item) || isBlockedItem(item)) {
          continue;
        }
        add(item.id, item.title, item.due !== undefined ? "open_with_due" : "open_item");
      }

      const result: NextTasksResult = { tasks };
      return okSkillOutput("deriveNextTasks", result);
    },
  };
}
