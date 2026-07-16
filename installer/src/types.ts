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

/** A local capability a future write adapter may declare; a label only. */
export type InstallerWriteAdapterCapability = "write-file" | "remove-file" | "backup-file";

/**
 * Declared metadata contract for a future write adapter. This is metadata
 * only — there is no adapter object, function, method, content, write payload,
 * execution-result, destination, command, or remote field. Nothing here is an
 * adapter instance and no adapter method is ever called.
 */
export type InstallerWriteAdapterContract = {
  name: string;
  capabilities: InstallerWriteAdapterCapability[];
  requiresExplicitApproval: boolean;
  supportsRollbackCapture: boolean;
};

/**
 * Input for checking a declared contract against already computed local
 * reports; nothing is fetched, written, executed, or called.
 */
export type InstallerWriteAdapterContractInput = {
  contract: InstallerWriteAdapterContract;
  confirmation: InstallerWriteConfirmationChecklist;
  executionPlan: InstallerWriteExecutionPlan;
};

/** Result of evaluating a declared write adapter contract; nothing is executed. */
export type InstallerWriteAdapterContractReport = {
  ok: boolean;
  name: string;
  requiredCapabilities: InstallerWriteAdapterCapability[];
  declaredCapabilities: InstallerWriteAdapterCapability[];
  reasons: string[];
};

/** Result of a write adapter contract dry run; nothing is written or executed. */
export type InstallerWriteAdapterContractDryRunReport = {
  ok: boolean;
  report: InstallerWriteAdapterContractReport;
  warnings?: KernelWarning[];
};

/**
 * Input aggregating every already computed write readiness layer for one
 * controlled dry-run envelope; nothing is fetched, written, or executed.
 */
export type ControlledWriteExecutionDryRunEnvelopeInput = {
  intent: InstallerWriteIntent;
  capability: InstallerWriteCapabilityReport;
  approval: InstallerWriteApprovalTokenDryRunReport;
  executionPlan: InstallerWriteExecutionPlan;
  confirmation: InstallerWriteConfirmationChecklist;
  adapterContract: InstallerWriteAdapterContractReport;
};

/** Flat readiness summary across every write layer; nothing is executed. */
export type ControlledWriteExecutionDryRunEnvelopeSummary = {
  intent: InstallerWriteIntent;
  allowed: boolean;
  approved: boolean;
  planReady: boolean;
  confirmationReady: boolean;
  adapterReady: boolean;
  plannedSteps: number;
  reasons: string[];
};

/**
 * Non-mutating inspection envelope aggregating every write readiness layer.
 * There is no content, write adapter object, execution-result, destination,
 * command, remote, or method/function field — the pass-through layers are the
 * already computed reports and nothing here executes.
 */
export type ControlledWriteExecutionDryRunEnvelope = {
  ok: boolean;
  summary: ControlledWriteExecutionDryRunEnvelopeSummary;
  capability: InstallerWriteCapabilityReport;
  approval: InstallerWriteApprovalTokenDryRunReport;
  executionPlan: InstallerWriteExecutionPlan;
  confirmation: InstallerWriteConfirmationChecklist;
  adapterContract: InstallerWriteAdapterContractReport;
};

/** Result of a controlled write dry run; nothing is written or executed. */
export type ControlledWriteExecutionDryRunReport = {
  ok: boolean;
  envelope: ControlledWriteExecutionDryRunEnvelope;
  warnings?: KernelWarning[];
};

/** Aggregate readiness classification for a local installer/release preview. */
export type InstallerReleaseReadinessStatus = "ready" | "blocked" | "review-required";

/** Identifier for one release-readiness section. */
export type InstallerReleaseReadinessSectionId =
  | "installer-decision"
  | "audit-export"
  | "controlled-write";

/** One named readiness layer inside the release-readiness report. */
export type InstallerReleaseReadinessSection = {
  id: InstallerReleaseReadinessSectionId;
  label: string;
  ok: boolean;
  status: InstallerReleaseReadinessStatus;
  reasons: string[];
};

/**
 * Input aggregating already computed local readiness reports; nothing is
 * fetched, written, or executed.
 */
export type InstallerReleaseReadinessInput = {
  decision: InstallerDecisionReport;
  auditExport: InstallerAuditTrailExportDryRunReport;
  controlledWrite: ControlledWriteExecutionDryRunReport;
};

