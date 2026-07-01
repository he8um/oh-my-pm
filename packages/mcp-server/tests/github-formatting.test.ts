import { parseRateLimitHeaders, extractDeliveryTags } from "../src/connectors/github/formatters";
import { excerptBody, clampMaxItems } from "../src/connectors/github/limits";

describe("parseRateLimitHeaders", () => {
  it("parses valid rate limit headers", () => {
    const info = parseRateLimitHeaders({
      "x-ratelimit-remaining": "42",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": "1700000000",
    });
    expect(info.remaining).toBe(42);
    expect(info.limit).toBe(5000);
    expect(info.warning).toBe(false);
  });

  it("sets warning: true when remaining is below 10", () => {
    const info = parseRateLimitHeaders({
      "x-ratelimit-remaining": "5",
      "x-ratelimit-limit": "60",
      "x-ratelimit-reset": null,
    });
    expect(info.warning).toBe(true);
  });

  it("handles missing headers gracefully", () => {
    const info = parseRateLimitHeaders({
      "x-ratelimit-remaining": null,
      "x-ratelimit-limit": null,
      "x-ratelimit-reset": null,
    });
    expect(typeof info.remaining).toBe("number");
    expect(info.warning).toBe(false);
  });
});

describe("extractDeliveryTags", () => {
  it("tags issues with blocker label", () => {
    expect(extractDeliveryTags(["blocker", "bug"])).toContain("blocker");
  });

  it("tags issues with critical label as blocker", () => {
    expect(extractDeliveryTags(["critical"])).toContain("blocker");
  });

  it("tags stale issues", () => {
    expect(extractDeliveryTags(["stale"])).toContain("stale");
  });

  it("returns empty array for plain labels", () => {
    expect(extractDeliveryTags(["enhancement", "feature"])).toEqual([]);
  });
});

describe("excerptBody", () => {
  it("returns null for null input", () => {
    expect(excerptBody(null)).toBeNull();
  });

  it("returns full text when under limit", () => {
    expect(excerptBody("short body")).toBe("short body");
  });

  it("truncates long bodies and appends marker", () => {
    const long = "x".repeat(600);
    const result = excerptBody(long)!;
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
