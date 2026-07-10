import type { IntentCategory, JsonValue, ProviderRequest, TaskGraph, TaskNode } from "@oh-my-pm/contracts";
import type { PlannerNodeIds, TaskGraphBuildInput } from "./types.js";

/** Rebuild a provider request as a plain JSON value for node payloads. */
function providerRequestPayload(request: ProviderRequest): JsonValue {
  const payload: { [key: string]: JsonValue } = {
    providerId: request.providerId,
    action: request.action,
    query: request.query,
  };
  if (request.limit !== undefined) {
    payload["limit"] = request.limit;
  }
  return payload;
}

const FINAL_NODE_TITLES: Readonly<Record<IntentCategory, string>> = {
  status: "Prepare project status",
  riskReview: "Review project risks",
  nextTask: "Derive next tasks",
  planning: "Create project plan",
  handoff: "Create project handoff",
};

export function providerNodeId(index: number, request: ProviderRequest): string {
  return `provider:${index}:${request.providerId}:${request.action}`;
}

export function finalNodeId(intent: IntentCategory): string {
  return `plan:${intent}`;
}

/** Build a deterministic task graph: provider reads first, one final node. */
export function buildTaskGraph(input: TaskGraphBuildInput): TaskGraph {
  const providerNodes: TaskNode[] = input.providerRequests.map((request, index) => ({
    id: providerNodeId(index, request),
    kind: "providerRead",
    title: `Read ${request.providerId} context`,
    dependsOn: [],
    payload: { providerRequest: providerRequestPayload(request) },
  }));

  const final: TaskNode = {
    id: finalNodeId(input.intent),
    kind: "skillExecution",
    title: FINAL_NODE_TITLES[input.intent],
    dependsOn: providerNodes.map((node) => node.id),
    payload: {
      intent: input.intent,
      request: input.request,
      locale: input.locale,
    },
  };

  return { nodes: [...providerNodes, final] };
}

export function collectPlannerNodeIds(graph: TaskGraph): PlannerNodeIds {
  const providerNodeIds = graph.nodes
    .filter((node) => node.kind === "providerRead")
    .map((node) => node.id);
  const final = graph.nodes.find((node) => node.kind === "skillExecution");
  return { providerNodeIds, finalNodeId: final?.id ?? "" };
}
