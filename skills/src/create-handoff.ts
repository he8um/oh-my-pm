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
import { classifyGitHubCommentRisks, classifyGitHubCommentTasks } from "./project-signals.js";
import type { HandoffResult, Skill, TextItem } from "./types.js";

const MAX_SECTION_ITEMS = 5;

// A GitHub item-comment is exactly source=github, type=note, kind=issueComment.
function isGitHubCommentItem(item: TextItem): boolean {
  return (
    item.source === "github" &&
    item.type === "note" &&
    (item.kind ?? "").trim().toLowerCase() === "issuecomment"
  );
}

/** Prefix a comment-derived line with its author, e.g. `@alice: text`. */
function commentPrefixed(item: TextItem, text: string): string {
  const author = (item.author ?? "").trim();
  return author === "" ? text : `@${author}: ${text}`;
}

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

/** Deterministic open-tasks list from explicit tasks, checkboxes, items, then
 * bounded comment action items (author-prefixed). */
function openTasks(parsed: {
  tasks?: TextItem[];
  items?: TextItem[];
}): string[] {
  const items = parsed.items ?? [];
  // Comments are handled separately (author-prefixed); exclude them from the
  // document-level checkbox/operational scans so they are not double-counted.
  const documentItems = items.filter((item) => !isGitHubCommentItem(item));
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
  for (const task of collectMarkdownUncheckedTasks(documentItems)) {
    add(task.id, task.title);
  }
  for (const item of documentItems) {
    if (isOperationalOpenItem(item)) {
      add(item.id, item.title);
    }
  }
  // Comment-derived action items last, author-prefixed and bounded.
  for (const item of items) {
    if (!isGitHubCommentItem(item)) continue;
    for (const task of classifyGitHubCommentTasks(item)) {
      add(task.id, commentPrefixed(item, task.title));
    }
  }
  return titles;
}

/** Explicit declaration titles first, Markdown section content, then bounded
 * comment-derived section content (author-prefixed). */
function declaredThenMarkdown(
  explicit: readonly TextItem[] | undefined,
  items: readonly TextItem[],
  headings: readonly string[],
  commentSection: "risks" | "decisions" | null,
): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();
  // Comments contribute only through the author-prefixed pass below; the
  // document-level section scan must not see them (no double-counting).
  const documentItems = items.filter((item) => !isGitHubCommentItem(item));
  for (const entry of explicit ?? []) {
    pushDeduped(collected, seen, entry.title);
  }
  for (const text of collectMarkdownSectionItems(documentItems, headings)) {
    pushDeduped(collected, seen, text);
  }
  if (commentSection !== null) {
    for (const item of items) {
      if (!isGitHubCommentItem(item)) continue;
      if (commentSection === "risks") {
        for (const risk of classifyGitHubCommentRisks(item)) {
          pushDeduped(collected, seen, commentPrefixed(item, risk.title));
        }
      } else {
        // Decisions: only recognized decision-heading content from the comment.
        for (const text of collectMarkdownSectionItems([item], headings)) {
          pushDeduped(collected, seen, commentPrefixed(item, text));
        }
      }
    }
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
      // Comments are conversation context, not project documents: they never
      // influence the title, Summary, or top-level Markdown section inference.
      const documentItems = items.filter((item) => !isGitHubCommentItem(item));

      // Title: a Markdown project title from the first document wins, then an
      // explicit title, then a fixed fallback. The Runtime request string is
      // never used as the title when project documents are present.
      const projectTitle = inferMarkdownProjectTitle(documentItems);
      const title = projectTitle ?? parsed.title ?? "Project handoff";

      // Summary: prefer Markdown objective/active/milestone content. Only when
      // Markdown yields nothing does an explicit summary apply; the Runtime
      // request summary is not project content.
      const summaryItems = collectMarkdownSectionItems(documentItems, SUMMARY_HEADINGS);
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
              declaredThenMarkdown(parsed.risks, items, RISK_HEADINGS, "risks"),
              "No risks listed.",
            ),
          },
          {
            heading: "Decisions",
            items: sectionOrFallback(
              declaredThenMarkdown(parsed.decisions, items, DECISION_HEADINGS, "decisions"),
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
