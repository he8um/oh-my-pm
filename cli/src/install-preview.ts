// Dry-run installer preview. Reads the target root through the installer's
// read-only adapter and reports the planned operations. It never touches a
// write adapter, never executes an install, and never mutates files.

import type {
  CliOutputMode,
  StateTransitionDecision,
  StateTransitionInput,
  UpdateGuardDecision,
  UpdatePlan,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";
import {
  createArchiveDryRunFromAssembly,
  createInstaller,
  createInstallerDecisionDryRun,
  createNodeFilesystemAdapter,
  createLocalUpdatePolicyDryRun,
  createPackageAssemblyDryRun,
  createReleaseChannelDryRun,
  createReleaseIntegrityDryRun,
  createReleaseMetadataDryRun,
  createRollbackImpactDryRun,
  createUpdateImpactDryRun,
  formatInstallerDecisionReportMarkdown,
  DEFAULT_LOCAL_UPDATE_POLICY,
} from "@oh-my-pm/installer";

export type InstallerPreviewResult = {
  ok: boolean;
  root: string;
  operations: {
    kind: string;
    path: string;
    checksum?: string;
  }[];
  packageName: string;
  packageVersion: string;
  warnings: string[];
  /** Planned archive summary; nothing is created. */
  archive?: {
    format: string;
    archiveName: string;
    entries: number;
    checksum: string;
  };
  /** Release metadata summary; placeholder only, no signature value. */
  releaseMetadata?: {
    schemaVersion: string;
    signed: boolean;
    signatureAlgorithm?: string;
    keyId?: string;
  };
  /** Consistency-only integrity verdict; no real signature verification. */
  integrity?: {
    ok: boolean;
    reasons: string[];
  };
  /** Local channel metadata summary; no remote locations exist. */
  channel?: {
    name: string;
    latestVersion: string;
    entries: number;
    ok: boolean;
  };
  /** Local update policy verdict; evaluated only, never executed. */
  updatePolicy?: {
    ok: boolean;
    decision: string;
    currentVersion?: string;
    candidateVersion?: string;
    reasons: string[];
  };
  /** Update impact preview; comparison only, no files are touched. */
  impact?: {
    ok: boolean;
    operations: number;
    creates: number;
    replaces: number;
    removes: number;
    unchanged: number;
    beforeSizeBytes: number;
    afterSizeBytes: number;
    reasons: string[];
  };
  /** Rollback impact preview; comparison only, no rollback is executed. */
  rollbackImpact?: {
    ok: boolean;
    rollbackId: string;
    operations: number;
    restores: number;
    removes: number;
    missing: number;
    unchanged: number;
    beforeSizeBytes: number;
    afterSizeBytes: number;
    reasons: string[];
  };
  /** Aggregated decision over all local preview layers; nothing is executed. */
  decision?: {
    ok: boolean;
    decision: string;
    blockingReasons: string[];
    reviewReasons: string[];
    markdown?: string;
  };
};

// Preview-only Kernel stand-in. planInstall never consults the Kernel; this
// object only satisfies createInstaller's dependency shape. It is not the
// production Kernel binding and must never be used for real decisions.
function createPreviewKernelApi() {
  return {
    version(): string {
      return "preview";
    },
    validateJson(target: ValidationTarget): ValidationReport {
      return { target, passed: true, errors: [], warnings: [] };
    },
    checkUpdatePlan(plan: UpdatePlan): UpdateGuardDecision {
      return {
        status: "allowed",
        planId: plan.id,
        planHash: `preview:${plan.id}`,
        reasons: [],
      };
    },
    decideTransition(input: StateTransitionInput): StateTransitionDecision {
      return { from: input.from, to: input.to, allowed: true, reason: "preview" };
    },
  };
}

/**
 * Assemble the local preview package from the target root as a dry run,
 * then plan what installing it would do. Missing source files surface as
 * warnings without failing the preview by themselves.
 */
export function runInstallerPreview(root: string): InstallerPreviewResult {
  const filesystem = createNodeFilesystemAdapter({ root });
  const assembly = createPackageAssemblyDryRun(
    {
      name: "oh-my-pm-local",
      version: "2.0.0-alpha.0",
      root,
      include: ["bin/oh-my-pm", "README.md"],
      platform: "local",
      architecture: "local",
      createdAt: "preview-created-at",
    },
    filesystem,
  );
  // Archive planning only: the report already carries assembly warnings
  // after its own, so it is the single warning source for the preview.
  const archiveReport = createArchiveDryRunFromAssembly(assembly, "zip");
  const warnings =
    archiveReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];
  const archive = {
    format: archiveReport.plan.format,
    archiveName: archiveReport.plan.archiveName,
    entries: archiveReport.plan.entries.length,
    checksum: archiveReport.plan.checksum,
  };

  // Summary only: the placeholder signature value never reaches the output.
  const metadataReport = createReleaseMetadataDryRun({
    archive: archiveReport.plan,
    createdAt: "preview-created-at",
    keyId: "preview-key",
  });
  const signature = metadataReport.metadata.signature;
  const releaseMetadata = {
    schemaVersion: metadataReport.metadata.schemaVersion,
    signed: signature !== undefined,
    ...(signature === undefined
      ? {}
      : { signatureAlgorithm: signature.algorithm, keyId: signature.keyId }),
  };
  const metadataWarnings =
    metadataReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Consistency-only integrity check of the planned metadata against the
  // planned archive; duplicates with metadata warnings are dropped below.
  const integrityReport = createReleaseIntegrityDryRun({
    metadata: metadataReport.metadata,
    archive: archiveReport.plan,
  });
  const integrity = {
    ok: integrityReport.ok,
    reasons: [...integrityReport.verification.reasons],
  };
  const integrityWarnings =
    integrityReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Local channel metadata only: one dev entry pairing the planned metadata
  // with its integrity verdict.
  const channelReport = createReleaseChannelDryRun({
    channel: "dev",
    entries: [
      {
        version: metadataReport.metadata.packageVersion,
        createdAt: "preview-created-at",
        metadata: metadataReport.metadata,
        integrity: integrityReport.verification,
      },
    ],
  });
  const channel = {
    name: channelReport.channel.channel,
    latestVersion: channelReport.channel.latestVersion,
    entries: channelReport.channel.entries.length,
    ok: channelReport.ok,
  };
  const channelWarnings =
    channelReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Local, evaluation-only update decision against a hypothetical installed
  // 1.0.0 manifest; nothing is fetched or installed.
  const updatePolicyReport = createLocalUpdatePolicyDryRun({
    installed: {
      schemaVersion: "1",
      version: "1.0.0",
      installedAt: "preview-installed-at",
      root,
    },
    channel: channelReport.channel,
    policy: DEFAULT_LOCAL_UPDATE_POLICY,
  });
  const policyReport = updatePolicyReport.report;
  const updatePolicy = {
    ok: updatePolicyReport.ok,
    decision: policyReport.decision,
    ...(policyReport.currentVersion === undefined
      ? {}
      : { currentVersion: policyReport.currentVersion }),
    ...(policyReport.candidateVersion === undefined
      ? {}
      : { candidateVersion: policyReport.candidateVersion }),
    reasons: [...policyReport.reasons],
  };
  const updatePolicyWarnings =
    updatePolicyReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Impact preview: compare the assembly's current files with the archive's
  // candidate entries. Comparison only — nothing is fetched or written.
  const impactReport = createUpdateImpactDryRun({
    root,
    currentFiles: assembly.plan.files,
    candidateEntries: archiveReport.plan.entries,
    policy: policyReport,
  });
  const impactSummary = impactReport.preview.summary;
  const impact = {
    ok: impactReport.ok,
    operations: impactReport.preview.operations.length,
    creates: impactSummary.creates,
    replaces: impactSummary.replaces,
    removes: impactSummary.removes,
    unchanged: impactSummary.unchanged,
    beforeSizeBytes: impactSummary.beforeSizeBytes,
    afterSizeBytes: impactSummary.afterSizeBytes,
    reasons: [...impactReport.preview.reasons],
  };
  const impactWarnings =
    impactReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Rollback impact preview: treat the assembly's current files as both the
  // installed files and, re-keyed to package-relative paths, the backup set.
  // Comparison only — no rollback runs and nothing is written.
  const rootPrefix = `${root.replace(/\/+$/, "")}/`;
  const backupFiles = assembly.plan.files.map((file) => ({
    ...file,
    path: file.path.startsWith(rootPrefix) ? file.path.slice(rootPrefix.length) : file.path,
  }));
  const rollbackPaths = backupFiles.map((file) => file.path);
  const rollbackImpactReport = createRollbackImpactDryRun({
    root,
    currentFiles: assembly.plan.files,
    rollback: {
      id: "preview-rollback",
      paths: rollbackPaths.length > 0 ? rollbackPaths : ["bin/oh-my-pm", "README.md"],
      createdAt: "preview-created-at",
    },
    backupFiles,
  });
  const rollbackSummary = rollbackImpactReport.preview.summary;
  const rollbackImpact = {
    ok: rollbackImpactReport.ok,
    rollbackId: rollbackImpactReport.preview.rollbackId,
    operations: rollbackImpactReport.preview.operations.length,
    restores: rollbackSummary.restores,
    removes: rollbackSummary.removes,
    missing: rollbackSummary.missing,
    unchanged: rollbackSummary.unchanged,
    beforeSizeBytes: rollbackSummary.beforeSizeBytes,
    afterSizeBytes: rollbackSummary.afterSizeBytes,
    reasons: [...rollbackImpactReport.preview.reasons],
  };
  const rollbackImpactWarnings =
    rollbackImpactReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  const uniqueWarnings = (values: string[]): string[] => [...new Set(values)];
  const packageManifest = assembly.manifest;

  const installer = createInstaller({ kernel: createPreviewKernelApi() });
  const result = installer.planInstall(
    { packageManifest, root, installedAt: "preview-installed-at" },
    { filesystem },
  );

  // Aggregate every local preview layer into one decision. The install plan
  // operations feed in as-is; on a planning failure the operation list is
  // empty, which the decision report treats as blocking. No install or
  // rollback executes and nothing is written.
  const installOperations = "code" in result ? [] : result.plan.operations.map((op) => ({ ...op }));
  const decisionReport = createInstallerDecisionDryRun({
    root,
    installOperations,
    assembly,
    archive: archiveReport,
    metadata: metadataReport,
    integrity: integrityReport,
    channel: channelReport,
    updatePolicy: updatePolicyReport,
    updateImpact: impactReport,
    rollbackImpact: rollbackImpactReport,
  });
  const decision = {
    ok: decisionReport.report.ok,
    decision: decisionReport.report.decision,
    blockingReasons: [...decisionReport.report.blockingReasons],
    reviewReasons: [...decisionReport.report.reviewReasons],
    markdown: formatInstallerDecisionReportMarkdown(decisionReport.report),
  };
  const decisionWarnings =
    decisionReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  if ("code" in result) {
    return {
      ok: false,
      root,
      operations: [],
      packageName: packageManifest.name,
      packageVersion: packageManifest.version,
      warnings: uniqueWarnings([
        ...warnings,
        ...metadataWarnings,
        ...integrityWarnings,
        ...channelWarnings,
        ...updatePolicyWarnings,
        ...impactWarnings,
        ...rollbackImpactWarnings,
        ...decisionWarnings,
        result.message,
      ]),
      archive,
      releaseMetadata,
      integrity,
      channel,
      updatePolicy,
      impact,
      rollbackImpact,
      decision,
    };
  }

  return {
    ok: true,
    root,
    operations: result.plan.operations.map((operation) => ({
      kind: operation.kind,
      path: operation.path,
      ...(operation.checksum === undefined ? {} : { checksum: operation.checksum }),
    })),
    packageName: packageManifest.name,
    packageVersion: packageManifest.version,
    warnings: uniqueWarnings([
      ...warnings,
      ...metadataWarnings,
      ...integrityWarnings,
      ...channelWarnings,
      ...updatePolicyWarnings,
      ...impactWarnings,
      ...rollbackImpactWarnings,
      ...decisionWarnings,
      ...(result.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? []),
    ]),
    archive,
    releaseMetadata,
    integrity,
    channel,
    updatePolicy,
    impact,
    rollbackImpact,
    decision,
  };
}

