// Local artifact creation confirmation checklist: compose the guarded
// artifact creation permission report, the local artifact creation execution
// plan, and the metadata-only adapter contract report into one deterministic
// readiness confirmation. This confirms readiness only — it never receives an
// adapter instance, never calls an adapter method, never creates an artifact
// or archive, never writes files, and never executes anything. Creation stays
// disabled.

import type {
  LocalArtifactCreationConfirmationChecklist,
  LocalArtifactCreationConfirmationChecklistDryRunReport,
  LocalArtifactCreationConfirmationChecklistInput,
  LocalArtifactCreationConfirmationChecklistItem,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/**
 * Build the confirmation items in a fixed order. A passing item omits
 * `reason`; a failing item carries exactly its own reason. Nothing is
 * mutated, no raw source-report reason is copied, no adapter is called, and
 * nothing is written.
 */
export function createLocalArtifactCreationConfirmationChecklistItems(
  input: LocalArtifactCreationConfirmationChecklistInput,
): LocalArtifactCreationConfirmationChecklistItem[] {
  const creationDisabled =
    input.permission.creationAllowed === false &&
    input.executionPlan.summary.creationAllowed === false &&
    input.adapterContract.creationAllowed === false;

  const checks: Array<{
    id: LocalArtifactCreationConfirmationChecklistItem["id"];
    label: string;
    ok: boolean;
    reason: string;
  }> = [
    {
      id: "version-present",
      label: "Artifact version is present",
      ok: input.version.trim().length > 0,
      reason: "local_artifact_confirmation_version_missing",
    },
    {
      id: "permission-allowed",
      label: "Guarded artifact creation permission is allowed",
      ok: input.permission.allowed === true,
      reason: "local_artifact_confirmation_permission_not_allowed",
    },
    {
      id: "execution-plan-ready",
      label: "Local artifact creation execution plan is ready",
      ok: input.executionPlan.ok === true,
      reason: "local_artifact_confirmation_execution_plan_not_ready",
    },
    {
      id: "execution-steps-present",
      label: "Local artifact creation execution steps are present",
      ok: input.executionPlan.steps.length > 0,
      reason: "local_artifact_confirmation_execution_steps_empty",
    },
    {
      id: "adapter-contract-ready",
      label: "Local artifact creation adapter contract is ready",
      ok: input.adapterContract.ok === true,
      reason: "local_artifact_confirmation_adapter_contract_not_ready",
    },
    {
      id: "required-capabilities-present",
      label: "Required artifact adapter capabilities are present",
      ok: input.adapterContract.requiredCapabilities.length > 0,
      reason: "local_artifact_confirmation_required_capabilities_empty",
    },
    {
      id: "creation-remains-disabled",
      label: "Artifact creation remains disabled in this phase",
      ok: creationDisabled,
      reason: "local_artifact_confirmation_creation_must_remain_disabled",
    },
  ];

  return checks.map((check) =>
    check.ok
      ? { id: check.id, label: check.label, ok: true }
      : { id: check.id, label: check.label, ok: false, reason: check.reason },
  );
}

/**
 * Build the full confirmation checklist. Reasons are the failed items'
 * reasons in item order, each at most once; `creationAllowed` is always false
 * and the checklist is ok only when every item passes — readiness never
 * enables creation. Nothing is mutated and nothing is written.
 */
export function createLocalArtifactCreationConfirmationChecklist(
  input: LocalArtifactCreationConfirmationChecklistInput,
): LocalArtifactCreationConfirmationChecklist {
  const items = createLocalArtifactCreationConfirmationChecklistItems(input);
  const reasons: string[] = [];
  for (const item of items) {
    if (item.reason !== undefined && !reasons.includes(item.reason)) {
      reasons.push(item.reason);
    }
  }
  return {
    // `creationAllowed` is the literal false below, so readiness can hold
    // while creation stays disabled.
    ok: items.every((item) => item.ok) && reasons.length === 0,
    version: input.version,
    items,
    reasons,
    creationAllowed: false,
  };
}

/**
 * Build the checklist and wrap it in a dry-run report. A ready checklist
 * omits warnings; a blocked one surfaces its reasons as OMP-I-6001 warnings.
 * Nothing is written and no adapter is called.
 */
export function createLocalArtifactCreationConfirmationChecklistDryRun(
  input: LocalArtifactCreationConfirmationChecklistInput,
): LocalArtifactCreationConfirmationChecklistDryRunReport {
  const checklist = createLocalArtifactCreationConfirmationChecklist(input);
  if (checklist.ok) {
    return { ok: true, checklist };
  }
  return {
    ok: false,
    checklist,
    warnings: checklist.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}

/** Render the checklist as deterministic markdown with one trailing newline. */
export function formatLocalArtifactCreationConfirmationChecklistMarkdown(
  checklist: LocalArtifactCreationConfirmationChecklist,
): string {
  const lines = [
    "# OH MY PM Local Artifact Creation Confirmation Checklist",
    "",
    `Version: \`${checklist.version}\``,
    `Status: \`${checklist.ok ? "ready" : "blocked"}\``,
    "Creation allowed: `false`",
    "",
    "## Items",
    "",
  ];
  for (const item of checklist.items) {
    if (item.ok) {
      lines.push(`- \`[x]\` \`${item.id}\` — ${item.label}`);
    } else {
      lines.push(`- \`[ ]\` \`${item.id}\` — ${item.label} — reason: \`${item.reason}\``);
    }
  }
  lines.push("", "## Reasons", "");
  if (checklist.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of checklist.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