/** Flat counts across every release-readiness section; nothing is executed. */
export type InstallerReleaseReadinessSummary = {
  status: InstallerReleaseReadinessStatus;
  sectionsReady: number;
  sectionsBlocked: number;
  sectionsReviewRequired: number;
  uniqueReasons: number;
  plannedWriteSteps: number;
};

/**
 * Summary-only aggregation of local preview readiness. There is no content,
 * artifact, release-asset, output-path, destination, command, remote, adapter
 * object, or execution-result field — nothing here is created or executed.
 */
export type InstallerReleaseReadinessReport = {
  ok: boolean;
  status: InstallerReleaseReadinessStatus;
  sections: InstallerReleaseReadinessSection[];
  reasons: string[];
  summary: InstallerReleaseReadinessSummary;
};

/** Result of a release-readiness dry run; nothing is written or executed. */
export type InstallerReleaseReadinessDryRunReport = {
  ok: boolean;
  report: InstallerReleaseReadinessReport;
  warnings?: KernelWarning[];
};

/** Identifier for one v0 release candidate checklist item. */
export type V0ReleaseCandidateChecklistItemId =
  | "contracts-valid"
  | "public-surface-clean"
  | "structure-valid"
  | "boundaries-valid"
  | "builds-pass"
  | "tests-pass"
  | "wasm-build-pass"
  | "cli-smoke-pass"
  | "installer-release-readiness-reviewed"
  | "no-production-install-command"
  | "no-release-artifacts"
  | "no-publishing-metadata"
  | "no-private-docs"
  | "docs-updated";

/**
 * One release-candidate checklist item. `reason` is present only when the
 * item failed. It carries no release-output, output-path, destination,
 * command-execution, distribution, remote, adapter-object, or execution-result
 * field — items describe caller-supplied readiness signals only.
 */
export type V0ReleaseCandidateChecklistItem = {
  id: V0ReleaseCandidateChecklistItemId;
  label: string;
  ok: boolean;
  reason?: string;
};

/**
 * Caller-supplied signals for the v0 release candidate checklist. The checklist
 * never inspects the repository itself; every value is provided by the caller.
 */
export type V0ReleaseCandidateChecklistInput = {
  releaseReadiness: InstallerReleaseReadinessReport;
  validation: {
    contracts: boolean;
    publicSurface: boolean;
    structure: boolean;
    boundaries: boolean;
    builds: boolean;
    tests: boolean;
    wasmBuild: boolean;
    cliSmoke: boolean;
  };
  hygiene: {
    noProductionInstallCommand: boolean;
    noReleaseArtifacts: boolean;
    noPublishingMetadata: boolean;
    noPrivateDocs: boolean;
    docsUpdated: boolean;
  };
};

/** Deterministic v0 release candidate checklist; nothing is executed. */
export type V0ReleaseCandidateChecklist = {
  ok: boolean;
  items: V0ReleaseCandidateChecklistItem[];
  reasons: string[];
};

/** Result of a v0 release candidate checklist dry run; nothing is written. */
export type V0ReleaseCandidateChecklistDryRunReport = {
  ok: boolean;
  checklist: V0ReleaseCandidateChecklist;
  warnings?: KernelWarning[];
};

/** Input for rendering a public v0 release notes draft; nothing is created. */
export type PublicV0ReleaseNotesDraftInput = {
  version: string;
  checklist: V0ReleaseCandidateChecklist;
  releaseReadiness: InstallerReleaseReadinessReport;
};

/** Identifier for one public v0 release notes draft section. */
export type PublicV0ReleaseNotesDraftSectionId =
  | "status"
  | "included"
  | "safety"
  | "not-included"
  | "validation"
  | "next";

/** One public-safe release notes section. */
export type PublicV0ReleaseNotesDraftSection = {
  id: PublicV0ReleaseNotesDraftSectionId;
  title: string;
  lines: string[];
};

/**
 * Public-facing, summary-only v0 release notes draft. It carries no
 * release-output, release-asset, fetch-link, output-path, destination,
 * distribution-target, command-execution, remote, adapter-object, or
 * execution-result field — nothing here creates a release or is written.
 */
export type PublicV0ReleaseNotesDraft = {
  ok: boolean;
  version: string;
  status: "draft-ready" | "blocked";
  sections: PublicV0ReleaseNotesDraftSection[];
  reasons: string[];
};

