import { describe, expect, it } from "vitest";
import { extractProviderRequests } from "../src/index.js";

describe("extractProviderRequests", () => {
  it("fails for non-object context", () => {
    expect(extractProviderRequests("nope")).toEqual({
      ok: false,
      reason: "context_must_be_object",
      requestedContext: ["context"],
    });
    expect(extractProviderRequests(null)).toEqual({
      ok: false,
      reason: "context_must_be_object",
      requestedContext: ["context"],
    });
  });

  it("returns an empty list when providerRequests is absent", () => {
    expect(extractProviderRequests({ notes: ["hello"] })).toEqual({ ok: true, requests: [] });
  });

  it("fails when providerRequests is not an array", () => {
    expect(extractProviderRequests({ providerRequests: "all" })).toEqual({
      ok: false,
      reason: "provider_requests_must_be_array",
      requestedContext: ["providerRequests"],
    });
  });

  it("fails on an invalid provider request", () => {
    expect(
      extractProviderRequests({ providerRequests: [{ providerId: "local" }] }),
    ).toEqual({
      ok: false,
      reason: "invalid_provider_request",
      requestedContext: ["providerRequests"],
    });
    expect(
      extractProviderRequests({
        providerRequests: [{ providerId: "unknown-provider", action: "list", query: "" }],
      }),
    ).toEqual({
      ok: false,
      reason: "invalid_provider_request",
      requestedContext: ["providerRequests"],
    });
  });

  it("preserves the order of valid provider requests", () => {
    const result = extractProviderRequests({
      providerRequests: [
        { providerId: "local", action: "list", query: "" },
        { providerId: "github", action: "search", query: "login", limit: 5 },
      ],
    });
    expect(result).toEqual({
      ok: true,
      requests: [
        { providerId: "local", action: "list", query: "" },
        { providerId: "github", action: "search", query: "login", limit: 5 },
      ],
    });
  });
});
