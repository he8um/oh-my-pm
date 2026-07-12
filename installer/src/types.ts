import type {
  InstallManifest,
  InstallReport,
  KernelWarning,
  PackageManifest,
  RollbackManifest,
  RollbackReport,
  UpdateApplyReport,
  UpdatePlan,
} from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";

/** Registered installer error codes. */
export type InstallerErrorCode =
  | "OMP-I-6001"
  | "OMP-I-6002"
  | "OMP-I-6003"
  | "OMP-I-6004"
  | "OMP-I-6005";

/**
 * Package-local failure shape; current contracts do not include a failed
 * install report shape.
 */
export type InstallerFailure = {
  ok: false;
  code: InstallerErrorCode;
  message: string;
  warnings: KernelWarning[];
};

/** Injected dependencies; the Kernel boundary is never constructed here. */
export type InstallerDeps = {
  kernel: KernelApi;
};

/** Input for an installation run. All time values are caller-supplied. */
export type InstallInput = {
  packageManifest: PackageManifest;
  root: string;
  installedAt: string;
};

/** Input for applying an update plan. */
export type UpdateInput = {
  currentManifest: InstallManifest;
  plan: UpdatePlan;
};

/** Input for restoring a rollback point. */
export type RollbackInput = {
  rollback: RollbackManifest;
};

/** In-memory installer state; snapshots never share references with inputs. */
export type InstallerState = {
  manifest?: InstallManifest;
  rollbacks: RollbackManifest[];
  appliedUpdates: UpdateApplyReport[];
};

/** Path handled by the installer; always exchanged as a plain string. */
export type InstallerPath = string;

/** File content handled by the installer. */
export type FileContent = string;

/** Single file visible through a filesystem adapter. */
export type FilesystemEntry = {
  path: InstallerPath;
  content: FileContent;
  checksum: string;
};

/** Deterministic view of adapter contents. */
export type FilesystemSnapshot = {
  entries: FilesystemEntry[];
};

/**
 * Explicit read-only filesystem boundary. Installer core never touches the
 * real filesystem; every implementation is injected by the caller.
 */
export type FilesystemAdapter = {
  list(root: InstallerPath): FilesystemSnapshot;
  read(path: InstallerPath): FilesystemEntry | undefined;
  exists(path: InstallerPath): boolean;
};

/** Kind of planned file operation; nothing here executes. */
export type PlannedFileOperationKind = "create" | "replace" | "remove" | "backup";

/** Single planned file operation. */
export type PlannedFileOperation = {
  kind: PlannedFileOperationKind;
  path: InstallerPath;
  checksum?: string;
};

/** Planned file operations for installing a package under a root. */
export type InstallPlan = {
  root: InstallerPath;
  packageManifest: PackageManifest;
  operations: PlannedFileOperation[];
};

/** Result of an install dry run; no operation has been executed. */
export type InstallDryRunReport = {
  ok: boolean;
  plan: InstallPlan;
  warnings?: KernelWarning[];
};

/** Planned capture operations backing a rollback point. */
export type RollbackCapturePlan = {
  rollback: RollbackManifest;
  operations: PlannedFileOperation[];
};

/** Injected dependencies for filesystem planning. */
export type FilesystemPlannerDeps = {
  filesystem: FilesystemAdapter;
};

/** Outcome of one executed file operation. */
export type ExecutedFileOperation = {
  kind: PlannedFileOperationKind;
  path: InstallerPath;
  ok: boolean;
  checksum?: string;
  message?: string;
};

/** Result of executing an install plan through a write adapter. */
export type InstallExecutionReport = {
  ok: boolean;
  root: InstallerPath;
  operations: ExecutedFileOperation[];
  warnings?: KernelWarning[];
};

/** Result of executing a rollback capture through a write adapter. */
export type RollbackExecutionReport = {
  ok: boolean;
  rollbackId: string;
  operations: ExecutedFileOperation[];
  warnings?: KernelWarning[];
};

/** Input for writing one file through a write adapter. */
export type WriteFileInput = {
  path: InstallerPath;
  content: FileContent;
  checksum: string;
};

/** Input for backing up one file through a write adapter. */
export type BackupFileInput = {
  path: InstallerPath;
  rollbackId: string;
};

/**
 * Explicit write boundary. Installer core never mutates anything itself;
 * every write implementation is injected by the caller.
 */
