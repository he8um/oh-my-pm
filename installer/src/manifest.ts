// Deterministic builders for install, update, and rollback artifacts.
// Builders never validate; callers validate first.

import type {
  InstallManifest,
  InstallReport,
  PackageManifest,
  RollbackManifest,
  RollbackReport,
  UpdateApplyReport,
  UpdatePlan,
} from "@oh-my-pm/contracts";

export const INSTALL_SCHEMA_VERSION = "1";

/** Build an install manifest from a package manifest and caller-supplied values. */
export function createInstallManifest(input: {
  packageManifest: PackageManifest;
  root: string;
  installedAt: string;
}): InstallManifest {
  return {
    schemaVersion: INSTALL_SCHEMA_VERSION,
    version: input.packageManifest.version,
    installedAt: input.installedAt,
    root: input.root,
  };
}

/** Build a successful install report for a manifest. */
export function createInstallReport(manifest: InstallManifest): InstallReport {
  return { ok: true, manifest };
}

/** Build a rollback manifest, cloning the supplied paths. */
export function createRollbackManifest(input: {
  id: string;
  paths: string[];
  createdAt: string;
}): RollbackManifest {
  return {
    id: input.id,
    paths: [...input.paths],
    createdAt: input.createdAt,
  };
}

/** Build a successful rollback report for a rollback manifest. */
export function createRollbackReport(rollback: RollbackManifest): RollbackReport {
  return {
    ok: true,
    rollbackId: rollback.id,
    restoredPaths: [...rollback.paths],
  };
}

/** Build a successful update apply report; steps are described as `<kind>:<path>`. */
export function createUpdateApplyReport(plan: UpdatePlan): UpdateApplyReport {
  return {
    ok: true,
    planId: plan.id,
    appliedSteps: plan.steps.map((step) => `${step.kind}:${step.path}`),
  };
}
