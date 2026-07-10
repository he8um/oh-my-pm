import type {
  IntentCategory,
  PlannerInput,
  PlannerResult,
  ProviderRequest,
} from "@oh-my-pm/contracts";
import type { ProviderRegistry } from "@oh-my-pm/providers";

export type PlannerDeps = {
  providers?: ProviderRegistry;
};

export type Planner = {
  plan(input: PlannerInput): PlannerResult;
};

export type PlannerContextShape = {
  providerRequests?: ProviderRequest[];
  notes?: string[];
};

export type ProviderRequestExtractionResult =
  | { ok: true; requests: ProviderRequest[] }
  | { ok: false; reason: string; requestedContext: string[] };

export type RuntimePlannerInputResult =
  | { ok: true; input: PlannerInput }
  | { ok: false; reason: string; requestedContext: string[] };

export type TaskGraphBuildInput = {
  intent: IntentCategory;
  request: string;
  locale: PlannerInput["locale"];
  providerRequests: ProviderRequest[];
};

export type PlannerNodeIds = {
  providerNodeIds: string[];
  finalNodeId: string;
};