export type FilesystemWriteAdapter = {
  writeFile(input: WriteFileInput): ExecutedFileOperation;
  removeFile(path: InstallerPath): ExecutedFileOperation;
  backupFile(input: BackupFileInput): ExecutedFileOperation;
};

/** Injected dependencies for controlled execution. */
export type FilesystemExecutorDeps = {
  filesystem: FilesystemAdapter;
  writer: FilesystemWriteAdapter;
};

/**
 * Input for executing an install plan. `files` carries already available
 * package file contents; no remote retrieval occurs.
 */
export type InstallExecutionInput = {
  input: InstallInput;
  plan: InstallPlan;
  files: FilesystemEntry[];
};

/** Input for executing a rollback capture. */
export type RollbackExecutionInput = {
  rollback: RollbackManifest;
};

/**
 * Input for a package assembly dry run. `include` lists package-relative
 * file paths; there is no output path or write target — nothing is packaged.
 */
export type PackageAssemblyInput = {
  name: string;
  version: string;
  root: InstallerPath;
  include: string[];
  platform?: string;
  architecture?: string;
  createdAt?: string;
};

/** Files resolved for an assembly through a read-only adapter. */
export type PackageAssemblyPlan = {
  root: InstallerPath;
  include: string[];
  files: FilesystemEntry[];
};

/** Result of an assembly dry run; no archive is ever created. */
export type PackageAssemblyDryRunReport = {
  ok: boolean;
  plan: PackageAssemblyPlan;
  manifest: PackageManifest;
  warnings?: KernelWarning[];
};

/** Planned archive format; a plan value only, never an instruction to create. */
export type ArchiveFormat = "zip" | "tar";

/** Single file planned into a future archive. */
export type ArchivePlanEntry = {
  path: InstallerPath;
  checksum: string;
  sizeBytes: number;
};

/**
 * Deterministic description of a future archive. `archiveName` is a planned
 * name, not a written path — there is no output directory, artifact path, or
 * write target anywhere in this model.
 */
export type ArchivePlan = {
  format: ArchiveFormat;
  archiveName: string;
  packageName: string;
  packageVersion: string;
  checksum: string;
  entries: ArchivePlanEntry[];
};

/** Input for planning an archive. */
export type ArchivePlanInput = {
  format: ArchiveFormat;
  packageName: string;
  packageVersion: string;
  files: FilesystemEntry[];
};

/** Result of an archive dry run; no archive is ever created. */
export type ArchiveDryRunReport = {
  ok: boolean;
  plan: ArchivePlan;
  warnings?: KernelWarning[];
};

/**
 * Placeholder-only signature algorithm. This phase models the metadata
 * shape; no keys exist and no cryptographic signing happens anywhere.
 */
export type ReleaseSignatureAlgorithm = "deterministic-placeholder";

/** Placeholder signature over a release signing payload. */
export type ReleaseSignature = {
  algorithm: ReleaseSignatureAlgorithm;
  keyId: string;
  value: string;
};

/** Metadata describing a future signed release; nothing is written. */
export type ReleaseMetadata = {
  schemaVersion: string;
  packageName: string;
  packageVersion: string;
  archiveName: string;
  archiveFormat: ArchiveFormat;
  archiveChecksum: string;
  archiveEntries: ArchivePlanEntry[];
  createdAt: string;
  signature?: ReleaseSignature;
};

/** Input for building release metadata from an archive plan. */
export type ReleaseMetadataInput = {
  archive: ArchivePlan;
  createdAt: string;
  keyId?: string;
};

/** Result of validating release metadata. */
export type ReleaseMetadataValidationReport = {
  ok: boolean;
  reasons: string[];
};

/** Result of a release metadata dry run; no file, key, or remote transfer exists. */
export type ReleaseMetadataDryRunReport = {
  ok: boolean;
  metadata: ReleaseMetadata;
  signingPayload: string;
  validation: ReleaseMetadataValidationReport;
  warnings?: KernelWarning[];
};

/** Input for verifying release metadata against an archive plan. */
export type ReleaseIntegrityVerificationInput = {
  metadata: ReleaseMetadata;
  archive: ArchivePlan;
};

/**
 * Result of a consistency-only integrity verification. No cryptographic
 * authenticity is checked and no key material exists anywhere.
 */
export type ReleaseIntegrityVerificationReport = {
  ok: boolean;
  reasons: string[];
  metadataValidation: ReleaseMetadataValidationReport;
};

/** Result of an integrity verification dry run; nothing is written. */
export type ReleaseIntegrityDryRunReport = {
  ok: boolean;
  verification: ReleaseIntegrityVerificationReport;
  warnings?: KernelWarning[];
};

