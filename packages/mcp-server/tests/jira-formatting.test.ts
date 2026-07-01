import { parseRateLimitHeaders, classifyStatusCategory, extractDeliveryTags } from "../src/connectors/jira/formatters";
import { excerptDescription, clampMaxItems } from "../src/connectors/jira/limits";
import type { JiraIssue } from "../src/connectors/jira/types";

describe("parseRateLimitHeaders", () => {
  it("parses valid rate limit headers", () => {
    const info = parseRateLimitHeaders({ "x-ratelimit-remaining": "42", "retry-after": null });
    expect(info.remaining).toBe(42);
    expect(info.warning).toBe(false);
    expect(info.retry_after).toBeNull();
  });

  it("sets warning: true when remaining is below 10", () => {
    const info = parseRateLimitHeaders({ "x-ratelimit-remaining": "5", "retry-after": "30" });
    expect(info.warning).toBe(true);
    expect(info.retry_after).toBe("30");
  });

  it("handles missing headers gracefully", () => {
    const info = parseRateLimitHeaders({ "x-ratelimit-remaining": null, "retry-after": null });
    expect(typeof info.remaining).toBe("number");
    expect(info.warning).toBe(false);
  });
});

describe("classifyStatusCategory", () => {
  it("classifies known Jira status category keys", () => {
    expect(classifyStatusCategory("new")).toBe("todo");
    expect(classifyStatusCategory("indeterminate")).toBe("in_progress");
    expect(classifyStatusCategory("done")).toBe("done");
  });

  it("classifies unrecognized category keys as unknown", () => {
    expect(classifyStatusCategory("something-else")).toBe("unknown");
    expect(classifyStatusCategory("")).toBe("unknown");
  });
});

function makeIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: "10001",
    key: "PROJ-1",
    summary: "Test issue",
    status_name: "In Progress",
    status_category: "in_progress",
    assignee: "alice",
    priority: "High",
    story_points: 3,
    sprint_name: "Sprint 12",
    labels: [],
    due_date: null,
    updated_at: new Date().toISOString(),
    description_excerpt: null,
    url: "https://example.atlassian.net/browse/PROJ-1",
    ...overrides,
  };
}

describe("extractDeliveryTags", () => {
  it("tags blocked status names", () => {
    const issue = makeIssue({ status_name: "Blocked" });
    expect(extractDeliveryTags(issue)).toContain("blocked");
  });

  it("tags issues with a blocked label", () => {
    const issue = makeIssue({ labels: ["blocked-by-vendor"] });
    expect(extractDeliveryTags(issue)).toContain("blocked");
  });

  it("tags unassigned issues", () => {
    const issue = makeIssue({ assignee: null });
    expect(extractDeliveryTags(issue)).toContain("unassigned");
  });

  it("tags issues missing a story point estimate", () => {
    const issue = makeIssue({ story_points: null });
    expect(extractDeliveryTags(issue)).toContain("missing_estimate");
  });

  it("tags issues missing a sprint", () => {
    const issue = makeIssue({ sprint_name: null });
    expect(extractDeliveryTags(issue)).toContain("missing_sprint");
  });

  it("tags issues with no priority", () => {
    const issue = makeIssue({ priority: null });
    expect(extractDeliveryTags(issue)).toContain("missing_priority");
  });

  it("tags issues with an unclear status category", () => {
    const issue = makeIssue({ status_category: "unknown" });
    expect(extractDeliveryTags(issue)).toContain("unclear_status");
  });

  it("tags overdue open issues", () => {
    const issue = makeIssue({ status_category: "in_progress", due_date: "2000-01-01" });
    expect(extractDeliveryTags(issue)).toContain("overdue");
  });

  it("does not tag done issues as overdue", () => {
    const issue = makeIssue({ status_category: "done", due_date: "2000-01-01" });
    expect(extractDeliveryTags(issue)).not.toContain("overdue");
  });

  it("tags stale open issues (no update in 14+ days)", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const issue = makeIssue({ updated_at: oldDate.toISOString() });
    expect(extractDeliveryTags(issue)).toContain("stale");
  });

  it("does not tag done issues as stale", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const issue = makeIssue({ updated_at: oldDate.toISOString(), status_category: "done" });
    expect(extractDeliveryTags(issue)).not.toContain("stale");
  });

  it("returns no tags for a healthy issue", () => {
    const issue = makeIssue();
    expect(extractDeliveryTags(issue)).toEqual([]);
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
