// Explicit write approval token: a deterministic, local, non-secret token that
// binds a write intent, a root, and a decision value. A future explicit write
// mode can check whether the user intentionally approved the same preview
// result. This is a modelling/validation layer only — the token value is
// plain descriptive text, never a secret and never a hash or signature, and
// nothing here writes files, executes an install or rollback, or reaches for IO.

import type {
  InstallerDecision,
  InstallerWriteApprovalToken,
  InstallerWriteApprovalTokenDryRunReport,
  InstallerWriteApprovalTokenInput,
  InstallerWriteApprovalTokenMatchInput,
  InstallerWriteApprovalTokenMatchReport,
  InstallerWriteApprovalTokenValidationReport,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { validateInstallerWriteIntent } from "./write-capability.js";

const DECISION_VALUES: readonly InstallerDecision[] = ["ready", "blocked", "review-required"];

/** Build the deterministic descriptive token value; plain text, not a secret. */
export function createInstallerWriteApprovalTokenValue(
  input: InstallerWriteApprovalTokenInput,
): string {
  return `approve:${input.intent}:${input.root}:${input.decision.decision}`;
}

/** Build an approval token binding an intent, root, and decision value. */
export function createInstallerWriteApprovalToken(
  input: InstallerWriteApprovalTokenInput,
): InstallerWriteApprovalToken {
  return {
    intent: input.intent,
    root: input.root,
    decision: input.decision.decision,
    value: createInstallerWriteApprovalTokenValue(input),
  };
}

/** Validate a token's internal consistency; reasons are deterministic, each once. */
export function validateInstallerWriteApprovalToken(
  token: InstallerWriteApprovalToken,
): InstallerWriteApprovalTokenValidationReport {
  const reasons: string[] = [];

  if (!validateInstallerWriteIntent(token.intent)) {
    reasons.push("write_approval_token_intent_invalid");
  }
  if (token.root.length === 0) {
    reasons.push("write_approval_token_root_missing");
  }
  if (!(DECISION_VALUES as readonly string[]).includes(token.decision)) {
    reasons.push("write_approval_token_decision_invalid");
  }
  if (token.value.length === 0) {
    reasons.push("write_approval_token_value_missing");
  }
  const expected = `approve:${token.intent}:${token.root}:${token.decision}`;
  if (token.value.length > 0 && token.value !== expected) {
    reasons.push("write_approval_token_value_mismatch");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Match a token against a write capability request. Reasons are deterministic
 * and appear in a fixed order; a token approves only when it is present, valid,
 * and binds the request's intent, decision root, and decision value.
 */
export function matchInstallerWriteApprovalToken(
  input: InstallerWriteApprovalTokenMatchInput,
): InstallerWriteApprovalTokenMatchReport {
  const { token, request } = input;
  const reasons: string[] = [];

  if (token === undefined) {
    reasons.push("write_approval_token_missing");
    return { ok: false, approved: false, reasons };
  }

  if (!validateInstallerWriteApprovalToken(token).ok) {
    reasons.push("write_approval_token_invalid");
  }
  if (token.intent !== request.intent) {
    reasons.push("write_approval_token_intent_mismatch");
  }
  if (token.root !== request.decision.root) {
    reasons.push("write_approval_token_root_mismatch");
  }
  if (token.decision !== request.decision.decision) {
    reasons.push("write_approval_token_decision_mismatch");
  }

  const approved = reasons.length === 0;
  return { ok: approved, approved, reasons };
}

/**
 * Build and validate an approval token. A valid token omits warnings; an
 * invalid one surfaces its reasons as OMP-I-6001 warnings. Nothing is written.
 */
export function createInstallerWriteApprovalTokenDryRun(
  input: InstallerWriteApprovalTokenInput,
): InstallerWriteApprovalTokenDryRunReport {
  const token = createInstallerWriteApprovalToken(input);
  const validation = validateInstallerWriteApprovalToken(token);
  if (validation.ok) {
    return { ok: true, token, validation };
  }
  return {
    ok: false,
    token,
    validation,
    warnings: validation.reasons.map((reason) =>
      installerWarning(OMP_I_INVALID_PACKAGE, reason),
    ),
  };
}
