export {
  OMP_P_INVALID_REQUEST,
  OMP_P_UNKNOWN_PROVIDER,
  OMP_P_UNSUPPORTED_ACTION,
  emptyProviderResponse,
  providerFailure,
  providerWarning,
} from "./errors.js";
export {
  createLocalProvider,
} from "./local.js";
export type { LocalProviderOptions } from "./local.js";
export {
  matchesQuery,
  normalizeLocalItem,
  normalizeText,
} from "./normalize.js";
export {
  createProviderRegistry,
} from "./registry.js";
export type {
  LocalProviderItemInput,
  Provider,
  ProviderCapability,
  ProviderDescriptor,
  ProviderExecutionContext,
  ProviderRegistry,
  ProviderResult,
} from "./types.js";
