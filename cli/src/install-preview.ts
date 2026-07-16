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
  createInstallerAuditEventDryRun,
  createInstallerAuditTrailExportDryRun,
  createInstallerWriteApprovalTokenDryRun,
  createInstallerWriteCapabilityDryRun,
  createControlledWriteExecutionDryRun,
  createInstallerReleaseReadinessDryRun,
  createV0ReleaseCandidateChecklistDryRun,
  createPublicV0ReleaseNotesDraftDryRun,
  createGuardedReleaseArtifactPlanDryRun,
  createGuardedLocalArtifactAssemblyDryRun,
  createGuardedArtifactCreationPermissionDryRun,
  createLocalArtifactCreationExecutionPlanDryRun,
  createLocalArtifactCreationAdapterContractDryRun,
  createInstallerWriteAdapterContractDryRun,
  createInstallerWriteConfirmationChecklistDryRun,
  createInstallerWriteExecutionPlanDryRun,
  createInstallerDecisionDryRun,
  createNodeFilesystemAdapter,
  createLocalUpdatePolicyDryRun,
  createPackageAssemblyDryRun,
  createReleaseChannelDryRun,
  createReleaseIntegrityDryRun,
  createReleaseMetadataDryRun,
  createRollbackImpactDryRun,
  createUpdateImpactDryRun,
  formatInstallerAuditEventsMarkdown,
  formatInstallerDecisionReportMarkdown,
  DEFAULT_GUARDED_ARTIFACT_CREATION_PERMISSION_POLICY,
  DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
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
  /** In-memory audit event summary; nothing is logged, persisted, or sent. */
  audit?: {
    ok: boolean;
    events: number;
    errors: number;
    warnings: number;
    markdown?: string;
  };
  /**
   * In-memory audit trail export summary; the raw export content is never
   * included, written, logged, or sent.
   */
  auditExport?: {
    ok: boolean;
    format: string;
    events: number;
    sizeBytes: number;
    fingerprint: string;
  };
  /**
   * Guarded write capability verdict; evaluation only. The default policy is
   * preview-only, so writes are never allowed and nothing is executed.
   */
  writeCapability?: {
    ok: boolean;
    allowed: boolean;
    intent: string;
    mode: string;
    reasons: string[];
  };
  /**
   * Deterministic, non-secret approval token summary. The token value is
   * descriptive text, not a secret; it does not bypass the preview-only default.
   */
  approval?: {
    ok: boolean;
    intent: string;
    decision: string;
    tokenValue: string;
  };
  /**
   * Planned write step summary; planning only. The raw step list is never
   * included, nothing is executed, and no write adapter is called.
   */
  writeExecutionPlan?: {
    ok: boolean;
    intent: string;
    steps: number;
    reasons: string[];
  };
  /**
   * Pre-write confirmation summary; confirmation-only. The raw checklist items
   * are never included, nothing is executed, and no write adapter is called.
   */
  writeConfirmation?: {
    ok: boolean;
    intent: string;
    passed: number;
    failed: number;
    reasons: string[];
  };
  /**
   * Declared write adapter contract verdict; metadata-only. No adapter object
   * or method reaches the result, nothing is executed, and no adapter is called.
   */
  writeAdapterContract?: {
    ok: boolean;
    name: string;
    requiredCapabilities: string[];
    declaredCapabilities: string[];
    reasons: string[];
  };
  /**
   * Aggregated controlled write readiness summary; non-mutating. The raw
   * pass-through layers are never included, nothing is executed, and no
   * adapter is called.
   */
  controlledWriteDryRun?: {
    ok: boolean;
    intent: string;
    allowed: boolean;
    approved: boolean;
    planReady: boolean;
    confirmationReady: boolean;
    adapterReady: boolean;
    plannedSteps: number;
    reasons: string[];
  };
  /**
   * Aggregated release-readiness summary; summary-only. The raw sections and
   * markdown are never included in JSON, no artifact is created, and nothing
   * is executed.
   */
  releaseReadiness?: {
    ok: boolean;
    status: string;
    sectionsReady: number;
    sectionsBlocked: number;
    sectionsReviewRequired: number;
    uniqueReasons: number;
    plannedWriteSteps: number;
    reasons: string[];
  };
  /**
   * v0 release candidate checklist summary; checklist-only. The raw items and
   * markdown are never included in JSON, no release output is created, and
   * nothing is executed.
   */
  v0ReleaseCandidate?: {
    ok: boolean;
    items: number;
    passed: number;
    failed: number;
    reasons: string[];
  };
  /**
   * Public v0 release notes draft summary; documentation-only. The raw sections
   * and markdown are never included in JSON, no release is created, and nothing
   * is executed.
   */
  publicV0ReleaseNotes?: {
    ok: boolean;
    status: string;
    version: string;
    sections: number;
    reasons: string[];
  };
  /**
   * Guarded release artifact plan summary; planning-only. The raw items and
   * markdown are never included in JSON, `creationAllowed` is always false, no
   * release output is created, and nothing is executed.
   */
  guardedReleaseArtifactPlan?: {
    ok: boolean;
    version: string;
    plannedItems: number;
    blockedItems: number;
    totalItems: number;
    creationAllowed: boolean;
    reasons: string[];
  };
  /**
   * Guarded local artifact assembly readiness summary; readiness-only. The raw
   * envelope and pass-through reports are never included in JSON,
   * `creationAllowed` is always false, and nothing is created or executed.
   */
  guardedLocalArtifactAssembly?: {
    ok: boolean;
    version: string;
    artifactPlanReady: boolean;
    packageAssemblyReady: boolean;
    archivePlanReady: boolean;
    metadataReady: boolean;
    integrityReady: boolean;
    channelReady: boolean;
    creationAllowed: boolean;
    reasons: string[];
  };
  /**
   * Guarded artifact creation permission verdict; evaluation-only. The default
   * policy is dry-run-only and the preview is never approved, so permission is
   * never granted here, `creationAllowed` is always false, the raw assembly
   * envelope and markdown are never included in JSON, and nothing is created
   * or executed.
   */
  guardedArtifactCreationPermission?: {
    ok: boolean;
    version: string;
    mode: string;
    allowed: boolean;
    creationAllowed: boolean;
    reasons: string[];
  };
  /**
   * Local artifact creation execution plan summary; planning-only. The raw
   * steps and markdown are never included in JSON, no step is executed,
   * `creationAllowed` is always false, and nothing is created or written.
   */
  localArtifactCreationPlan?: {
    ok: boolean;
    version: string;
    permissionAllowed: boolean;
    assemblyReady: boolean;
    plannedSteps: number;
    blockedSteps: number;
    totalSteps: number;
    creationAllowed: boolean;
    reasons: string[];
  };
  /**
   * Declared local artifact creation adapter contract verdict; metadata-only.
   * No adapter instance, function, or method reaches the result, no adapter is
   * called, the markdown is never included in JSON, `creationAllowed` is
   * always false, and nothing is created or executed.
   */
  localArtifactAdapterContract?: {
    ok: boolean;
    name: string;
    requiredCapabilities: string[];
    declaredCapabilities: string[];
    creationAllowed: boolean;
    reasons: string[];
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

  // Model the preview pipeline as a deterministic in-memory event sequence.
  // Nothing is logged, persisted, or sent — the summary counts events only.
  const auditReport = createInstallerAuditEventDryRun({
    root,
    decision: decisionReport.report,
  });
  const audit = {
    ok: auditReport.ok,
    events: auditReport.events.length,
    errors: auditReport.events.filter((event) => event.level === "error").length,
    warnings: auditReport.events.filter((event) => event.level === "warning").length,
    markdown: formatInstallerAuditEventsMarkdown(auditReport.events),
  };
  const auditWarnings =
    auditReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Render the audit event sequence into an in-memory export payload. Only a
  // summary reaches the result — the raw export content is never included,
  // written, logged, or sent.
  const auditExportReport = createInstallerAuditTrailExportDryRun({
    events: auditReport.events,
    format: "jsonl",
  });
  const auditExport = {
    ok: auditExportReport.ok,
    format: auditExportReport.plan.format,
    events: auditExportReport.plan.eventCount,
    sizeBytes: auditExportReport.plan.sizeBytes,
    fingerprint: auditExportReport.plan.fingerprint,
  };
  const auditExportWarnings =
    auditExportReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Evaluate whether a write-capable install would be allowed under the
  // default preview-only policy. Evaluation only — the CLI never executes an
  // install or rollback, never calls a write adapter, and writes no files.
  const writeCapabilityReport = createInstallerWriteCapabilityDryRun({
    intent: "install",
    approved: false,
    decision: decisionReport.report,
    policy: DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
  });
  const writeCapability = {
    ok: writeCapabilityReport.ok,
    allowed: writeCapabilityReport.report.allowed,
    intent: writeCapabilityReport.report.intent,
    mode: writeCapabilityReport.report.mode,
    reasons: [...writeCapabilityReport.report.reasons],
  };
  const writeCapabilityWarnings =
    writeCapabilityReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Build a deterministic, non-secret approval token for the previewed
  // install intent. The token is descriptive metadata only; it never bypasses
  // the preview-only default write capability and nothing is executed.
  const approvalReport = createInstallerWriteApprovalTokenDryRun({
    intent: "install",
    root,
    decision: decisionReport.report,
  });
  const approval = {
    ok: approvalReport.ok,
    intent: approvalReport.token.intent,
    decision: approvalReport.token.decision,
    tokenValue: approvalReport.token.value,
  };
  const approvalWarnings =
    approvalReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Plan the local write steps for the previewed install intent. Planning only
  // — the raw step list stays out of the summary, no write adapter is called,
  // and nothing is executed. Under the default preview-only capability the plan
  // is blocked, but the step count remains inspectable.
  const writeExecutionPlanReport = createInstallerWriteExecutionPlanDryRun({
    intent: "install",
    capability: writeCapabilityReport.report,
    installOperations,
    updateImpact: impactReport.preview,
    rollbackImpact: rollbackImpactReport.preview,
  });
  const writeExecutionPlan = {
    ok: writeExecutionPlanReport.ok,
    intent: writeExecutionPlanReport.plan.intent,
    steps: writeExecutionPlanReport.plan.steps.length,
    reasons: [...writeExecutionPlanReport.plan.reasons],
  };
  const writeExecutionPlanWarnings =
    writeExecutionPlanReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Summarize the pre-write confirmation checklist over the decision report,
  // write capability, and write execution plan. Confirmation-only — the raw
  // checklist items stay out of the summary, no write adapter is called, and
  // nothing is executed.
  const writeConfirmationReport = createInstallerWriteConfirmationChecklistDryRun({
    decision: decisionReport.report,
    capability: writeCapabilityReport.report,
    executionPlan: writeExecutionPlanReport.plan,
  });
  const confirmationItems = writeConfirmationReport.checklist.items;
  const writeConfirmation = {
    ok: writeConfirmationReport.ok,
    intent: writeConfirmationReport.checklist.intent,
    passed: confirmationItems.filter((item) => item.ok).length,
    failed: confirmationItems.filter((item) => !item.ok).length,
    reasons: [...writeConfirmationReport.checklist.reasons],
  };
  const writeConfirmationWarnings =
    writeConfirmationReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Validate a declared write adapter metadata contract against the confirmation
  // checklist and execution plan. Metadata-only — no adapter object is
  // constructed, no adapter method is called, and nothing is executed.
  const writeAdapterContractReport = createInstallerWriteAdapterContractDryRun({
    contract: {
      name: "preview-write-adapter",
      capabilities: ["write-file", "remove-file", "backup-file"],
      requiresExplicitApproval: true,
      supportsRollbackCapture: true,
    },
    confirmation: writeConfirmationReport.checklist,
    executionPlan: writeExecutionPlanReport.plan,
  });
  const writeAdapterContract = {
    ok: writeAdapterContractReport.ok,
    name: writeAdapterContractReport.report.name,
    requiredCapabilities: [...writeAdapterContractReport.report.requiredCapabilities],
    declaredCapabilities: [...writeAdapterContractReport.report.declaredCapabilities],
    reasons: [...writeAdapterContractReport.report.reasons],
  };
  const writeAdapterContractWarnings =
    writeAdapterContractReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Aggregate every write readiness layer into one non-mutating controlled
  // dry-run envelope. Aggregation-only — the raw pass-through layers stay out
  // of the summary, no adapter is called, and nothing is executed.
  const controlledWriteDryRunReport = createControlledWriteExecutionDryRun({
    intent: "install",
    capability: writeCapabilityReport.report,
    approval: approvalReport,
    executionPlan: writeExecutionPlanReport.plan,
    confirmation: writeConfirmationReport.checklist,
    adapterContract: writeAdapterContractReport.report,
  });
  const controlledSummary = controlledWriteDryRunReport.envelope.summary;
  const controlledWriteDryRun = {
    ok: controlledWriteDryRunReport.ok,
    intent: controlledSummary.intent,
    allowed: controlledSummary.allowed,
    approved: controlledSummary.approved,
    planReady: controlledSummary.planReady,
    confirmationReady: controlledSummary.confirmationReady,
    adapterReady: controlledSummary.adapterReady,
    plannedSteps: controlledSummary.plannedSteps,
    reasons: [...controlledSummary.reasons],
  };
  const controlledWriteDryRunWarnings =
    controlledWriteDryRunReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Aggregate local preview readiness into one release-readiness report.
  // Summary-only — the raw sections and markdown stay out of the summary, no
  // artifact is created, and nothing is executed.
  const releaseReadinessReport = createInstallerReleaseReadinessDryRun({
    decision: decisionReport.report,
    auditExport: auditExportReport,
    controlledWrite: controlledWriteDryRunReport,
  });
  const releaseReadinessSummary = releaseReadinessReport.report.summary;
  const releaseReadiness = {
    ok: releaseReadinessReport.ok,
    status: releaseReadinessReport.report.status,
    sectionsReady: releaseReadinessSummary.sectionsReady,
    sectionsBlocked: releaseReadinessSummary.sectionsBlocked,
    sectionsReviewRequired: releaseReadinessSummary.sectionsReviewRequired,
    uniqueReasons: releaseReadinessSummary.uniqueReasons,
    plannedWriteSteps: releaseReadinessSummary.plannedWriteSteps,
    reasons: [...releaseReadinessReport.report.reasons],
  };
  const releaseReadinessWarnings =
    releaseReadinessReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Build the v0 release candidate checklist from the release-readiness report
  // plus the hygiene constraints this command itself upholds. Validation
  // booleans are true here because this is a runtime preview, not a substitute
  // for the repository-wide validation commands. Checklist-only — nothing is
  // created or executed.
  const v0ReleaseCandidateReport = createV0ReleaseCandidateChecklistDryRun({
    releaseReadiness: releaseReadinessReport.report,
    validation: {
      contracts: true,
      publicSurface: true,
      structure: true,
      boundaries: true,
      builds: true,
      tests: true,
      wasmBuild: true,
      cliSmoke: true,
    },
    hygiene: {
      noProductionInstallCommand: true,
      noReleaseArtifacts: true,
      noPublishingMetadata: true,
      noPrivateDocs: true,
      docsUpdated: true,
    },
  });
  const v0Items = v0ReleaseCandidateReport.checklist.items;
  const v0ReleaseCandidate = {
    ok: v0ReleaseCandidateReport.ok,
    items: v0Items.length,
    passed: v0Items.filter((item) => item.ok).length,
    failed: v0Items.filter((item) => !item.ok).length,
    reasons: [...v0ReleaseCandidateReport.checklist.reasons],
  };
  const v0ReleaseCandidateWarnings =
    v0ReleaseCandidateReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Render the public v0 release notes draft from the v0 checklist and release
  // readiness report. Documentation-only — the raw sections and markdown stay
  // out of the summary, no release is created, and nothing is executed.
  const publicV0ReleaseNotesReport = createPublicV0ReleaseNotesDraftDryRun({
    version: "v0.1.0",
    checklist: v0ReleaseCandidateReport.checklist,
    releaseReadiness: releaseReadinessReport.report,
  });
  const publicV0ReleaseNotes = {
    ok: publicV0ReleaseNotesReport.ok,
    status: publicV0ReleaseNotesReport.draft.status,
    version: publicV0ReleaseNotesReport.draft.version,
    sections: publicV0ReleaseNotesReport.draft.sections.length,
    reasons: [...publicV0ReleaseNotesReport.draft.reasons],
  };
  const publicV0ReleaseNotesWarnings =
    publicV0ReleaseNotesReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Build the guarded release artifact plan from the local dry-run reports.
  // Planning-only — creation stays disabled, the raw items stay out of the
  // summary, and nothing is created or executed.
  const guardedReleaseArtifactPlanReport = createGuardedReleaseArtifactPlanDryRun({
    version: "v0.1.0",
    releaseNotes: publicV0ReleaseNotesReport,
    v0Checklist: v0ReleaseCandidateReport,
    releaseReadiness: releaseReadinessReport,
    assembly,
    archive: archiveReport,
    metadata: metadataReport,
    integrity: integrityReport,
    channel: channelReport,
  });
  const guardedReleaseArtifactSummary = guardedReleaseArtifactPlanReport.plan.summary;
  const guardedReleaseArtifactPlan = {
    ok: guardedReleaseArtifactPlanReport.ok,
    version: guardedReleaseArtifactSummary.version,
    plannedItems: guardedReleaseArtifactSummary.plannedItems,
    blockedItems: guardedReleaseArtifactSummary.blockedItems,
    totalItems: guardedReleaseArtifactSummary.totalItems,
    creationAllowed: guardedReleaseArtifactSummary.creationAllowed,
    reasons: [...guardedReleaseArtifactPlanReport.plan.reasons],
  };
  const guardedReleaseArtifactPlanWarnings =
    guardedReleaseArtifactPlanReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Aggregate the guarded release artifact plan and the package assembly,
  // archive, metadata, integrity, and channel dry-runs into one local artifact
  // assembly readiness envelope. Readiness-only — creation stays disabled, the
  // raw envelope stays out of the summary, and nothing is created or executed.
  const guardedLocalArtifactAssemblyReport = createGuardedLocalArtifactAssemblyDryRun({
    version: "v0.1.0",
    artifactPlan: guardedReleaseArtifactPlanReport,
    assembly,
    archive: archiveReport,
    metadata: metadataReport,
    integrity: integrityReport,
    channel: channelReport,
  });
  const guardedLocalArtifactAssemblySummary = guardedLocalArtifactAssemblyReport.envelope.summary;
  const guardedLocalArtifactAssembly = {
    ok: guardedLocalArtifactAssemblyReport.ok,
    version: guardedLocalArtifactAssemblySummary.version,
    artifactPlanReady: guardedLocalArtifactAssemblySummary.artifactPlanReady,
    packageAssemblyReady: guardedLocalArtifactAssemblySummary.packageAssemblyReady,
    archivePlanReady: guardedLocalArtifactAssemblySummary.archivePlanReady,
    metadataReady: guardedLocalArtifactAssemblySummary.metadataReady,
    integrityReady: guardedLocalArtifactAssemblySummary.integrityReady,
    channelReady: guardedLocalArtifactAssemblySummary.channelReady,
    creationAllowed: guardedLocalArtifactAssemblySummary.creationAllowed,
    reasons: [...guardedLocalArtifactAssemblySummary.reasons],
  };
  const guardedLocalArtifactAssemblyWarnings =
    guardedLocalArtifactAssemblyReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];

  // Evaluate whether artifact creation permission would be granted under the
  // default dry-run-only policy without approval. Evaluation-only — permission
  // is never granted here, creation stays disabled, the raw assembly envelope
  // stays out of the summary, and nothing is created or executed.
  const guardedArtifactCreationPermissionReport = createGuardedArtifactCreationPermissionDryRun({
    version: "v0.1.0",
    policy: DEFAULT_GUARDED_ARTIFACT_CREATION_PERMISSION_POLICY,
    approved: false,
    assembly: guardedLocalArtifactAssemblyReport.envelope,
  });
  const permissionReport = guardedArtifactCreationPermissionReport.report;
  const guardedArtifactCreationPermission = {
    ok: guardedArtifactCreationPermissionReport.ok,
    version: permissionReport.version,
    mode: permissionReport.mode,
    allowed: permissionReport.allowed,
    creationAllowed: permissionReport.creationAllowed,
    reasons: [...permissionReport.reasons],
  };
  const guardedArtifactCreationPermissionWarnings =
    guardedArtifactCreationPermissionReport.warnings?.map(
      (warning) => `${warning.code}: ${warning.message}`,
    ) ?? [];

  // Sequence the ordered local creation steps a future explicitly-enabled
  // phase would take. Planning-only — no step is executed, creation stays
  // disabled, the raw steps stay out of the summary, and nothing is created.
  const localArtifactCreationPlanReport = createLocalArtifactCreationExecutionPlanDryRun({
    version: "v0.1.0",
    permission: guardedArtifactCreationPermissionReport,
    artifactPlan: guardedReleaseArtifactPlanReport,
    assembly: guardedLocalArtifactAssemblyReport,
  });
  const localCreationSummary = localArtifactCreationPlanReport.plan.summary;
  const localArtifactCreationPlan = {
    ok: localArtifactCreationPlanReport.ok,
    version: localCreationSummary.version,
    permissionAllowed: localCreationSummary.permissionAllowed,
    assemblyReady: localCreationSummary.assemblyReady,
    plannedSteps: localCreationSummary.plannedSteps,
    blockedSteps: localCreationSummary.blockedSteps,
    totalSteps: localCreationSummary.totalSteps,
    creationAllowed: localCreationSummary.creationAllowed,
    reasons: [...localArtifactCreationPlanReport.plan.reasons],
  };
  const localArtifactCreationPlanWarnings =
    localArtifactCreationPlanReport.warnings?.map(
      (warning) => `${warning.code}: ${warning.message}`,
    ) ?? [];

  // Validate a declared local artifact creation adapter metadata contract
  // against the execution plan's required capability labels. Metadata-only —
  // no adapter instance exists, no adapter method is called, creation stays
  // disabled, and nothing is created or executed.
  const localArtifactAdapterContractReport = createLocalArtifactCreationAdapterContractDryRun({
    contract: {
      name: "preview-artifact-adapter",
      capabilities: ["write-text-output", "write-binary-output"],
      supportsDryRun: true,
      requiresExplicitPermission: true,
    },
    permission: guardedArtifactCreationPermissionReport.report,
    executionPlan: localArtifactCreationPlanReport.plan,
  });
  const localArtifactAdapterContract = {
    ok: localArtifactAdapterContractReport.ok,
    name: localArtifactAdapterContractReport.report.name,
    requiredCapabilities: [...localArtifactAdapterContractReport.report.requiredCapabilities],
    declaredCapabilities: [...localArtifactAdapterContractReport.report.declaredCapabilities],
    creationAllowed: localArtifactAdapterContractReport.report.creationAllowed,
    reasons: [...localArtifactAdapterContractReport.report.reasons],
  };
  const localArtifactAdapterContractWarnings =
    localArtifactAdapterContractReport.warnings?.map(
      (warning) => `${warning.code}: ${warning.message}`,
    ) ?? [];

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
        ...auditWarnings,
        ...auditExportWarnings,
        ...writeCapabilityWarnings,
        ...approvalWarnings,
        ...writeExecutionPlanWarnings,
        ...writeConfirmationWarnings,
        ...writeAdapterContractWarnings,
        ...controlledWriteDryRunWarnings,
        ...releaseReadinessWarnings,
        ...v0ReleaseCandidateWarnings,
        ...publicV0ReleaseNotesWarnings,
        ...guardedReleaseArtifactPlanWarnings,
        ...guardedLocalArtifactAssemblyWarnings,
        ...guardedArtifactCreationPermissionWarnings,
        ...localArtifactCreationPlanWarnings,
        ...localArtifactAdapterContractWarnings,
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
      audit,
      auditExport,
      writeCapability,
      approval,
      writeExecutionPlan,
      writeConfirmation,
      writeAdapterContract,
      controlledWriteDryRun,
      releaseReadiness,
      v0ReleaseCandidate,
      publicV0ReleaseNotes,
      guardedReleaseArtifactPlan,
      guardedLocalArtifactAssembly,
      guardedArtifactCreationPermission,
      localArtifactCreationPlan,
      localArtifactAdapterContract,
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
      ...auditWarnings,
      ...auditExportWarnings,
      ...writeCapabilityWarnings,
      ...approvalWarnings,
      ...writeExecutionPlanWarnings,
      ...writeConfirmationWarnings,
      ...writeAdapterContractWarnings,
      ...controlledWriteDryRunWarnings,
      ...releaseReadinessWarnings,
      ...v0ReleaseCandidateWarnings,
      ...publicV0ReleaseNotesWarnings,
      ...guardedReleaseArtifactPlanWarnings,
      ...guardedLocalArtifactAssemblyWarnings,
      ...guardedArtifactCreationPermissionWarnings,
      ...localArtifactCreationPlanWarnings,
      ...localArtifactAdapterContractWarnings,
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
    audit,
    auditExport,
    writeCapability,
    approval,
    writeExecutionPlan,
    writeConfirmation,
    writeAdapterContract,
    controlledWriteDryRun,
    releaseReadiness,
    v0ReleaseCandidate,
    publicV0ReleaseNotes,
    guardedReleaseArtifactPlan,
    guardedLocalArtifactAssembly,
    guardedArtifactCreationPermission,
    localArtifactCreationPlan,
    localArtifactAdapterContract,
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
  if (result.writeCapability !== undefined) {
    // Report-only: this preview never provides a write-capable command.
    lines.push(
      "",
      "## Write Capability",
      "",
      `Write capability: \`${result.writeCapability.allowed ? "allowed" : "blocked"}\` (mode \`${result.writeCapability.mode}\`)`,
    );
  }
  if (result.writeExecutionPlan !== undefined) {
    // Planning only: the step count is a plan, not an execution.
    lines.push(
      "",
      "## Write Execution Plan",
      "",
      `Planned write steps: \`${result.writeExecutionPlan.steps}\` (\`${result.writeExecutionPlan.ok ? "ready" : "blocked"}\`, not executed)`,
    );
  }
  if (result.writeConfirmation !== undefined) {
    // Confirmation only: this reports readiness, never an execution.
    lines.push(
      "",
      "## Write Confirmation",
      "",
      `Write confirmation: \`${result.writeConfirmation.ok ? "confirmed" : "blocked"}\` (${result.writeConfirmation.passed}/${result.writeConfirmation.passed + result.writeConfirmation.failed} checks passed, not executed)`,
    );
  }
  if (result.writeAdapterContract !== undefined) {
    // Metadata only: this reports contract fit, never an adapter call.
    lines.push(
      "",
      "## Write Adapter Contract",
      "",
      `Write adapter contract \`${result.writeAdapterContract.name}\`: \`${result.writeAdapterContract.ok ? "satisfied" : "blocked"}\` (metadata only, no adapter called)`,
    );
  }
  if (result.controlledWriteDryRun !== undefined) {
    // Aggregation only: this reports readiness, never an execution.
    lines.push(
      "",
      "## Controlled Write Dry Run",
      "",
      `Controlled write dry run: \`${result.controlledWriteDryRun.ok ? "ready" : "blocked"}\` (${result.controlledWriteDryRun.plannedSteps} planned steps, not executed)`,
    );
  }
  if (result.releaseReadiness !== undefined) {
    // Summary only: this reports readiness, never an artifact or execution.
    lines.push(
      "",
      "## Release Readiness",
      "",
      `Release readiness: \`${result.releaseReadiness.status}\` (${result.releaseReadiness.sectionsReady} ready / ${result.releaseReadiness.sectionsBlocked} blocked / ${result.releaseReadiness.sectionsReviewRequired} review-required, not executed)`,
    );
  }
  if (result.v0ReleaseCandidate !== undefined) {
    // Checklist only: this reports candidacy, never a release or execution.
    lines.push(
      "",
      "## v0 Release Candidate Checklist",
      "",
      `v0 release candidate: \`${result.v0ReleaseCandidate.ok ? "ready" : "blocked"}\` (${result.v0ReleaseCandidate.passed}/${result.v0ReleaseCandidate.items} items passed, no release created)`,
    );
  }
  if (result.publicV0ReleaseNotes !== undefined) {
    // Draft only: this is a public-notes preview, never a created release.
    lines.push(
      "",
      "## Public v0 Release Notes Draft",
      "",
      `Public release notes draft \`${result.publicV0ReleaseNotes.version}\`: \`${result.publicV0ReleaseNotes.status}\` (${result.publicV0ReleaseNotes.sections} sections, draft only, no release created)`,
    );
  }
  if (result.guardedReleaseArtifactPlan !== undefined) {
    // Planning only: creation stays disabled; nothing is created.
    lines.push(
      "",
      "## Guarded Release Artifact Plan",
      "",
      `Guarded release artifact plan \`${result.guardedReleaseArtifactPlan.version}\`: \`${result.guardedReleaseArtifactPlan.ok ? "ready" : "blocked"}\` (${result.guardedReleaseArtifactPlan.plannedItems}/${result.guardedReleaseArtifactPlan.totalItems} items planned, creation disabled)`,
    );
  }
  if (result.guardedLocalArtifactAssembly !== undefined) {
    // Readiness only: creation stays disabled; nothing is created.
    lines.push(
      "",
      "## Guarded Local Artifact Assembly Dry-Run",
      "",
      `Guarded local artifact assembly \`${result.guardedLocalArtifactAssembly.version}\`: \`${result.guardedLocalArtifactAssembly.ok ? "ready" : "blocked"}\` (readiness only, creation disabled)`,
    );
  }
  if (result.guardedArtifactCreationPermission !== undefined) {
    // Permission-only note: evaluation only; creation stays disabled.
    lines.push(
      "",
      "## Guarded Artifact Creation Permission",
      "",
      `Guarded artifact creation permission \`${result.guardedArtifactCreationPermission.version}\`: \`${result.guardedArtifactCreationPermission.allowed ? "allowed" : "blocked"}\` (mode \`${result.guardedArtifactCreationPermission.mode}\`, evaluation only, creation disabled)`,
    );
  }
  if (result.localArtifactCreationPlan !== undefined) {
    // Planning-only note: no step is executed and nothing is created.
    lines.push(
      "",
      "## Local Artifact Creation Execution Plan",
      "",
      `Local artifact creation plan \`${result.localArtifactCreationPlan.version}\`: \`${result.localArtifactCreationPlan.ok ? "ready" : "blocked"}\` (${result.localArtifactCreationPlan.plannedSteps}/${result.localArtifactCreationPlan.totalSteps} steps planned, planning only, creation disabled)`,
    );
  }
  if (result.localArtifactAdapterContract !== undefined) {
    // Metadata-contract note: no adapter exists or is called.
    lines.push(
      "",
      "## Local Artifact Creation Adapter Contract",
      "",
      `Local artifact adapter contract \`${result.localArtifactAdapterContract.name}\`: \`${result.localArtifactAdapterContract.ok ? "ready" : "blocked"}\` (metadata only, no adapter called, creation disabled)`,
    );
  }
  let preview = `${lines.join("\n")}\n`;
  // Compose the aggregated decision report, then the audit events, after the
  // preview body.
  if (result.decision?.markdown !== undefined) {
    preview = `${preview}\n${result.decision.markdown}`;
  }
  if (result.audit?.markdown !== undefined) {
    preview = `${preview}\n${result.audit.markdown}`;
  }
  return preview;
}

/** Format a preview result for the requested output mode. */
export function formatInstallerPreview(
  result: InstallerPreviewResult,
  mode: CliOutputMode,
): string {
  if (mode === "json") {
    // The rendered markdown blocks are display aids, not part of the JSON
    // contract, so they are dropped from JSON output.
    const jsonResult = {
      ...result,
      ...(result.decision === undefined
        ? {}
        : { decision: { ...result.decision, markdown: undefined } }),
      ...(result.audit === undefined
        ? {}
        : { audit: { ...result.audit, markdown: undefined } }),
    };
    return `${JSON.stringify(jsonResult, null, 2)}\n`;
  }
  if (mode === "markdown") {
    return formatMarkdown(result);
  }
  return formatBrief(result);
}
