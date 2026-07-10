import type { PlannerInput, PlannerResult } from "@oh-my-pm/contracts";
import { extractProviderRequests } from "./context.js";
import { buildTaskGraph } from "./graph.js";
import { classifyIntent } from "./intent.js";
import { unavailableProviderIds } from "./providers.js";
import type { Planner, PlannerDeps } from "./types.js";

function missingContext(reason: string, requestedContext: string[]): PlannerResult {
  return {
    status: "missingContext",
    missingContext: { reason, requestedContext },
  };
}

/** Plan a project request deterministically; never executes anything. */
export function planProject(input: PlannerInput, deps?: PlannerDeps): PlannerResult {
  const intent = classifyIntent(input.request);
  if (intent === null) {
    return missingContext("request_missing", ["request"]);
  }

  const extraction = extractProviderRequests(input.context);
  if (!extraction.ok) {
    return missingContext(extraction.reason, extraction.requestedContext);
  }

  const missing = unavailableProviderIds(extraction.requests, deps?.providers);
  if (missing.length > 0) {
    return missingContext(
      "provider_not_available",
      missing.map((id) => `provider:${id}`),
    );
  }

  return {
    status: "ok",
    graph: buildTaskGraph({
      intent,
      request: input.request,
      locale: input.locale,
      providerRequests: extraction.requests,
    }),
  };
}

export function createPlanner(deps?: PlannerDeps): Planner {
  return {
    plan(input: PlannerInput): PlannerResult {
      return planProject(input, deps);
    },
  };
}
