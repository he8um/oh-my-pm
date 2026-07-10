import { describe, expect, it } from "vitest";
import { createRuntimeRequest } from "../src/index.js";

describe("cli runtime request factory", () => {
  it("creates a deterministic status request", () => {
    expect(createRuntimeRequest("status")).toEqual({
      id: "cli-status",
      kind: "status",
      locale: "en",
      payload: { source: "cli" },
    });
  });

  it("creates a deterministic doctor request", () => {
    expect(createRuntimeRequest("doctor")).toEqual({
      id: "cli-doctor",
      kind: "doctor",
      locale: "en",
      payload: { source: "cli" },
    });
  });

  it("creates a deterministic plan request with the input text", () => {
    expect(createRuntimeRequest("plan", "review risks")).toEqual({
      id: "cli-plan",
      kind: "plan",
      locale: "en",
      payload: { source: "cli", request: "review risks", context: {} },
    });
  });
});
