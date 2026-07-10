import type {
  NormalizedProviderResponse,
  PlannerInput,
  PlannerResult,
  RuntimeRequest,
  RuntimeResponse,
  SkillOutputEnvelope,
  TaskGraph,
  TaskNode,
} from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";
import type { Planner } from "@oh-my-pm/planner";
import type { ProviderRegistry } from "@oh-my-pm/providers";
import type { SkillRegistry } from "@oh-my-pm/skills";

export type RuntimeDeps = {
  kernel: KernelApi;
  version: string;
  planner?: Planner;
  providers?: ProviderRegistry;
  skills?: SkillRegistry;
  /** Injected deterministic clock value for skill context; never a real clock. */
  now?: string;
};

export type Runtime = {
  handle(request: RuntimeRequest): RuntimeResponse;
};

export type RuntimeFailureInput = {
  requestId: string;
  code: string;
  message: string;
  trace: NonNullable<RuntimeResponse["trace"]>;
  warnings?: RuntimeResponse["warnings"];
  data?: RuntimeResponse["data"];
};

export type RuntimePlanData = {
  plannerInput: PlannerInput;
  plannerResult: PlannerResult;
  graph?: TaskGraph;
  providerResponses: NormalizedProviderResponse[];
  skillOutput?: SkillOutputEnvelope;
};

export type RuntimePlanNodeResult = {
  node: TaskNode;
  ok: boolean;
  data: RuntimeResponse["data"];
};
