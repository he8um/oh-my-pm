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
 * package file contents; no download occurs.
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

/** Result of a release metadata dry run; no file, key, or upload exists. */
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
