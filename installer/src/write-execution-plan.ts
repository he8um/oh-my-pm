// Explicit write execution plan: turn an allowed write capability decision plus
// existing local preview data into a deterministic list of planned write steps
// for install, update, or rollback intent. This is a planning layer only — it
// never calls a write adapter, writes/removes/backs-up/restores files, retrieves
// anything, or executes an install or rollback.

import type {
  InstallerWriteExecutionPlan,
  InstallerWriteExecutionPlanDryRunReport,
  InstallerWriteExecutionPlanInput,
  InstallerWriteExecutionPlanStep,
  InstallerWriteExecutionPlanStepKind,
  PlannedFileOperation,
  RollbackImpactOperation,
  UpdateImpactOperation,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { validateInstallerWriteIntent } from "./write-capability.js";

/** Map an install operation kind to a planned write step kind. */
export function mapInstallOperationToWriteStepKind(
  kind: PlannedFileOperation["kind"],
): InstallerWriteExecutionPlanStepKind | undefined {
  switch (kind) {
    case "create":
      return "install-create";
    case "replace":
      return "install-replace";
    case "remove":
      return "install-remove";
    case "backup":
      return "install-backup";
    default:
      return undefined;
  }
}

/** Map an update impact operation kind to a planned write step kind. */
export function mapUpdateImpactToWriteStepKind(
  kind: UpdateImpactOperation["kind"],
): InstallerWriteExecutionPlanStepKind | undefined {
  switch (kind) {
    case "create":
      return "update-create";
    case "replace":
      return "update-replace";
    case "remove":
      return "update-remove";
    default:
      return undefined;
  }
}

/** Map a rollback impact operation kind to a planned write step kind. */
export function mapRollbackImpactToWriteStepKind(
  kind: RollbackImpactOperation["kind"],
): InstallerWriteExecutionPlanStepKind | undefined {
  switch (kind) {
    case "restore":
      return "rollback-restore";
    case "remove":
      return "rollback-remove";
    default:
      return undefined;
  }
}

/** Build one planned step, attaching a checksum only when one is available. */
function planStep(
  sequence: number,
  kind: InstallerWriteExecutionPlanStepKind,
  path: string,
  checksum: string | undefined,
): InstallerWriteExecutionPlanStep {
  return {
    sequence,
    kind,
    path,
    ...(checksum === undefined ? {} : { checksum }),
  };
}

/**
 * Build planned steps for the requested intent from the matching source
 * operations. Undefined mapped kinds are skipped, source order is preserved,
 * and sequences are contiguous from 1. Inputs are never mutated.
 */
export function createInstallerWriteExecutionPlanSteps(
  input: InstallerWriteExecutionPlanInput,
): InstallerWriteExecutionPlanStep[] {
  const steps: InstallerWriteExecutionPlanStep[] = [];
  let sequence = 1;

  if (input.intent === "install") {
    for (const operation of input.installOperations) {
      const kind = mapInstallOperationToWriteStepKind(operation.kind);
      if (kind === undefined) {
        continue;
      }
      steps.push(planStep(sequence++, kind, operation.path, operation.checksum));
    }
  } else if (input.intent === "update") {
    for (const operation of input.updateImpact.operations) {
      const kind = mapUpdateImpactToWriteStepKind(operation.kind);
      if (kind === undefined) {
        continue;
      }
      const checksum = operation.afterChecksum ?? operation.beforeChecksum;
      steps.push(planStep(sequence++, kind, operation.path, checksum));
    }
  } else if (input.intent === "rollback") {
    for (const operation of input.rollbackImpact.operations) {
      const kind = mapRollbackImpactToWriteStepKind(operation.kind);
      if (kind === undefined) {
        continue;
      }
      const checksum = operation.afterChecksum ?? operation.beforeChecksum;
      steps.push(planStep(sequence++, kind, operation.path, checksum));
    }
  }

  return steps;
}

/**
 * Build the execution plan. Steps are always built so the preview stays
 * inspectable, but reasons block the plan when capability is not allowed, the
 * intent is invalid, or no steps map. Reasons are deterministic and each
 * appears once. Never throws for normal invalid input and never mutates.
 */
export function createInstallerWriteExecutionPlan(
  input: InstallerWriteExecutionPlanInput,
): InstallerWriteExecutionPlan {
  const steps = createInstallerWriteExecutionPlanSteps(input);
  const reasons: string[] = [];

  if (!input.capability.allowed) {
    reasons.push("write_execution_capability_not_allowed");
  }
  if (!validateInstallerWriteIntent(input.intent)) {
    reasons.push("write_execution_intent_invalid");
  }
  if (steps.length === 0) {
    reasons.push("write_execution_steps_empty");
  }

  return {
    ok: reasons.length === 0,
    intent: input.intent,
    steps,
    reasons,
  };
}

/**
 * Build the plan and wrap it in a dry-run report. A valid plan omits warnings;
 * an invalid one surfaces its reasons as OMP-I-6001 warnings. Nothing is written.
 */
export function createInstallerWriteExecutionPlanDryRun(
  input: InstallerWriteExecutionPlanInput,
): InstallerWriteExecutionPlanDryRunReport {
  const plan = createInstallerWriteExecutionPlan(input);
  if (plan.ok) {
    return { ok: true, plan };
  }
  return {
    ok: false,
    plan,
    warnings: plan.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}
