import type { PlannerInput, RuntimeRequest } from "@oh-my-pm/contracts";
import { isRecord } from "./context.js";
import type { RuntimePlannerInputResult } from "./types.js";

/** Convert a Runtime plan request into a PlannerInput without calling Runtime. */
export function plannerInputFromRuntimeRequest(
  request: RuntimeRequest,
): RuntimePlannerInputResult {
  if (request.kind !== "plan") {
    return {
      ok: false,
      reason: "runtime_request_kind_must_be_plan",
      requestedContext: ["runtimeRequest.kind"],
    };
  }

  const payload = request.payload;
  if (!isRecord(payload)) {
    return {
      ok: false,
      reason: "runtime_payload_must_be_object",
      requestedContext: ["runtimeRequest.payload"],
    };
  }

  const requested = payload["request"];
  if (typeof requested !== "string") {
    return {
      ok: false,
      reason: "runtime_payload_request_missing",
      requestedContext: ["runtimeRequest.payload.request"],
    };
  }

  const payloadLocale = payload["locale"];
  const locale = payloadLocale === "en" || payloadLocale === "fa" ? payloadLocale : request.locale;

  return {
    ok: true,
    input: {
      request: requested,
      locale,
      context: payload["context"] ?? {},
    },
  };
}
