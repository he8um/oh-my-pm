// Deterministic example inputs for tests and examples. All time values are
// fixed literals; nothing here reads a clock.

import type {
  PackageFileEntry,
  PackageManifest,
  RollbackManifest,
  UpdatePlan,
} from "@oh-my-pm/contracts";
import type {
  ArchivePlanInput,
  FilesystemEntry,
  InstallerAuditEventInput,
  InstallerAuditTrailExportInput,
  InstallerDecisionReportInput,
  LocalUpdatePolicyInput,
  PackageAssemblyInput,
  PlannedFileOperation,
  ReleaseChannelMetadataInput,
  ReleaseIntegrityVerificationInput,
  ReleaseMetadataInput,
  RollbackImpactPreviewInput,
  UpdateImpactPreviewInput,
  InstallerWriteCapabilityInput,
  InstallerWriteApprovalTokenInput,
  InstallerWriteExecutionPlanInput,
  InstallerWriteConfirmationChecklistInput,
  InstallerWriteAdapterContractInput,
  ControlledWriteExecutionDryRunEnvelopeInput,
  InstallerReleaseReadinessInput,
  V0ReleaseCandidateChecklistInput,
  PublicV0ReleaseNotesDraftInput,
  GuardedReleaseArtifactPlanInput,
  GuardedLocalArtifactAssemblyDryRunEnvelopeInput,
  GuardedArtifactCreationPermissionInput,
  LocalArtifactCreationExecutionPlanInput,
  LocalArtifactCreationAdapterContractInput,
  LocalArtifactCreationConfirmationChecklistInput,
} from "./types.js";
import { createArchiveDryRunFromAssembly } from "./package-assembly.js";
import { createArchivePlan } from "./archive-plan.js";
import { createInstallerAuditEvents } from "./audit-events.js";
import { createInstallerDecisionReport } from "./decision-report.js";
import { createLocalUpdatePolicyDryRun } from "./update-policy.js";
import { createMemoryFilesystem } from "./memory-filesystem.js";
import { createPackageAssemblyDryRun } from "./package-assembly.js";
import { createPackageManifest } from "./package-manifest.js";
import { createReleaseChannelDryRun } from "./release-channel.js";
import { createReleaseChannelMetadata } from "./release-channel.js";
import { createReleaseIntegrityDryRun } from "./release-integrity.js";
import { createReleaseMetadataDryRun } from "./release-metadata.js";
import { createRollbackImpactDryRun } from "./rollback-impact.js";
import { createUpdateImpactDryRun } from "./update-impact.js";
import { DEFAULT_LOCAL_UPDATE_POLICY, evaluateLocalUpdatePolicy } from "./update-policy.js";
import { DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY } from "./write-capability.js";
import { evaluateInstallerWriteCapability } from "./write-capability.js";
import { createInstallerWriteApprovalToken } from "./write-approval.js";
import { createInstallerWriteApprovalTokenDryRun } from "./write-approval.js";
import { createInstallerWriteExecutionPlan } from "./write-execution-plan.js";
import { createInstallerWriteConfirmationChecklist } from "./write-confirmation.js";
import { evaluateInstallerWriteAdapterContract } from "./write-adapter-contract.js";
import { createInstallerAuditTrailExportDryRun } from "./audit-export.js";
import { createControlledWriteExecutionDryRun } from "./write-dry-run-envelope.js";
import { createInstallerReleaseReadinessReport } from "./release-readiness.js";
import { createInstallerReleaseReadinessDryRun } from "./release-readiness.js";
import { createV0ReleaseCandidateChecklist } from "./v0-release-candidate.js";
import { createV0ReleaseCandidateChecklistDryRun } from "./v0-release-candidate.js";
import { createPublicV0ReleaseNotesDraftDryRun } from "./public-v0-release-notes.js";
import { createGuardedReleaseArtifactPlanDryRun } from "./release-artifact-plan.js";
import { createGuardedLocalArtifactAssemblyDryRun } from "./local-artifact-assembly-envelope.js";
import { createGuardedArtifactCreationPermissionDryRun } from "./artifact-creation-permission.js";
import { createLocalArtifactCreationExecutionPlan } from "./local-artifact-creation-plan.js";
import { evaluateLocalArtifactCreationAdapterContract } from "./local-artifact-adapter-contract.js";