/** Result of a public v0 release notes draft dry run; nothing is written. */
export type PublicV0ReleaseNotesDraftDryRunReport = {
  ok: boolean;
  draft: PublicV0ReleaseNotesDraft;
  warnings?: KernelWarning[];
};

/** Kind of release output a guarded release artifact plan would plan. */
export type GuardedReleaseArtifactPlanItemKind =
  | "release-notes"
  | "package-manifest"
  | "archive-plan"
  | "release-metadata"
  | "integrity-metadata"
  | "channel-metadata";

/**
 * One planned release output. `reason` is present only when the output is not
 * planned. There is no file-content, output-path, destination, command,
 * distribution-target, remote, adapter-object, execution-result, or
 * artifact-bytes field — items describe what would be planned, nothing created.
 */
export type GuardedReleaseArtifactPlanItem = {
  sequence: number;
  kind: GuardedReleaseArtifactPlanItemKind;
  name: string;
  planned: boolean;
  reason?: string;
};

/**
 * Input aggregating the local dry-run reports a guarded release artifact plan
 * reads. Every value is an already computed local report; nothing is fetched,
 * written, or executed.
 */
export type GuardedReleaseArtifactPlanInput = {
  version: string;
  releaseNotes: PublicV0ReleaseNotesDraftDryRunReport;
  v0Checklist: V0ReleaseCandidateChecklistDryRunReport;
  releaseReadiness: InstallerReleaseReadinessDryRunReport;
  assembly: PackageAssemblyDryRunReport;
  archive: ArchiveDryRunReport;
  metadata: ReleaseMetadataDryRunReport;
  integrity: ReleaseIntegrityDryRunReport;
  channel: ReleaseChannelDryRunReport;
};

/**
 * Flat counts across the plan. `creationAllowed` is always `false` — this
 * phase plans outputs only and never permits creation.
 */
export type GuardedReleaseArtifactPlanSummary = {
  version: string;
  plannedItems: number;
  blockedItems: number;
  totalItems: number;
  creationAllowed: false;
};

/**
 * Planning-only guarded release artifact plan. It reports which release
 * outputs would be planned and keeps creation disabled; nothing is created.
 */
export type GuardedReleaseArtifactPlan = {
  ok: boolean;
  version: string;
  items: GuardedReleaseArtifactPlanItem[];
  reasons: string[];
  summary: GuardedReleaseArtifactPlanSummary;
};

/** Result of a guarded release artifact plan dry run; nothing is written. */
export type GuardedReleaseArtifactPlanDryRunReport = {
  ok: boolean;
  plan: GuardedReleaseArtifactPlan;
  warnings?: KernelWarning[];
};

/**
 * Input aggregating the local dry-run reports a guarded local artifact assembly
 * readiness envelope reads. Every value is an already computed local report;
 * nothing is fetched, written, or executed.
 */
export type GuardedLocalArtifactAssemblyDryRunEnvelopeInput = {
  version: string;
  artifactPlan: GuardedReleaseArtifactPlanDryRunReport;
  assembly: PackageAssemblyDryRunReport;
  archive: ArchiveDryRunReport;
  metadata: ReleaseMetadataDryRunReport;
  integrity: ReleaseIntegrityDryRunReport;
  channel: ReleaseChannelDryRunReport;
};

/**
 * Flat readiness summary across the assembly layers. `creationAllowed` is
 * always `false` — this phase models readiness only and never permits creation.
 */
export type GuardedLocalArtifactAssemblyDryRunEnvelopeSummary = {
  version: string;
  artifactPlanReady: boolean;
  packageAssemblyReady: boolean;
  archivePlanReady: boolean;
  metadataReady: boolean;
  integrityReady: boolean;
  channelReady: boolean;
  creationAllowed: false;
  reasons: string[];
};

/**
 * Readiness-only inspection envelope aggregating the guarded release artifact
 * plan and the package assembly, archive, metadata, integrity, and channel
 * dry-runs. There is no file-content, output-path, destination, command,
 * distribution-target, remote, adapter-object, execution-result, or
 * artifact-bytes field — the pass-through layers are already computed reports
 * and nothing here is created.
 */
export type GuardedLocalArtifactAssemblyDryRunEnvelope = {
  ok: boolean;
  summary: GuardedLocalArtifactAssemblyDryRunEnvelopeSummary;
  artifactPlan: GuardedReleaseArtifactPlan;
  assembly: PackageAssemblyDryRunReport;
  archive: ArchiveDryRunReport;
  metadata: ReleaseMetadataDryRunReport;
  integrity: ReleaseIntegrityDryRunReport;
  channel: ReleaseChannelDryRunReport;
};

