import type { ProviderId, ProviderRequest } from "@oh-my-pm/contracts";
import { OMP_P_UNKNOWN_PROVIDER, providerFailure } from "./errors.js";
import type { Provider, ProviderDescriptor, ProviderExecutionContext, ProviderRegistry } from "./types.js";

/** Registry over a fixed provider set; duplicate ids keep the first provider. */
export function createProviderRegistry(providers: readonly Provider[]): ProviderRegistry {
  const byId = new Map<ProviderId, Provider>();
  const descriptors: ProviderDescriptor[] = [];

  for (const provider of providers) {
    if (!byId.has(provider.descriptor.id)) {
      byId.set(provider.descriptor.id, provider);
      descriptors.push(provider.descriptor);
    }
  }

  return {
    list(): readonly ProviderDescriptor[] {
      return descriptors;
    },
    get(id: ProviderId): Provider | undefined {
      return byId.get(id);
    },
    execute(request: ProviderRequest, context: ProviderExecutionContext) {
      const provider = byId.get(request.providerId);
      if (provider === undefined) {
        return providerFailure(
          request.providerId,
          OMP_P_UNKNOWN_PROVIDER,
          `unknown provider: ${request.providerId}`,
        );
      }
      return provider.execute(request, context);
    },
  };
}
