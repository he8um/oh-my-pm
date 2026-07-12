import { describe, expect, it } from "vitest";
import * as examples from "../src/index.js";
import {
  runInstallerArchivePlanExample,
  runInstallerAuditEventExample,
  runInstallerAuditTrailExportExample,
  runInstallerDecisionReportExample,
  runInstallerReleaseChannelExample,
  runInstallerReleaseIntegrityExample,
  runInstallerUpdatePolicyExample,
  runInstallerSignedMetadataExample,
  runInstallerControlledExecutionExample,
  runInstallerDryRunExample,
  runInstallerPackageAssemblyDryRunExample,
  runInstallerRollbackExample,
  runInstallerRollbackImpactExample,
  runInstallerUpdateExample,
  runInstallerUpdateImpactExample,
  runInstallerWriteCapabilityExample,
} from "../src/index.js";

describe("runInstallerDryRunExample", () => {
  it("returns a passing dry-run with planned operations only", () => {
    const result = runInstallerDryRunExample();
    expect(result.dryRun.ok).toBe(true);
    expect(result.dryRun.plan.operations.length).toBeGreaterThan(0);
    expect(
      result.dryRun.plan.operations.some(
        (operation) => operation.kind === "replace" || operation.kind === "create",
      ),
    ).toBe(true);
    expect(Object.keys(result)).toEqual(["dryRun"]);
    expect(result.dryRun).not.toHaveProperty("manifest");
  });
});

describe("runInstallerControlledExecutionExample", () => {
  it("plans and executes through the in-memory writer", () => {
    const result = runInstallerControlledExecutionExample();
    expect(result.dryRun.ok).toBe(true);
    expect(result.execution.ok).toBe(true);
    expect(result.execution.operations.length).toBeGreaterThan(0);
    expect(result.snapshotVersion).toBe("2.0.0-alpha.0");
  });
});

describe("runInstallerRollbackExample", () => {
  it("plans a capture and executes rollback backups", () => {
    const result = runInstallerRollbackExample();
    expect(result.capturePlan.rollback.id).toBe("rollback-1");
    expect(result.capturePlan.operations.length).toBeGreaterThan(0);
    expect(result.execution.ok).toBe(true);
    expect(result.execution.operations.length).toBeGreaterThan(0);
    expect(result.execution.operations.every((operation) => operation.kind === "backup")).toBe(
      true,
    );
  });
});

describe("runInstallerUpdateExample", () => {
  it("installs and applies the example update plan", () => {
    const result = runInstallerUpdateExample();
    expect(result.ok).toBe(true);
    expect(result.planId).toBe("update-1");
    expect(result.appliedSteps).toContain("replace:bin/oh-my-pm");
    expect(result.snapshotVersion).toBe("2.0.0-alpha.1");
  });
});

describe("runInstallerPackageAssemblyDryRunExample", () => {
  it("assembles the example package without archive or output fields", () => {
    const result = runInstallerPackageAssemblyDryRunExample();
    expect(result.assembly.ok).toBe(true);
    expect(result.assembly.manifest.fileEntries?.length).toBeGreaterThan(0);
    expect(result.assembly.manifest.files).toEqual(["bin/oh-my-pm", "README.md"]);
    expect(Object.keys(result.assembly).sort()).toEqual(["manifest", "ok", "plan"]);
    for (const key of Object.keys(result.assembly.plan)) {
      expect(key).not.toMatch(/archive|output|target/i);
    }
  });
});

describe("runInstallerArchivePlanExample", () => {
  it("plans a zip archive without creating any file", () => {
    const result = runInstallerArchivePlanExample();
    expect(result.archive.ok).toBe(true);
    expect(result.archive.plan.archiveName.endsWith(".zip")).toBe(true);
    expect(result.archive.plan.entries.length).toBeGreaterThan(0);
    expect(Object.keys(result.archive).sort()).toEqual(["ok", "plan"]);
    for (const key of Object.keys(result.archive.plan)) {
      expect(key).not.toMatch(/output|target|directory|writtenTo/i);
    }
  });
});

