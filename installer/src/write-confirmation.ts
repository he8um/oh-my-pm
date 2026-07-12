// Write execution confirmation checklist: summarize whether the already-built
// write capability and write execution plan are ready for a future explicit
// write operation. This is a confirmation/validation layer only — it never
// calls a write adapter, writes/removes/backs-up/restores files, retrieves
// anything, or executes an install or rollback.

import type {
  InstallerWriteConfirmationChecklist,
  InstallerWriteConfirmationChecklistDryRunReport,
  InstallerWriteConfirmationChecklistInput,
  InstallerWriteConfirmationChecklistItem,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Build one checklist item, attaching a reason only when it failed. */
function checklistItem(
  id: InstallerWriteConfirmationChecklistItem["id"],
  label: string,
  ok: boolean,
  reason: string,
): InstallerWriteConfirmationChecklistItem {
  return {
    id,
    label,
    ok,
    ...(ok ? {} : { reason }),
  };
}

/**
 * Build the confirmation items in fixed order. Each item's `reason` is present
 * only when the check failed. Inputs are never mutated.
 */
export function createInstallerWriteConfirmationChecklistItems(
  input: InstallerWriteConfirmationChecklistInput,
): InstallerWriteConfirmationChecklistItem[] {
  const { decision, capability, executionPlan } = input;
  return [
    checklistItem(
      "intent-consistent",
      "Capability and execution plan target the same intent",
      capability.intent === executionPlan.intent,
      "write_confirmation_intent_mismatch",
    ),
    checklistItem(
      "decision-ready",
      "Installer decision is ready",
      decision.decision === "ready",
      "write_confirmation_decision_not_ready",
    ),
    checklistItem(
      "capability-allowed",
      "Write capability is allowed",
      capability.allowed === true,
      "write_confirmation_capability_not_allowed",
    ),
    checklistItem(
      "execution-plan-ready",
      "Write execution plan is ready",
      executionPlan.ok === true,
      "write_confirmation_execution_plan_not_ready",
    ),
    checklistItem(
      "execution-steps-present",
      "Write execution plan has steps",
      executionPlan.steps.length > 0,
      "write_confirmation_steps_empty",
    ),
  ];
}

/**
 * Build the checklist. Reasons are the failed items' reasons in item order,
 * and the checklist is ok only when every item passes. Never throws for normal
 * invalid input and never mutates.
 */
export function createInstallerWriteConfirmationChecklist(
  input: InstallerWriteConfirmationChecklistInput,
): InstallerWriteConfirmationChecklist {
  const items = createInstallerWriteConfirmationChecklistItems(input);
  const reasons = items
    .filter((item) => !item.ok)
    .map((item) => item.reason)
    .filter((reason): reason is string => reason !== undefined);
  return {
    ok: reasons.length === 0,
    intent: input.executionPlan.intent,
    items,
    reasons,
  };
}

/**
 * Build the checklist and wrap it in a dry-run report. A passing checklist
 * omits warnings; a failing one surfaces its reasons as OMP-I-6001 warnings.
 * Nothing is written.
 */
export function createInstallerWriteConfirmationChecklistDryRun(
  input: InstallerWriteConfirmationChecklistInput,
): InstallerWriteConfirmationChecklistDryRunReport {
  const checklist = createInstallerWriteConfirmationChecklist(input);
  if (checklist.ok) {
    return { ok: true, checklist };
  }
  return {
    ok: false,
    checklist,
    warnings: checklist.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