/** Result of a guarded local artifact assembly dry run; nothing is written. */
export type GuardedLocalArtifactAssemblyDryRunReport = {
  ok: boolean;
  envelope: GuardedLocalArtifactAssemblyDryRunEnvelope;
  warnings?: KernelWarning[];
};

/** Modes a guarded artifact creation permission policy may declare. */
export type GuardedArtifactCreationPermissionMode =
  | "disabled"
  | "dry-run-only"
  | "explicit";

/**
 * Policy governing whether a future explicitly-enabled local artifact
 * creation phase would be permitted. In this phase the policy must require a
 * ready assembly envelope and explicit approval; creation itself stays
 * disabled regardless of the policy.
 */
export type GuardedArtifactCreationPermissionPolicy = {
  mode: GuardedArtifactCreationPermissionMode;
  requireReadyAssembly: boolean;
  requireExplicitApproval: boolean;
};

/**
 * Input for a guarded artifact creation permission evaluation. The assembly
 * value is the already computed guarded local artifact assembly dry-run
 * envelope; nothing is fetched, created, written, or executed.
 */
export type GuardedArtifactCreationPermissionInput = {
  version: string;
  policy: GuardedArtifactCreationPermissionPolicy;
  approved: boolean;
  assembly: GuardedLocalArtifactAssemblyDryRunEnvelope;
};

/**
 * Permission-evaluation verdict. `allowed` is only a future-permission
 * signal and `creationAllowed` is always the literal `false` — this phase
 * evaluates permission only and never permits creation. There is no
 * artifact-bytes, archive-bytes, file-content, output-path, destination,
 * command, distribution-target, remote, adapter-object, or execution-result
 * field.
 */
export type GuardedArtifactCreationPermissionReport = {
  ok: boolean;
  version: string;
  mode: GuardedArtifactCreationPermissionMode;
  allowed: boolean;
  creationAllowed: false;
  reasons: string[];
};

/** Result of a guarded artifact creation permission dry run; nothing is written. */
export type GuardedArtifactCreationPermissionDryRunReport = {
  ok: boolean;
  report: GuardedArtifactCreationPermissionReport;
  warnings?: KernelWarning[];
};

/** Step kinds a local artifact creation execution plan may sequence. */
export type LocalArtifactCreationExecutionPlanStepKind =
  | "prepare-release-notes"
  | "prepare-package-manifest"
  | "prepare-archive"
  | "prepare-release-metadata"
  | "prepare-integrity-metadata"
  | "prepare-channel-metadata";

/**
 * One planned local creation step. `reason` is present only when the step is
 * not planned. There is no file-content, output-path, destination, command,
 * distribution-target, remote, adapter-object, execution-result, or
 * artifact-bytes field — steps describe what would be prepared, nothing
 * created.
 */
export type LocalArtifactCreationExecutionPlanStep = {
  sequence: number;
  kind: LocalArtifactCreationExecutionPlanStepKind;
  name: string;
  planned: boolean;
  reason?: string;
};

/**
 * Input aggregating the local dry-run reports a local artifact creation
 * execution plan reads. Every value is an already computed local report;
 * nothing is fetched, created, written, or executed.
 */
export type LocalArtifactCreationExecutionPlanInput = {
  version: string;
  permission: GuardedArtifactCreationPermissionDryRunReport;
  artifactPlan: GuardedReleaseArtifactPlanDryRunReport;
  assembly: GuardedLocalArtifactAssemblyDryRunReport;
};

/**
 * Flat plan summary. `creationAllowed` is always `false` — this phase plans
 * the ordered steps a future explicitly-enabled phase would take and never
 * permits creation itself.
 */
export type LocalArtifactCreationExecutionPlanSummary = {
  version: string;
  permissionAllowed: boolean;
  assemblyReady: boolean;
  plannedSteps: number;
  blockedSteps: number;
  totalSteps: number;
  creationAllowed: false;
};

/**
 * Deterministic execution plan for a future explicitly-enabled local artifact
 * creation phase. Planning-only: it can be ok while still not allowing
 * creation, and it carries no file-content, output-path, destination,
 * command, distribution-target, remote, adapter-object, execution-result, or
 * artifact-bytes field.
 */
