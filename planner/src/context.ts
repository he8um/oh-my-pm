import type { JsonValue, ProviderRequest } from "@oh-my-pm/contracts";
import { PROVIDER_ACTION_VALUES, PROVIDER_ID_VALUES } from "@oh-my-pm/contracts";
import type { ProviderRequestExtractionResult } from "./types.js";

export function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asProviderRequest(value: JsonValue): ProviderRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  const { providerId, action, query, limit } = value;
  if (typeof providerId !== "string" || !(PROVIDER_ID_VALUES as readonly string[]).includes(providerId)) {
    return null;
  }
  if (typeof action !== "string" || !(PROVIDER_ACTION_VALUES as readonly string[]).includes(action)) {
    return null;
  }
  if (typeof query !== "string") {
    return null;
  }
  const request: ProviderRequest = {
    providerId: providerId as ProviderRequest["providerId"],
    action: action as ProviderRequest["action"],
    query,
  };
  if (limit !== undefined) {
    if (typeof limit !== "number" || !Number.isInteger(limit)) {
      return null;
    }
    request.limit = limit;
  }
  return request;
}

/** Extract provider requests from the supported structured context shape. */
export function extractProviderRequests(context: JsonValue): ProviderRequestExtractionResult {
  if (!isRecord(context)) {
    return { ok: false, reason: "context_must_be_object", requestedContext: ["context"] };
  }

  const raw = context["providerRequests"];
  if (raw === undefined) {
    return { ok: true, requests: [] };
  }
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      reason: "provider_requests_must_be_array",
      requestedContext: ["providerRequests"],
    };
  }

  const requests: ProviderRequest[] = [];
  for (const entry of raw) {
    const request = asProviderRequest(entry);
    if (request === null) {
      return {
        ok: false,
        reason: "invalid_provider_request",
        requestedContext: ["providerRequests"],
      };
    }
    requests.push(request);
  }
  return { ok: true, requests };
}
