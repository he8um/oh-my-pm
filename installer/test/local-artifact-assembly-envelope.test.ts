import { describe, expect, it } from "vitest";
import {
  collectGuardedLocalArtifactAssemblyDryRunReasons,
  createGuardedLocalArtifactAssemblyDryRun,
  createGuardedLocalArtifactAssemblyDryRunEnvelope,
  exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput,
  formatGuardedLocalArtifactAssemblyDryRunMarkdown,
  summarizeGuardedLocalArtifactAssemblyDryRunEnvelope,
} from "../src/index.js";
import type { GuardedLocalArtifactAssemblyDryRunEnvelopeInput } from "../src/index.js";

function input(
  overrides: Partial<GuardedLocalArtifactAssemblyDryRunEnvelopeInput> = {},
): GuardedLocalArtifactAssemblyDryRunEnvelopeInput {
  return { ...exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput(), ...overrides };
}

describe("collectGuardedLocalArtifactAssemblyDryRunReasons", () => {
  it("returns no reasons for the ready fixture", () => {
    expect(collectGuardedLocalArtifactAssemblyDryRunReasons(input())).toEqual([]);
  });

  it("flags a missing version", () => {
    expect(collectGuardedLocalArtifactAssemblyDryRunReasons(input({ version: "  " }))).toContain(
      "guarded_local_artifact_assembly_version_missing",
    );
  });

  it("flags a not-ready artifact plan", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      ...base,
      artifactPlan: { ...base.artifactPlan, ok: false },
    });
    expect(reasons).toContain("guarded_local_artifact_assembly_plan_not_ready");
  });

  it("flags a not-ready package assembly", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      ...base,
      assembly: { ...base.assembly, ok: false },
    });
    expect(reasons).toContain("guarded_local_artifact_assembly_package_not_ready");
  });

  it("flags a not-ready archive", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      ...base,
      archive: { ...base.archive, ok: false },
    });
    expect(reasons).toContain("guarded_local_artifact_assembly_archive_not_ready");
  });

  it("flags not-ready metadata", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      ...base,
      metadata: { ...base.metadata, ok: false },
    });
    expect(reasons).toContain("guarded_local_artifact_assembly_metadata_not_ready");
  });

  it("flags not-ready integrity", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      ...base,
      integrity: { ...base.integrity, ok: false },
    });
    expect(reasons).toContain("guarded_local_artifact_assembly_integrity_not_ready");
  });

  it("flags a not-ready channel", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      ...base,
      channel: { ...base.channel, ok: false },
    });
    expect(reasons).toContain("guarded_local_artifact_assembly_channel_not_ready");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      version: "",
      artifactPlan: { ...base.artifactPlan, ok: false },
      assembly: { ...base.assembly, ok: false },
      archive: { ...base.archive, ok: false },
      metadata: { ...base.metadata, ok: false },
      integrity: { ...base.integrity, ok: false },
      channel: { ...base.channel, ok: false },
    });
    expect(reasons).toEqual([
      "guarded_local_artifact_assembly_version_missing",
      "guarded_local_artifact_assembly_plan_not_ready",
      "guarded_local_artifact_assembly_package_not_ready",
      "guarded_local_artifact_assembly_archive_not_ready",
      "guarded_local_artifact_assembly_metadata_not_ready",
      "guarded_local_artifact_assembly_integrity_not_ready",
      "guarded_local_artifact_assembly_channel_not_ready",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("does not copy raw source report reasons", () => {
    const base = input();
    const reasons = collectGuardedLocalArtifactAssemblyDryRunReasons({
      ...base,
      archive: {
        ...base.archive,
        ok: false,
        warnings: [{ code: "OMP-I-6001", message: "archive_files_must_not_be_empty" }],
      },
    });
    expect(reasons).toContain("guarded_local_artifact_assembly_archive_not_ready");
    expect(reasons).not.toContain("archive_files_must_not_be_empty");
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    collectGuardedLocalArtifactAssemblyDryRunReasons(base);
    expect(base).toEqual(snapshot);
  });
});