function formatBrief(result: InstallerPreviewResult): string {
  const lines = [
    `OH MY PM install-preview: ${result.ok ? "ok" : "failed"}`,
    `package: ${result.packageName}@${result.packageVersion}`,
    `root: ${result.root}`,
  ];
  if (result.ok) {
    lines.push(`operations: ${result.operations.length}`);
    for (const operation of result.operations) {
      lines.push(`- ${operation.kind} ${operation.path}`);
    }
  } else {
    for (const warning of result.warnings) {
      lines.push(`warning: ${warning}`);
    }
  }
  if (result.archive !== undefined) {
    lines.push(`archive-plan: ${result.archive.archiveName}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatMarkdown(result: InstallerPreviewResult): string {
  const lines = ["# OH MY PM Install Preview", ""];
  if (!result.ok) {
    lines.push("Status: failed", "");
  }
  lines.push(
    `Package: \`${result.packageName}@${result.packageVersion}\``,
    `Root: \`${result.root}\``,
    "",
  );
  if (result.ok) {
    lines.push("## Operations", "");
    for (const operation of result.operations) {
      lines.push(`- \`${operation.kind}\` \`${operation.path}\``);
    }
  } else {
    lines.push("## Warnings", "");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  if (result.archive !== undefined) {
    lines.push("", "## Archive Plan", "", `Planned archive: \`${result.archive.archiveName}\``);
  }
  const preview = `${lines.join("\n")}\n`;
  // Compose the aggregated decision report after the preview body.
  if (result.decision?.markdown !== undefined) {
    return `${preview}\n${result.decision.markdown}`;
  }
  return preview;
}

/** Format a preview result for the requested output mode. */
export function formatInstallerPreview(
  result: InstallerPreviewResult,
  mode: CliOutputMode,
): string {
  if (mode === "json") {
    // The decision markdown is a rendering aid, not part of the JSON contract.
    const jsonResult =
      result.decision === undefined
        ? result
        : { ...result, decision: { ...result.decision, markdown: undefined } };
    return `${JSON.stringify(jsonResult, null, 2)}\n`;
  }
  if (mode === "markdown") {
    return formatMarkdown(result);
  }
  return formatBrief(result);
}
