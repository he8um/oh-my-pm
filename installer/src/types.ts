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
};
