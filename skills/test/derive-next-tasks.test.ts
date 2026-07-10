import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createDeriveNextTasksSkill } from "../src/index.js";
import type { NextTasksResult } from "../src/index.js";

const skill = createDeriveNextTasksSkill();

function envelope(input: SkillInputEnvelope["input"]): SkillInputEnvelope {
  return { skillId: "deriveNextTasks", context: { locale: "en", now: "t0" }, input };
}

function tasksOf(input: SkillInputEnvelope["input"]): NextTasksResult["tasks"] {
  return (skill.execute(envelope(input)).output as NextTasksResult).tasks;
}

describe("deriveNextTasks", () => {
  it("includes explicit tasks first", () => {
    const tasks = tasksOf({
      tasks: [{ id: "t1", title: "Prepare demo" }],
      items: [{ id: "i1", title: "Open item" }],
    });
    expect(tasks.map((t) => t.id)).toEqual(["t1", "i1"]);
    expect(tasks[0]?.reason).toBe("explicit");
  });

  it("excludes done and blocked items", () => {
    const tasks = tasksOf({
      items: [
        { id: "1", title: "Done work", status: "done" },
        { id: "2", title: "Blocked work", status: "blocked" },
        { id: "3", title: "Open work" },
      ],
    });
    expect(tasks.map((t) => t.id)).toEqual(["3"]);
  });

  it("caps at five tasks", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, title: `Item ${i}` }));
    expect(tasksOf({ items })).toHaveLength(5);
  });

  it("uses open_with_due and open_item reasons", () => {
    const tasks = tasksOf({
      items: [
        { id: "1", title: "Due soon", due: "2026-02-01" },
        { id: "2", title: "No due" },
      ],
    });
    expect(tasks.map((t) => t.reason)).toEqual(["open_with_due", "open_item"]);
  });
});
