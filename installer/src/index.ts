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
  exampleLocalUpdatePolicyInput,
  exampleRollbackImpactPreviewInput,
  exampleUpdateImpactPreviewInput,
  examplePackageAssemblyInput,
  examplePackageFileEntries,
  examplePackageManifest,
  exampleReleaseChannelMetadataInput,
  exampleReleaseIntegrityVerificationInput,
  exampleReleaseMetadataInput,
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
export {
  createRollbackImpactDryRun,
  createRollbackImpactOperations,
  createRollbackImpactPreview,
  normalizeRollbackImpactPath,
  summarizeRollbackImpact,
} from "./rollback-impact.js";
export {
  createUpdateImpactDryRun,
  createUpdateImpactOperations,
  createUpdateImpactPreview,
  normalizeImpactPath,
  summarizeUpdateImpact,
} from "./update-impact.js";
export {
  compareVersionStrings,
  createLocalUpdatePolicyDryRun,
  DEFAULT_LOCAL_UPDATE_POLICY,
  evaluateLocalUpdatePolicy,
  selectUpdateCandidate,
  validateLocalUpdatePolicy,
  validateUpdatePolicyMode,
} from "./update-policy.js";
export {
  compareReleaseChannelEntries,
  createReleaseChannelDryRun,
  createReleaseChannelMetadata,
  RELEASE_CHANNEL_SCHEMA_VERSION,
  selectLatestReleaseChannelEntry,
  validateReleaseChannelMetadata,
  validateReleaseChannelName,
} from "./release-channel.js";
export {
  createReleaseIntegrityDryRun,
  expectedPlaceholderSignatureValue,
  verifyPlaceholderSignature,
  verifyReleaseIntegrity,
  verifyReleaseMetadataAgainstArchive,
} from "./release-integrity.js";
export {
  attachPlaceholderSignature,
  createPlaceholderReleaseSignature,
  createReleaseMetadataDryRun,
  createReleaseSigningPayload,
  createUnsignedReleaseMetadata,
  PLACEHOLDER_SIGNATURE_ALGORITHM,
  RELEASE_METADATA_SCHEMA_VERSION,
  validateReleaseMetadata,
} from "./release-metadata.js";
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
  LocalUpdatePolicy,
  LocalUpdatePolicyDryRunReport,
  LocalUpdatePolicyInput,
  LocalUpdatePolicyReport,
  NodeFilesystemAdapterInfo,
  PackageAssemblyDryRunReport,
  PackageAssemblyInput,
  PackageAssemblyPlan,
  NodeFilesystemAdapterOptions,
  PlannedFileOperation,
  PlannedFileOperationKind,
  ReleaseChannelDryRunReport,
  ReleaseChannelEntry,
  ReleaseChannelMetadata,
  ReleaseChannelMetadataInput,
  ReleaseChannelName,
  ReleaseChannelValidationReport,
  ReleaseIntegrityDryRunReport,
  ReleaseIntegrityVerificationInput,
  ReleaseIntegrityVerificationReport,
  ReleaseMetadata,
  ReleaseMetadataDryRunReport,
  ReleaseMetadataInput,
  ReleaseMetadataValidationReport,
  ReleaseSignature,
  ReleaseSignatureAlgorithm,
  RollbackImpactDryRunReport,
  RollbackImpactOperation,
  RollbackImpactOperationKind,
  RollbackImpactPreviewInput,
  RollbackImpactPreviewReport,
  RollbackImpactSummary,
  UpdateImpactDryRunReport,
  UpdateImpactOperation,
  UpdateImpactOperationKind,
  UpdateImpactPreviewInput,
  UpdateImpactPreviewReport,
  UpdateImpactSummary,
  UpdatePolicyDecision,
  UpdatePolicyMode,
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
