// Tests for the dry-run installer preview. Only test code prepares and
// removes temporary directories; the preview itself must never write.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatInstallerPreview, runInstallerPreview } from "../src/index.js";
import type { InstallerPreviewResult } from "../src/index.js";

function withTempRoot<T>(run: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-install-preview-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const failureResult: InstallerPreviewResult = {
  ok: false,
  root: "",
  operations: [],
  packageName: "oh-my-pm-local",
  packageVersion: "2.0.0-alpha.0",
  warnings: ["invalid install input: missing_root"],
};

describe("runInstallerPreview", () => {
  it("assembles from the root and plans operations without writing anything", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      writeFileSync(join(root, "README.md"), "old readme", "utf8");
      const before = readdirSync(root).sort();

      const result = runInstallerPreview(root);
      expect(result.ok).toBe(true);
      expect(result.packageName).toBe("oh-my-pm-local");
      expect(result.packageVersion).toBe("2.0.0-alpha.0");
      expect(result.operations.map((operation) => operation.kind)).toEqual([
        "replace",
        "replace",
      ]);
      // The preview compares the root against itself, so the update and
      // rollback layers report no changes; those are review reasons, not
      // blocking ones, and surface as decision warnings.
      expect(result.warnings).toEqual([
        "OMP-I-6001: update_impact_no_changes",
        "OMP-I-6001: rollback_impact_no_changes",
        "OMP-I-6001: write_capability_preview_only",
        "OMP-I-6001: write_capability_decision_not_ready",
        "OMP-I-6001: write_capability_approval_required",
        "OMP-I-6001: write_execution_capability_not_allowed",
        "OMP-I-6001: write_confirmation_decision_not_ready",
        "OMP-I-6001: write_confirmation_capability_not_allowed",
        "OMP-I-6001: write_confirmation_execution_plan_not_ready",
        "OMP-I-6001: write_adapter_confirmation_not_ready",
        "OMP-I-6001: write_adapter_execution_plan_not_ready",
        "OMP-I-6001: controlled_write_capability_not_allowed",
        "OMP-I-6001: controlled_write_execution_plan_not_ready",
        "OMP-I-6001: controlled_write_confirmation_not_ready",
        "OMP-I-6001: controlled_write_adapter_contract_not_ready",
      ]);
      expect(result.archive).toEqual({
        format: "zip",
        archiveName: "oh-my-pm-local-2.0.0-alpha.0.zip",
        entries: 2,
        checksum: expect.stringMatching(/^archive:zip:oh-my-pm-local:2\.0\.0-alpha\.0:/),
      });
      expect(result.releaseMetadata).toEqual({
        schemaVersion: "1",
        signed: true,
        signatureAlgorithm: "deterministic-placeholder",
        keyId: "preview-key",
      });
      expect(result.integrity).toEqual({ ok: true, reasons: [] });
      expect(result.channel).toEqual({
        name: "dev",
        latestVersion: "2.0.0-alpha.0",
        entries: 1,
        ok: true,
      });
      expect(result.updatePolicy).toEqual({
        ok: true,
        decision: "allowed",
        currentVersion: "1.0.0",
        candidateVersion: "2.0.0-alpha.0",
        reasons: [],
      });
      expect(result.impact?.ok).toBe(true);
      expect(result.impact?.operations).toBe(2);
      expect(result.impact?.unchanged).toBe(2);
      expect(
        (result.impact?.creates ?? 0) +
          (result.impact?.replaces ?? 0) +
          (result.impact?.removes ?? 0) +
          (result.impact?.unchanged ?? 0),
      ).toBe(result.impact?.operations);
      expect(result.rollbackImpact?.ok).toBe(true);
      expect(result.rollbackImpact?.rollbackId).toBe("preview-rollback");
      expect(
        (result.rollbackImpact?.restores ?? 0) +
          (result.rollbackImpact?.removes ?? 0) +
          (result.rollbackImpact?.missing ?? 0) +
          (result.rollbackImpact?.unchanged ?? 0),
      ).toBe(result.rollbackImpact?.operations);

      expect(result.decision?.decision).toBe("review-required");
      expect(result.decision?.blockingReasons).toEqual([]);
      expect(result.decision?.reviewReasons).toContain("update_impact_no_changes");
      expect(result.audit?.ok).toBe(true);
      expect(result.audit?.events).toBeGreaterThan(0);
      expect(result.audit?.errors).toBe(0);

      expect(readdirSync(root).sort()).toEqual(before);
      expect(readFileSync(join(root, "bin", "oh-my-pm"), "utf8")).toBe("old binary");
      expect(readdirSync(root).some((name) => name.endsWith(".zip"))).toBe(false);
    });
  });

  it("warns about missing include files but still previews found files", () => {
    withTempRoot((root) => {
      writeFileSync(join(root, "README.md"), "old readme", "utf8");
      const result = runInstallerPreview(root);
      expect(result.ok).toBe(true);
      // The install plan still previews the found file, but the assembly layer
      // fails (a package file is missing), so the aggregated decision blocks.
      expect(result.warnings).toEqual([
        "OMP-I-6001: assembly_include_file_missing",
        "OMP-I-6001: update_impact_no_changes",
        "OMP-I-6001: rollback_impact_no_changes",
        "OMP-I-6001: write_capability_preview_only",
        "OMP-I-6001: write_capability_decision_not_ready",
        "OMP-I-6001: write_capability_approval_required",
        "OMP-I-6001: write_execution_capability_not_allowed",
        "OMP-I-6001: write_confirmation_decision_not_ready",
        "OMP-I-6001: write_confirmation_capability_not_allowed",
        "OMP-I-6001: write_confirmation_execution_plan_not_ready",
        "OMP-I-6001: write_adapter_confirmation_not_ready",
        "OMP-I-6001: write_adapter_execution_plan_not_ready",
        "OMP-I-6001: controlled_write_capability_not_allowed",
        "OMP-I-6001: controlled_write_execution_plan_not_ready",
        "OMP-I-6001: controlled_write_confirmation_not_ready",
        "OMP-I-6001: controlled_write_adapter_contract_not_ready",
      ]);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].path.endsWith("README.md")).toBe(true);
      expect(result.decision?.decision).toBe("blocked");
      expect(result.decision?.blockingReasons).toContain("assembly_include_file_missing");
    });
  });

  it("carries manifest-derived per-file checksums into json output", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      writeFileSync(join(root, "README.md"), "old readme", "utf8");
      const output = formatInstallerPreview(runInstallerPreview(root), "json");
      const parsed = JSON.parse(output);
      expect(parsed.operations).toHaveLength(2);
      for (const operation of parsed.operations as { checksum?: string }[]) {
        expect(operation.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
      expect(parsed.archive.archiveName).toBe("oh-my-pm-local-2.0.0-alpha.0.zip");
      expect(parsed.archive.entries).toBe(2);
      expect(parsed.releaseMetadata.signed).toBe(true);
      expect(parsed.releaseMetadata.signatureAlgorithm).toBe("deterministic-placeholder");
      expect(parsed.integrity.ok).toBe(true);
      expect(parsed.integrity.reasons).toEqual([]);
      expect(parsed.channel.name).toBe("dev");
      expect(parsed.channel.latestVersion).toBe("2.0.0-alpha.0");
      expect(parsed.updatePolicy.decision).toBe("allowed");
      expect(parsed.updatePolicy.currentVersion).toBe("1.0.0");
      expect(parsed.updatePolicy.candidateVersion).toBe("2.0.0-alpha.0");
      expect(parsed.impact.ok).toBe(true);
      expect(parsed.impact.operations).toBe(
        parsed.impact.creates +
          parsed.impact.replaces +
          parsed.impact.removes +
          parsed.impact.unchanged,
      );
      expect(parsed.decision.decision).toBe("review-required");
      expect(parsed.decision.ok).toBe(false);
      expect(parsed.decision).not.toHaveProperty("markdown");
      expect(parsed.audit.ok).toBe(true);
      expect(parsed.audit.events).toBeGreaterThan(0);
      expect(parsed.audit.errors).toBe(0);
      expect(parsed.audit).not.toHaveProperty("markdown");
      expect(parsed.auditExport.ok).toBe(true);
      expect(parsed.auditExport.format).toBe("jsonl");
      expect(parsed.auditExport.events).toBe(parsed.audit.events);
      expect(parsed.auditExport.sizeBytes).toBeGreaterThan(0);
      expect(parsed.auditExport.fingerprint).toBe(
        `audit-export:jsonl:${parsed.auditExport.events}:${parsed.auditExport.sizeBytes}`,
      );
      // Only a summary is present: the raw export content never reaches JSON.
      expect(parsed.auditExport).not.toHaveProperty("content");
      for (const key of Object.keys(parsed.auditExport)) {
        expect(key).not.toMatch(/path|file|dest|url|remote|telemetry|sink|content/i);
      }
      // Guarded write capability: default policy is preview-only and blocked.
      expect(parsed.writeCapability.mode).toBe("preview-only");
      expect(parsed.writeCapability.allowed).toBe(false);
      expect(parsed.writeCapability.ok).toBe(false);
      expect(parsed.writeCapability.intent).toBe("install");
      expect(parsed.writeCapability.reasons).toContain("write_capability_preview_only");
      // No write adapter, execution, or remote field on the summary.
      for (const key of Object.keys(parsed.writeCapability)) {
        expect(key).not.toMatch(/adapter|writer|exec|command|url|remote|path/i);
      }
      // Deterministic, non-secret approval token summary.
      expect(parsed.approval.ok).toBe(true);
      expect(parsed.approval.intent).toBe("install");
      expect(typeof parsed.approval.decision).toBe("string");
      expect(parsed.approval.tokenValue.startsWith("approve:install:")).toBe(true);
      // Token carries no secret/key/signature/timestamp field, and the token
      // does not unblock the preview-only default write capability.
      for (const key of Object.keys(parsed.approval)) {
        expect(key).not.toMatch(/secret|key|signature|timestamp|expiry|user|machine/i);
      }
      expect(parsed.writeCapability.allowed).toBe(false);
      // Planned write step summary; the default capability is blocked, so the
      // plan is blocked, and the raw step list never reaches JSON.
      expect(parsed.writeExecutionPlan.intent).toBe("install");
      expect(typeof parsed.writeExecutionPlan.steps).toBe("number");
      expect(parsed.writeExecutionPlan.ok).toBe(false);
      expect(parsed.writeExecutionPlan.reasons).toContain(
        "write_execution_capability_not_allowed",
      );
      expect(parsed.writeExecutionPlan).not.toHaveProperty("plan");
      for (const key of Object.keys(parsed.writeExecutionPlan)) {
        expect(key).not.toMatch(/content|command|dest|adapter|writer|result|remote|url/i);
      }
      // Pre-write confirmation summary; the default preview path is not fully
      // ready, so it reports failed checks with reasons and no raw items.
      expect(parsed.writeConfirmation.intent).toBe("install");
      expect(typeof parsed.writeConfirmation.passed).toBe("number");
      expect(typeof parsed.writeConfirmation.failed).toBe("number");
      expect(parsed.writeConfirmation.ok).toBe(false);
      expect(parsed.writeConfirmation.reasons.length).toBeGreaterThan(0);
      expect(parsed.writeConfirmation).not.toHaveProperty("checklist");
      expect(parsed.writeConfirmation).not.toHaveProperty("items");
      for (const key of Object.keys(parsed.writeConfirmation)) {
        expect(key).not.toMatch(/content|command|dest|writer|result|remote|url/i);
      }
      // Declared write adapter contract verdict; metadata only, no adapter
      // object or method reaches JSON.
      expect(parsed.writeAdapterContract.name).toBe("preview-write-adapter");
      expect(Array.isArray(parsed.writeAdapterContract.requiredCapabilities)).toBe(true);
      expect(parsed.writeAdapterContract.declaredCapabilities).toEqual([
        "write-file",
        "remove-file",
        "backup-file",
      ]);
      expect(parsed.writeAdapterContract).not.toHaveProperty("report");
      for (const key of Object.keys(parsed.writeAdapterContract)) {
        expect(key).not.toMatch(/object|fn|func|method|content|command|dest|result|remote|url/i);
      }
      // Aggregated controlled write readiness summary; the raw envelope and
      // pass-through layers never reach JSON.
      expect(parsed.controlledWriteDryRun.intent).toBe("install");
      expect(typeof parsed.controlledWriteDryRun.plannedSteps).toBe("number");
      expect(parsed.controlledWriteDryRun.ok).toBe(false);
      expect(parsed.controlledWriteDryRun.reasons.length).toBeGreaterThan(0);
      expect(parsed.controlledWriteDryRun).not.toHaveProperty("envelope");
      expect(parsed.controlledWriteDryRun).not.toHaveProperty("capability");
      expect(parsed.controlledWriteDryRun).not.toHaveProperty("adapterContract");
      for (const key of Object.keys(parsed.controlledWriteDryRun)) {
        expect(key).not.toMatch(/object|fn|func|method|content|command|dest|result|remote|url/i);
      }
      // Aggregated release-readiness summary; raw sections and markdown never
      // reach JSON.
      expect(typeof parsed.releaseReadiness.status).toBe("string");
      expect(typeof parsed.releaseReadiness.plannedWriteSteps).toBe("number");
      expect(parsed.releaseReadiness).not.toHaveProperty("sections");
      expect(parsed.releaseReadiness).not.toHaveProperty("markdown");
      expect(parsed.releaseReadiness).not.toHaveProperty("report");
      for (const key of Object.keys(parsed.releaseReadiness)) {
        expect(key).not.toMatch(/artifact|asset|content|command|dest|adapter|object|result|remote|url/i);
      }
      expect(output).not.toContain("backupFile");
      expect(output).not.toContain("removeFile");
      expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(output).not.toContain("writeFile");
      expect(output).not.toContain("placeholder:preview-key:");
      expect(output).not.toMatch(/https?:\/\//);
      expect(output).not.toContain("download");
      expect(output).not.toContain("upload");
      expect(output).not.toContain("publish");
      expect(output).not.toContain("telemetry");
      expect(output).not.toContain("executeInstall");
      expect(output).not.toContain("executeRollback");
    });
  });

  it("includes the decision report in markdown output without executing anything", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      writeFileSync(join(root, "README.md"), "old readme", "utf8");
      const before = readdirSync(root).sort();

      const output = formatInstallerPreview(runInstallerPreview(root), "markdown");
      expect(output).toContain("# OH MY PM Installer Decision Report");
      expect(output).toContain("Decision: `review-required`");
      expect(output).toContain("# OH MY PM Installer Audit Events");
      expect(output).toContain("`preview_started`");
      expect(output).not.toMatch(/https?:\/\//);
      expect(output).not.toContain("placeholder:preview-key:");
      expect(output).not.toContain("executeInstall");
      expect(output).not.toContain("telemetry");

      expect(readdirSync(root).sort()).toEqual(before);
      expect(readdirSync(root).some((name) => name.endsWith(".zip"))).toBe(false);
    });
  });

  it("fails without mutating anything for an empty root", () => {
    const result = runInstallerPreview("");
    expect(result.ok).toBe(false);
    expect(result.operations).toEqual([]);
    expect(result.warnings).toEqual([
      "OMP-I-6001: archive_files_must_not_be_empty",
      "OMP-I-6001: missing_root",
      "OMP-I-6001: release_archive_entries_must_not_be_empty",
      "OMP-I-6001: release_channel_entry_metadata_invalid",
      "OMP-I-6001: release_channel_entry_integrity_failed",
      "OMP-I-6001: candidate_integrity_failed",
      "OMP-I-6001: update_impact_root_missing",
      "OMP-I-6001: update_policy_not_allowed",
      "OMP-I-6001: update_impact_candidate_entries_empty",
      "OMP-I-6001: rollback_impact_root_missing",
      "OMP-I-6001: rollback_impact_backup_files_empty",
      "OMP-I-6001: install_operations_empty",
      "OMP-I-6001: update_impact_no_changes",
      "OMP-I-6001: audit_event_root_missing",
      "OMP-I-6001: write_capability_preview_only",
      "OMP-I-6001: write_capability_decision_not_ready",
      "OMP-I-6001: write_capability_approval_required",
      "OMP-I-6001: write_approval_token_root_missing",
      "OMP-I-6001: write_execution_capability_not_allowed",
      "OMP-I-6001: write_execution_steps_empty",
      "OMP-I-6001: write_confirmation_decision_not_ready",
      "OMP-I-6001: write_confirmation_capability_not_allowed",
      "OMP-I-6001: write_confirmation_execution_plan_not_ready",
      "OMP-I-6001: write_confirmation_steps_empty",
      "OMP-I-6001: write_adapter_confirmation_not_ready",
      "OMP-I-6001: write_adapter_execution_plan_not_ready",
      "OMP-I-6001: write_adapter_required_capabilities_empty",
      "OMP-I-6001: controlled_write_capability_not_allowed",
      "OMP-I-6001: controlled_write_approval_invalid",
      "OMP-I-6001: controlled_write_execution_plan_not_ready",
      "OMP-I-6001: controlled_write_confirmation_not_ready",
      "OMP-I-6001: controlled_write_adapter_contract_not_ready",
      "invalid package manifest: package_files_must_not_be_empty",
    ]);
    expect(result.archive?.entries).toBe(0);
    expect(result.releaseMetadata?.signed).toBe(true);
    expect(result.integrity?.ok).toBe(false);
    expect(result.integrity?.reasons).toContain("release_archive_entries_must_not_be_empty");
    expect(result.channel?.ok).toBe(false);
    expect(result.updatePolicy?.ok).toBe(false);
    expect(result.updatePolicy?.decision).toBe("blocked");
    expect(result.updatePolicy?.reasons).toContain("candidate_integrity_failed");
    expect(result.impact?.ok).toBe(false);
    expect(result.impact?.operations).toBe(0);
    expect(result.rollbackImpact?.ok).toBe(false);
    expect(result.rollbackImpact?.rollbackId).toBe("preview-rollback");
    expect(result.decision?.decision).toBe("blocked");
    expect(result.decision?.blockingReasons).toContain("install_operations_empty");
    expect(result.audit?.ok).toBe(false);
    expect(result.audit?.events).toBeGreaterThan(0);
    expect(result.audit?.errors).toBeGreaterThan(0);
  });
});