/** Local release channel name; a grouping label only. */
export type ReleaseChannelName = "stable" | "beta" | "nightly" | "dev";

/** One verified release inside a channel. */
export type ReleaseChannelEntry = {
  version: string;
  createdAt: string;
  metadata: ReleaseMetadata;
  integrity: ReleaseIntegrityVerificationReport;
};

/**
 * Local channel metadata grouping verified releases. There are no remote
 * locations, endpoints, or artifact paths anywhere in this model.
 */
export type ReleaseChannelMetadata = {
  schemaVersion: string;
  channel: ReleaseChannelName;
  latestVersion: string;
  entries: ReleaseChannelEntry[];
};

/** Input for building channel metadata. */
export type ReleaseChannelMetadataInput = {
  channel: ReleaseChannelName;
  entries: ReleaseChannelEntry[];
};

/** Result of validating channel metadata. */
export type ReleaseChannelValidationReport = {
  ok: boolean;
  reasons: string[];
};

/** Result of a channel metadata dry run; nothing is written or fetched. */
export type ReleaseChannelDryRunReport = {
  ok: boolean;
  channel: ReleaseChannelMetadata;
  validation: ReleaseChannelValidationReport;
  warnings?: KernelWarning[];
};

/** How updates are applied under a local policy; a label only. */
export type UpdatePolicyMode = "manual" | "automatic";

/** Outcome of evaluating a candidate against an installed manifest. */
export type UpdatePolicyDecision = "allowed" | "blocked" | "already-current";

/** Local, policy-based update rules. No remote locations are involved. */
export type LocalUpdatePolicy = {
  mode: UpdatePolicyMode;
  allowedChannels: ReleaseChannelName[];
  allowDowngrade: boolean;
  requireIntegrity: boolean;
};

/** Input for evaluating a channel candidate against the installed manifest. */
export type LocalUpdatePolicyInput = {
  installed: InstallManifest | undefined;
  channel: ReleaseChannelMetadata;
  policy: LocalUpdatePolicy;
};

/** Result of evaluating a local update policy. */
export type LocalUpdatePolicyReport = {
  ok: boolean;
  decision: UpdatePolicyDecision;
  currentVersion?: string;
  candidateVersion?: string;
  channel: ReleaseChannelName;
  reasons: string[];
};

/** Result of an update policy dry run; nothing is fetched or executed. */
export type LocalUpdatePolicyDryRunReport = {
  ok: boolean;
  report: LocalUpdatePolicyReport;
  warnings?: KernelWarning[];
};

/** How a candidate file compares to the currently installed file. */
export type UpdateImpactOperationKind = "create" | "replace" | "remove" | "unchanged";

/** One file's before/after comparison for an update impact preview. */
export type UpdateImpactOperation = {
  kind: UpdateImpactOperationKind;
  path: InstallerPath;
  beforeChecksum?: string;
  afterChecksum?: string;
  beforeSizeBytes?: number;
  afterSizeBytes?: number;
};

/** Aggregate counts and byte totals for an impact preview. */
export type UpdateImpactSummary = {
  creates: number;
  replaces: number;
  removes: number;
  unchanged: number;
  beforeSizeBytes: number;
  afterSizeBytes: number;
};

/** Input for previewing the impact of an eligible update; no execution. */
export type UpdateImpactPreviewInput = {
  root: InstallerPath;
  currentFiles: FilesystemEntry[];
  candidateEntries: ArchivePlanEntry[];
  policy: LocalUpdatePolicyReport;
};

/** Result of an update impact preview. */
export type UpdateImpactPreviewReport = {
  ok: boolean;
  root: InstallerPath;
  operations: UpdateImpactOperation[];
  summary: UpdateImpactSummary;
  policyDecision: UpdatePolicyDecision;
  reasons: string[];
};

/** Result of an update impact dry run; nothing is fetched or executed. */
export type UpdateImpactDryRunReport = {
  ok: boolean;
  preview: UpdateImpactPreviewReport;
  warnings?: KernelWarning[];
};

/** How a rollback backup compares to the current file. */
export type RollbackImpactOperationKind = "restore" | "remove" | "missing" | "unchanged";

/** One file's before/after comparison for a rollback impact preview. */
export type RollbackImpactOperation = {
  kind: RollbackImpactOperationKind;
  path: InstallerPath;
  beforeChecksum?: string;
  afterChecksum?: string;
  beforeSizeBytes?: number;
  afterSizeBytes?: number;
};

