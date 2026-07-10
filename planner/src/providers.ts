import type { ProviderRequest } from "@oh-my-pm/contracts";
import type { ProviderRegistry } from "@oh-my-pm/providers";

/**
 * Provider ids referenced by requests that are absent from the registry.
 * Without a registry the planner stays usable for pure offline planning.
 */
export function unavailableProviderIds(
  requests: readonly ProviderRequest[],
  registry: ProviderRegistry | undefined,
): string[] {
  if (registry === undefined) {
    return [];
  }
  const missing: string[] = [];
  for (const request of requests) {
    if (registry.get(request.providerId) === undefined && !missing.includes(request.providerId)) {
      missing.push(request.providerId);
    }
  }
  return missing;
}
