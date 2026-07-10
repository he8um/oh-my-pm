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

/** Deterministic, side-effect-free installer boundary. */
export type Installer = {
  install(input: InstallInput): InstallReport | InstallerFailure;
  applyUpdate(input: UpdateInput): UpdateApplyReport | InstallerFailure;
  rollback(input: RollbackInput): RollbackReport | InstallerFailure;
  snapshot(): InstallerState;
};
