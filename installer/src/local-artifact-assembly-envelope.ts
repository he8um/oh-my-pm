// Guarded local artifact assembly dry-run envelope: aggregate the guarded
// release artifact plan and the package assembly, archive, metadata, integrity,
// and channel dry-runs into one local readiness envelope. This is a
// readiness/aggregation layer only — creation stays disabled. It never creates
// archives, packages, or release outputs, never writes files, and never
// executes anything.

import type {
  GuardedLocalArtifactAssemblyDryRunEnvelope,
  GuardedLocalArtifactAssemblyDryRunEnvelopeInput,
  GuardedLocalArtifactAssemblyDryRunEnvelopeSummary,
  GuardedLocalArtifactAssemblyDryRunReport,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Collect the readiness reasons in a fixed order; each appears at most once. */
export function collectGuardedLocalArtifactAssemblyDryRunReasons(
  input: GuardedLocalArtifactAssemblyDryRunEnvelopeInput,
): string[] {
  const reasons: string[] = [];
  if (input.version.trim().length === 0) {
    reasons.push("guarded_local_artifact_assembly_version_missing");
  }
  if (!input.artifactPlan.ok) {
    reasons.push("guarded_local_artifact_assembly_plan_not_ready");
  }
  if (!input.assembly.ok) {
    reasons.push("guarded_local_artifact_assembly_package_not_ready");
  }
  if (!input.archive.ok) {
    reasons.push("guarded_local_artifact_assembly_archive_not_ready");
  }
  if (!input.metadata.ok) {
    reasons.push("guarded_local_artifact_assembly_metadata_not_ready");
  }
  if (!input.integrity.ok) {
    reasons.push("guarded_local_artifact_assembly_integrity_not_ready");
  }
  if (!input.channel.ok) {
    reasons.push("guarded_local_artifact_assembly_channel_not_ready");
  }
  return reasons;
}

/** Build a flat readiness summary; creation is always disallowed. */
export function summarizeGuardedLocalArtifactAssemblyDryRunEnvelope(
  input: GuardedLocalArtifactAssemblyDryRunEnvelopeInput,
): GuardedLocalArtifactAssemblyDryRunEnvelopeSummary {
  return {
    version: input.version,
    artifactPlanReady: input.artifactPlan.ok,
    packageAssemblyReady: input.assembly.ok,
    archivePlanReady: input.archive.ok,
    metadataReady: input.metadata.ok,
    integrityReady: input.integrity.ok,
    channelReady: input.channel.ok,
    creationAllowed: false,
    reasons: collectGuardedLocalArtifactAssemblyDryRunReasons(input),
  };
}

/**
 * Build the envelope: a readiness summary plus pass-through references to each
 * already computed report. It is ok only when there are no reasons and creation
 * stays disallowed. Nothing is mutated or written.
 */
export function createGuardedLocalArtifactAssemblyDryRunEnvelope(
  input: GuardedLocalArtifactAssemblyDryRunEnvelopeInput,
): GuardedLocalArtifactAssemblyDryRunEnvelope {
  const summary = summarizeGuardedLocalArtifactAssemblyDryRunEnvelope(input);
  return {
    ok: summary.reasons.length === 0 && summary.creationAllowed === false,
    summary,
    artifactPlan: input.artifactPlan.plan,
    assembly: input.assembly,
    archive: input.archive,
    metadata: input.metadata,
    integrity: input.integrity,
    channel: input.channel,
  };
}

/**
 * Build the envelope and wrap it in a dry-run report. A ready envelope omits
 * warnings; a blocked one surfaces its summary reasons as OMP-I-6001 warnings.
 * Nothing is written.
 */
export function createGuardedLocalArtifactAssemblyDryRun(
  input: GuardedLocalArtifactAssemblyDryRunEnvelopeInput,
): GuardedLocalArtifactAssemblyDryRunReport {
  const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope(input);
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

/** Render the envelope as deterministic markdown with one trailing newline. */
export function formatGuardedLocalArtifactAssemblyDryRunMarkdown(
  envelope: GuardedLocalArtifactAssemblyDryRunEnvelope,
): string {
  const { summary } = envelope;
  const lines = [
    "# OH MY PM Guarded Local Artifact Assembly Dry-Run",
    "",
    `Version: \`${summary.version}\``,
    `Status: \`${envelope.ok ? "ready" : "blocked"}\``,
    "Creation allowed: `false`",
    "",
    "## Summary",
    "",
    `- Artifact plan ready: ${summary.artifactPlanReady}`,
    `- Package assembly ready: ${summary.packageAssemblyReady}`,
    `- Archive plan ready: ${summary.archivePlanReady}`,
    `- Metadata ready: ${summary.metadataReady}`,
    `- Integrity ready: ${summary.integrityReady}`,
    `- Channel ready: ${summary.channelReady}`,
    "",
    "## Reasons",
    "",
  ];
  if (summary.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of summary.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
