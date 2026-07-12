// Controlled write adapter contract hardening: check whether a declared write
// adapter metadata contract has the local capabilities required by an
// already-built write execution plan and confirmation checklist. This is a
// metadata-validation layer only — it never receives an adapter instance,
// never calls an adapter method, never writes files, and never executes an
// install or rollback.

import type {
  InstallerWriteAdapterCapability,
  InstallerWriteAdapterContract,
  InstallerWriteAdapterContractDryRunReport,
  InstallerWriteAdapterContractInput,
  InstallerWriteAdapterContractReport,
  InstallerWriteExecutionPlanStepKind,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

const WRITE_ADAPTER_CAPABILITIES: readonly InstallerWriteAdapterCapability[] = [
  "write-file",
  "remove-file",
  "backup-file",
];

/** True only for a supported write adapter capability value. */
export function validateInstallerWriteAdapterCapability(
  value: string,
): value is InstallerWriteAdapterCapability {
  return (WRITE_ADAPTER_CAPABILITIES as readonly string[]).includes(value);
}

/** Validate a declared contract; reasons are deterministic and each appears once. */
export function validateInstallerWriteAdapterContract(
  contract: InstallerWriteAdapterContract,
): string[] {
  const reasons: string[] = [];

  if (contract.name.length === 0) {
    reasons.push("write_adapter_contract_name_missing");
  }
  if (contract.capabilities.length === 0) {
    reasons.push("write_adapter_contract_capabilities_empty");
  }
  if (contract.capabilities.some((capability) => !validateInstallerWriteAdapterCapability(capability))) {
    reasons.push("write_adapter_contract_capability_invalid");
  }
  if (!contract.requiresExplicitApproval) {
    reasons.push("write_adapter_contract_explicit_approval_required");
  }

  return reasons;
}

/** Map a planned write step kind to the adapter capability it requires. */
export function mapWriteStepKindToAdapterCapability(
  kind: InstallerWriteExecutionPlanStepKind,
): InstallerWriteAdapterCapability {
  switch (kind) {
    case "install-create":
    case "install-replace":
    case "update-create":
    case "update-replace":
    case "rollback-restore":
      return "write-file";
    case "install-remove":
    case "update-remove":
    case "rollback-remove":
      return "remove-file";
    case "install-backup":
      return "backup-file";
  }
}

/** Collect the required capabilities, deduped in first-occurrence order. */
export function collectRequiredWriteAdapterCapabilities(
  input: InstallerWriteAdapterContractInput,
): InstallerWriteAdapterCapability[] {
  const required: InstallerWriteAdapterCapability[] = [];
  for (const step of input.executionPlan.steps) {
    const capability = mapWriteStepKindToAdapterCapability(step.kind);
    if (!required.includes(capability)) {
      required.push(capability);
    }
  }
  return required;
}

/**
 * Evaluate the declared contract against the required capabilities. Reasons are
 * deterministic and appear in a fixed order; the contract is ok only when every
 * check passes. Never throws for normal invalid input, never mutates, and never
 * calls an adapter.
 */
export function evaluateInstallerWriteAdapterContract(
  input: InstallerWriteAdapterContractInput,
): InstallerWriteAdapterContractReport {
  const { contract, confirmation, executionPlan } = input;
  const requiredCapabilities = collectRequiredWriteAdapterCapabilities(input);
  const declaredCapabilities = [...contract.capabilities];
  const reasons: string[] = [];

  if (validateInstallerWriteAdapterContract(contract).length > 0) {
    reasons.push("write_adapter_contract_invalid");
  }
  if (!confirmation.ok) {
    reasons.push("write_adapter_confirmation_not_ready");
  }
  if (!executionPlan.ok) {
    reasons.push("write_adapter_execution_plan_not_ready");
  }
  if (requiredCapabilities.length === 0) {
    reasons.push("write_adapter_required_capabilities_empty");
  }
  if (requiredCapabilities.some((capability) => !declaredCapabilities.includes(capability))) {
    reasons.push("write_adapter_capability_missing");
  }
  if (requiredCapabilities.includes("backup-file") && !contract.supportsRollbackCapture) {
    reasons.push("write_adapter_rollback_capture_not_supported");
  }

  return {
    ok: reasons.length === 0,
    name: contract.name,
    requiredCapabilities,
    declaredCapabilities,
    reasons,
  };
}

/**
 * Evaluate the contract and wrap it in a dry-run report. A passing contract
 * omits warnings; a failing one surfaces its reasons as OMP-I-6001 warnings.
 * Nothing is written and no adapter is called.
 */
export function createInstallerWriteAdapterContractDryRun(
  input: InstallerWriteAdapterContractInput,
): InstallerWriteAdapterContractDryRunReport {
  const report = evaluateInstallerWriteAdapterContract(input);
  if (report.ok) {
    return { ok: true, report };
  }
  return {
    ok: false,
    report,
    warnings: report.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}
