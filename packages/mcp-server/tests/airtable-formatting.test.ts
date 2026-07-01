import { extractDataQualityTags } from "../src/connectors/airtable/formatters";
import { excerptFieldValue, clampMaxItems } from "../src/connectors/airtable/limits";
import type { AirtableRecord } from "../src/connectors/airtable/types";

function makeRecord(overrides: Partial<AirtableRecord> = {}): AirtableRecord {
  return {
    id: "rec1",
    fields: {
      Name: "Test record",
      Owner: "alice",
      Status: "In Progress",
      "Due Date": "2099-01-01",
    },
    created_time: new Date().toISOString(),
    ...overrides,
  };
}

describe("extractDataQualityTags", () => {
  it("tags records with an empty owner-like field", () => {
    const record = makeRecord({ fields: { Name: "x", Owner: "" } });
    expect(extractDataQualityTags(record)).toContain("missing_owner");
  });

  it("tags records with an empty due-date-like field", () => {
    const record = makeRecord({ fields: { Name: "x", "Due Date": null } });
    expect(extractDataQualityTags(record)).toContain("missing_due_date");
  });

  it("tags records missing an explicitly required field", () => {
    const record = makeRecord({ fields: { Name: "x" } });
    expect(extractDataQualityTags(record, ["Priority"])).toContain("missing_required_field");
  });

  it("tags open status-like field values as open", () => {
    const record = makeRecord({ fields: { Name: "x", Status: "In Progress" } });
    expect(extractDataQualityTags(record)).toContain("open");
  });

  it("does not tag closed status-like field values as open", () => {
    const record = makeRecord({ fields: { Name: "x", Status: "Done" } });
    expect(extractDataQualityTags(record)).not.toContain("open");
  });

  it("tags stale open records with an old created_time", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const record = makeRecord({
      fields: { Name: "x", Status: "In Progress" },
      created_time: oldDate.toISOString(),
    });
    expect(extractDataQualityTags(record)).toContain("stale");
  });

  it("returns no tags for a healthy record with no recognizable fields", () => {
    const record = makeRecord({ fields: { Name: "x" } });
    expect(extractDataQualityTags(record)).toEqual([]);
  });
});

describe("excerptFieldValue", () => {
  it("returns non-string values unchanged", () => {
    expect(excerptFieldValue(42)).toBe(42);
    expect(excerptFieldValue(["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns full text when under limit", () => {
    expect(excerptFieldValue("short value")).toBe("short value");
  });

  it("truncates long string values and appends marker", () => {
    const long = "x".repeat(600);
    const result = excerptFieldValue(long) as string;
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
