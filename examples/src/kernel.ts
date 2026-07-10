import type {
  StateTransitionDecision,
  StateTransitionInput,
  UpdateGuardDecision,
  UpdatePlan,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";

/**
 * Deterministic example Kernel boundary used only for examples.
 * It approves everything; it is not the real Kernel binding.
 */
export function createExampleKernelApi(): KernelApi {
  return {
    version(): string {
      return "2.0.0-alpha.0-example";
    },
    validateJson(target: ValidationTarget): ValidationReport {
      return { target, passed: true, errors: [], warnings: [] };
    },
    checkUpdatePlan(plan: UpdatePlan): UpdateGuardDecision {
      return {
        status: "allowed",
        planId: plan.id,
        planHash: `example:${plan.id}`,
        reasons: [],
      };
    },
    decideTransition(input: StateTransitionInput): StateTransitionDecision {
      return {
        from: input.from,
        to: input.to,
        allowed: true,
        reason: "example",
      };
    },
  };
}
