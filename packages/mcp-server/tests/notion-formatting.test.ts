import { extractDataQualityTags } from "../src/connectors/notion/formatters";
import { excerptText, clampMaxItems } from "../src/connectors/notion/limits";

function makeItem(overrides: Partial<{ properties: Record<string, unknown>; last_edited_time: string | null }> = {}) {
  return {
    properties: {
      Name: { title: [{ plain_text: "Test item" }] },
      Owner: { people: [{ id: "user-1" }] },
      Status: { status: { name: "In Progress" } },
      "Due Date": { date: { start: "2099-01-01" } },
    },
    last_edited_time: new Date().toISOString(),
    ...overrides,
  };
}

describe("extractDataQualityTags", () => {
  it("tags items with an empty owner-like property", () => {
    const item = makeItem({ properties: { Name: { title: [] }, Owner: { people: [] } } });
    expect(extractDataQualityTags(item)).toContain("missing_owner");
  });

  it("tags items with an empty due-date-like property", () => {
    const item = makeItem({ properties: { Name: { title: [] }, "Due Date": { date: null } } });
    expect(extractDataQualityTags(item)).toContain("missing_due_date");
  });

  it("tags items with no recognizable status property", () => {
    const item = makeItem({ properties: { Name: { title: [] } } });
    expect(extractDataQualityTags(item)).toContain("missing_status");
  });

  it("tags items with an empty status property", () => {
    const item = makeItem({ properties: { Name: { title: [] }, Status: { status: null } } });
    expect(extractDataQualityTags(item)).toContain("missing_status");
  });

  it("does not tag missing_status when a status value is present", () => {
    const item = makeItem();
    expect(extractDataQualityTags(item)).not.toContain("missing_status");
  });

  it("tags stale items (no edit signal in 14+ days)", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const item = makeItem({ last_edited_time: oldDate.toISOString() });
    expect(extractDataQualityTags(item)).toContain("stale");
  });

  it("returns only missing_status for a fully healthy item with no stale signal", () => {
    const item = makeItem();
    const tags = extractDataQualityTags(item);
    expect(tags).not.toContain("missing_owner");
    expect(tags).not.toContain("missing_due_date");
    expect(tags).not.toContain("stale");
  });
});

describe("excerptText", () => {
  it("returns null for null input", () => {
    expect(excerptText(null)).toBeNull();
  });

  it("returns full text when under limit", () => {
    expect(excerptText("short text")).toBe("short text");
  });

  it("truncates long text and appends marker", () => {
    const long = "x".repeat(600);
    const result = excerptText(long)!;
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
