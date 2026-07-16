// Guarded artifact creation permission model: given a permission policy, an
// explicit approval flag, and the guarded local artifact assembly dry-run
// envelope, evaluate whether a future explicitly-enabled local artifact
// creation phase would be permitted. This is an evaluation layer only —
// creation stays disabled in this phase: it never creates an artifact or
// archive, never writes files, never calls an adapter, and never executes
// anything.

import type {
  GuardedArtifactCreationPermissionDryRunReport,
  GuardedArtifactCreationPermissionInput,
  GuardedArtifactCreationPermissionMode,
  GuardedArtifactCreationPermissionPolicy,
  GuardedArtifactCreationPermissionReport,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

const ARTIFACT_CREATION_PERMISSION_MODES: readonly GuardedArtifactCreationPermissionMode[] = [
  "disabled",
  "dry-run-only",
  "explicit",
];

/**
 * Default permission policy: dry-run-only, requires a ready assembly
 * envelope, and requires explicit approval. Under this policy permission is
 * never granted.
 */
export const DEFAULT_GUARDED_ARTIFACT_CREATION_PERMISSION_POLICY: GuardedArtifactCreationPermissionPolicy =
  {
    mode: "dry-run-only",
    requireReadyAssembly: true,
    requireExplicitApproval: true,
  };

/** True only for a supported artifact creation permission mode value. */
export function validateGuardedArtifactCreationPermissionMode(
  value: string,
): value is GuardedArtifactCreationPermissionMode {
  return (ARTIFACT_CREATION_PERMISSION_MODES as readonly string[]).includes(value);
}

/**
 * Validate a permission policy; reasons are deterministic and each appears
 * once. This phase mandates that a policy require a ready assembly envelope
 * and explicit approval.
 */
export function validateGuardedArtifactCreationPermissionPolicy(
  policy: GuardedArtifactCreationPermissionPolicy,
): string[] {
  const reasons: string[] = [];

  if (!validateGuardedArtifactCreationPermissionMode(policy.mode)) {
    reasons.push("artifact_creation_permission_mode_invalid");
  }
  if (policy.requireReadyAssembly !== true) {
    reasons.push("artifact_creation_permission_ready_assembly_required");
  }
  if (policy.requireExplicitApproval !== true) {
    reasons.push("artifact_creation_permission_explicit_approval_required");
  }

  return reasons;
}

/**
 * Evaluate whether artifact creation permission would be granted. Reasons are
 * deterministic and appear in a fixed order; permission is allowed only when
 * every guard passes, and `creationAllowed` stays false regardless. Never
 * throws for normal invalid input and never mutates.
 */
export function evaluateGuardedArtifactCreationPermission(
  input: GuardedArtifactCreationPermissionInput,
): GuardedArtifactCreationPermissionReport {
  const { version, policy, approved, assembly } = input;
  const reasons: string[] = [];

  if (validateGuardedArtifactCreationPermissionPolicy(policy).length > 0) {
    reasons.push("artifact_creation_permission_policy_invalid");
  }
  if (version.trim().length === 0) {
    reasons.push("artifact_creation_permission_version_missing");
  }
  if (policy.mode === "disabled") {
    reasons.push("artifact_creation_permission_disabled");
  }
  if (policy.mode === "dry-run-only") {
    reasons.push("artifact_creation_permission_dry_run_only");
  }
  if (policy.requireReadyAssembly && assembly.ok === false) {
    reasons.push("artifact_creation_permission_assembly_not_ready");
  }
  if (policy.requireExplicitApproval && approved === false) {
    reasons.push("artifact_creation_permission_approval_required");
  }

  const allowed = reasons.length === 0;
  return {
    ok: allowed,
    version,
    mode: policy.mode,
    allowed,
    creationAllowed: false,
    reasons,
  };
}

/**
 * Evaluate the permission and wrap it in a dry-run report. An allowed
 * evaluation omits warnings; a blocked one surfaces its reasons as OMP-I-6001
 * warnings. Nothing is created, written, or executed.
 */
export function createGuardedArtifactCreationPermissionDryRun(
  input: GuardedArtifactCreationPermissionInput,
): GuardedArtifactCreationPermissionDryRunReport {
  const report = evaluateGuardedArtifactCreationPermission(input);
  if (report.allowed) {
    return { ok: true, report };
  }
  return {
    ok: false,
    report,
    warnings: report.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}

/** Render the permission report as deterministic markdown with one trailing newline. */
export function formatGuardedArtifactCreationPermissionMarkdown(
  report: GuardedArtifactCreationPermissionReport,
): string {
  const lines = [
    "# OH MY PM Guarded Artifact Creation Permission",
    "",
    `Version: \`${report.version}\``,
    `Mode: \`${report.mode}\``,
    `Allowed: \`${report.allowed}\``,
    "Creation allowed: `false`",
    "",
    "## Reasons",
    "",
  ];
  if (report.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of report.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
