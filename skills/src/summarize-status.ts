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
import type { Skill, StatusSummary, TextItem } from "./types.js";

// A bounded GitHub discussion note is source=github, type=note, and one of the
// discussion kinds (issueComment, pullRequestReview, pullRequestReviewComment).
// These are conversation context: they never change status counts and their
// generated titles never become highlights.
const DISCUSSION_NOTE_KINDS = new Set([
  "issuecomment",
  "pullrequestreview",
  "pullrequestreviewcomment",
]);

function isDiscussionNote(item: TextItem): boolean {
  return (
    item.source === "github" &&
    item.type === "note" &&
    DISCUSSION_NOTE_KINDS.has((item.kind ?? "").trim().toLowerCase())
  );
}

export function createSummarizeStatusSkill(): Skill {
  return {
    descriptor: {
      id: "summarizeStatus",
      name: "Summarize status",
      deterministic: true,
      readOnly: true,
    },
    execute(input: SkillInputEnvelope) {
      if (input.skillId !== "summarizeStatus") {
        return failSkillOutput(
          "summarizeStatus",
          OMP_S_SKILL_MISMATCH,
          `expected skillId summarizeStatus, received ${input.skillId}`,
        );
      }
      const parsed = skillInputObject(input);
      if (parsed === null) {
        return failSkillOutput(
          "summarizeStatus",
          OMP_S_INVALID_INPUT,
          "skill input must be an object",
        );
      }

      const notes = parsed.notes ?? [];
      // Discussion notes (comments, reviews, review comments) are excluded from
      // every count and from highlights.
      const items = (parsed.items ?? []).filter((item) => !isDiscussionNote(item));

      let done = 0;
      let blocked = 0;
      for (const item of items) {
        if (isDoneItem(item)) {
          done += 1;
        } else if (isBlockedItem(item)) {
          blocked += 1;
        }
      }

      const summary: StatusSummary = {
        title: parsed.title ?? "Project status",
        summary: parsed.summary ?? "",
        counts: {
          total: items.length,
          done,
          blocked,
          open: items.length - done - blocked,
        },
        highlights:
          notes.length > 0 ? notes.slice(0, 3) : items.slice(0, 3).map((item) => item.title),
        generatedAt: input.context.now,
      };

      return okSkillOutput("summarizeStatus", summary);
    },
  };
}
