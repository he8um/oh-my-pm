// In-memory installer engine. Purely deterministic: no filesystem, network,
// clock, randomness, or process access. Real installation arrives in a later
// phase behind the same boundary.

import type { JsonValue } from "@oh-my-pm/contracts";
import type {
  FilesystemExecutorDeps,
  FilesystemPlannerDeps,
  InstallDryRunReport,
  InstallExecutionInput,
  InstallExecutionReport,
  InstallInput,
  Installer,
  InstallerDeps,
  InstallerFailure,
  InstallerState,
  RollbackCaptureInput,
  RollbackCapturePlan,
  RollbackExecutionInput,
  RollbackExecutionReport,
  RollbackInput,
  UpdateInput,
} from "./types.js";
import type {
  InstallReport,
  RollbackReport,
  UpdateApplyReport,
} from "@oh-my-pm/contracts";
import {
  installerFailure,
  OMP_I_INVALID_INSTALL_INPUT,
  OMP_I_INVALID_PACKAGE,
  OMP_I_MANIFEST_VALIDATION_FAILED,
  OMP_I_ROLLBACK_INVALID,
  OMP_I_UPDATE_BLOCKED,
} from "./errors.js";
import { executeInstallPlan, executeRollbackPlan } from "./executor.js";
import {
  planInstallOperations,
  planRollbackCapture as planRollbackCaptureOperations,
} from "./filesystem-plan.js";
import {
  createInstallManifest,
  createInstallReport,
  createRollbackReport,
  createUpdateApplyReport,
} from "./manifest.js";
import { isSafeRelativePath, validatePackageFilePaths } from "./paths.js";
import { isNonEmptyString, validatePackageManifest, validateRollbackManifest } from "./validate.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** Create an installer around an injected Kernel boundary. */
export function createInstaller(
  deps: InstallerDeps,
  initialState?: Partial<InstallerState>,
): Installer {
  const state: InstallerState = {
    rollbacks: clone(initialState?.rollbacks ?? []),
    appliedUpdates: clone(initialState?.appliedUpdates ?? []),
  };
  if (initialState?.manifest !== undefined) {
    state.manifest = clone(initialState.manifest);
  }

  function install(input: InstallInput): InstallReport | InstallerFailure {
    const packageReasons = validatePackageManifest(input.packageManifest);
    if (packageReasons.length > 0) {
      return installerFailure(
        OMP_I_INVALID_PACKAGE,
        `invalid package manifest: ${packageReasons.join(", ")}`,
      );
    }

    const inputReasons: string[] = [];
    if (!isNonEmptyString(input.root)) {
      inputReasons.push("missing_root");
    }
    if (!isNonEmptyString(input.installedAt)) {
      inputReasons.push("missing_installed_at");
    }
    if (inputReasons.length > 0) {
      return installerFailure(
        OMP_I_INVALID_INSTALL_INPUT,
        `invalid install input: ${inputReasons.join(", ")}`,
      );
    }

    const manifest = createInstallManifest({
      packageManifest: clone(input.packageManifest),
      root: input.root,
      installedAt: input.installedAt,
    });

    const validation = deps.kernel.validateJson("installManifest", toJsonValue(manifest));
    if (!validation.passed) {
      return installerFailure(
        OMP_I_MANIFEST_VALIDATION_FAILED,
        "install manifest failed kernel validation",
      );
    }

    state.manifest = clone(manifest);
    return createInstallReport(clone(manifest));
  }

  function applyUpdate(input: UpdateInput): UpdateApplyReport | InstallerFailure {
    const decision = deps.kernel.checkUpdatePlan(clone(input.plan));
    if (decision.status === "blocked") {
      return installerFailure(
        OMP_I_UPDATE_BLOCKED,
        `update blocked: ${decision.reasons.join(", ")}`,
      );
    }

    const report = createUpdateApplyReport(input.plan);
    state.appliedUpdates.push(clone(report));

    const baseManifest = state.manifest ?? clone(input.currentManifest);
    state.manifest = {
      schemaVersion: baseManifest.schemaVersion,
      version: input.plan.toVersion,
      installedAt: baseManifest.installedAt,
      root: baseManifest.root,
    };

    return report;
  }

  function rollback(input: RollbackInput): RollbackReport | InstallerFailure {
    const reasons = validateRollbackManifest(input.rollback);
    if (reasons.length > 0) {
      return installerFailure(
        OMP_I_ROLLBACK_INVALID,
        `invalid rollback manifest: ${reasons.join(", ")}`,
      );
    }

    if (!state.rollbacks.some((stored) => stored.id === input.rollback.id)) {
      state.rollbacks.push(clone(input.rollback));
    }

    return createRollbackReport(clone(input.rollback));
  }

  function planInstall(
    input: InstallInput,
    plannerDeps: FilesystemPlannerDeps,
  ): InstallDryRunReport | InstallerFailure {
    const packageReasons = validatePackageManifest(input.packageManifest);
    if (packageReasons.length > 0) {
      return installerFailure(
        OMP_I_INVALID_PACKAGE,
        `invalid package manifest: ${packageReasons.join(", ")}`,
      );
    }

    const inputReasons: string[] = [];
    if (!isNonEmptyString(input.root)) {
      inputReasons.push("missing_root");
    }
    if (!isNonEmptyString(input.installedAt)) {
      inputReasons.push("missing_installed_at");
    }
    if (inputReasons.length > 0) {
      return installerFailure(
        OMP_I_INVALID_INSTALL_INPUT,
        `invalid install input: ${inputReasons.join(", ")}`,
      );
    }

    const pathReasons = validatePackageFilePaths(input.packageManifest.files);
    if (pathReasons.length > 0) {
      return installerFailure(
        OMP_I_INVALID_PACKAGE,
        `invalid package manifest: ${pathReasons.join(", ")}`,
      );
    }

    // Filesystem plan preview only: no state change and no Kernel manifest
    // validation; install() remains the authoritative path.
    return { ok: true, plan: planInstallOperations(clone(input), plannerDeps.filesystem) };
  }

  function planRollbackCapture(
    input: RollbackCaptureInput,
    plannerDeps: FilesystemPlannerDeps,
  ): RollbackCapturePlan | InstallerFailure {
    const reasons: string[] = [];
    if (!isNonEmptyString(input.id)) {
      reasons.push("missing_rollback_id");
    }
    if (!isNonEmptyString(input.root)) {
      reasons.push("missing_root");
    }
    if (!isNonEmptyString(input.createdAt)) {
      reasons.push("missing_rollback_created_at");
    }
    if (input.paths.length === 0) {
      reasons.push("rollback_paths_must_not_be_empty");
    }
    if (input.paths.some((path) => !isSafeRelativePath(path))) {
      reasons.push("unsafe_rollback_path");
    }
    if (reasons.length > 0) {
      return installerFailure(
        OMP_I_ROLLBACK_INVALID,
        `invalid rollback capture input: ${reasons.join(", ")}`,
      );
    }

    return planRollbackCaptureOperations(clone(input), plannerDeps.filesystem);
  }

  function executeInstall(
    input: InstallExecutionInput,
    executorDeps: FilesystemExecutorDeps,
  ): InstallExecutionReport | InstallerFailure {
    const result = executeInstallPlan(input, executorDeps);
    if ("code" in result) {
      return result;
    }
    // State changes only after every operation applied cleanly; the regular
    // install path also runs Kernel manifest validation.
    if (result.ok) {
      const installed = install(input.input);
      if ("code" in installed) {
        return installed;
      }
    }
    return result;
  }

  function executeRollback(
    input: RollbackExecutionInput,
    executorDeps: FilesystemExecutorDeps,
  ): RollbackExecutionReport | InstallerFailure {
    const result = executeRollbackPlan(input, executorDeps);
    if ("code" in result) {
      return result;
    }
    if (result.ok) {
      const stored = rollback({ rollback: input.rollback });
      if ("code" in stored) {
        return stored;
      }
    }
    return result;
  }

  function snapshot(): InstallerState {
    const snap: InstallerState = {
      rollbacks: clone(state.rollbacks),
      appliedUpdates: clone(state.appliedUpdates),
    };
    if (state.manifest !== undefined) {
      snap.manifest = clone(state.manifest);
    }
    return snap;
  }

  return {
    install,
    applyUpdate,
    rollback,
    snapshot,
    planInstall,
    planRollbackCapture,
    executeInstall,
    executeRollback,
  };
}
