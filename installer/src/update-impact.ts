// Update impact preview: compare currently installed files with candidate
// release entries and classify what an eligible update would change. This is
// a local, read-free comparison of provided data — nothing here retrieves
// packages remotely, executes installation, calls write adapters, or writes
// files.

import type {
  UpdateImpactDryRunReport,
  UpdateImpactOperation,
  UpdateImpactPreviewInput,
  UpdateImpactPreviewReport,
  UpdateImpactSummary,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { joinInstallerPath, normalizeInstallerPath } from "./paths.js";
import { isNonEmptyString } from "./validate.js";

/** Resolve a current-file or candidate path to a normalized full path. */
export function normalizeImpactPath(root: string, path: string): string {
  const normalizedRoot = normalizeInstallerPath(root);
  const normalized = normalizeInstallerPath(path);
  if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized;
  }
  return joinInstallerPath(root, path);
}

function pushOnce(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

/**
 * Classify each path as create/replace/remove/unchanged by comparing the
 * candidate entries against the current files. Output is sorted by path and
 * no input array is mutated.
 */
export function createUpdateImpactOperations(
  input: UpdateImpactPreviewInput,
): UpdateImpactOperation[] {
  const current = new Map(
    input.currentFiles.map((file) => [
      normalizeImpactPath(input.root, file.path),
      { checksum: file.checksum, sizeBytes: new TextEncoder().encode(file.content).length },
    ]),
  );
  const candidate = new Map(
    input.candidateEntries.map((entry) => [
      normalizeImpactPath(input.root, entry.path),
      { checksum: entry.checksum, sizeBytes: entry.sizeBytes },
    ]),
  );

  const operations: UpdateImpactOperation[] = [];
  const paths = new Set([...current.keys(), ...candidate.keys()]);
  for (const path of paths) {
    const before = current.get(path);
    const after = candidate.get(path);

    let kind: UpdateImpactOperation["kind"];
    if (after !== undefined && before === undefined) {
      kind = "create";
    } else if (after === undefined && before !== undefined) {
      kind = "remove";
    } else if (
      after !== undefined &&
      before !== undefined &&
      after.checksum === before.checksum &&
      after.sizeBytes === before.sizeBytes
    ) {
      kind = "unchanged";
    } else {
      kind = "replace";
    }

    const operation: UpdateImpactOperation = { kind, path };
    if (before !== undefined) {
      operation.beforeChecksum = before.checksum;
      operation.beforeSizeBytes = before.sizeBytes;
    }
    if (after !== undefined) {
      operation.afterChecksum = after.checksum;
      operation.afterSizeBytes = after.sizeBytes;
    }
    operations.push(operation);
  }

  return operations.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Count operations by kind and total before/after sizes. */
export function summarizeUpdateImpact(
  operations: readonly UpdateImpactOperation[],
): UpdateImpactSummary {
  const summary: UpdateImpactSummary = {
    creates: 0,
    replaces: 0,
    removes: 0,
    unchanged: 0,
    beforeSizeBytes: 0,
    afterSizeBytes: 0,
  };
  for (const operation of operations) {
    if (operation.kind === "create") summary.creates += 1;
    else if (operation.kind === "replace") summary.replaces += 1;
    else if (operation.kind === "remove") summary.removes += 1;
    else summary.unchanged += 1;
    if (operation.beforeSizeBytes !== undefined) {
      summary.beforeSizeBytes += operation.beforeSizeBytes;
    }
    if (operation.afterSizeBytes !== undefined) {
      summary.afterSizeBytes += operation.afterSizeBytes;
    }
  }
  return summary;
}

/** Build a policy-aware impact preview; operations are always computed. */
export function createUpdateImpactPreview(
  input: UpdateImpactPreviewInput,
): UpdateImpactPreviewReport {
  const operations = createUpdateImpactOperations(input);
  const summary = summarizeUpdateImpact(operations);

  const reasons: string[] = [];
  if (!isNonEmptyString(input.root)) {
    pushOnce(reasons, "update_impact_root_missing");
  }
  const blocked = !input.policy.ok || input.policy.decision === "blocked";
  if (blocked) {
    pushOnce(reasons, "update_policy_not_allowed");
    for (const reason of input.policy.reasons) {
      pushOnce(reasons, reason);
    }
  }
  if (input.candidateEntries.length === 0) {
    pushOnce(reasons, "update_impact_candidate_entries_empty");
  }
  if (input.policy.decision === "already-current") {
    pushOnce(reasons, "candidate_already_installed");
  }

  // already-current is a benign state: the update is a no-op, not a failure.
  const ok = !blocked && !reasons.some((reason) => reason !== "candidate_already_installed");
  return {
    ok,
    root: input.root,
    operations,
    summary,
    policyDecision: input.policy.decision,
    reasons,
  };
}

/** Wrap the impact preview in a dry-run report with OMP-I-6001 warnings. */
export function createUpdateImpactDryRun(
  input: UpdateImpactPreviewInput,
): UpdateImpactDryRunReport {
  const preview = createUpdateImpactPreview(input);
  if (preview.ok) {
    return { ok: true, preview };
  }
  return {
    ok: false,
    preview,
    warnings: preview.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}
