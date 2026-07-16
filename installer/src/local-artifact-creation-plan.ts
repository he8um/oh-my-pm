// Local artifact creation execution plan: from the guarded artifact creation
// permission dry-run, the guarded release artifact plan, and the guarded
// local artifact assembly dry-run, sequence the ordered local creation steps
// a future explicitly-enabled phase would take. This is planning-only —
// creation stays disabled. It never creates an artifact, archive, package, or
// release output, never writes files, never calls an adapter, and never
// executes anything.

import type {
  GuardedReleaseArtifactPlanItemKind,
  LocalArtifactCreationExecutionPlan,
  LocalArtifactCreationExecutionPlanDryRunReport,
  LocalArtifactCreationExecutionPlanInput,
  LocalArtifactCreationExecutionPlanStep,
  LocalArtifactCreationExecutionPlanStepKind,
  LocalArtifactCreationExecutionPlanSummary,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

const STEP_KIND_BY_ARTIFACT_PLAN_ITEM_KIND: Record<
  GuardedReleaseArtifactPlanItemKind,
  LocalArtifactCreationExecutionPlanStepKind
> = {
  "release-notes": "prepare-release-notes",
  "package-manifest": "prepare-package-manifest",
  "archive-plan": "prepare-archive",
  "release-metadata": "prepare-release-metadata",
  "integrity-metadata": "prepare-integrity-metadata",
  "channel-metadata": "prepare-channel-metadata",
};

/**
 * Build the plan steps from the artifact plan items in item order; sequences
 * are contiguous from 1. A step carries a reason only when it is not planned:
 * the source item's reason when present, a fixed fallback otherwise. Nothing
 * is mutated or written.
 */
export function createLocalArtifactCreationExecutionPlanSteps(
  input: LocalArtifactCreationExecutionPlanInput,
): LocalArtifactCreationExecutionPlanStep[] {
  return input.artifactPlan.plan.items.map((item, index) => ({
    sequence: index + 1,
    kind: STEP_KIND_BY_ARTIFACT_PLAN_ITEM_KIND[item.kind],
    name: item.name,
    planned: item.planned,
    ...(item.planned
      ? {}
      : { reason: item.reason ?? "local_artifact_creation_step_not_planned" }),
  }));
}

/**
 * Collect the plan's reasons in fixed order: the version/permission/assembly
 * gates and the empty-steps gate first, then each failed step's reason in
 * step order. Raw permission, assembly, and artifact-plan report reasons are
 * never copied — only failed step reasons already carried by the steps. Each
 * reason appears at most once.
 */
export function collectLocalArtifactCreationExecutionPlanReasons(
  input: LocalArtifactCreationExecutionPlanInput,
  steps: readonly LocalArtifactCreationExecutionPlanStep[],
): string[] {
  const reasons: string[] = [];
  if (input.version.trim().length === 0) {
    reasons.push("local_artifact_creation_version_missing");
  }
  if (input.permission.report.allowed === false) {
    reasons.push("local_artifact_creation_permission_not_allowed");
  }
  if (input.assembly.ok === false) {
    reasons.push("local_artifact_creation_assembly_not_ready");
  }
  if (steps.length === 0) {
    reasons.push("local_artifact_creation_no_steps");
  }
  for (const step of steps) {
    if (!step.planned && step.reason !== undefined && !reasons.includes(step.reason)) {
      reasons.push(step.reason);
    }
  }
  return reasons;
}

/** Summarize gate and step readiness; creation is always disallowed. */
export function summarizeLocalArtifactCreationExecutionPlan(
  input: LocalArtifactCreationExecutionPlanInput,
  steps: readonly LocalArtifactCreationExecutionPlanStep[],
): LocalArtifactCreationExecutionPlanSummary {
  return {
    version: input.version,
    permissionAllowed: input.permission.report.allowed,
    assemblyReady: input.assembly.ok,
    plannedSteps: steps.filter((step) => step.planned).length,
    blockedSteps: steps.filter((step) => !step.planned).length,
    totalSteps: steps.length,
    creationAllowed: false,
  };
}

/**
 * Build the plan. It is ok only when there are no reasons, every step is
 * planned, and creation stays disallowed — so a plan can be ok while still
 * not permitting creation. Nothing is created or written.
 */
export function createLocalArtifactCreationExecutionPlan(
  input: LocalArtifactCreationExecutionPlanInput,
): LocalArtifactCreationExecutionPlan {
  const steps = createLocalArtifactCreationExecutionPlanSteps(input);
  const reasons = collectLocalArtifactCreationExecutionPlanReasons(input, steps);
  const summary = summarizeLocalArtifactCreationExecutionPlan(input, steps);
  return {
    ok:
      reasons.length === 0 &&
      steps.every((step) => step.planned) &&
      summary.creationAllowed === false,
    version: input.version,
    steps,
    reasons,
    summary,
  };
}

/**
 * Build the plan and wrap it in a dry-run report. A ready plan omits
 * warnings; a blocked one surfaces its reasons as OMP-I-6001 warnings.
 * Nothing is written.
 */
export function createLocalArtifactCreationExecutionPlanDryRun(
  input: LocalArtifactCreationExecutionPlanInput,
): LocalArtifactCreationExecutionPlanDryRunReport {
  const plan = createLocalArtifactCreationExecutionPlan(input);
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
export function formatLocalArtifactCreationExecutionPlanMarkdown(
  plan: LocalArtifactCreationExecutionPlan,
): string {
  const lines = [
    "# OH MY PM Local Artifact Creation Execution Plan",
    "",
    `Version: \`${plan.version}\``,
    `Status: \`${plan.ok ? "ready" : "blocked"}\``,
    `Permission allowed: \`${plan.summary.permissionAllowed}\``,
    `Assembly ready: \`${plan.summary.assemblyReady}\``,
    "Creation allowed: `false`",
    "",
    "## Summary",
    "",
    `- Planned steps: ${plan.summary.plannedSteps}`,
    `- Blocked steps: ${plan.summary.blockedSteps}`,
    `- Total steps: ${plan.summary.totalSteps}`,
    "",
    "## Steps",
    "",
  ];
  for (const step of plan.steps) {
    const box = step.planned ? "[x]" : "[ ]";
    const suffix =
      step.planned || step.reason === undefined ? "" : ` — reason: \`${step.reason}\``;
    lines.push(`- \`${box}\` \`${step.sequence}\` \`${step.kind}\` — ${step.name}${suffix}`);
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
