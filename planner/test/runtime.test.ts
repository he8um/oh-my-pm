import type { RuntimeRequest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { plannerInputFromRuntimeRequest } from "../src/index.js";

function runtimeRequest(overrides: Partial<RuntimeRequest> = {}): RuntimeRequest {
  return {
    id: "req-plan",
    kind: "plan",
    locale: "en",
    payload: { request: "organize the roadmap" },
    ...overrides,
  };
}

describe("plannerInputFromRuntimeRequest", () => {
  it("rejects non-plan requests", () => {
    expect(plannerInputFromRuntimeRequest(runtimeRequest({ kind: "status" }))).toEqual({
      ok: false,
      reason: "runtime_request_kind_must_be_plan",
      requestedContext: ["runtimeRequest.kind"],
    });
  });

  it("rejects non-object payloads", () => {
    expect(plannerInputFromRuntimeRequest(runtimeRequest({ payload: "nope" }))).toEqual({
      ok: false,
      reason: "runtime_payload_must_be_object",
      requestedContext: ["runtimeRequest.payload"],
    });
  });

  it("rejects payloads without a request string", () => {
    expect(plannerInputFromRuntimeRequest(runtimeRequest({ payload: { context: {} } }))).toEqual({
      ok: false,
      reason: "runtime_payload_request_missing",
      requestedContext: ["runtimeRequest.payload.request"],
    });
  });

  it("converts a valid plan payload", () => {
    const result = plannerInputFromRuntimeRequest(
      runtimeRequest({
        payload: { request: "plan the release", locale: "fa", context: { notes: ["n"] } },
      }),
    );
    expect(result).toEqual({
      ok: true,
      input: { request: "plan the release", locale: "fa", context: { notes: ["n"] } },
    });
  });

  it("defaults locale to the runtime request locale", () => {
    const result = plannerInputFromRuntimeRequest(
      runtimeRequest({ locale: "fa", payload: { request: "plan it" } }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.locale).toBe("fa");
    }
  });

  it("defaults context to an object", () => {
    const result = plannerInputFromRuntimeRequest(runtimeRequest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.context).toEqual({});
    }
  });
});
