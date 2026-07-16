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

describe("deriveNextTasks explicit tasks", () => {
  it("includes explicit tasks first", () => {
    const tasks = tasksOf({
      tasks: [{ id: "t1", title: "Prepare demo" }],
      items: [{ id: "i1", title: "Open item", status: "open" }],
    });
    expect(tasks.map((t) => t.id)).toEqual(["t1", "i1"]);
    expect(tasks[0]?.reason).toBe("explicit");
  });

  it("keeps first-wins dedupe for explicit task ids", () => {
    const tasks = tasksOf({
      tasks: [
        { id: "t1", title: "First title" },
        { id: "t1", title: "Duplicate title" },
      ],
    });
    expect(tasks).toEqual([{ id: "t1", title: "First title", reason: "explicit" }]);
  });
});

describe("deriveNextTasks markdown checkbox extraction", () => {
  it("extracts dash, star, and plus unchecked checkboxes", () => {
    const tasks = tasksOf({
      items: [
        {
          id: "docs/a.md",
          title: "A",
          body: ["- [ ] Dash task", "* [ ] Star task", "+ [ ] Plus task"].join("\n"),
        },
      ],
    });
    expect(tasks).toEqual([
      { id: "docs/a.md#task-1", title: "Dash task", reason: "markdown_unchecked_task" },
      { id: "docs/a.md#task-2", title: "Star task", reason: "markdown_unchecked_task" },
      { id: "docs/a.md#task-3", title: "Plus task", reason: "markdown_unchecked_task" },
    ]);
  });

  it("allows leading whitespace and spaces inside the brackets", () => {
    const tasks = tasksOf({
      items: [
        {
          id: "d",
          title: "D",
          body: ["   - [ ] Indented task", "- [  ] Wide bracket task"].join("\n"),
        },
      ],
    });
    expect(tasks.map((t) => t.title)).toEqual(["Indented task", "Wide bracket task"]);
  });

  it("ignores checked tasks with lowercase and uppercase x", () => {
    const tasks = tasksOf({
      items: [
        {
          id: "d",
          title: "D",
          body: ["- [x] Done lower", "- [X] Done upper", "- [ ] Still open"].join("\n"),
        },
      ],
    });
    expect(tasks.map((t) => t.title)).toEqual(["Still open"]);
  });

  it("ignores empty checkbox titles", () => {
    const tasks = tasksOf({
      items: [
        { id: "d", title: "D", body: ["- [ ]", "- [ ]   ", "- [ ] Real task"].join("\n") },
      ],
    });
    expect(tasks).toEqual([
      { id: "d#task-1", title: "Real task", reason: "markdown_unchecked_task" },
    ]);
  });

  it("preserves line order and keeps ids contiguous per document", () => {
    const tasks = tasksOf({
      items: [
        {
          id: "docs/plan.md",
          title: "Plan",
          body: ["- [ ] First", "- [x] Skipped", "- [ ] Second", "text", "- [ ] Third"].join("\n"),
        },
      ],
    });
    expect(tasks).toEqual([
      { id: "docs/plan.md#task-1", title: "First", reason: "markdown_unchecked_task" },
      { id: "docs/plan.md#task-2", title: "Second", reason: "markdown_unchecked_task" },
      { id: "docs/plan.md#task-3", title: "Third", reason: "markdown_unchecked_task" },
    ]);
  });

  it("returns no markdown tasks when the body is absent", () => {
    expect(tasksOf({ items: [{ id: "d", title: "No body" }] })).toEqual([]);
  });

  it("places markdown tasks before the structured fallback", () => {
    const tasks = tasksOf({
      items: [
        { id: "i1", title: "Operational item", status: "open" },
        { id: "docs/a.md", title: "A", body: "- [ ] Checklist task" },
      ],
    });
    expect(tasks.map((t) => t.reason)).toEqual(["markdown_unchecked_task", "open_item"]);
    expect(tasks.map((t) => t.id)).toEqual(["docs/a.md#task-1", "i1"]);
  });
});

describe("deriveNextTasks structured fallback", () => {
  it("does not turn a plain document title into a task", () => {
    const tasks = tasksOf({
      items: [{ id: "docs/readme.md", title: "Project Guide", body: "Just prose." }],
    });
    expect(tasks).toEqual([]);
  });

  it("returns metadata-bearing open items as fallback tasks", () => {
    const tasks = tasksOf({
      items: [
        { id: "1", title: "Owned work", owner: "sam" },
        { id: "2", title: "Tagged work", tags: ["planning"] },
        { id: "3", title: "Due work", due: "2026-08-01" },
      ],
    });
    expect(tasks.map((t) => t.reason)).toEqual(["open_item", "open_item", "open_with_due"]);
  });

  it("skips done and blocked structured items", () => {
    const tasks = tasksOf({
      items: [
        { id: "1", title: "Done work", status: "done" },
        { id: "2", title: "Blocked work", status: "blocked" },
        { id: "3", title: "Open work", status: "open" },
      ],
    });
    expect(tasks.map((t) => t.id)).toEqual(["3"]);
  });

  it("uses open_with_due and open_item reasons", () => {
    const tasks = tasksOf({
      items: [
        { id: "1", title: "Due soon", due: "2026-02-01" },
        { id: "2", title: "No due", status: "open" },
      ],
    });
    expect(tasks.map((t) => t.reason)).toEqual(["open_with_due", "open_item"]);
  });
});

describe("deriveNextTasks limits and purity", () => {
  it("caps at five tasks", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `i${i}`,
      title: `Item ${i}`,
      status: "open",
    }));
    expect(tasksOf({ items })).toHaveLength(5);
  });

  it("caps markdown extraction at five tasks", () => {
    const body = Array.from({ length: 8 }, (_, i) => `- [ ] Task ${i}`).join("\n");
    const tasks = tasksOf({ items: [{ id: "d", title: "D", body }] });
    expect(tasks).toHaveLength(5);
    expect(tasks[4]?.id).toBe("d#task-5");
  });

  it("does not mutate the input items", () => {
    const input = {
      items: [{ id: "d", title: "D", body: "- [ ] Task", status: "open" }],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    tasksOf(input);
    expect(input).toEqual(snapshot);
  });
});
