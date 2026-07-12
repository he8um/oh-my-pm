// Guarded installer write capability: given a decision report, an explicit
// capability policy, and a requested write intent, decide whether installer
// writes would be allowed. This is a modelling/validation layer only — it
// never writes files, executes an install or rollback, calls a write adapter,
// retrieves anything remotely, or exposes a production install command.

import type {
  InstallerWriteCapabilityDryRunReport,
  InstallerWriteCapabilityInput,
  InstallerWriteCapabilityMode,
  InstallerWriteCapabilityPolicy,
  InstallerWriteCapabilityReport,
  InstallerWriteIntent,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

const WRITE_INTENTS: readonly InstallerWriteIntent[] = ["install", "update", "rollback"];

const WRITE_CAPABILITY_MODES: readonly InstallerWriteCapabilityMode[] = [
  "disabled",
  "preview-only",
  "explicit",
];

/**
 * Default capability policy: preview-only, requires a ready decision, and
 * requires explicit approval. Under this policy no write is ever allowed.
 */
export const DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY: InstallerWriteCapabilityPolicy = {
  mode: "preview-only",
  allowedIntents: ["install", "update", "rollback"],
  requireReadyDecision: true,
  requireExplicitApproval: true,
};

/** True only for a supported write intent value. */
export function validateInstallerWriteIntent(value: string): value is InstallerWriteIntent {
  return (WRITE_INTENTS as readonly string[]).includes(value);
}

/** True only for a supported write capability mode value. */
export function validateInstallerWriteCapabilityMode(
  value: string,
): value is InstallerWriteCapabilityMode {
  return (WRITE_CAPABILITY_MODES as readonly string[]).includes(value);
}

/** Validate a capability policy; reasons are deterministic and each appears once. */
export function validateInstallerWriteCapabilityPolicy(
  policy: InstallerWriteCapabilityPolicy,
): string[] {
  const reasons: string[] = [];

  if (!validateInstallerWriteCapabilityMode(policy.mode)) {
    reasons.push("write_capability_mode_invalid");
  }
  if (policy.allowedIntents.length === 0) {
    reasons.push("write_capability_allowed_intents_empty");
  }
  if (policy.allowedIntents.some((intent) => !validateInstallerWriteIntent(intent))) {
    reasons.push("write_capability_allowed_intent_invalid");
  }

  return reasons;
}

/**
 * Evaluate whether a requested write intent would be allowed. Reasons are
 * deterministic and appear in a fixed order; the request is allowed only when
 * every guard passes. Never throws for normal invalid input and never mutates.
 */
export function evaluateInstallerWriteCapability(
  input: InstallerWriteCapabilityInput,
): InstallerWriteCapabilityReport {
  const { intent, approved, decision, policy } = input;
  const reasons: string[] = [];

  if (validateInstallerWriteCapabilityPolicy(policy).length > 0) {
    reasons.push("write_capability_policy_invalid");
  }
  if (policy.mode === "disabled") {
    reasons.push("write_capability_disabled");
  }
  if (policy.mode === "preview-only") {
    reasons.push("write_capability_preview_only");
  }
  if (!validateInstallerWriteIntent(intent)) {
    reasons.push("write_capability_intent_invalid");
  }
  if (!policy.allowedIntents.includes(intent)) {
    reasons.push("write_capability_intent_not_allowed");
  }
  if (policy.requireReadyDecision && decision.decision !== "ready") {
    reasons.push("write_capability_decision_not_ready");
  }
  if (policy.requireExplicitApproval && !approved) {
    reasons.push("write_capability_approval_required");
  }

  const allowed = reasons.length === 0;
  return {
    ok: allowed,
    intent,
    mode: policy.mode,
    allowed,
    reasons,
  };
}

/**
 * Evaluate the request and wrap it in a dry-run report. An allowed request
 * omits warnings; a blocked one surfaces its reasons as OMP-I-6001 warnings.
 * Nothing is written or executed.
 */
export function createInstallerWriteCapabilityDryRun(
  input: InstallerWriteCapabilityInput,
): InstallerWriteCapabilityDryRunReport {
  const report = evaluateInstallerWriteCapability(input);
  if (report.allowed) {
    return { ok: true, report };
  }
  return {
    ok: false,
    report,
    warnings: report.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
