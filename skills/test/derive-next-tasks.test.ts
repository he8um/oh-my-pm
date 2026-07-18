import type { SkillInputEnvelope } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createDeriveNextTasksSkill } from "../src/index.js";
import type { NextTasksResult } from "../src/index.js";

const skill = createDeriveNextTasksSkill();

function envelope(input: SkillInputEnvelope["input"], now = "2026-03-01T00:00:00.000Z"): SkillInputEnvelope {
  return { skillId: "deriveNextTasks", context: { locale: "en", now }, input };
}

function tasksOf(input: SkillInputEnvelope["input"], now?: string): NextTasksResult["tasks"] {
  return (skill.execute(envelope(input, now)).output as NextTasksResult).tasks;
}

function doc(id: string, body: string) {
  return { id, title: id, source: "local", type: "document", body };
}

function gh(over: Record<string, unknown>) {
  return { source: "github", ...over };
}

describe("deriveNextTasks — explicit and Markdown", () => {
  it("lists explicit tasks first with a stable reason", () => {
    const tasks = tasksOf({ tasks: [{ id: "t1", title: "Ship it" }] });
    expect(tasks).toEqual([{ id: "t1", title: "Ship it", reason: "explicit", source: "structured" }]);
  });

  it("keeps first-wins dedupe for explicit task ids", () => {
    const tasks = tasksOf({
      tasks: [
        { id: "t1", title: "First" },
        { id: "t1", title: "Duplicate" },
      ],
    });
    expect(tasks).toEqual([{ id: "t1", title: "First", reason: "explicit", source: "structured" }]);
  });

  it("extracts unchecked checkboxes and excludes checked ones", () => {
    const tasks = tasksOf({
      items: [doc("d1", "# Plan\n\n- [ ] Alpha\n- [x] Done\n- [ ] Beta")],
    });
    expect(tasks.map((t) => [t.id, t.title, t.reason])).toEqual([
      ["d1#task-1", "Alpha", "markdown_unchecked_task"],
      ["d1#task-3", "Beta", "markdown_unchecked_task"],
    ]);
  });

  it("extracts list items under an action heading and explicit action markers", () => {
    const tasks = tasksOf({
      items: [
        doc("d1", "## Next Steps\n\n- Draft the spec.\n- Review the plan."),
        doc("d2", "Action: Book the venue."),
      ],
    });
    expect(tasks.map((t) => [t.reason, t.title])).toEqual([
      ["markdown_heading:next_steps", "Draft the spec."],
      ["markdown_heading:next_steps", "Review the plan."],
      ["markdown_marker:action", "Book the venue."],
    ]);
  });

  it("supports Persian action headings and markers", () => {
    const tasks = tasksOf({
      items: [
        doc("fa1", "## اقدامات بعدی\n\n- بازبینی طرح."),
        doc("fa2", "اقدام: ارسال گزارش."),
      ],
    });
    expect(tasks.map((t) => [t.reason, t.title])).toEqual([
      ["markdown_heading:next_steps", "بازبینی طرح."],
      ["markdown_marker:action", "ارسال گزارش."],
    ]);
  });

  it("strips a priority marker from an unchecked task title and records the priority", () => {
    const tasks = tasksOf({ items: [doc("d1", "- [ ] [P0] Fix the outage.")] });
    expect(tasks).toEqual([
      { id: "d1#task-1", title: "Fix the outage.", reason: "markdown_unchecked_task", source: "markdown", priority: "high" },
    ]);
  });

  it("dedupes duplicate local task text within the same document", () => {
    const tasks = tasksOf({ items: [doc("d1", "- [ ] Same task\n- [ ] Same task")] });
    expect(tasks.map((t) => t.title)).toEqual(["Same task"]);
  });

  it("does not treat arbitrary prose or risk-section items as tasks", () => {
    const prose = tasksOf({ items: [doc("d1", "# Notes\n\nThis is just narrative text.")] });
    expect(prose).toEqual([]);
    const riskSection = tasksOf({ items: [doc("d2", "## Risks\n\n- A risk item.")] });
    expect(riskSection).toEqual([]);
  });
});

