// Guarded release artifact planning: from local release-readiness, v0
// checklist, release notes, package assembly, archive, metadata, integrity,
// and channel dry-runs, decide which public release outputs would be planned
// for a future guarded release. This is planning-only — creation stays
// disabled. It never creates release outputs, archives, or packages, never
// writes files, and never executes anything.

import type {
  GuardedReleaseArtifactPlan,
  GuardedReleaseArtifactPlanDryRunReport,
  GuardedReleaseArtifactPlanInput,
  GuardedReleaseArtifactPlanItem,
  GuardedReleaseArtifactPlanSummary,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Build one plan item, attaching a reason only when it is not planned. */
function planItem(
  sequence: number,
  kind: GuardedReleaseArtifactPlanItem["kind"],
  name: string,
  planned: boolean,
  reason: string,
): GuardedReleaseArtifactPlanItem {
  return {
    sequence,
    kind,
    name,
    planned,
    ...(planned ? {} : { reason }),
  };
}

/** Build the plan items in fixed order; sequences are contiguous from 1. */
export function createGuardedReleaseArtifactPlanItems(
  input: GuardedReleaseArtifactPlanInput,
): GuardedReleaseArtifactPlanItem[] {
  return [
    planItem(
      1,
      "release-notes",
      "Public v0 release notes draft",
      input.releaseNotes.ok,
      "guarded_release_artifact_release_notes_blocked",
    ),
    planItem(
      2,
      "package-manifest",
      "Package manifest",
      input.assembly.ok,
      "guarded_release_artifact_package_manifest_blocked",
    ),
    planItem(
      3,
      "archive-plan",
      "Archive plan",
      input.archive.ok,
      "guarded_release_artifact_archive_plan_blocked",
    ),
    planItem(
      4,
      "release-metadata",
      "Release metadata",
      input.metadata.ok,
      "guarded_release_artifact_metadata_blocked",
    ),
    planItem(
      5,
      "integrity-metadata",
      "Release integrity metadata",
      input.integrity.ok,
      "guarded_release_artifact_integrity_blocked",
    ),
    planItem(
      6,
      "channel-metadata",
      "Release channel metadata",
      input.channel.ok,
      "guarded_release_artifact_channel_blocked",
    ),
  ];
}

/**
 * Collect the plan's reasons in fixed order: the version/checklist/readiness
 * gates first, then each not-planned item's reason in item order. Raw source
 * report reasons are never copied. Each reason appears at most once.
 */
export function collectGuardedReleaseArtifactPlanReasons(
  input: GuardedReleaseArtifactPlanInput,
  items: readonly GuardedReleaseArtifactPlanItem[],
): string[] {
  const reasons: string[] = [];
  if (input.version.trim().length === 0) {
    reasons.push("guarded_release_artifact_version_missing");
  }
  if (!input.v0Checklist.ok) {
    reasons.push("guarded_release_artifact_v0_checklist_blocked");
  }
  if (!input.releaseReadiness.ok) {
    reasons.push("guarded_release_artifact_release_readiness_blocked");
  }
  for (const item of items) {
    if (!item.planned && item.reason !== undefined && !reasons.includes(item.reason)) {
      reasons.push(item.reason);
    }
  }
  return reasons;
}

/** Summarize planned/blocked counts; creation is always disallowed. */
export function summarizeGuardedReleaseArtifactPlan(
  input: GuardedReleaseArtifactPlanInput,
  items: readonly GuardedReleaseArtifactPlanItem[],
): GuardedReleaseArtifactPlanSummary {
  return {
    version: input.version,
    plannedItems: items.filter((item) => item.planned).length,
    blockedItems: items.filter((item) => !item.planned).length,
    totalItems: items.length,
    creationAllowed: false,
  };
}

/**
 * Build the plan. It is ok only when there are no reasons, every item is
 * planned, and creation stays disallowed — so a plan can be ok while still not
 * permitting creation. Nothing is created or written.
 */
export function createGuardedReleaseArtifactPlan(
  input: GuardedReleaseArtifactPlanInput,
): GuardedReleaseArtifactPlan {
  const items = createGuardedReleaseArtifactPlanItems(input);
  const reasons = collectGuardedReleaseArtifactPlanReasons(input, items);
  const summary = summarizeGuardedReleaseArtifactPlan(input, items);
  return {
    ok: reasons.length === 0 && items.every((item) => item.planned) && summary.creationAllowed === false,
    version: input.version,
    items,
    reasons,
    summary,
  };
}

/**
 * Build the plan and wrap it in a dry-run report. A ready plan omits warnings;
 * a blocked one surfaces its reasons as OMP-I-6001 warnings. Nothing is written.
 */
export function createGuardedReleaseArtifactPlanDryRun(
  input: GuardedReleaseArtifactPlanInput,
): GuardedReleaseArtifactPlanDryRunReport {
  const plan = createGuardedReleaseArtifactPlan(input);
  if (plan.ok) {
    return { ok: true, plan };
  }
  return {
    ok: false,
    plan,
    warnings: plan.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}

/** Render the plan as deterministic markdown with one trailing newline. */
export function formatGuardedReleaseArtifactPlanMarkdown(
  plan: GuardedReleaseArtifactPlan,
): string {
  const lines = [
    "# OH MY PM Guarded Release Artifact Plan",
    "",
    `Version: \`${plan.version}\``,
    `Status: \`${plan.ok ? "ready" : "blocked"}\``,
    "Creation allowed: `false`",
    "",
    "## Summary",
    "",
    `- Planned items: ${plan.summary.plannedItems}`,
    `- Blocked items: ${plan.summary.blockedItems}`,
    `- Total items: ${plan.summary.totalItems}`,
    "",
    "## Items",
    "",
  ];
  for (const item of plan.items) {
    const box = item.planned ? "[x]" : "[ ]";
    const suffix = item.planned || item.reason === undefined ? "" : ` - reason: \`${item.reason}\``;
    lines.push(`- \`${box}\` \`${item.sequence}\` \`${item.kind}\` - ${item.name}${suffix}`);
  }
  lines.push("", "## Reasons", "");
  if (plan.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of plan.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