export type LocalArtifactCreationExecutionPlan = {
  ok: boolean;
  version: string;
  steps: LocalArtifactCreationExecutionPlanStep[];
  reasons: string[];
  summary: LocalArtifactCreationExecutionPlanSummary;
};

/** Result of a local artifact creation execution plan dry run; nothing is written. */
export type LocalArtifactCreationExecutionPlanDryRunReport = {
  ok: boolean;
  plan: LocalArtifactCreationExecutionPlan;
  warnings?: KernelWarning[];
};

/** Capability labels a local artifact creation adapter contract may declare. */
export type LocalArtifactCreationAdapterCapability =
  | "write-text-output"
  | "write-binary-output";

/**
 * Declared, metadata-only description of a future local artifact creation
 * adapter. It is a description, not an implementation: there is no adapter
 * instance, function, or method field, and nothing here can be called.
 */
export type LocalArtifactCreationAdapterContract = {
  name: string;
  capabilities: LocalArtifactCreationAdapterCapability[];
  supportsDryRun: boolean;
  requiresExplicitPermission: boolean;
};

/**
 * Input for validating a declared local artifact creation adapter contract
 * against the already-built execution plan. Every value is an already
 * computed local report; nothing is fetched, created, written, or executed.
 */
export type LocalArtifactCreationAdapterContractInput = {
  contract: LocalArtifactCreationAdapterContract;
  permission: GuardedArtifactCreationPermissionReport;
  executionPlan: LocalArtifactCreationExecutionPlan;
};

/**
 * Contract-fit verdict. `creationAllowed` is always the literal `false` —
 * this phase validates declared capability labels only and never permits
 * creation. There is no adapter-instance, function, method, file-content,
 * bytes, output-path, destination, command, distribution-target, remote, or
 * execution-result field.
 */
export type LocalArtifactCreationAdapterContractReport = {
  ok: boolean;
  name: string;
  requiredCapabilities: LocalArtifactCreationAdapterCapability[];
  declaredCapabilities: LocalArtifactCreationAdapterCapability[];
  reasons: string[];
  creationAllowed: false;
};

/** Result of a local artifact creation adapter contract dry run; nothing is written. */
export type LocalArtifactCreationAdapterContractDryRunReport = {
  ok: boolean;
  report: LocalArtifactCreationAdapterContractReport;
  warnings?: KernelWarning[];
};

/** Item ids a local artifact creation confirmation checklist evaluates. */
export type LocalArtifactCreationConfirmationChecklistItemId =
  | "version-present"
  | "permission-allowed"
  | "execution-plan-ready"
  | "execution-steps-present"
  | "adapter-contract-ready"
  | "required-capabilities-present"
  | "creation-remains-disabled";

/**
 * One confirmation checklist item. `reason` is present only when the item
 * fails.
 */
export type LocalArtifactCreationConfirmationChecklistItem = {
  id: LocalArtifactCreationConfirmationChecklistItemId;
  label: string;
  ok: boolean;
  reason?: string;
};

/**
 * Input composing the guarded artifact creation permission report, the local
 * artifact creation execution plan, and the metadata-only adapter contract
 * report into one confirmation. Every value is an already computed local
 * report; nothing is fetched, created, written, or executed.
 */
export type LocalArtifactCreationConfirmationChecklistInput = {
  version: string;
  permission: GuardedArtifactCreationPermissionReport;
  executionPlan: LocalArtifactCreationExecutionPlan;
  adapterContract: LocalArtifactCreationAdapterContractReport;
};

/**
 * Deterministic readiness confirmation. `creationAllowed` is always the
 * literal `false` — the checklist can be ready while creation remains
 * disabled, and it never permits creation itself. There is no
 * adapter-object, function, method, file-content, bytes, output-path,
 * destination, command, distribution-target, remote, or execution-result
 * field.
 */
export type LocalArtifactCreationConfirmationChecklist = {
  ok: boolean;
  version: string;
  items: LocalArtifactCreationConfirmationChecklistItem[];
  reasons: string[];
  creationAllowed: false;
};

/** Result of a local artifact creation confirmation checklist dry run; nothing is written. */
export type LocalArtifactCreationConfirmationChecklistDryRunReport = {
  ok: boolean;
  checklist: LocalArtifactCreationConfirmationChecklist;
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