describe("summarizeGuardedLocalArtifactAssemblyDryRunEnvelope", () => {
  it("mirrors each layer's readiness and always disallows creation", () => {
    const summary = summarizeGuardedLocalArtifactAssemblyDryRunEnvelope(input());
    expect(summary).toMatchObject({
      version: "v0.1.0",
      artifactPlanReady: true,
      packageAssemblyReady: true,
      archivePlanReady: true,
      metadataReady: true,
      integrityReady: true,
      channelReady: true,
      creationAllowed: false,
    });
    expect(summary.reasons).toEqual([]);
  });

  it("reflects a blocked layer in the matching readiness flag", () => {
    const base = input();
    const summary = summarizeGuardedLocalArtifactAssemblyDryRunEnvelope({
      ...base,
      metadata: { ...base.metadata, ok: false },
    });
    expect(summary.metadataReady).toBe(false);
    expect(summary.creationAllowed).toBe(false);
  });
});

describe("createGuardedLocalArtifactAssemblyDryRunEnvelope", () => {
  it("is ok when all gates pass and creation stays disallowed", () => {
    const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope(input());
    expect(envelope.ok).toBe(true);
    expect(envelope.summary.reasons).toEqual([]);
    expect(envelope.summary.creationAllowed).toBe(false);
  });

  it("is blocked when any gate fails", () => {
    const base = input();
    const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope({
      ...base,
      integrity: { ...base.integrity, ok: false },
    });
    expect(envelope.ok).toBe(false);
    expect(envelope.summary.reasons).toContain(
      "guarded_local_artifact_assembly_integrity_not_ready",
    );
  });

  it("passes through the artifact plan and each report", () => {
    const base = input();
    const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope(base);
    expect(envelope.artifactPlan).toBe(base.artifactPlan.plan);
    expect(envelope.assembly).toBe(base.assembly);
    expect(envelope.archive).toBe(base.archive);
    expect(envelope.metadata).toBe(base.metadata);
    expect(envelope.integrity).toBe(base.integrity);
    expect(envelope.channel).toBe(base.channel);
  });

  it("carries no file content, output path, destination, command, publish, adapter, URL, bytes, or result fields", () => {
    const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope(input());
    for (const key of [...Object.keys(envelope), ...Object.keys(envelope.summary)]) {
      expect(key).not.toMatch(
        /content|path|dest|command|publish|adapter|object|url|bytes|result|remote|download|upload/i,
      );
    }
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe("createGuardedLocalArtifactAssemblyDryRun", () => {
  it("omits warnings for a ready envelope", () => {
    const dryRun = createGuardedLocalArtifactAssemblyDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked envelope", () => {
    const base = input();
    const dryRun = createGuardedLocalArtifactAssemblyDryRun({
      ...base,
      channel: { ...base.channel, ok: false },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "guarded_local_artifact_assembly_channel_not_ready"),
    ).toBe(true);
  });
});

describe("formatGuardedLocalArtifactAssemblyDryRunMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope(input());
    const markdown = formatGuardedLocalArtifactAssemblyDryRunMarkdown(envelope);
    expect(markdown).toBe(formatGuardedLocalArtifactAssemblyDryRunMarkdown(envelope));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("renders version, ready status, creation-allowed false, and `- none` reasons", () => {
    const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope(input());
    const markdown = formatGuardedLocalArtifactAssemblyDryRunMarkdown(envelope);
    expect(markdown).toContain("# OH MY PM Guarded Local Artifact Assembly Dry-Run");
    expect(markdown).toContain("Version: `v0.1.0`");
    expect(markdown).toContain("Status: `ready`");
    expect(markdown).toContain("Creation allowed: `false`");
    expect(markdown).toContain("- Artifact plan ready: true");
    expect(markdown).toContain("- none");
    expect(markdown).not.toMatch(/https?:\/\//);
  });

  it("renders a blocked status and reason lines when blocked", () => {
    const base = input();
    const envelope = createGuardedLocalArtifactAssemblyDryRunEnvelope({
      ...base,
      channel: { ...base.channel, ok: false },
    });
    const markdown = formatGuardedLocalArtifactAssemblyDryRunMarkdown(envelope);
    expect(markdown).toContain("Status: `blocked`");
    expect(markdown).toContain("- Channel ready: false");
    expect(markdown).toContain("- `guarded_local_artifact_assembly_channel_not_ready`");
  });
});

describe("exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput", () => {
  it("is deterministic", () => {
    expect(exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput()).toEqual(
      exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput(),
    );
  });

  it("produces a ready dry run from the ready fixture chain", () => {
    const dryRun = createGuardedLocalArtifactAssemblyDryRun(
      exampleGuardedLocalArtifactAssemblyDryRunEnvelopeInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.envelope.summary.creationAllowed).toBe(false);
  });
});
