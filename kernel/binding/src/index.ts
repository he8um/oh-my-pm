import type {
  JsonValue,
  StateTransitionDecision,
  StateTransitionInput,
  UpdateGuardDecision,
  UpdatePlan,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";

/** Public boundary the rest of the workspace uses to reach the Kernel. */
export type KernelApi = {
  version(): string;
  validateJson(target: ValidationTarget, payload: JsonValue): ValidationReport;
  checkUpdatePlan(plan: UpdatePlan): UpdateGuardDecision;
  decideTransition(input: StateTransitionInput): StateTransitionDecision;
};

export type KernelBindingStatus =
  | { status: "configured"; mode: "injected" }
  | { status: "unavailable"; reason: string };

const UNAVAILABLE_REASON = Symbol("kernel-binding-unavailable");

type MarkedKernelApi = KernelApi & { [UNAVAILABLE_REASON]?: string };

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
  const reason = (api as MarkedKernelApi)[UNAVAILABLE_REASON];
  if (reason !== undefined) {
    return { status: "unavailable", reason };
  }
  return { status: "configured", mode: "injected" };
}