/** Aggregate counts and byte totals for a rollback impact preview. */
export type RollbackImpactSummary = {
  restores: number;
  removes: number;
  missing: number;
  unchanged: number;
  beforeSizeBytes: number;
  afterSizeBytes: number;
};

/** Input for previewing the impact of a rollback; no execution. */
export type RollbackImpactPreviewInput = {
  root: InstallerPath;
  currentFiles: FilesystemEntry[];
  rollback: RollbackManifest;
  backupFiles: FilesystemEntry[];
};

/** Result of a rollback impact preview. */
export type RollbackImpactPreviewReport = {
  ok: boolean;
  root: InstallerPath;
  rollbackId: string;
  operations: RollbackImpactOperation[];
  summary: RollbackImpactSummary;
  reasons: string[];
};

/** Result of a rollback impact dry run; nothing is restored or executed. */
export type RollbackImpactDryRunReport = {
  ok: boolean;
  preview: RollbackImpactPreviewReport;
  warnings?: KernelWarning[];
};

/** Final classification of an aggregated installer decision report. */
export type InstallerDecision = "ready" | "blocked" | "review-required";

/**
 * Input for aggregating local preview layers into one decision report. Every
 * field is an already computed local dry-run/report; nothing is fetched,
 * written, or executed. There is no output path or write target.
 */
export type InstallerDecisionReportInput = {
  root: InstallerPath;
  installOperations: PlannedFileOperation[];
  assembly: PackageAssemblyDryRunReport;
  archive: ArchiveDryRunReport;
  metadata: ReleaseMetadataDryRunReport;
  integrity: ReleaseIntegrityDryRunReport;
  channel: ReleaseChannelDryRunReport;
  updatePolicy: LocalUpdatePolicyDryRunReport;
  updateImpact: UpdateImpactDryRunReport;
  rollbackImpact: RollbackImpactDryRunReport;
};

/** One named layer's verdict inside a decision report. */
export type InstallerDecisionReportSection = {
  name: string;
  ok: boolean;
  reasons: string[];
};

/** Aggregate counts across all decision-report layers. */
export type InstallerDecisionReportSummary = {
  installOperations: number;
  archiveEntries: number;
  channelEntries: number;
  updateImpactOperations: number;
  rollbackImpactOperations: number;
  warnings: number;
};

/** Deterministic aggregation of local preview layers; nothing is executed. */
export type InstallerDecisionReport = {
  ok: boolean;
  decision: InstallerDecision;
  root: InstallerPath;
  sections: InstallerDecisionReportSection[];
  blockingReasons: string[];
  reviewReasons: string[];
  summary: InstallerDecisionReportSummary;
};

/** Result of a decision dry run; nothing is fetched, written, or executed. */
export type InstallerDecisionDryRunReport = {
  ok: boolean;
  report: InstallerDecisionReport;
  warnings?: KernelWarning[];
};

/** Severity of a single installer audit event. */
export type InstallerAuditEventLevel = "info" | "warning" | "error";

/** Kind of installer audit event in a local preview pipeline. */
export type InstallerAuditEventKind =
  | "preview_started"
  | "section_evaluated"
  | "decision_reported"
  | "preview_completed";

/**
 * One deterministic in-memory audit event. There is no timestamp, user,
 * machine id, persisted path, remote destination, or telemetry field — events
 * describe the local preview only and are never written or sent anywhere.
 */
export type InstallerAuditEvent = {
  sequence: number;
  kind: InstallerAuditEventKind;
  level: InstallerAuditEventLevel;
  message: string;
  root: InstallerPath;
  subject?: string;
  reason?: string;
};

/** Input for building an audit event sequence from a decision report. */
export type InstallerAuditEventInput = {
  root: InstallerPath;
  decision: InstallerDecisionReport;
};

/** Result of validating an audit event sequence. */
export type InstallerAuditEventValidationReport = {
  ok: boolean;
  reasons: string[];
};

/** Result of an audit event dry run; nothing is written, sent, or persisted. */
export type InstallerAuditEventDryRunReport = {
  ok: boolean;
  events: InstallerAuditEvent[];
  validation: InstallerAuditEventValidationReport;
  warnings?: KernelWarning[];
};

/** Supported in-memory audit trail export formats; no file extension is implied. */
export type InstallerAuditTrailExportFormat = "json" | "jsonl" | "markdown";