describe("formatInstallerPreview", () => {
  const successResult: InstallerPreviewResult = {
    ok: true,
    root: "/tmp/oh-my-pm",
    operations: [
      { kind: "replace", path: "/tmp/oh-my-pm/bin/oh-my-pm", checksum: "sha256:example" },
      { kind: "create", path: "/tmp/oh-my-pm/README.md", checksum: "sha256:example" },
    ],
    packageName: "oh-my-pm-local",
    packageVersion: "2.0.0-alpha.0",
    warnings: [],
  };

  it("formats a brief success report", () => {
    expect(formatInstallerPreview(successResult, "brief")).toBe(
      [
        "OH MY PM install-preview: ok",
        "package: oh-my-pm-local@2.0.0-alpha.0",
        "root: /tmp/oh-my-pm",
        "operations: 2",
        "- replace /tmp/oh-my-pm/bin/oh-my-pm",
        "- create /tmp/oh-my-pm/README.md",
        "",
      ].join("\n"),
    );
  });

  it("formats a markdown success report", () => {
    expect(formatInstallerPreview(successResult, "markdown")).toBe(
      [
        "# OH MY PM Install Preview",
        "",
        "Package: `oh-my-pm-local@2.0.0-alpha.0`",
        "Root: `/tmp/oh-my-pm`",
        "",
        "## Operations",
        "",
        "- `replace` `/tmp/oh-my-pm/bin/oh-my-pm`",
        "- `create` `/tmp/oh-my-pm/README.md`",
        "",
      ].join("\n"),
    );
  });

  it("formats a json report that round-trips", () => {
    const output = formatInstallerPreview(successResult, "json");
    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output)).toEqual(successResult);
  });

  it("formats a brief failure report", () => {
    expect(formatInstallerPreview(failureResult, "brief")).toBe(
      [
        "OH MY PM install-preview: failed",
        "package: oh-my-pm-local@2.0.0-alpha.0",
        "root: ",
        "warning: invalid install input: missing_root",
        "",
      ].join("\n"),
    );
  });

  it("adds an archive-plan line to brief output when planned", () => {
    const withArchive = {
      ...successResult,
      archive: {
        format: "zip",
        archiveName: "oh-my-pm-local-2.0.0-alpha.0.zip",
        entries: 2,
        checksum: "archive:zip:oh-my-pm-local:2.0.0-alpha.0:x",
      },
    };
    expect(formatInstallerPreview(withArchive, "brief")).toContain(
      "archive-plan: oh-my-pm-local-2.0.0-alpha.0.zip\n",
    );
    expect(formatInstallerPreview(withArchive, "markdown")).toContain(
      "## Archive Plan\n\nPlanned archive: `oh-my-pm-local-2.0.0-alpha.0.zip`\n",
    );
  });

  it("formats a markdown failure report", () => {
    expect(formatInstallerPreview(failureResult, "markdown")).toBe(
      [
        "# OH MY PM Install Preview",
        "",
        "Status: failed",
        "",
        "Package: `oh-my-pm-local@2.0.0-alpha.0`",
        "Root: ``",
        "",
        "## Warnings",
        "",
        "- invalid install input: missing_root",
        "",
      ].join("\n"),
    );
  });
});
