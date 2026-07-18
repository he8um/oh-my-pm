import type {
  NormalizedProviderItem,
  NormalizedProviderResponse,
  ProviderAction,
  ProviderId,
  ProviderRequest,
} from "@oh-my-pm/contracts";

export type ProviderCapability = {
  action: ProviderAction;
  readOnly: true;
};

export type ProviderDescriptor = {
  id: ProviderId;
  name: string;
  readOnly: true;
  capabilities: readonly ProviderCapability[];
};

export type ProviderExecutionContext = {
  requestId: string;
};

/** Stable provider failure codes. */
export type ProviderFailureCode =
  | "OMP-P-4001"
  | "OMP-P-4002"
  | "OMP-P-4003"
  | "OMP-P-4004"
  | "OMP-P-4005"
  | "OMP-P-4006"
  | "OMP-P-4007"
  | "OMP-P-4008"
  | "OMP-P-4009";

export type ProviderResult =
  | {
      ok: true;
      response: NormalizedProviderResponse;
    }
  | {
      ok: false;
      response: NormalizedProviderResponse;
      code: ProviderFailureCode;
      message: string;
    };

export type Provider = {
  descriptor: ProviderDescriptor;
  execute(
    request: ProviderRequest,
    context: ProviderExecutionContext,
  ): Promise<ProviderResult>;
};

export type ProviderRegistry = {
  list(): readonly ProviderDescriptor[];
  get(id: ProviderId): Provider | undefined;
  execute(
    request: ProviderRequest,
    context: ProviderExecutionContext,
  ): Promise<ProviderResult>;
};

export type LocalProviderItemInput = {
  id: string;
  type?: NormalizedProviderItem["type"];
  title: string;
  url?: string;
  data?: NormalizedProviderItem["data"];
};
