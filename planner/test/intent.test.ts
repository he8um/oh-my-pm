import { describe, expect, it } from "vitest";
import { classifyIntent, normalizeRequestText } from "../src/index.js";

describe("normalizeRequestText", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeRequestText("  What   IS\tNext ")).toBe("what is next");
  });
});

describe("classifyIntent", () => {
  it("returns null for an empty request", () => {
    expect(classifyIntent("")).toBeNull();
    expect(classifyIntent("   ")).toBeNull();
  });

  it("classifies status keywords", () => {
    expect(classifyIntent("show project STATUS")).toBe("status");
    expect(classifyIntent("run a health check")).toBe("status");
    expect(classifyIntent("doctor please")).toBe("status");
  });

  it("classifies risk keywords", () => {
    expect(classifyIntent("what risks do we have")).toBe("riskReview");
    expect(classifyIntent("anything blocked?")).toBe("riskReview");
    expect(classifyIntent("find the blocker")).toBe("riskReview");
  });

  it("classifies next-task keywords", () => {
    expect(classifyIntent("what should we do next")).toBe("nextTask");
    expect(classifyIntent("show my todo list")).toBe("nextTask");
    expect(classifyIntent("give me an action item")).toBe("nextTask");
  });

  it("classifies handoff keywords", () => {
    expect(classifyIntent("prepare the handoff")).toBe("handoff");
    expect(classifyIntent("write a brief")).toBe("handoff");
  });

  it("falls back to planning", () => {
    expect(classifyIntent("organize the roadmap for v2")).toBe("planning");
  });

  it("applies precedence deterministically", () => {
    // "status" wins over "risk" and "task" because it is checked first.
    expect(classifyIntent("status of risk tasks")).toBe("status");
    // "risk" wins over "next".
    expect(classifyIntent("risk of the next release")).toBe("riskReview");
    // "task" wins over "summary".
    expect(classifyIntent("task summary")).toBe("nextTask");
  });
});
