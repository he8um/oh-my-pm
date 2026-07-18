import type { NormalizedProviderItem, ProviderRequest } from "@oh-my-pm/contracts";
import { OMP_P_INVALID_REQUEST, OMP_P_UNSUPPORTED_ACTION, providerFailure } from "./errors.js";
import { matchesQuery, normalizeLocalItem } from "./normalize.js";
import type { LocalProviderItemInput, Provider } from "./types.js";

export type LocalProviderOptions = {
  items: readonly LocalProviderItemInput[];
};

function applyLimit(
  items: readonly NormalizedProviderItem[],
  limit: number | undefined,
): NormalizedProviderItem[] {
  if (limit === undefined) {
    return [...items];
  }
  if (limit <= 0) {
    return [];
  }
  return items.slice(0, limit);
}

/** Deterministic read-only in-memory provider over caller-supplied items. */
export function createLocalProvider(options: LocalProviderOptions): Provider {
  const items = options.items.map((input) => normalizeLocalItem("local", input));

  return {
    descriptor: {
      id: "local",
      name: "Local",
      readOnly: true,
      capabilities: [
        { action: "search", readOnly: true },
        { action: "fetch", readOnly: true },
        { action: "list", readOnly: true },
      ],
    },
    async execute(request: ProviderRequest): ReturnType<Provider["execute"]> {
      if (request.providerId !== "local") {
        return providerFailure(
          "local",
          OMP_P_INVALID_REQUEST,
          `local provider received a request for provider: ${request.providerId}`,
        );
      }

      switch (request.action) {
        case "list":
          return {
            ok: true,
            response: { providerId: "local", items: applyLimit(items, request.limit) },
          };
        case "search":
          return {
            ok: true,
            response: {
              providerId: "local",
              items: applyLimit(
                items.filter((item) => matchesQuery(item, request.query)),
                request.limit,
              ),
            },
          };
        case "fetch":
          return {
            ok: true,
            response: {
              providerId: "local",
              items: items.filter((item) => item.id === request.query).slice(0, 1),
            },
          };
        default:
          return providerFailure(
            "local",
            OMP_P_UNSUPPORTED_ACTION,
            `unsupported provider action: ${String(request.action)}`,
          );
      }
    },
  };
}
