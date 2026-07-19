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

// A GitHub item-comment is exactly source=github, type=note, kind=issueComment.
// Comment notes are conversation context: they never change status counts and
// their titles never become highlights.
function isGitHubCommentItem(item: TextItem): boolean {
  return (
    item.source === "github" &&
    item.type === "note" &&
    (item.kind ?? "").trim().toLowerCase() === "issuecomment"
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
      // Comment notes are excluded from every count and from highlights.
      const items = (parsed.items ?? []).filter((item) => !isGitHubCommentItem(item));

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
