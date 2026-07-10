import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeLocalItem, normalizeText } from "../src/index.js";

describe("normalizeText", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeText("  Fix   the\tLogin\n Flow  ")).toBe("fix the login flow");
  });
});

describe("matchesQuery", () => {
  const item = normalizeLocalItem("local", { id: "TASK-42", title: "Fix Login Flow" });

  it("matches everything with an empty query", () => {
    expect(matchesQuery(item, "")).toBe(true);
    expect(matchesQuery(item, "   ")).toBe(true);
  });

  it("matches the title case-insensitively", () => {
    expect(matchesQuery(item, "LOGIN")).toBe(true);
    expect(matchesQuery(item, "fix login")).toBe(true);
    expect(matchesQuery(item, "logout")).toBe(false);
  });

  it("matches the id", () => {
    expect(matchesQuery(item, "task-42")).toBe(true);
  });
});

describe("normalizeLocalItem", () => {
  it("defaults type to unknown and data to an object", () => {
    const item = normalizeLocalItem("local", { id: "1", title: "One" });
    expect(item.type).toBe("unknown");
    expect(item.data).toEqual({});
    expect(item.source).toBe("local");
  });

  it("omits url when missing and keeps it when provided", () => {
    expect("url" in normalizeLocalItem("local", { id: "1", title: "One" })).toBe(false);
    expect(
      normalizeLocalItem("local", { id: "1", title: "One", url: "https://example.invalid/1" }).url,
    ).toBe("https://example.invalid/1");
  });

  it("keeps explicit type and data", () => {
    const item = normalizeLocalItem("local", {
      id: "1",
      title: "One",
      type: "task",
      data: { key: "value" },
    });
    expect(item.type).toBe("task");
    expect(item.data).toEqual({ key: "value" });
  });
});
