import { describe, expect, it } from "vitest";
import {
  OMP_P_ACCESS_FORBIDDEN,
  OMP_P_AUTHENTICATION_FAILED,
  OMP_P_INVALID_REQUEST,
  OMP_P_INVALID_RESPONSE,
  OMP_P_RATE_LIMITED,
  OMP_P_RESOURCE_NOT_FOUND,
  OMP_P_TRANSPORT_FAILED,
  OMP_P_UNKNOWN_PROVIDER,
  OMP_P_UNSUPPORTED_ACTION,
  PROVIDER_FAILURE_MESSAGE,
  emptyProviderResponse,
  providerFailure,
} from "../src/index.js";

describe("provider error taxonomy", () => {
  it("preserves the original three codes and adds six new ones", () => {
    expect(OMP_P_UNKNOWN_PROVIDER).toBe("OMP-P-4001");
    expect(OMP_P_UNSUPPORTED_ACTION).toBe("OMP-P-4002");
    expect(OMP_P_INVALID_REQUEST).toBe("OMP-P-4003");
    expect(OMP_P_AUTHENTICATION_FAILED).toBe("OMP-P-4004");
    expect(OMP_P_ACCESS_FORBIDDEN).toBe("OMP-P-4005");
    expect(OMP_P_RESOURCE_NOT_FOUND).toBe("OMP-P-4006");
    expect(OMP_P_RATE_LIMITED).toBe("OMP-P-4007");
    expect(OMP_P_TRANSPORT_FAILED).toBe("OMP-P-4008");
    expect(OMP_P_INVALID_RESPONSE).toBe("OMP-P-4009");
  });

  it("has a stable message for every code", () => {
    for (const code of [
      "OMP-P-4001",
      "OMP-P-4002",
      "OMP-P-4003",
      "OMP-P-4004",
      "OMP-P-4005",
      "OMP-P-4006",
      "OMP-P-4007",
      "OMP-P-4008",
      "OMP-P-4009",
    ] as const) {
      expect(typeof PROVIDER_FAILURE_MESSAGE[code]).toBe("string");
      expect(PROVIDER_FAILURE_MESSAGE[code].length).toBeGreaterThan(0);
    }
  });

  it("builds a sanitized failure with an empty response and one warning", () => {
    const result = providerFailure("github", OMP_P_RATE_LIMITED);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(OMP_P_RATE_LIMITED);
    expect(result.response.items).toEqual([]);
    expect(result.response.warnings).toHaveLength(1);
    expect(result.response.warnings?.[0]?.code).toBe(OMP_P_RATE_LIMITED);
    expect(result.message).toBe(PROVIDER_FAILURE_MESSAGE[OMP_P_RATE_LIMITED]);
  });

  it("emptyProviderResponse omits warnings when none are given", () => {
    const response = emptyProviderResponse("github");
    expect(response.items).toEqual([]);
    expect(response.warnings).toBeUndefined();
  });
});
