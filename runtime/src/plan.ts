import type {
  ExecutionTraceEntry,
  IntentCategory,
  JsonValue,
  NormalizedProviderResponse,
  RuntimeRequest,
  RuntimeResponse,
} from "@oh-my-pm/contracts";
import { INTENT_CATEGORY_VALUES } from "@oh-my-pm/contracts";
import { createPlanner, plannerInputFromRuntimeRequest } from "@oh-my-pm/planner";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import {
  OMP_R_GRAPH_VALIDATION_FAILED,
  OMP_R_MISSING_CONTEXT,
  OMP_R_PROVIDER_FAILED,
  OMP_R_SKILL_FAILED,
  failureResponse,
} from "./errors.js";
import {
  notesFromPlannerContext,
  providerRequestFromNode,
  skillIdForIntent,
  skillInputForPlan,
} from "./plan-utils.js";
import type { RuntimeDeps } from "./types.js";

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function intentFromFinalNodePayload(payload: JsonValue): IntentCategory | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  const intent = payload["intent"];
  if (typeof intent !== "string" || !(INTENT_CATEGORY_VALUES as readonly string[]).includes(intent)) {
    return null;
  }
  return intent as IntentCategory;
}

/** Deterministic plan execution shell: plan, validate, read, transform. */
export function handlePlanRequest(
  request: RuntimeRequest,
  deps: RuntimeDeps,
  trace: ExecutionTraceEntry[],
): RuntimeResponse {
  const adapted = plannerInputFromRuntimeRequest(request);
  if (!adapted.ok) {
    trace.push({ step: "planner.input", status: "fail", message: adapted.reason });
    return failureResponse({
      requestId: request.id,
      code: OMP_R_MISSING_CONTEXT,
      message: "planner input is missing required context",
      trace,
      data: {
        code: OMP_R_MISSING_CONTEXT,
        message: "planner input is missing required context",
        reason: adapted.reason,
        requestedContext: [...adapted.requestedContext],
      },
    });
  }
  trace.push({ step: "planner.input", status: "ok" });

  const planner =
    deps.planner ??
    (deps.providers === undefined ? createPlanner() : createPlanner({ providers: deps.providers }));
  const plannerResult = planner.plan(adapted.input);
  if (plannerResult.status === "missingContext") {
    trace.push({
      step: "planner.plan",
      status: "fail",
      message: plannerResult.missingContext.reason,
    });
    return failureResponse({
      requestId: request.id,
      code: OMP_R_MISSING_CONTEXT,
      message: "planner reported missing context",
      trace,
      data: {
        code: OMP_R_MISSING_CONTEXT,
        message: "planner reported missing context",
        reason: plannerResult.missingContext.reason,
        requestedContext: [...plannerResult.missingContext.requestedContext],
      },
    });
  }
  trace.push({ step: "planner.plan", status: "ok" });

  const graph = plannerResult.graph;
  const validation = deps.kernel.validateJson("taskGraph", toJsonValue(graph));
  if (!validation.passed) {
    trace.push({
      step: "kernel.validate.taskGraph",
      status: "fail",
      message: `${validation.errors.length} error(s)`,
    });
    return failureResponse({
      requestId: request.id,
      code: OMP_R_GRAPH_VALIDATION_FAILED,
      message: "planner graph failed kernel validation",
      trace,
      data: {
        code: OMP_R_GRAPH_VALIDATION_FAILED,
        message: "planner graph failed kernel validation",
        validation: toJsonValue(validation),
      },
    });
  }
  trace.push({ step: "kernel.validate.taskGraph", status: "ok" });

  const providerResponses: NormalizedProviderResponse[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== "providerRead") {
      continue;
    }
    const providerRequest = providerRequestFromNode(node);
    if (providerRequest === null) {
      trace.push({ step: "provider.node", status: "fail", message: node.id });
      return failureResponse({
        requestId: request.id,
        code: OMP_R_PROVIDER_FAILED,
        message: `provider node payload is invalid: ${node.id}`,
        trace,
      });
    }
    if (deps.providers === undefined) {
      trace.push({ step: "provider.execute", status: "fail", message: "registry_not_configured" });
      return failureResponse({
        requestId: request.id,
        code: OMP_R_PROVIDER_FAILED,
        message: "provider registry is not configured",
        trace,
      });
    }
    const result = deps.providers.execute(providerRequest, { requestId: request.id });
    if (!result.ok) {
      trace.push({
        step: "provider.execute",
        status: "fail",
        message: providerRequest.providerId,
      });
      return failureResponse({
        requestId: request.id,
        code: OMP_R_PROVIDER_FAILED,
        message: `provider execution failed: ${result.message}`,
        trace,
        data: {
          code: OMP_R_PROVIDER_FAILED,
          message: `provider execution failed: ${result.message}`,
          providerCode: result.code,
          response: toJsonValue(result.response),
        },
      });
    }
    providerResponses.push(result.response);
    trace.push({
      step: "provider.execute",
      status: "ok",
      message: `${providerRequest.providerId}:${providerRequest.action}`,
    });
  }

  const finalNode = graph.nodes.find((node) => node.kind === "skillExecution");
  const intent = finalNode === undefined ? null : intentFromFinalNodePayload(finalNode.payload);
  if (finalNode === undefined || intent === null) {
    trace.push({ step: "skill.execute", status: "fail", message: "missing_final_node" });
    return failureResponse({
      requestId: request.id,
      code: OMP_R_SKILL_FAILED,
      message: "task graph has no valid skill node",
      trace,
    });
  }

  const skillId = skillIdForIntent(intent);
  const skills = deps.skills ?? createDefaultSkillRegistry();
  const envelope = skillInputForPlan({
    skillId,
    locale: adapted.input.locale,
    now: deps.now ?? "runtime-now-not-supplied",
    request: adapted.input.request,
    graph,
    providerItems: providerResponses.flatMap((response) => response.items),
    notes: notesFromPlannerContext(adapted.input.context),
  });
  const skillOutput = skills.execute(envelope);
  if (!skillOutput.ok) {
    trace.push({ step: "skill.execute", status: "fail", message: skillId });
    return failureResponse({
      requestId: request.id,
      code: OMP_R_SKILL_FAILED,
      message: `skill execution failed: ${skillId}`,
      trace,
      data: {
        code: OMP_R_SKILL_FAILED,
        message: `skill execution failed: ${skillId}`,
        skillOutput: toJsonValue(skillOutput),
      },
    });
  }
  trace.push({ step: "skill.execute", status: "ok", message: skillId });

  return {
    id: request.id,
    ok: true,
    data: toJsonValue({
      plannerInput: adapted.input,
      plannerResult,
      graph,
      providerResponses,
      skillOutput,
      output: skillOutput.output,
    }),
    trace,
  };
}