describe("runInstallerSignedMetadataExample", () => {
  it("builds placeholder-signed metadata without key material", () => {
    const result = runInstallerSignedMetadataExample();
    expect(result.metadata.ok).toBe(true);
    expect(result.metadata.metadata.signature?.algorithm).toBe("deterministic-placeholder");
    expect(result.metadata.metadata.signature?.keyId).toBe("example-key");
    expect(result.metadata.signingPayload.startsWith("release:")).toBe(true);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("BEGIN");
    expect(serialized).not.toContain("PRIVATE KEY");
    expect(serialized).not.toContain("-----");
  });
});

describe("runInstallerReleaseIntegrityExample", () => {
  it("verifies placeholder metadata consistency without key material", () => {
    const result = runInstallerReleaseIntegrityExample();
    expect(result.integrity.ok).toBe(true);
    expect(result.integrity.verification.reasons).toEqual([]);
    expect(result.integrity.verification.metadataValidation.ok).toBe(true);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("BEGIN");
    expect(serialized).not.toContain("PRIVATE KEY");
    expect(serialized).not.toContain("-----");
  });
});

describe("runInstallerReleaseChannelExample", () => {
  it("groups the verified release into local dev channel metadata", () => {
    const result = runInstallerReleaseChannelExample();
    expect(result.channel.ok).toBe(true);
    expect(result.channel.channel.channel).toBe("dev");
    expect(result.channel.channel.latestVersion).toBe("2.0.0-alpha.0");
    expect(result.channel.channel.entries).toHaveLength(1);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/https?:\/\//);
    for (const key of Object.keys(result.channel.channel)) {
      expect(key).not.toMatch(/url|endpoint|remote|mirror/i);
    }
  });
});

describe("runInstallerUpdatePolicyExample", () => {
  it("allows the update from 1.0.0 to the channel candidate", () => {
    const result = runInstallerUpdatePolicyExample();
    expect(result.updatePolicy.ok).toBe(true);
    expect(result.updatePolicy.report.decision).toBe("allowed");
    expect(result.updatePolicy.report.currentVersion).toBe("1.0.0");
    expect(result.updatePolicy.report.candidateVersion).toBe("2.0.0-alpha.0");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/https?:\/\//);
    for (const key of Object.keys(result.updatePolicy.report)) {
      expect(key).not.toMatch(/url|endpoint|download|remote/i);
    }
  });
});

describe("runInstallerUpdateImpactExample", () => {
  it("previews impact operations without remote or execution fields", () => {
    const result = runInstallerUpdateImpactExample();
    expect(result.impact.ok).toBe(true);
    expect(result.impact.preview.operations.length).toBeGreaterThan(0);
    expect(result.impact.preview.summary.replaces).toBeGreaterThanOrEqual(1);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("writeFile");
  });
});

describe("runInstallerRollbackImpactExample", () => {
  it("previews rollback operations without remote or execution fields", () => {
    const result = runInstallerRollbackImpactExample();
    expect(result.rollbackImpact.ok).toBe(true);
    expect(result.rollbackImpact.preview.summary.restores).toBeGreaterThanOrEqual(1);
    expect(result.rollbackImpact.preview.summary.unchanged).toBeGreaterThanOrEqual(1);
    expect(result.rollbackImpact.preview.summary.removes).toBeGreaterThanOrEqual(1);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toContain("writeFile");
  });
});

describe("runInstallerDecisionReportExample", () => {
  it("returns an aggregated decision report and its markdown", () => {
    const result = runInstallerDecisionReportExample();
    expect(result.decision.report.decision).not.toBe("blocked");
    expect(result.decision.report.sections.length).toBe(8);
    expect(result.markdown).toContain("Installer Decision Report");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("placeholder:");
    expect(serialized).not.toContain("BEGIN");
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain("download");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toContain("writeFile");
  });
});

