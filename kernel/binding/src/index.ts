import type {
  JsonValue,
  StateTransitionDecision,
  StateTransitionInput,
  UpdateGuardDecision,
  UpdatePlan,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";
import type { BindingMarkers } from "./status.js";
import { UNAVAILABLE_REASON, WASM_MODE } from "./status.js";

export {
  createNodeWasmKernelApi,
  isNodeWasmKernelAvailable,
} from "./node.js";

/** Public boundary the rest of the workspace uses to reach the Kernel. */
export type KernelApi = {
  version(): string;
  validateJson(target: ValidationTarget, payload: JsonValue): ValidationReport;
  checkUpdatePlan(plan: UpdatePlan): UpdateGuardDecision;
  decideTransition(input: StateTransitionInput): StateTransitionDecision;
};

export type KernelBindingStatus =
  | { status: "configured"; mode: "injected" | "wasm" }
  | { status: "unavailable"; reason: string };

type MarkedKernelApi = KernelApi & BindingMarkers;

/**
 * Deterministic fail-closed Kernel boundary used until a real binding is
 * injected. Every operation refuses instead of guessing.
 */
export function createUnavailableKernelApi(
  reason = "kernel_binding_not_configured",
): KernelApi {
  const api: MarkedKernelApi = {
    version(): string {
      return "unavailable";
    },
    validateJson(target: ValidationTarget): ValidationReport {
      return {
        target,
        passed: false,
        errors: [
          {
            code: "OMP-K-1002",
            message: `Kernel binding unavailable: ${reason}`,
            path: "",
            blocking: true,
          },
        ],
        warnings: [],
      };
    },
    checkUpdatePlan(plan: UpdatePlan): UpdateGuardDecision {
      return {
        status: "blocked",
        planId: plan.id,
        planHash: `unavailable:${plan.id}`,
        reasons: [reason],
      };
    },
    decideTransition(input: StateTransitionInput): StateTransitionDecision {
      return {
        from: input.from,
        to: input.to,
        allowed: false,
        reason,
      };
    },
  };
  api[UNAVAILABLE_REASON] = reason;
  return api;
}

/** Report whether a KernelApi is a configured binding or the fail-closed stub. */
export function describeKernelBinding(api: KernelApi): KernelBindingStatus {
  const marked = api as MarkedKernelApi;
  const reason = marked[UNAVAILABLE_REASON];
  if (reason !== undefined) {
    return { status: "unavailable", reason };
  }
  if (marked[WASM_MODE] === true) {
    return { status: "configured", mode: "wasm" };
  }
  return { status: "configured", mode: "injected" };
}