/** Example installable package manifest. */
export function examplePackageManifest(): PackageManifest {
  return {
    name: "oh-my-pm-local",
    version: "2.0.0-alpha.0",
    checksum: "sha256:example",
    files: ["bin/oh-my-pm", "README.md"],
  };
}

/** Example rollback manifest. */
export function exampleRollbackManifest(): RollbackManifest {
  return {
    id: "rollback-1",
    paths: ["bin/oh-my-pm"],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Example per-file metadata matching the rich package manifest. */
export function examplePackageFileEntries(): PackageFileEntry[] {
  return [
    { path: "bin/oh-my-pm", checksum: "sha256:example-bin", sizeBytes: 14 },
    { path: "README.md", checksum: "sha256:example-readme", sizeBytes: 14 },
  ];
}

/** Example release package manifest with per-file metadata. */
export function exampleRichPackageManifest(): PackageManifest {
  return createPackageManifest({
    name: "oh-my-pm-local",
    version: "2.0.0-alpha.0",
    platform: "linux",
    architecture: "x64",
    createdAt: "2026-01-01T00:00:00.000Z",
    files: [
      { path: "bin/oh-my-pm", content: "example binary", checksum: "sha256:example-bin" },
      { path: "README.md", content: "example readme", checksum: "sha256:example-readme" },
    ],
  });
}

/** Example archive plan input with package-relative file paths. */
export function exampleArchivePlanInput(): ArchivePlanInput {
  return {
    format: "zip",
    packageName: "oh-my-pm-local",
    packageVersion: "2.0.0-alpha.0",
    files: exampleFilesystemEntries().map((entry) => ({
      ...entry,
      path: entry.path.slice("/tmp/oh-my-pm/".length),
    })),
  };
}

/** Example release metadata input with a placeholder-only key id. */
export function exampleReleaseMetadataInput(): ReleaseMetadataInput {
  return {
    archive: createArchivePlan(exampleArchivePlanInput()),
    createdAt: "2026-01-01T00:00:00.000Z",
    keyId: "example-key",
  };
}

/** Example verification input pairing metadata with its archive plan. */
export function exampleReleaseIntegrityVerificationInput(): ReleaseIntegrityVerificationInput {
  const archive = createArchivePlan(exampleArchivePlanInput());
  const metadata = createReleaseMetadataDryRun({
    archive,
    createdAt: "2026-01-01T00:00:00.000Z",
    keyId: "example-key",
  });
  return { archive, metadata: metadata.metadata };
}

/** Example channel input holding one verified release entry. */
export function exampleReleaseChannelMetadataInput(): ReleaseChannelMetadataInput {
  const integrityInput = exampleReleaseIntegrityVerificationInput();
  const integrity = createReleaseIntegrityDryRun(integrityInput);
  return {
    channel: "dev",
    entries: [
      {
        version: "2.0.0-alpha.0",
        createdAt: "2026-01-01T00:00:00.000Z",
        metadata: integrityInput.metadata,
        integrity: integrity.verification,
      },
    ],
  };
}

/** Example update policy input; the candidate (2.0.0-alpha.0) is newer. */
export function exampleLocalUpdatePolicyInput(): LocalUpdatePolicyInput {
  return {
    installed: {
      schemaVersion: "1",
      version: "1.0.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      root: "/tmp/oh-my-pm",
    },
    channel: createReleaseChannelMetadata(exampleReleaseChannelMetadataInput()),
    policy: DEFAULT_LOCAL_UPDATE_POLICY,
  };
}

/**
 * Example update impact input. The candidate archive entries carry
 * checksum `sha256:old` (bin) and `sha256:old-readme` (README), both size 10.
 * README's current file matches exactly (unchanged); bin differs (replace).
 */
export function exampleUpdateImpactPreviewInput(): UpdateImpactPreviewInput {
  const archive = createArchivePlan(exampleArchivePlanInput());
  const policy = evaluateLocalUpdatePolicy(exampleLocalUpdatePolicyInput());
  return {
    root: "/tmp/oh-my-pm",
    currentFiles: [
      { path: "bin/oh-my-pm", content: "different!", checksum: "sha256:old-bin" },
      { path: "README.md", content: "old readme", checksum: "sha256:old-readme" },
    ],
    candidateEntries: archive.entries,
    policy,
  };
}

/**
 * Example rollback impact input. bin/oh-my-pm differs from its backup
 * (restore); README.md matches its backup (unchanged); old-file.txt is
 * current-only with no backup (remove).
 */
export function exampleRollbackImpactPreviewInput(): RollbackImpactPreviewInput {
  return {
    root: "/tmp/oh-my-pm",
    rollback: {
      id: "rollback-1",
      paths: ["bin/oh-my-pm", "README.md", "old-file.txt"],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    currentFiles: [
      { path: "bin/oh-my-pm", content: "new binary", checksum: "sha256:new-bin" },
      { path: "README.md", content: "old readme", checksum: "sha256:old-readme" },
      { path: "old-file.txt", content: "leftover!", checksum: "sha256:leftover" },
    ],
    backupFiles: [
      { path: "bin/oh-my-pm", content: "old binary", checksum: "sha256:old-bin" },
      { path: "README.md", content: "old readme", checksum: "sha256:old-readme" },
    ],
  };
}

/** Example package assembly dry-run input. */
export function examplePackageAssemblyInput(): PackageAssemblyInput {
  return {
    name: "oh-my-pm-local",
    version: "2.0.0-alpha.0",
    root: "/tmp/oh-my-pm",
    include: ["bin/oh-my-pm", "README.md"],
    platform: "linux",
    architecture: "x64",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Example entries for an in-memory filesystem adapter. */
export function exampleFilesystemEntries(): FilesystemEntry[] {
  return [
    {
      path: "/tmp/oh-my-pm/bin/oh-my-pm",
      content: "old binary",
      checksum: "sha256:old",
    },
    {
      path: "/tmp/oh-my-pm/README.md",
      content: "old readme",
      checksum: "sha256:old-readme",
    },
  ];
}

/**
 * Example decision-report input built from the existing example chain. Every
 * layer is a local dry run; install operations are a small deterministic list.
 * The chain is consistent, so the aggregated decision is not blocked.
 */
export function exampleInstallerDecisionReportInput(): InstallerDecisionReportInput {
  const filesystem = createMemoryFilesystem(exampleFilesystemEntries());
  const assembly = createPackageAssemblyDryRun(examplePackageAssemblyInput(), filesystem);
  const archive = createArchiveDryRunFromAssembly(assembly, "zip");
  const metadata = createReleaseMetadataDryRun(exampleReleaseMetadataInput());
  const integrity = createReleaseIntegrityDryRun(exampleReleaseIntegrityVerificationInput());
  const channel = createReleaseChannelDryRun(exampleReleaseChannelMetadataInput());
  const updatePolicy = createLocalUpdatePolicyDryRun(exampleLocalUpdatePolicyInput());
  const updateImpact = createUpdateImpactDryRun(exampleUpdateImpactPreviewInput());
  const rollbackImpact = createRollbackImpactDryRun(exampleRollbackImpactPreviewInput());

  const installOperations: PlannedFileOperation[] = [
    { kind: "create", path: "/tmp/oh-my-pm/bin/oh-my-pm" },
    { kind: "replace", path: "/tmp/oh-my-pm/README.md" },
  ];

  return {
    root: "/tmp/oh-my-pm",
    installOperations,
    assembly,
    archive,
    metadata,
    integrity,
    channel,
    updatePolicy,
    updateImpact,
    rollbackImpact,
  };
}

/**
 * Example audit-event input built from the example decision report. The report
 * is not blocked, so the aggregated event sequence validates cleanly.
 */
export function exampleInstallerAuditEventInput(): InstallerAuditEventInput {
  const decision = createInstallerDecisionReport(exampleInstallerDecisionReportInput());
  return { root: "/tmp/oh-my-pm", decision };
}

/**
 * Example audit trail export input built from the example audit event
 * sequence, rendered as JSONL. The sequence is well-formed, so the export
 * plan validates cleanly.
 */
export function exampleInstallerAuditTrailExportInput(): InstallerAuditTrailExportInput {
  const events = createInstallerAuditEvents(exampleInstallerAuditEventInput());
  return { events, format: "jsonl" };
}

/**
 * Example write capability input built from the example decision report. The
 * intent is install, the request is unapproved, and the default preview-only
 * policy applies — so the evaluation is blocked.
 */
export function exampleInstallerWriteCapabilityInput(): InstallerWriteCapabilityInput {
  const decision = createInstallerDecisionReport(exampleInstallerDecisionReportInput());
  return {
    intent: "install",
    approved: false,
    decision,
    policy: DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
  };
}

/**
 * Example approval token input built from the example decision report, bound
 * to the install intent and the example root.
 */
export function exampleInstallerWriteApprovalTokenInput(): InstallerWriteApprovalTokenInput {
  const decision = createInstallerDecisionReport(exampleInstallerDecisionReportInput());
  return {
    intent: "install",
    root: "/tmp/oh-my-pm",
    decision,
  };
}

/**
 * Example write execution plan input. Capability is evaluated in explicit mode
 * with a matching approval token (ready decision not required), so it is
 * allowed; the install operations, update impact, and rollback impact come
 * from the existing decision-report example chain.
 */
export function exampleInstallerWriteExecutionPlanInput(): InstallerWriteExecutionPlanInput {
  const decisionInput = exampleInstallerDecisionReportInput();
  const decision = createInstallerDecisionReport(decisionInput);
  const approvalToken = createInstallerWriteApprovalToken({
    intent: "install",
    root: decision.root,
    decision,
  });
  const capability = evaluateInstallerWriteCapability({
    intent: "install",
    approved: false,
    decision,
    approvalToken,
    policy: {
      mode: "explicit",
      allowedIntents: ["install", "update", "rollback"],
      requireReadyDecision: false,
      requireExplicitApproval: true,
    },
  });
  return {
    intent: "install",
    capability,
    installOperations: decisionInput.installOperations,
    updateImpact: decisionInput.updateImpact.preview,
    rollbackImpact: decisionInput.rollbackImpact.preview,
  };
}

/**
 * Example confirmation checklist input. It reuses the write execution plan
 * example's capability and install operations, and pairs them with a ready
 * decision so every confirmation item passes and the checklist is ok.
 */
export function exampleInstallerWriteConfirmationChecklistInput(): InstallerWriteConfirmationChecklistInput {
  const planInput = exampleInstallerWriteExecutionPlanInput();
  // The write execution plan example evaluates capability with a ready-decision
  // requirement disabled; pair it with a ready decision so the confirmation
  // checklist's decision-ready item also passes.
  const decision = { ...createInstallerDecisionReport(exampleInstallerDecisionReportInput()), decision: "ready" as const, ok: true };
  const executionPlan = createInstallerWriteExecutionPlan(planInput);
  return {
    decision,
    capability: planInput.capability,
    executionPlan,
  };
}

/**
 * Example write adapter contract input. It reuses the confirmation checklist
 * example's ready confirmation and its execution plan, paired with a contract
 * that declares every required capability and supports rollback capture, so
 * the contract evaluation is ok.
 */
export function exampleInstallerWriteAdapterContractInput(): InstallerWriteAdapterContractInput {
  const checklistInput = exampleInstallerWriteConfirmationChecklistInput();
  const confirmation = createInstallerWriteConfirmationChecklist(checklistInput);
  return {
    contract: {
      name: "memory-write-adapter",
      capabilities: ["write-file", "remove-file", "backup-file"],
      requiresExplicitApproval: true,
      supportsRollbackCapture: true,
    },
    confirmation,
    executionPlan: checklistInput.executionPlan,
  };
}

/**
 * Example controlled write dry-run envelope input. It reuses the confirmation
 * checklist chain (ready decision, allowed capability, ok execution plan),
 * derives an ok confirmation and adapter contract, and pairs them with an ok
 * approval token dry-run — so every readiness layer aligns and the envelope
 * dry-run is ok.
 */
export function exampleControlledWriteExecutionDryRunEnvelopeInput(): ControlledWriteExecutionDryRunEnvelopeInput {
  const checklistInput = exampleInstallerWriteConfirmationChecklistInput();
  const confirmation = createInstallerWriteConfirmationChecklist(checklistInput);
  const adapterContract = evaluateInstallerWriteAdapterContract(
    exampleInstallerWriteAdapterContractInput(),
  );
  const approval = createInstallerWriteApprovalTokenDryRun({
    intent: "install",
    root: checklistInput.decision.root,
    decision: checklistInput.decision,
  });
  return {
    intent: "install",
    capability: checklistInput.capability,
    approval,
    executionPlan: checklistInput.executionPlan,
    confirmation,
    adapterContract,
  };
}

/**
 * Example release-readiness input built from the existing fixture chain: the
 * decision report, audit trail export dry-run, and controlled write dry-run
 * envelope. Readiness is not forced — tests assert the exact status produced.
 */
export function exampleInstallerReleaseReadinessInput(): InstallerReleaseReadinessInput {
  const decision = createInstallerDecisionReport(exampleInstallerDecisionReportInput());
  const auditExport = createInstallerAuditTrailExportDryRun(
    exampleInstallerAuditTrailExportInput(),
  );
  const controlledWrite = createControlledWriteExecutionDryRun(
    exampleControlledWriteExecutionDryRunEnvelopeInput(),
  );
  return { decision, auditExport, controlledWrite };
}

/**
 * Example v0 release candidate checklist input. Release readiness is built
 * from the existing fixture chain; every caller-supplied validation and
 * hygiene signal is set to true, so the checklist is ok when release readiness
 * is not blocked.
 */
export function exampleV0ReleaseCandidateChecklistInput(): V0ReleaseCandidateChecklistInput {
  const releaseReadiness = createInstallerReleaseReadinessReport(
    exampleInstallerReleaseReadinessInput(),
  );
  return {
    releaseReadiness,
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
  };
}

/**
 * Example public v0 release notes draft input. The checklist and release
 * readiness are built from the existing fixture chain; the draft is draft-ready
 * only when both are ready (the fixtures are, so it is).
 */
export function examplePublicV0ReleaseNotesDraftInput(): PublicV0ReleaseNotesDraftInput {
  const checklist = createV0ReleaseCandidateChecklist(exampleV0ReleaseCandidateChecklistInput());
  const releaseReadiness = createInstallerReleaseReadinessReport(
    exampleInstallerReleaseReadinessInput(),
  );
  return {
    version: "v0.1.0",
    checklist,
    releaseReadiness,
  };
}

/**
 * Example guarded release artifact plan input built from the existing fixture
 * chain: release notes, v0 checklist, and release readiness dry-runs plus the
 * package assembly, archive, metadata, integrity, and channel dry-runs. All
 * source fixtures are ready, so the plan is ready (creation still disallowed).
 */
export function exampleGuardedReleaseArtifactPlanInput(): GuardedReleaseArtifactPlanInput {
  const releaseNotes = createPublicV0ReleaseNotesDraftDryRun(
    examplePublicV0ReleaseNotesDraftInput(),
  );
  const v0Checklist = createV0ReleaseCandidateChecklistDryRun(
    exampleV0ReleaseCandidateChecklistInput(),
  );
  const releaseReadiness = createInstallerReleaseReadinessDryRun(
    exampleInstallerReleaseReadinessInput(),
  );
  const filesystem = createMemoryFilesystem(exampleFilesystemEntries());
  const assembly = createPackageAssemblyDryRun(examplePackageAssemblyInput(), filesystem);
  const archive = createArchiveDryRunFromAssembly(assembly, "zip");
  const metadata = createReleaseMetadataDryRun(exampleReleaseMetadataInput());
  const integrity = createReleaseIntegrityDryRun(exampleReleaseIntegrityVerificationInput());
  const channel = createReleaseChannelDryRun(exampleReleaseChannelMetadataInput());
  return {
    version: "v0.1.0",
    releaseNotes,
    v0Checklist,
    releaseReadiness,
    assembly,
    archive,
    metadata,
    integrity,
    channel,
  };
}

/**
 * Example guarded local artifact assembly dry-run envelope input. The artifact
 * plan dry-run and the package assembly, archive, metadata, integrity, and
 * channel dry-runs all come from the existing ready fixture chain, so the
 * envelope is ready (creation still disallowed).
 */
export function exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput(): GuardedLocalArtifactAssemblyDryRunEnvelopeInput {
  const artifactPlan = createGuardedReleaseArtifactPlanDryRun(
    exampleGuardedReleaseArtifactPlanInput(),
  );
  const filesystem = createMemoryFilesystem(exampleFilesystemEntries());
  const assembly = createPackageAssemblyDryRun(examplePackageAssemblyInput(), filesystem);
  const archive = createArchiveDryRunFromAssembly(assembly, "zip");
  const metadata = createReleaseMetadataDryRun(exampleReleaseMetadataInput());
  const integrity = createReleaseIntegrityDryRun(exampleReleaseIntegrityVerificationInput());
  const channel = createReleaseChannelDryRun(exampleReleaseChannelMetadataInput());
  return {
    version: "v0.1.0",
    artifactPlan,
    assembly,
    archive,
    metadata,
    integrity,
    channel,
  };
}

/**
 * Example guarded artifact creation permission input. The assembly envelope
 * comes from the ready assembly fixture chain and the policy is explicit with
 * approval granted, so the permission evaluation may be ok while
 * `creationAllowed` stays false — creation remains disabled in this phase.
 */
export function exampleGuardedArtifactCreationPermissionInput(): GuardedArtifactCreationPermissionInput {
  const assembly = createGuardedLocalArtifactAssemblyDryRun(
    exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput(),
  );
  return {
    version: "v0.1.0",
    policy: {
      mode: "explicit",
      requireReadyAssembly: true,
      requireExplicitApproval: true,
    },
    approved: true,
    assembly: assembly.envelope,
  };
}

/**
 * Example local artifact creation execution plan input built from the
 * existing fixture chain: the guarded artifact creation permission dry-run,
 * the guarded release artifact plan dry-run, and the guarded local artifact
 * assembly dry-run. Readiness is not forced — the fixture is ok only because
 * the underlying fixtures are ready and permission is allowed, while creation
 * stays disabled.
 */
export function exampleLocalArtifactCreationExecutionPlanInput(): LocalArtifactCreationExecutionPlanInput {
  const permission = createGuardedArtifactCreationPermissionDryRun(
    exampleGuardedArtifactCreationPermissionInput(),
  );
  const artifactPlan = createGuardedReleaseArtifactPlanDryRun(
    exampleGuardedReleaseArtifactPlanInput(),
  );
  const assembly = createGuardedLocalArtifactAssemblyDryRun(
    exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput(),
  );
  return {
    version: "v0.1.0",
    permission,
    artifactPlan,
    assembly,
  };
}

/**
 * Example local artifact creation adapter contract input built from the
 * existing fixture chain: the execution plan fixture's permission report and
 * the execution plan built from it, plus a declared in-memory contract that
 * supports dry runs and requires explicit permission. Readiness is not forced
 * — the input is ok only because the underlying fixtures are ready, while
 * creation stays disabled and no adapter exists or is called.
 */
export function exampleLocalArtifactCreationAdapterContractInput(): LocalArtifactCreationAdapterContractInput {
  const planInput = exampleLocalArtifactCreationExecutionPlanInput();
  const executionPlan = createLocalArtifactCreationExecutionPlan(planInput);
  return {
    contract: {
      name: "memory-artifact-adapter",
      capabilities: ["write-text-output", "write-binary-output"],
      supportsDryRun: true,
      requiresExplicitPermission: true,
    },
    permission: planInput.permission.report,
    executionPlan,
  };
}

/**
 * Example local artifact creation confirmation checklist input built from the
 * existing fixture chain: the execution plan fixture's permission report, the
 * execution plan built from it, and the adapter contract report evaluated
 * from the adapter contract fixture. Readiness is not forced — the checklist
 * is ready only because the underlying fixtures are ready, while every
 * `creationAllowed` field stays false and no adapter exists or is called.
 */
export function exampleLocalArtifactCreationConfirmationChecklistInput(): LocalArtifactCreationConfirmationChecklistInput {
  const planInput = exampleLocalArtifactCreationExecutionPlanInput();
  const executionPlan = createLocalArtifactCreationExecutionPlan(planInput);
  const adapterContract = evaluateLocalArtifactCreationAdapterContract(
    exampleLocalArtifactCreationAdapterContractInput(),
  );
  return {
    version: "v0.1.0",
    permission: planInput.permission.report,
    executionPlan,
    adapterContract,
  };
}

/** Example update plan accepted by the Kernel update guard. */
export function exampleUpdatePlan(): UpdatePlan {
  return {
    id: "update-1",
    fromVersion: "2.0.0-alpha.0",
    toVersion: "2.0.0-alpha.1",
    steps: [{ kind: "replace", path: "bin/oh-my-pm", checksum: "sha256:next" }],
    rollback: {
      id: "rollback-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      paths: ["bin/oh-my-pm"],
    },
  };
}
