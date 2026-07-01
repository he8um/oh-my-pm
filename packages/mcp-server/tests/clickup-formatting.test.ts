import {
  parseRateLimitHeaders,
  classifyStatusType,
  extractDeliveryTags,
} from "../src/connectors/clickup/formatters";
import { excerptDescription, clampMaxItems } from "../src/connectors/clickup/limits";
import type { ClickUpTask } from "../src/connectors/clickup/types";

describe("parseRateLimitHeaders", () => {
  it("parses valid rate limit headers", () => {
    const info = parseRateLimitHeaders({
      "x-ratelimit-remaining": "42",
      "x-ratelimit-limit": "100",
    });
    expect(info.remaining).toBe(42);
    expect(info.limit).toBe(100);
    expect(info.warning).toBe(false);
  });

  it("sets warning: true when remaining is below 10", () => {
    const info = parseRateLimitHeaders({
      "x-ratelimit-remaining": "5",
      "x-ratelimit-limit": "100",
    });
    expect(info.warning).toBe(true);
  });

  it("handles missing headers gracefully", () => {
    const info = parseRateLimitHeaders({
      "x-ratelimit-remaining": null,
      "x-ratelimit-limit": null,
    });
    expect(typeof info.remaining).toBe("number");
    expect(info.warning).toBe(false);
  });
});

describe("classifyStatusType", () => {
  it("classifies closed-like statuses as closed", () => {
    expect(classifyStatusType("closed")).toBe("closed");
    expect(classifyStatusType("Complete")).toBe("closed");
    expect(classifyStatusType("done")).toBe("closed");
  });

  it("classifies other statuses as open", () => {
    expect(classifyStatusType("in progress")).toBe("open");
    expect(classifyStatusType("to do")).toBe("open");
  });

  it("classifies empty status as unknown", () => {
    expect(classifyStatusType("")).toBe("unknown");
  });
});

function makeTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: "task-1",
    name: "Test task",
    status: "in progress",
    status_type: "open",
    assignees: ["alice"],
    priority: null,
    due_date: null,
    date_updated: new Date().toISOString(),
    description_excerpt: null,
    url: "https://app.clickup.com/t/task-1",
    ...overrides,
  };
}

describe("extractDeliveryTags", () => {
  it("tags blocked status", () => {
    const task = makeTask({ status: "blocked" });
    expect(extractDeliveryTags(task)).toContain("blocked");
  });

  it("tags unassigned tasks", () => {
    const task = makeTask({ assignees: [] });
    expect(extractDeliveryTags(task)).toContain("unassigned");
  });

  it("tags tasks missing a due date", () => {
    const task = makeTask({ due_date: null });
    expect(extractDeliveryTags(task)).toContain("missing_due_date");
  });

  it("tags overdue open tasks", () => {
    const task = makeTask({
      status_type: "open",
      due_date: new Date("2000-01-01").toISOString(),
    });
    expect(extractDeliveryTags(task)).toContain("overdue");
  });

  it("tags stale tasks (no update in 14+ days)", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const task = makeTask({ date_updated: oldDate.toISOString() });
    expect(extractDeliveryTags(task)).toContain("stale");
  });

  it("returns no tags for a healthy task", () => {
    const task = makeTask({
      assignees: ["bob"],
      due_date: new Date("2099-01-01").toISOString(),
      date_updated: new Date().toISOString(),
      status: "in progress",
    });
    expect(extractDeliveryTags(task)).toEqual([]);
  });
});

describe("excerptDescription", () => {
  it("returns null for null input", () => {
    expect(excerptDescription(null)).toBeNull();
  });

  it("returns full text when under limit", () => {
    expect(excerptDescription("short description")).toBe("short description");
  });

  it("truncates long descriptions and appends marker", () => {
    const long = "x".repeat(600);
    const result = excerptDescription(long)!;
    expect(result).toContain("[truncated]");
    expect(result.length).toBeLessThan(600);
  });
});

describe("clampMaxItems", () => {
  it("returns default when undefined", () => {
    expect(clampMaxItems(undefined)).toBe(25);
  });

  it("clamps above hard max to 100", () => {
    expect(clampMaxItems(999)).toBe(100);
  });

  it("clamps below 1 to 1", () => {
    expect(clampMaxItems(0)).toBe(1);
  });

  it("returns value within bounds unchanged", () => {
    expect(clampMaxItems(50)).toBe(50);
  });
});
