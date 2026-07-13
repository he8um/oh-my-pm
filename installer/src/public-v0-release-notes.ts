// Public v0 release notes draft: render a deterministic, public-safe release
// notes draft from the local release-readiness and release-candidate checklist
// reports. This is documentation/data generation only — it never creates a
// GitHub release, tag, archive, or package output, never writes files, and
// never executes anything.

import type {
  PublicV0ReleaseNotesDraft,
  PublicV0ReleaseNotesDraftDryRunReport,
  PublicV0ReleaseNotesDraftInput,
  PublicV0ReleaseNotesDraftSection,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";

/** Collect the draft's blocking reasons in fixed order; each appears once. */
export function collectPublicV0ReleaseNotesDraftReasons(
  input: PublicV0ReleaseNotesDraftInput,
): string[] {
  const reasons: string[] = [];
  if (input.version.trim().length === 0) {
    reasons.push("public_v0_release_notes_version_missing");
  }
  if (!input.checklist.ok) {
    reasons.push("public_v0_release_notes_checklist_blocked");
  }
  if (input.releaseReadiness.status === "blocked") {
    reasons.push("public_v0_release_notes_readiness_blocked");
  }
  return reasons;
}

/** Build the public-safe draft sections in fixed order; inputs are not mutated. */
export function createPublicV0ReleaseNotesDraftSections(
  input: PublicV0ReleaseNotesDraftInput,
): PublicV0ReleaseNotesDraftSection[] {
  const reasons = collectPublicV0ReleaseNotesDraftReasons(input);
  const draftStatus = reasons.length === 0 ? "draft-ready" : "blocked";
  return [
    {
      id: "status",
      title: "Status",
      lines: [
        `Version: ${input.version}`,
        `Draft status: ${draftStatus}`,
        `Release readiness: ${input.releaseReadiness.status}`,
        `v0 checklist: ${input.checklist.ok ? "ready" : "blocked"}`,
      ],
    },
    {
      id: "included",
      title: "Included in this draft",
      lines: [
        "Repository scaffold and public package boundaries",
        "Shared contracts generation and validation",
        "Kernel foundation and WASM binding",
        "Runtime plan execution shell",
        "CLI status, doctor, plan review, and installer preview surfaces",
        "Provider, planner, and skills foundations",
        "Installer preview, decision, audit, readiness, and v0 candidate checks",
      ],
    },
    {
      id: "safety",
      title: "Safety model",
      lines: [
        "Preview-first installer design",
        "No production install command in this draft",
        "No release artifact creation in this draft",
        "No publishing workflow in this draft",
        "No telemetry, remote retrieval, or write adapter execution in this draft",
      ],
    },
    {
      id: "not-included",
      title: "Not included yet",
      lines: [
        "Release artifact creation",
        "Package publishing",
        "Production install command",
        "Production update command",
        "Production rollback command",
        "Signed public release artifacts",
      ],
    },
    {
      id: "validation",
      title: "Validation expected before release",
      lines: [
        "Contracts generation and validation",
        "Public surface scan",
        "Structure and boundary validation",
        "Package builds",
        "JavaScript tests",
        "Rust tests and clippy",
        "WASM kernel build",
        "CLI smoke checks",
      ],
    },
    {
      id: "next",
      title: "Next work",
      lines: [
        "Prepare guarded release artifact planning",
        "Keep production install disabled until write execution is explicitly promoted",
        "Keep publishing and tagging manual until the release workflow is intentionally introduced",
      ],
    },
  ];
}

/**
 * Build the draft. It is draft-ready only when there are no reasons; otherwise
 * blocked. Nothing is created or written.
 */
export function createPublicV0ReleaseNotesDraft(
  input: PublicV0ReleaseNotesDraftInput,
): PublicV0ReleaseNotesDraft {
  const reasons = collectPublicV0ReleaseNotesDraftReasons(input);
  const sections = createPublicV0ReleaseNotesDraftSections(input);
  const status = reasons.length === 0 ? "draft-ready" : "blocked";
  return {
    ok: status === "draft-ready",
    version: input.version,
    status,
    sections,
    reasons,
  };
}

/**
 * Build the draft and wrap it in a dry-run report. A draft-ready draft omits
 * warnings; a blocked one surfaces its reasons as OMP-I-6001 warnings. Nothing
 * is written.
 */
export function createPublicV0ReleaseNotesDraftDryRun(
  input: PublicV0ReleaseNotesDraftInput,
): PublicV0ReleaseNotesDraftDryRunReport {
  const draft = createPublicV0ReleaseNotesDraft(input);
  if (draft.ok) {
    return { ok: true, draft };
  }
  return {
    ok: false,
    draft,
    warnings: draft.reasons.map((reason) => installerWarning(OMP_I_INVALID_PACKAGE, reason)),
  };
}

/** Render the draft as deterministic markdown with one trailing newline. */
export function formatPublicV0ReleaseNotesDraftMarkdown(
  draft: PublicV0ReleaseNotesDraft,
): string {
  const lines = [
    `# OH MY PM ${draft.version} Release Notes Draft`,
    "",
    `Status: \`${draft.status}\``,
    "",
  ];
  for (const section of draft.sections) {
    lines.push(`## ${section.title}`, "");
    for (const line of section.lines) {
      lines.push(`- ${line}`);
    }
    lines.push("");
  }
  lines.push("## Reasons", "");
  if (draft.reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of draft.reasons) {
      lines.push(`- \`${reason}\``);
    }
  }
  return `${lines.join("\n")}\n`;
}