/**
 * Input for rendering an audit event sequence as an export payload. There is
 * no output path, filename, destination, or remote sink — the payload is
 * produced in memory only.
 */
export type InstallerAuditTrailExportInput = {
  events: InstallerAuditEvent[];
  format: InstallerAuditTrailExportFormat;
};

/**
 * Deterministic in-memory export payload. `fingerprint` is descriptive
 * metadata (`audit-export:<format>:<eventCount>:<sizeBytes>`), not a
 * cryptographic checksum. Nothing here is written, persisted, or sent.
 */
export type InstallerAuditTrailExportPlan = {
  format: InstallerAuditTrailExportFormat;
  eventCount: number;
  sizeBytes: number;
  fingerprint: string;
  content: string;
};

/** Result of validating an audit trail export plan. */
export type InstallerAuditTrailExportValidationReport = {
  ok: boolean;
  reasons: string[];
};

/** Result of an audit trail export dry run; nothing is written, persisted, or sent. */
export type InstallerAuditTrailExportDryRunReport = {
  ok: boolean;
  plan: InstallerAuditTrailExportPlan;
  validation: InstallerAuditTrailExportValidationReport;
  warnings?: KernelWarning[];
};

/** Kind of future write-capable installer operation; a label only. */
export type InstallerWriteIntent = "install" | "update" | "rollback";

/**
 * How much write capability an explicit policy grants. `preview-only` never
 * allows writes; `explicit` may allow them once every guard passes.
 */
export type InstallerWriteCapabilityMode = "disabled" | "preview-only" | "explicit";

/** Explicit capability policy governing whether writes would be allowed. */
export type InstallerWriteCapabilityPolicy = {
  mode: InstallerWriteCapabilityMode;
  allowedIntents: InstallerWriteIntent[];
  requireReadyDecision: boolean;
  requireExplicitApproval: boolean;
};

/**
 * Input for evaluating a requested write intent against a decision report and
 * an explicit policy. There is no file path, write payload, command payload,
 * write adapter, execution field, or remote field — this only models whether
 * writes would be allowed.
 */
export type InstallerWriteCapabilityInput = {
  intent: InstallerWriteIntent;
  approved: boolean;
  decision: InstallerDecisionReport;
  policy: InstallerWriteCapabilityPolicy;
  approvalToken?: InstallerWriteApprovalToken;
};

/** Result of evaluating a write capability request; nothing is executed. */
export type InstallerWriteCapabilityReport = {
  ok: boolean;
  intent: InstallerWriteIntent;
  mode: InstallerWriteCapabilityMode;
  allowed: boolean;
  reasons: string[];
};

/** Result of a write capability dry run; nothing is written or executed. */
export type InstallerWriteCapabilityDryRunReport = {
  ok: boolean;
  report: InstallerWriteCapabilityReport;
  warnings?: KernelWarning[];
};

/**
 * Deterministic, local, non-secret approval token. `value` is descriptive
 * text binding an intent, root, and decision — there is no secret, key,
 * signature, timestamp, expiry, user, machine, destination, or remote field,
 * and nothing here is cryptographic.
 */
export type InstallerWriteApprovalToken = {
  intent: InstallerWriteIntent;
  root: InstallerPath;
  decision: InstallerDecision;
  value: string;
};

/** Input for building an approval token from a decision report. */
export type InstallerWriteApprovalTokenInput = {
  intent: InstallerWriteIntent;
  root: InstallerPath;
  decision: InstallerDecisionReport;
};

/** Result of validating an approval token's internal consistency. */
export type InstallerWriteApprovalTokenValidationReport = {
  ok: boolean;
  reasons: string[];
};

/** Input for matching a token against a write capability request. */
export type InstallerWriteApprovalTokenMatchInput = {
  token: InstallerWriteApprovalToken | undefined;
  request: InstallerWriteCapabilityInput;
};

/** Result of matching an approval token against a request. */
export type InstallerWriteApprovalTokenMatchReport = {
  ok: boolean;
  approved: boolean;
  reasons: string[];
};

/** Result of an approval token dry run; nothing is written or executed. */
export type InstallerWriteApprovalTokenDryRunReport = {
  ok: boolean;
  token: InstallerWriteApprovalToken;
  validation: InstallerWriteApprovalTokenValidationReport;
  warnings?: KernelWarning[];
};

/** Kind of a planned write step; a plan label only, never an instruction to run. */
export type InstallerWriteExecutionPlanStepKind =
  | "install-create"
  | "install-replace"
  | "install-remove"
  | "install-backup"
  | "update-create"
  | "update-replace"
  | "update-remove"
  | "rollback-restore"
  | "rollback-remove";

