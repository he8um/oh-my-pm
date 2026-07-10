import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createReviewChangesSkill } from "../src/index.js";
import type { ReviewChangesResult } from "../src/index.js";

const skill = createReviewChangesSkill();

function envelope(input: SkillInputEnvelope["input"]): SkillInputEnvelope {
  return { skillId: "reviewChanges", context: { locale: "en", now: "t0" }, input };
}

function changesOf(input: SkillInputEnvelope["input"]): ReviewChangesResult["changes"] {
  return (skill.execute(envelope(input)).output as ReviewChangesResult).changes;
}

describe("reviewChanges", () => {
  it("classifies blocked, added, updated, and unknown", () => {
    const changes = changesOf({
      changes: [
        { id: "1", title: "Deploy", status: "blocked" },
        { id: "2", title: "New endpoint", tags: ["added"] },
        { id: "3", title: "Docs modified" },
        { id: "4", title: "Mystery" },
      ],
    });
    expect(changes.map((c) => c.classification)).toEqual([
      "blocked",
      "added",
      "updated",
      "unknown",
    ]);
  });

  it("prefers blocked over added when both match", () => {
    const changes = changesOf({
      changes: [{ id: "1", title: "new feature", status: "blocked" }],
    });
    expect(changes[0]?.classification).toBe("blocked");
  });

  it("uses changes before falling back to items", () => {
    const changes = changesOf({
      changes: [{ id: "c1", title: "created api" }],
      items: [{ id: "i1", title: "updated docs" }],
    });
    expect(changes.map((c) => c.id)).toEqual(["c1"]);
  });

  it("falls back to items when changes are absent", () => {
    const changes = changesOf({
      items: [{ id: "i1", title: "updated docs" }],
    });
    expect(changes).toEqual([{ id: "i1", title: "updated docs", classification: "updated" }]);
  });

  it("keeps input order", () => {
    const changes = changesOf({
      changes: [
        { id: "b", title: "changed config" },
        { id: "a", title: "added tests" },
      ],
    });
    expect(changes.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
