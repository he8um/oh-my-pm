// Local update policy evaluation: decide whether a locally described channel
// candidate is eligible for update from an installed manifest. This is a
// local, policy-based decision only — nothing here retrieves packages
// remotely, executes installation, or writes files.

import type {
  LocalUpdatePolicy,
  LocalUpdatePolicyDryRunReport,
  LocalUpdatePolicyInput,
  LocalUpdatePolicyReport,
  ReleaseChannelEntry,
  UpdatePolicyMode,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { selectLatestReleaseChannelEntry, validateReleaseChannelName } from "./release-channel.js";
import { isNonEmptyString } from "./validate.js";

/** Conservative default: manual, all channels, no downgrade, integrity required. */
export const DEFAULT_LOCAL_UPDATE_POLICY: LocalUpdatePolicy = {
  mode: "manual",
  allowedChannels: ["stable", "beta", "nightly", "dev"],
  allowDowngrade: false,
  requireIntegrity: true,
};

const POLICY_MODES: readonly UpdatePolicyMode[] = ["manual", "automatic"];

/** Whether a string names a supported update policy mode. */
export function validateUpdatePolicyMode(value: string): value is UpdatePolicyMode {
  return (POLICY_MODES as readonly string[]).includes(value);
}

/** Validate a local update policy; reasons appear at most once, in order. */
export function validateLocalUpdatePolicy(policy: LocalUpdatePolicy): string[] {
  const reasons: string[] = [];
  if (!validateUpdatePolicyMode(policy.mode)) {
    reasons.push("update_policy_mode_invalid");
  }
  if (policy.allowedChannels.length === 0) {
    reasons.push("update_policy_allowed_channels_empty");
  }
  if (policy.allowedChannels.some((channel) => !validateReleaseChannelName(channel))) {
    reasons.push("update_policy_allowed_channel_invalid");
  }
  return reasons;
}

/** Latest candidate from the channel; undefined when none. No mutation. */
export function selectUpdateCandidate(
  input: LocalUpdatePolicyInput,
): ReleaseChannelEntry | undefined {
  return selectLatestReleaseChannelEntry(input.channel.entries);
}

/** Deterministic version comparison; plain ordering, no semver parsing. */
export function compareVersionStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Evaluate whether the latest candidate is eligible for update. */
export function evaluateLocalUpdatePolicy(
  input: LocalUpdatePolicyInput,
): LocalUpdatePolicyReport {
  const channel = input.channel.channel;
  const candidate = selectUpdateCandidate(input);

  const base = (
    decision: LocalUpdatePolicyReport["decision"],
    ok: boolean,
    reasons: string[],
  ): LocalUpdatePolicyReport => {
    const report: LocalUpdatePolicyReport = { ok, decision, channel, reasons };
    if (input.installed !== undefined) {
      report.currentVersion = input.installed.version;
    }
    if (candidate !== undefined) {
      report.candidateVersion = candidate.version;
    }
    return report;
  };

  if (input.installed === undefined) {
    return base("blocked", false, ["installed_manifest_missing"]);
  }
  if (validateLocalUpdatePolicy(input.policy).length > 0) {
    return base("blocked", false, ["update_policy_invalid"]);
  }
  if (!input.policy.allowedChannels.includes(channel)) {
    return base("blocked", false, ["channel_not_allowed"]);
  }
  if (candidate === undefined) {
    return base("blocked", false, ["candidate_missing"]);
  }
  if (input.policy.requireIntegrity && !candidate.integrity.ok) {
    return base("blocked", false, ["candidate_integrity_failed"]);
  }
  if (!isNonEmptyString(candidate.version)) {
    return base("blocked", false, ["candidate_version_missing"]);
  }

  const order = compareVersionStrings(candidate.version, input.installed.version);
  if (order === 0) {
    return base("already-current", true, ["candidate_already_installed"]);
  }
  if (order < 0 && !input.policy.allowDowngrade) {
    return base("blocked", false, ["candidate_downgrade_blocked"]);
  }
  return base("allowed", true, []);
}

/** Wrap evaluation in a dry-run report with OMP-I-6001 warnings. */
export function createLocalUpdatePolicyDryRun(
  input: LocalUpdatePolicyInput,
): LocalUpdatePolicyDryRunReport {
  const report = evaluateLocalUpdatePolicy(input);
  if (report.ok) {
    return { ok: true, report };
  }
  return {
    ok: false,
    report,
    warnings: report.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}
