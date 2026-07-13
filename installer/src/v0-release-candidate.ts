// v0 release candidate checklist: turn caller-supplied local validation,
// readiness, and public-hygiene signals into a deterministic checklist that
// decides whether the repository is ready to be considered for a future v0.x
// release candidate. This is a checklist layer only — it never inspects the
// repository, creates release outputs, calls a write adapter, writes files, or
// executes anything. Every signal is provided by the caller.

import type {
  V0ReleaseCandidateChecklist,
  V0ReleaseCandidateChecklistDryRunReport,
  V0ReleaseCandidateChecklistInput,
  V0ReleaseCandidateChecklistItem,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Build one checklist item, attaching a reason only when it failed. */
function checklistItem(
  id: V0ReleaseCandidateChecklistItem["id"],
  label: string,
  ok: boolean,
  reason: string,
): V0ReleaseCandidateChecklistItem {
  return {
    id,
    label,
    ok,
    ...(ok ? {} : { reason }),
  };
}

/**
 * Build the checklist items in fixed order. Each item's `reason` is present
 * only when the check failed. Inputs are never mutated and nothing is read.
 */
export function createV0ReleaseCandidateChecklistItems(
  input: V0ReleaseCandidateChecklistInput,
): V0ReleaseCandidateChecklistItem[] {
  const { releaseReadiness, validation, hygiene } = input;
  return [
    checklistItem(
      "contracts-valid",
      "Contracts are generated and valid",
      validation.contracts,
      "v0_rc_contracts_invalid",
    ),
    checklistItem(
      "public-surface-clean",
      "Public surface is clean",
      validation.publicSurface,
      "v0_rc_public_surface_dirty",
    ),
    checklistItem(
      "structure-valid",
      "Repository structure is valid",
      validation.structure,
      "v0_rc_structure_invalid",
    ),
    checklistItem(
      "boundaries-valid",
      "Repository boundaries are valid",
      validation.boundaries,
      "v0_rc_boundaries_invalid",
    ),
    checklistItem("builds-pass", "Package builds pass", validation.builds, "v0_rc_builds_failed"),
    checklistItem("tests-pass", "Test suites pass", validation.tests, "v0_rc_tests_failed"),
    checklistItem(
      "wasm-build-pass",
      "WASM kernel build passes",
      validation.wasmBuild,
      "v0_rc_wasm_build_failed",
    ),
    checklistItem(
      "cli-smoke-pass",
      "CLI smoke checks pass",
      validation.cliSmoke,
      "v0_rc_cli_smoke_failed",
    ),
    checklistItem(
      "installer-release-readiness-reviewed",
      "Installer release readiness has been reviewed",
      releaseReadiness.status !== "blocked",
      "v0_rc_release_readiness_blocked",
    ),
    checklistItem(
      "no-production-install-command",
      "No production install command is exposed",
      hygiene.noProductionInstallCommand,
      "v0_rc_production_install_command_present",
    ),
    checklistItem(
      "no-release-artifacts",
      "No release artifacts are committed",
      hygiene.noReleaseArtifacts,
      "v0_rc_release_artifacts_present",
    ),
    checklistItem(
      "no-publishing-metadata",
      "No publishing metadata is present",
      hygiene.noPublishingMetadata,
      "v0_rc_publishing_metadata_present",
    ),
    checklistItem(
      "no-private-docs",
      "No private docs are committed",
      hygiene.noPrivateDocs,
      "v0_rc_private_docs_present",
    ),
    checklistItem("docs-updated", "Public docs are updated", hygiene.docsUpdated, "v0_rc_docs_outdated"),
  ];
}

/**
 * Build the checklist. Reasons are the failed items' reasons in item order,
 * and the checklist is ok only when every item passes. Never mutates.
 */
export function createV0ReleaseCandidateChecklist(
  input: V0ReleaseCandidateChecklistInput,
): V0ReleaseCandidateChecklist {
  const items = createV0ReleaseCandidateChecklistItems(input);
  const reasons = items
    .filter((item) => !item.ok)
    .map((item) => item.reason)
    .filter((reason): reason is string => reason !== undefined);
  return {
    ok: reasons.length === 0,
    items,
    reasons,
  };
}

/**
 * Build the checklist and wrap it in a dry-run report. A passing checklist
 * omits warnings; a failing one surfaces its reasons as OMP-I-6001 warnings.
 * Nothing is written.
 */
export function createV0ReleaseCandidateChecklistDryRun(
  input: V0ReleaseCandidateChecklistInput,
): V0ReleaseCandidateChecklistDryRunReport {
  const checklist = createV0ReleaseCandidateChecklist(input);
  if (checklist.ok) {
    return { ok: true, checklist };
  }
  return {
    ok: false,
    checklist,
    warnings: checklist.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}

/** Render the checklist as deterministic markdown with one trailing newline. */
export function formatV0ReleaseCandidateChecklistMarkdown(
  checklist: V0ReleaseCandidateChecklist,
): string {
  const lines = [
    "# OH MY PM v0 Release Candidate Checklist",
    "",
    `Status: \`${checklist.ok ? "ready" : "blocked"}\``,
    "",
    "## Items",
    "",
  ];
  for (const item of checklist.items) {
    const box = item.ok ? "[x]" : "[ ]";
    const suffix = item.ok || item.reason === undefined ? "" : ` — reason: \`${item.reason}\``;
    lines.push(`- \`${box}\` \`${item.id}\` — ${item.label}${suffix}`);
  }
  lines.push("", "## Reasons", "");
  if (checklist.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of checklist.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
