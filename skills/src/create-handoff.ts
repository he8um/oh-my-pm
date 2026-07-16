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
import {
  collectMarkdownSectionItems,
  collectMarkdownUncheckedTasks,
  inferMarkdownProjectTitle,
} from "./markdown-project.js";
import type { HandoffResult, Skill, TextItem } from "./types.js";

const MAX_SECTION_ITEMS = 5;

// Normalized Markdown heading aliases per handoff section. Summary blends the
// current objective, active work, and next milestone; risks blend explicit
// risk, blocker, and constraint headings; decisions read from decision logs.
const SUMMARY_HEADINGS = [
  "summary",
  "overview",
  "current objective",
  "objective",
  "active",
  "current status",
  "next milestone",
] as const;

const RISK_HEADINGS = [
  "risk",
  "risks",
  "blocked",
  "blocker",
  "blockers",
  "constraint",
  "constraints",
  "delivery constraints",
] as const;

const DECISION_HEADINGS = [
  "decision",
  "decisions",
  "decision log",
] as const;

/** Push trimmed non-empty text, deduped by prior text, up to the cap. */
function pushDeduped(target: string[], seen: Set<string>, text: string): void {
  const trimmed = text.trim();
  if (trimmed === "" || seen.has(trimmed) || target.length >= MAX_SECTION_ITEMS) {
    return;
  }
  seen.add(trimmed);
  target.push(trimmed);
}

function sectionOrFallback(items: readonly string[], fallback: string): string[] {
  return items.length > 0 ? items.slice(0, MAX_SECTION_ITEMS) : [fallback];
}

/** Structured operational items surface only when they carry real metadata. */
function isOperationalOpenItem(item: TextItem): boolean {
  const hasMetadata =
    item.status !== undefined ||
    item.owner !== undefined ||
    item.due !== undefined ||
    (item.tags !== undefined && item.tags.length > 0);
  return hasMetadata && !isDoneItem(item) && !isBlockedItem(item);
}

/** Deterministic open-tasks list from explicit tasks, checkboxes, then items. */
function openTasks(parsed: {
  tasks?: TextItem[];
  items?: TextItem[];
}): string[] {
  const items = parsed.items ?? [];
  const titles: string[] = [];
  const seenText = new Set<string>();
  const seenIds = new Set<string>();

  const add = (id: string | undefined, title: string): void => {
    if (id !== undefined && seenIds.has(id)) {
      return;
    }
    if (id !== undefined) {
      seenIds.add(id);
    }
    pushDeduped(titles, seenText, title);
  };

  for (const task of parsed.tasks ?? []) {
    add(task.id, task.title);
  }
  for (const task of collectMarkdownUncheckedTasks(items)) {
    add(task.id, task.title);
  }
  for (const item of items) {
    if (isOperationalOpenItem(item)) {
      add(item.id, item.title);
    }
  }
  return titles;
}

/** Explicit declaration titles first, then Markdown section content. */
function declaredThenMarkdown(
  explicit: readonly TextItem[] | undefined,
  items: readonly TextItem[],
  headings: readonly string[],
): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();
  for (const entry of explicit ?? []) {
    pushDeduped(collected, seen, entry.title);
  }
  for (const text of collectMarkdownSectionItems(items, headings)) {
    pushDeduped(collected, seen, text);
  }
  return collected;
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

      const items = parsed.items ?? [];

      // Title: a Markdown project title from the first document wins, then an
      // explicit title, then a fixed fallback. The Runtime request string is
      // never used as the title when project documents are present.
      const projectTitle = inferMarkdownProjectTitle(items);
      const title = projectTitle ?? parsed.title ?? "Project handoff";

      // Summary: prefer Markdown objective/active/milestone content. Only when
      // Markdown yields nothing does an explicit summary apply; the Runtime
      // request summary is not project content.
      const summaryItems = collectMarkdownSectionItems(items, SUMMARY_HEADINGS);
      const summary =
        summaryItems.length > 0
          ? summaryItems.slice(0, MAX_SECTION_ITEMS)
          : parsed.summary !== undefined
            ? [parsed.summary]
            : ["No project summary found."];

      const result: HandoffResult = {
        title,
        sections: [
          { heading: "Summary", items: summary },
          {
            heading: "Open Tasks",
            items: sectionOrFallback(openTasks(parsed), "No open tasks."),
          },
          {
            heading: "Risks",
            items: sectionOrFallback(
              declaredThenMarkdown(parsed.risks, items, RISK_HEADINGS),
              "No risks listed.",
            ),
          },
          {
            heading: "Decisions",
            items: sectionOrFallback(
              declaredThenMarkdown(parsed.decisions, items, DECISION_HEADINGS),
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
