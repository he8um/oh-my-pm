// Controlled write execution dry-run envelope: aggregate every already-built
// write readiness layer (capability, approval token, execution plan,
// confirmation checklist, adapter contract) into one deterministic,
// non-mutating inspection object. This is an aggregation layer only — it never
// calls a write adapter, writes files, or executes an install or rollback.

import type {
  ControlledWriteExecutionDryRunEnvelope,
  ControlledWriteExecutionDryRunEnvelopeInput,
  ControlledWriteExecutionDryRunEnvelopeSummary,
  ControlledWriteExecutionDryRunReport,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Collect the readiness reasons in a fixed order; each appears at most once. */
export function collectControlledWriteDryRunReasons(
  input: ControlledWriteExecutionDryRunEnvelopeInput,
): string[] {
  const { intent, capability, approval, executionPlan, confirmation, adapterContract } = input;
  const reasons: string[] = [];

  if (
    capability.intent !== intent ||
    executionPlan.intent !== intent ||
    confirmation.intent !== intent
  ) {
    reasons.push("controlled_write_intent_mismatch");
  }
  if (!capability.allowed) {
    reasons.push("controlled_write_capability_not_allowed");
  }
  if (!approval.ok) {
    reasons.push("controlled_write_approval_invalid");
  }
  if (!executionPlan.ok) {
    reasons.push("controlled_write_execution_plan_not_ready");
  }
  if (!confirmation.ok) {
    reasons.push("controlled_write_confirmation_not_ready");
  }
  if (!adapterContract.ok) {
    reasons.push("controlled_write_adapter_contract_not_ready");
  }

  return reasons;
}

/** Build a flat readiness summary across every write layer. */
export function summarizeControlledWriteExecutionDryRunEnvelope(
  input: ControlledWriteExecutionDryRunEnvelopeInput,
): ControlledWriteExecutionDryRunEnvelopeSummary {
  return {
    intent: input.intent,
    allowed: input.capability.allowed,
    approved: input.approval.ok,
    planReady: input.executionPlan.ok,
    confirmationReady: input.confirmation.ok,
    adapterReady: input.adapterContract.ok,
    plannedSteps: input.executionPlan.steps.length,
    reasons: collectControlledWriteDryRunReasons(input),
  };
}

/**
 * Build the envelope: a readiness summary plus pass-through references to each
 * already computed layer. The envelope is ok only when the summary has no
 * reasons. Nothing is mutated or written.
 */
export function createControlledWriteExecutionDryRunEnvelope(
  input: ControlledWriteExecutionDryRunEnvelopeInput,
): ControlledWriteExecutionDryRunEnvelope {
  const summary = summarizeControlledWriteExecutionDryRunEnvelope(input);
  return {
    ok: summary.reasons.length === 0,
    summary,
    capability: input.capability,
    approval: input.approval,
    executionPlan: input.executionPlan,
    confirmation: input.confirmation,
    adapterContract: input.adapterContract,
  };
}

/**
 * Build the envelope and wrap it in a dry-run report. A ready envelope omits
 * warnings; a not-ready one surfaces its summary reasons as OMP-I-6001
 * warnings. Nothing is written and no adapter is called.
 */
export function createControlledWriteExecutionDryRun(
  input: ControlledWriteExecutionDryRunEnvelopeInput,
): ControlledWriteExecutionDryRunReport {
  const envelope = createControlledWriteExecutionDryRunEnvelope(input);
  if (envelope.ok) {
    return { ok: true, envelope };
  }
  return {
    ok: false,
    envelope,
    warnings: envelope.summary.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