/**
 * One planned write step. There is no content, write adapter, destination,
 * command, remote, or execution-result field — steps describe what a future
 * write mode would do, and nothing here runs.
 */
export type InstallerWriteExecutionPlanStep = {
  sequence: number;
  kind: InstallerWriteExecutionPlanStepKind;
  path: InstallerPath;
  checksum?: string;
};

/**
 * Input for planning write steps from an allowed capability decision and
 * existing local preview data. Every field is an already computed local
 * report; nothing is fetched, written, or executed.
 */
export type InstallerWriteExecutionPlanInput = {
  intent: InstallerWriteIntent;
  capability: InstallerWriteCapabilityReport;
  installOperations: PlannedFileOperation[];
  updateImpact: UpdateImpactPreviewReport;
  rollbackImpact: RollbackImpactPreviewReport;
};

/** Deterministic planned write steps for one intent; nothing is executed. */
export type InstallerWriteExecutionPlan = {
  ok: boolean;
  intent: InstallerWriteIntent;
  steps: InstallerWriteExecutionPlanStep[];
  reasons: string[];
};

/** Result of a write execution plan dry run; nothing is written or executed. */
export type InstallerWriteExecutionPlanDryRunReport = {
  ok: boolean;
  plan: InstallerWriteExecutionPlan;
  warnings?: KernelWarning[];
};

/** Identifier for one pre-write confirmation check. */
export type InstallerWriteConfirmationItemId =
  | "intent-consistent"
  | "decision-ready"
  | "capability-allowed"
  | "execution-plan-ready"
  | "execution-steps-present";

/**
 * One confirmation check. `reason` is present only when the check failed.
 * There is no content, write adapter, destination, command, remote, or
 * execution-result field — items describe local readiness only.
 */
export type InstallerWriteConfirmationChecklistItem = {
  id: InstallerWriteConfirmationItemId;
  label: string;
  ok: boolean;
  reason?: string;
};

/**
 * Input for building the confirmation checklist from already computed local
 * reports; nothing is fetched, written, or executed.
 */
export type InstallerWriteConfirmationChecklistInput = {
  decision: InstallerDecisionReport;
  capability: InstallerWriteCapabilityReport;
  executionPlan: InstallerWriteExecutionPlan;
};

/** Deterministic pre-write confirmation checklist; nothing is executed. */
export type InstallerWriteConfirmationChecklist = {
  ok: boolean;
  intent: InstallerWriteIntent;
  items: InstallerWriteConfirmationChecklistItem[];
  reasons: string[];
};

/** Result of a confirmation checklist dry run; nothing is written or executed. */
export type InstallerWriteConfirmationChecklistDryRunReport = {
  ok: boolean;
  checklist: InstallerWriteConfirmationChecklist;
  warnings?: KernelWarning[];
};

/** Options for the read-only Node filesystem adapter. */
export type NodeFilesystemAdapterOptions = {
  root: string;
};

/** Checksum algorithm used by filesystem adapters. */
export type ChecksumAlgorithm = "sha256";

/** Description of a configured Node filesystem adapter. */
export type NodeFilesystemAdapterInfo = {
  root: string;
  checksumAlgorithm: ChecksumAlgorithm;
  readOnly: true;
};

/** Input for planning a rollback capture. */
export type RollbackCaptureInput = {
  id: string;
  root: string;
  paths: string[];
  createdAt: string;
};

/** Deterministic, side-effect-free installer boundary. */
export type Installer = {
  install(input: InstallInput): InstallReport | InstallerFailure;
  applyUpdate(input: UpdateInput): UpdateApplyReport | InstallerFailure;
  rollback(input: RollbackInput): RollbackReport | InstallerFailure;
  snapshot(): InstallerState;
  planInstall(
    input: InstallInput,
    deps: FilesystemPlannerDeps,
  ): InstallDryRunReport | InstallerFailure;
  planRollbackCapture(
    input: RollbackCaptureInput,
    deps: FilesystemPlannerDeps,
  ): RollbackCapturePlan | InstallerFailure;
  executeInstall(
    input: InstallExecutionInput,
    deps: FilesystemExecutorDeps,
  ): InstallExecutionReport | InstallerFailure;
  executeRollback(
    input: RollbackExecutionInput,
    deps: FilesystemExecutorDeps,
  ): RollbackExecutionReport | InstallerFailure;
};