describe("deriveNextTasks — GitHub", () => {
  it("includes an open issue and open/draft PRs, excluding the repository record", () => {
    const tasks = tasksOf({
      items: [
        gh({ id: "github:repository:o/r", type: "record", kind: "repository", title: "o/r", status: "active", repository: "o/r" }),
        gh({ id: "github:issue:o/r#1", type: "issue", title: "#1 Open issue", status: "open", repository: "o/r", number: 1, url: "https://github.com/o/r/issues/1" }),
        gh({ id: "github:pull-request:o/r#2", type: "pullRequest", kind: "pullRequest", title: "#2 Draft PR", status: "draft", repository: "o/r", number: 2 }),
      ],
    });
    expect(tasks.map((t) => [t.id, t.reason])).toEqual([
      ["github:issue:o/r#1", "github_issue:open"],
      ["github:pull-request:o/r#2", "github_pull_request:draft"],
    ]);
    expect(tasks[0]?.repository).toBe("o/r");
    expect(tasks[0]?.url).toBe("https://github.com/o/r/issues/1");
  });

  it("excludes closed issues, merged/closed PRs, blocked items, and no-action labels", () => {
    const tasks = tasksOf({
      items: [
        gh({ id: "github:issue:o/r#3", type: "issue", title: "#3 Closed", status: "closed", repository: "o/r", number: 3 }),
        gh({ id: "github:pull-request:o/r#4", type: "pullRequest", kind: "pullRequest", title: "#4 Merged", status: "merged", repository: "o/r", number: 4 }),
        gh({ id: "github:issue:o/r#5", type: "issue", title: "#5 Blocked", status: "blocked", repository: "o/r", number: 5 }),
        gh({ id: "github:issue:o/r#6", type: "issue", title: "#6 Dup", status: "open", labels: ["duplicate"], repository: "o/r", number: 6 }),
      ],
    });
    expect(tasks).toEqual([]);
  });

  it("orders GitHub tasks by high, then medium, then low priority in provider order", () => {
    const tasks = tasksOf(
      {
        items: [
          gh({ id: "github:issue:o/r#1", type: "issue", title: "#1 low", status: "open", repository: "o/r", number: 1 }),
          gh({ id: "github:issue:o/r#2", type: "issue", title: "#2 high", status: "open", labels: ["critical"], repository: "o/r", number: 2 }),
          gh({ id: "github:issue:o/r#3", type: "issue", title: "#3 medium", status: "open", labels: ["dependency"], repository: "o/r", number: 3 }),
        ],
      },
      "2026-03-01T00:00:00.000Z",
    );
    expect(tasks.map((t) => [t.id, t.priority])).toEqual([
      ["github:issue:o/r#2", "high"],
      ["github:issue:o/r#3", "medium"],
      ["github:issue:o/r#1", "low"],
    ]);
  });
});

describe("deriveNextTasks — limits and purity", () => {
  it("caps at 10 tasks", () => {
    const items = Array.from({ length: 15 }, (_v, i) =>
      gh({ id: `github:issue:o/r#${i + 1}`, type: "issue", title: `#${i + 1} open`, status: "open", repository: "o/r", number: i + 1 }),
    );
    expect(tasksOf({ items }).length).toBe(10);
  });

  it("is deterministic across repeated runs and does not mutate input", () => {
    const input = { items: [doc("d1", "## Tasks\n\n- [ ] One\n- [ ] Two")] };
    const snapshot = JSON.parse(JSON.stringify(input));
    const first = tasksOf(structuredClone(input));
    const second = tasksOf(structuredClone(input));
    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
  });

  it("rejects the wrong skill id", () => {
    const out = skill.execute({ skillId: "extractRisks", context: { locale: "en", now: "t0" }, input: {} });
    expect(out.ok).toBe(false);
  });
});