describe("runInstallerAuditEventExample", () => {
  it("returns a validated audit event sequence and its markdown", () => {
    const result = runInstallerAuditEventExample();
    expect(result.audit.ok).toBe(true);
    expect(result.audit.events.length).toBeGreaterThan(0);
    expect(result.audit.events[0].kind).toBe("preview_started");
    expect(result.markdown).toContain("Installer Audit Events");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("placeholder:");
    expect(serialized).not.toContain("BEGIN");
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain("telemetry");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toContain("writeFile");
    // No timestamp/user/machine/persisted-path fields on any event.
    for (const event of result.audit.events) {
      expect(event).not.toHaveProperty("timestamp");
      expect(event).not.toHaveProperty("user");
      expect(event).not.toHaveProperty("path");
    }
  });
});

describe("runInstallerAuditTrailExportExample", () => {
  it("renders the audit event sequence into an in-memory export payload", () => {
    const result = runInstallerAuditTrailExportExample();
    expect(result.auditExport.ok).toBe(true);
    expect(result.auditExport.plan.eventCount).toBeGreaterThan(0);
    expect(result.auditExport.plan.sizeBytes).toBeGreaterThan(0);
    expect(Object.keys(result)).toEqual(["auditExport"]);
    // No output path, destination, URL, or telemetry field on the plan.
    for (const key of Object.keys(result.auditExport.plan)) {
      expect(key).not.toMatch(/path|file|dest|url|remote|telemetry|sink/i);
    }

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("placeholder:");
    expect(serialized).not.toContain("BEGIN");
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain("telemetry");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toContain("writeFile");
  });
});

describe("runInstallerWriteCapabilityExample", () => {
  it("returns a blocked preview-only write capability report", () => {
    const result = runInstallerWriteCapabilityExample();
    expect(result.writeCapability.ok).toBe(false);
    expect(result.writeCapability.report.allowed).toBe(false);
    expect(result.writeCapability.report.mode).toBe("preview-only");
    expect(result.writeCapability.report.reasons).toContain("write_capability_preview_only");
    expect(Object.keys(result)).toEqual(["writeCapability"]);

    // No write adapter, command execution, or remote field anywhere.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("writer");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toContain("command");
    expect(serialized).not.toMatch(/https?:\/\//);
    for (const key of Object.keys(result.writeCapability.report)) {
      expect(key).not.toMatch(/adapter|writer|command|exec|url|remote|path/i);
    }
  });
});

describe("examples index", () => {
  it("exports the installer example functions", () => {
    expect(typeof examples.runInstallerWriteCapabilityExample).toBe("function");
    expect(typeof examples.runInstallerAuditTrailExportExample).toBe("function");
    expect(typeof examples.runInstallerAuditEventExample).toBe("function");
    expect(typeof examples.runInstallerDecisionReportExample).toBe("function");
    expect(typeof examples.runInstallerDryRunExample).toBe("function");
    expect(typeof examples.runInstallerControlledExecutionExample).toBe("function");
    expect(typeof examples.runInstallerRollbackExample).toBe("function");
    expect(typeof examples.runInstallerUpdateExample).toBe("function");
    expect(typeof examples.runInstallerPackageAssemblyDryRunExample).toBe("function");
    expect(typeof examples.runInstallerArchivePlanExample).toBe("function");
    expect(typeof examples.runInstallerSignedMetadataExample).toBe("function");
    expect(typeof examples.runInstallerReleaseIntegrityExample).toBe("function");
    expect(typeof examples.runInstallerReleaseChannelExample).toBe("function");
    expect(typeof examples.runInstallerUpdatePolicyExample).toBe("function");
    expect(typeof examples.runInstallerUpdateImpactExample).toBe("function");
    expect(typeof examples.runInstallerRollbackImpactExample).toBe("function");
  });
});
