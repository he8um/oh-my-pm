// Local artifact creation adapter contract: check whether a declared,
// metadata-only adapter contract provides the capability labels required by
// the already-built local artifact creation execution plan. This is a
// metadata-validation layer only — it never receives an adapter instance,
// never calls an adapter method, never creates an artifact or archive, never
// writes files, and never executes anything. Creation stays disabled.

import type {
  LocalArtifactCreationAdapterCapability,
  LocalArtifactCreationAdapterContract,
  LocalArtifactCreationAdapterContractDryRunReport,
  LocalArtifactCreationAdapterContractInput,
  LocalArtifactCreationAdapterContractReport,
  LocalArtifactCreationExecutionPlanStepKind,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

const LOCAL_ARTIFACT_ADAPTER_CAPABILITIES: readonly LocalArtifactCreationAdapterCapability[] = [
  "write-text-output",
  "write-binary-output",
];

/** True only for a supported local artifact adapter capability value. */
export function validateLocalArtifactCreationAdapterCapability(
  value: string,
): value is LocalArtifactCreationAdapterCapability {
  return (LOCAL_ARTIFACT_ADAPTER_CAPABILITIES as readonly string[]).includes(value);
}

/** Validate a declared contract; reasons are deterministic and each appears once. */
export function validateLocalArtifactCreationAdapterContract(
  contract: LocalArtifactCreationAdapterContract,
): string[] {
  const reasons: string[] = [];

  if (contract.name.trim().length === 0) {
    reasons.push("local_artifact_adapter_contract_name_missing");
  }
  if (contract.capabilities.length === 0) {
    reasons.push("local_artifact_adapter_contract_capabilities_empty");
  }
  if (
    contract.capabilities.some(
      (capability) => !validateLocalArtifactCreationAdapterCapability(capability),
    )
  ) {
    reasons.push("local_artifact_adapter_contract_capability_invalid");
  }
  if (!contract.supportsDryRun) {
    reasons.push("local_artifact_adapter_contract_dry_run_required");
  }
  if (!contract.requiresExplicitPermission) {
    reasons.push("local_artifact_adapter_contract_explicit_permission_required");
  }

  return reasons;
}

/** Map a planned creation step kind to the capability label it requires. */
export function mapLocalArtifactCreationStepToAdapterCapability(
  kind: LocalArtifactCreationExecutionPlanStepKind,
): LocalArtifactCreationAdapterCapability {
  switch (kind) {
    case "prepare-archive":
      return "write-binary-output";
    case "prepare-release-notes":
    case "prepare-package-manifest":
    case "prepare-release-metadata":
    case "prepare-integrity-metadata":
    case "prepare-channel-metadata":
      return "write-text-output";
  }
}

/**
 * Collect the capabilities the planned steps require, in step order and
 * deduped in first-occurrence order. Blocked steps contribute nothing.
 * Nothing is mutated.
 */
export function collectRequiredLocalArtifactCreationAdapterCapabilities(
  input: LocalArtifactCreationAdapterContractInput,
): LocalArtifactCreationAdapterCapability[] {
  const required: LocalArtifactCreationAdapterCapability[] = [];
  for (const step of input.executionPlan.steps) {
    if (!step.planned) {
      continue;
    }
    const capability = mapLocalArtifactCreationStepToAdapterCapability(step.kind);
    if (!required.includes(capability)) {
      required.push(capability);
    }
  }
  return required;
}

/**
 * Evaluate the declared contract against the required capabilities. Reasons
 * are deterministic and appear in a fixed order; the contract is ok only when
 * every check passes, and `creationAllowed` stays false regardless. Never
 * throws for normal invalid input, never mutates, and never calls an adapter.
 */
export function evaluateLocalArtifactCreationAdapterContract(
  input: LocalArtifactCreationAdapterContractInput,
): LocalArtifactCreationAdapterContractReport {
  const { contract, permission, executionPlan } = input;
  const requiredCapabilities = collectRequiredLocalArtifactCreationAdapterCapabilities(input);
  const declaredCapabilities = [...contract.capabilities];
  const reasons: string[] = [];

  if (validateLocalArtifactCreationAdapterContract(contract).length > 0) {
    reasons.push("local_artifact_adapter_contract_invalid");
  }
  if (permission.allowed === false) {
    reasons.push("local_artifact_adapter_permission_not_allowed");
  }
  if (executionPlan.ok === false) {
    reasons.push("local_artifact_adapter_execution_plan_not_ready");
  }
  if (requiredCapabilities.length === 0) {
    reasons.push("local_artifact_adapter_required_capabilities_empty");
  }
  if (requiredCapabilities.some((capability) => !declaredCapabilities.includes(capability))) {
    reasons.push("local_artifact_adapter_capability_missing");
  }

  return {
    ok: reasons.length === 0,
    name: contract.name,
    requiredCapabilities,
    declaredCapabilities,
    reasons,
    creationAllowed: false,
  };
}

/**
 * Evaluate the contract and wrap it in a dry-run report. A passing contract
 * omits warnings; a failing one surfaces its reasons as OMP-I-6001 warnings.
 * Nothing is written and no adapter is called.
 */
export function createLocalArtifactCreationAdapterContractDryRun(
  input: LocalArtifactCreationAdapterContractInput,
): LocalArtifactCreationAdapterContractDryRunReport {
  const report = evaluateLocalArtifactCreationAdapterContract(input);
  if (report.ok) {
    return { ok: true, report };
  }
  return {
    ok: false,
    report,
    warnings: report.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}

/** Render the report as deterministic markdown with one trailing newline. */
export function formatLocalArtifactCreationAdapterContractMarkdown(
  report: LocalArtifactCreationAdapterContractReport,
): string {
  const lines = [
    "# OH MY PM Local Artifact Creation Adapter Contract",
    "",
    `Name: \`${report.name}\``,
    `Status: \`${report.ok ? "ready" : "blocked"}\``,
    "Creation allowed: `false`",
    "",
    "## Capabilities",
    "",
  ];
  if (report.requiredCapabilities.length === 0) {
    lines.push("- none");
  } else {
    for (const capability of report.requiredCapabilities) {
      lines.push(`- Required: \`${capability}\``);
    }
  }
  if (report.declaredCapabilities.length === 0) {
    lines.push("- none");
  } else {
    for (const capability of report.declaredCapabilities) {
      lines.push(`- Declared: \`${capability}\``);
    }
  }
  lines.push("", "## Reasons", "");
  if (report.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of report.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
