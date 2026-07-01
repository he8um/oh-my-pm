import { parseRateLimitHeaders, classifyStateType, extractDeliveryTags } from "../src/connectors/linear/formatters";
import { excerptDescription, clampMaxItems } from "../src/connectors/linear/limits";
import type { LinearIssue } from "../src/connectors/linear/types";

describe("parseRateLimitHeaders", () => {
  it("parses valid rate limit headers", () => {
    const info = parseRateLimitHeaders({ "x-ratelimit-requests-remaining": "42" });
    expect(info.remaining).toBe(42);
    expect(info.warning).toBe(false);
  });

  it("sets warning: true when remaining is below 10", () => {
    const info = parseRateLimitHeaders({ "x-ratelimit-requests-remaining": "5" });
    expect(info.warning).toBe(true);
  });

  it("handles missing headers gracefully", () => {
    const info = parseRateLimitHeaders({ "x-ratelimit-requests-remaining": null });
    expect(typeof info.remaining).toBe("number");
    expect(info.warning).toBe(false);
  });
});

describe("classifyStateType", () => {
  it("classifies known Linear state types", () => {
    expect(classifyStateType("started")).toBe("started");
    expect(classifyStateType("completed")).toBe("completed");
    expect(classifyStateType("canceled")).toBe("canceled");
  });

  it("classifies unrecognized types as unknown", () => {
    expect(classifyStateType("something-else")).toBe("unknown");
    expect(classifyStateType("")).toBe("unknown");
  });
});

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: "issue-1",
    identifier: "ENG-1",
    title: "Test issue",
    state_name: "In Progress",
    state_type: "started",
    assignee: "alice",
    priority_label: "High",
    estimate: 3,
    cycle_name: "Cycle 12",
    labels: [],
    updated_at: new Date().toISOString(),
    description_excerpt: null,
    url: "https://linear.app/team/issue/ENG-1",
    ...overrides,
  };
}

describe("extractDeliveryTags", () => {
  it("tags blocked state names", () => {
    const issue = makeIssue({ state_name: "Blocked" });
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

  it("tags issues missing an estimate", () => {
    const issue = makeIssue({ estimate: null });
    expect(extractDeliveryTags(issue)).toContain("missing_estimate");
  });

  it("tags issues missing a cycle", () => {
    const issue = makeIssue({ cycle_name: null });
    expect(extractDeliveryTags(issue)).toContain("missing_cycle");
  });

  it("tags issues with no priority", () => {
    const issue = makeIssue({ priority_label: "No priority" });
    expect(extractDeliveryTags(issue)).toContain("missing_priority");
  });

  it("tags issues with an unclear state type", () => {
    const issue = makeIssue({ state_type: "unknown" });
    expect(extractDeliveryTags(issue)).toContain("unclear_state");
  });

  it("tags stale open issues (no update in 14+ days)", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const issue = makeIssue({ updated_at: oldDate.toISOString() });
    expect(extractDeliveryTags(issue)).toContain("stale");
  });

  it("does not tag completed issues as stale", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const issue = makeIssue({ updated_at: oldDate.toISOString(), state_type: "completed" });
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
