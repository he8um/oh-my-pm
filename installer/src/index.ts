export {
  installerFailure,
  installerWarning,
  OMP_I_INVALID_INSTALL_INPUT,
  OMP_I_INVALID_PACKAGE,
  OMP_I_MANIFEST_VALIDATION_FAILED,
  OMP_I_ROLLBACK_INVALID,
  OMP_I_UPDATE_BLOCKED,
} from "./errors.js";
export {
  exampleArchivePlanInput,
  exampleFilesystemEntries,
  examplePackageAssemblyInput,
  examplePackageFileEntries,
  examplePackageManifest,
  exampleRichPackageManifest,
  exampleRollbackManifest,
  exampleUpdatePlan,
} from "./fixtures.js";
export {
  fileForOperation,
  validateExecutionFiles,
  validateExecutionPlan,
} from "./execution-validate.js";
export { executeInstallPlan, executeRollbackPlan } from "./executor.js";
export { planInstallOperations, planRollbackCapture } from "./filesystem-plan.js";
export { createInstaller } from "./installer.js";
export { cloneFilesystemSnapshot, createMemoryFilesystem } from "./memory-filesystem.js";
export {
  archiveExtension,
  createArchiveDryRun,
  createArchiveName,
  createArchivePlan,
  createArchivePlanEntry,
  validateArchiveFormat,
} from "./archive-plan.js";
export {
  createArchiveDryRunFromAssembly,
  createPackageAssemblyDryRun,
  planPackageAssembly,
  validatePackageAssemblyInput,
} from "./package-assembly.js";
export {
  createPackageFileEntry,
  createPackageManifest,
  PACKAGE_MANIFEST_SCHEMA_VERSION,
  packageManifestFiles,
  validatePackageFileEntries,
} from "./package-manifest.js";
export type { PackageManifestInput } from "./package-manifest.js";
export { createMemoryWriteFilesystem } from "./memory-write-filesystem.js";
export {
  createNodeFilesystemAdapter,
  describeNodeFilesystemAdapter,
} from "./node-filesystem.js";
export { createNodeWriteFilesystemAdapter } from "./node-write-filesystem.js";
export {
  isSafeRelativePath,
  joinInstallerPath,
  normalizeInstallerPath,
  validatePackageFilePaths,
} from "./paths.js";
export {
  createInstallManifest,
  createInstallReport,
  createRollbackManifest,
  createRollbackReport,
  createUpdateApplyReport,
  INSTALL_SCHEMA_VERSION,
} from "./manifest.js";
export type {
  ArchiveDryRunReport,
  ArchiveFormat,
  ArchivePlan,
  ArchivePlanEntry,
  ArchivePlanInput,
  BackupFileInput,
  ChecksumAlgorithm,
  ExecutedFileOperation,
  FileContent,
  FilesystemAdapter,
  FilesystemExecutorDeps,
  FilesystemWriteAdapter,
  FilesystemEntry,
  FilesystemPlannerDeps,
  FilesystemSnapshot,
  InstallDryRunReport,
  Installer,
  InstallerDeps,
  InstallExecutionInput,
  InstallExecutionReport,
  InstallerErrorCode,
  InstallerFailure,
  InstallerPath,
  InstallerState,
  InstallInput,
  InstallPlan,
  NodeFilesystemAdapterInfo,
  PackageAssemblyDryRunReport,
  PackageAssemblyInput,
  PackageAssemblyPlan,
  NodeFilesystemAdapterOptions,
  PlannedFileOperation,
  PlannedFileOperationKind,
  RollbackCaptureInput,
  RollbackCapturePlan,
  RollbackExecutionInput,
  RollbackExecutionReport,
  RollbackInput,
  UpdateInput,
  WriteFileInput,
} from "./types.js";
export {
  isNonEmptyString,
  validateInstallManifest,
  validatePackageManifest,
  validateRollbackManifest,
} from "./validate.js";
