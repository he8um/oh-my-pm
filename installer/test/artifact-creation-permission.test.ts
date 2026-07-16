import { describe, expect, it } from "vitest";
import {
  createGuardedArtifactCreationPermissionDryRun,
  DEFAULT_GUARDED_ARTIFACT_CREATION_PERMISSION_POLICY,
  evaluateGuardedArtifactCreationPermission,
  exampleGuardedArtifactCreationPermissionInput,
  formatGuardedArtifactCreationPermissionMarkdown,
  validateGuardedArtifactCreationPermissionMode,
  validateGuardedArtifactCreationPermissionPolicy,
} from "../src/index.js";
import type {
  GuardedArtifactCreationPermissionInput,
  GuardedArtifactCreationPermissionPolicy,
} from "../src/index.js";

function input(
  overrides: Partial<GuardedArtifactCreationPermissionInput> = {},
): GuardedArtifactCreationPermissionInput {
  return { ...exampleGuardedArtifactCreationPermissionInput(), ...overrides };
}

function policy(
  overrides: Partial<GuardedArtifactCreationPermissionPolicy> = {},
): GuardedArtifactCreationPermissionPolicy {
  return { ...exampleGuardedArtifactCreationPermissionInput().policy, ...overrides };
}

describe("validateGuardedArtifactCreationPermissionMode", () => {
  it("accepts every supported mode", () => {
    for (const mode of ["disabled", "dry-run-only", "explicit"]) {
      expect(validateGuardedArtifactCreationPermissionMode(mode)).toBe(true);
    }
  });

  it("rejects an unsupported mode", () => {
    for (const mode of ["", "enabled", "preview-only", "DRY-RUN-ONLY"]) {
      expect(validateGuardedArtifactCreationPermissionMode(mode)).toBe(false);
    }
  });
});

describe("DEFAULT_GUARDED_ARTIFACT_CREATION_PERMISSION_POLICY", () => {
  it("is dry-run-only and requires readiness and approval", () => {
    expect(DEFAULT_GUARDED_ARTIFACT_CREATION_PERMISSION_POLICY).toEqual({
      mode: "dry-run-only",
      requireReadyAssembly: true,
      requireExplicitApproval: true,
    });
  });

  it("is a valid policy", () => {
    expect(
      validateGuardedArtifactCreationPermissionPolicy(
        DEFAULT_GUARDED_ARTIFACT_CREATION_PERMISSION_POLICY,
      ),
    ).toEqual([]);
  });
});

describe("validateGuardedArtifactCreationPermissionPolicy", () => {
  it("returns no reasons for a valid policy", () => {
    expect(validateGuardedArtifactCreationPermissionPolicy(policy())).toEqual([]);
  });

  it("flags an invalid mode", () => {
    expect(
      validateGuardedArtifactCreationPermissionPolicy(
        policy({ mode: "enabled" as GuardedArtifactCreationPermissionPolicy["mode"] }),
      ),
    ).toEqual(["artifact_creation_permission_mode_invalid"]);
  });

  it("flags a policy that does not require a ready assembly", () => {
    expect(
      validateGuardedArtifactCreationPermissionPolicy(policy({ requireReadyAssembly: false })),
    ).toEqual(["artifact_creation_permission_ready_assembly_required"]);
  });

  it("flags a policy that does not require explicit approval", () => {
    expect(
      validateGuardedArtifactCreationPermissionPolicy(policy({ requireExplicitApproval: false })),
    ).toEqual(["artifact_creation_permission_explicit_approval_required"]);
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const reasons = validateGuardedArtifactCreationPermissionPolicy({
      mode: "enabled" as GuardedArtifactCreationPermissionPolicy["mode"],
      requireReadyAssembly: false,
      requireExplicitApproval: false,
    });
    expect(reasons).toEqual([
      "artifact_creation_permission_mode_invalid",
      "artifact_creation_permission_ready_assembly_required",
      "artifact_creation_permission_explicit_approval_required",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe("evaluateGuardedArtifactCreationPermission", () => {
  it("allows the explicit, ready, approved fixture while creation stays disallowed", () => {
    const report = evaluateGuardedArtifactCreationPermission(input());
    expect(report.ok).toBe(true);
    expect(report.allowed).toBe(true);
    expect(report.creationAllowed).toBe(false);
    expect(report.mode).toBe("explicit");
    expect(report.version).toBe("v0.1.0");
    expect(report.reasons).toEqual([]);
  });

  it("flags an invalid policy", () => {
    const report = evaluateGuardedArtifactCreationPermission(
      input({ policy: policy({ requireReadyAssembly: false }) }),
    );
    expect(report.reasons).toContain("artifact_creation_permission_policy_invalid");
    expect(report.allowed).toBe(false);
  });

  it("flags a missing version", () => {
    const report = evaluateGuardedArtifactCreationPermission(input({ version: "  " }));
    expect(report.reasons).toContain("artifact_creation_permission_version_missing");
    expect(report.allowed).toBe(false);
  });

  it("flags a disabled mode", () => {
    const report = evaluateGuardedArtifactCreationPermission(
      input({ policy: policy({ mode: "disabled" }) }),
    );
    expect(report.reasons).toEqual(["artifact_creation_permission_disabled"]);
    expect(report.allowed).toBe(false);
  });

  it("flags a dry-run-only mode", () => {
    const report = evaluateGuardedArtifactCreationPermission(
      input({ policy: policy({ mode: "dry-run-only" }) }),
    );
    expect(report.reasons).toEqual(["artifact_creation_permission_dry_run_only"]);
    expect(report.allowed).toBe(false);
  });

  it("flags a blocked assembly envelope", () => {
    const base = input();
    const report = evaluateGuardedArtifactCreationPermission({
      ...base,
      assembly: { ...base.assembly, ok: false },
    });
    expect(report.reasons).toEqual(["artifact_creation_permission_assembly_not_ready"]);
    expect(report.allowed).toBe(false);
  });

  it("flags missing approval", () => {
    const report = evaluateGuardedArtifactCreationPermission(input({ approved: false }));
    expect(report.reasons).toEqual(["artifact_creation_permission_approval_required"]);
    expect(report.allowed).toBe(false);
  });

  it("returns evaluation reasons in the fixed order with each reason at most once", () => {
    const base = input();
    const report = evaluateGuardedArtifactCreationPermission({
      version: "",
      policy: policy({ mode: "disabled", requireExplicitApproval: false }),
      approved: false,
      assembly: { ...base.assembly, ok: false },
    });
    expect(report.reasons).toEqual([
      "artifact_creation_permission_policy_invalid",
      "artifact_creation_permission_version_missing",
      "artifact_creation_permission_disabled",
      "artifact_creation_permission_assembly_not_ready",
    ]);
    expect(new Set(report.reasons).size).toBe(report.reasons.length);
  });

  it("allows permission only under explicit mode with a ready assembly and approval", () => {
    for (const mode of ["disabled", "dry-run-only"] as const) {
      expect(
        evaluateGuardedArtifactCreationPermission(input({ policy: policy({ mode }) })).allowed,
      ).toBe(false);
    }
    const base = input();
    expect(
      evaluateGuardedArtifactCreationPermission({
        ...base,
        assembly: { ...base.assembly, ok: false },
      }).allowed,
    ).toBe(false);
    expect(evaluateGuardedArtifactCreationPermission(input({ approved: false })).allowed).toBe(
      false,
    );
    expect(evaluateGuardedArtifactCreationPermission(input()).allowed).toBe(true);
  });

  it("keeps ok equal to allowed", () => {
    for (const candidate of [input(), input({ approved: false }), input({ version: "" })]) {
      const report = evaluateGuardedArtifactCreationPermission(candidate);
      expect(report.ok).toBe(report.allowed);
    }
  });

  it("keeps creationAllowed false even when permission is allowed", () => {
    const allowedReport = evaluateGuardedArtifactCreationPermission(input());
    expect(allowedReport.allowed).toBe(true);
    expect(allowedReport.creationAllowed).toBe(false);
    const blockedReport = evaluateGuardedArtifactCreationPermission(input({ approved: false }));
    expect(blockedReport.creationAllowed).toBe(false);
  });

  it("does not mutate its input", () => {
    const base = input({ approved: false, policy: policy({ mode: "dry-run-only" }) });
    const snapshot = structuredClone(base);
    evaluateGuardedArtifactCreationPermission(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createGuardedArtifactCreationPermissionDryRun", () => {
  it("omits warnings for an allowed evaluation", () => {
    const dryRun = createGuardedArtifactCreationPermissionDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked evaluation", () => {
    const dryRun = createGuardedArtifactCreationPermissionDryRun(input({ approved: false }));
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some(
        (warning) => warning.message === "artifact_creation_permission_approval_required",
      ),
    ).toBe(true);
  });
});

describe("formatGuardedArtifactCreationPermissionMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const report = evaluateGuardedArtifactCreationPermission(input());
    const markdown = formatGuardedArtifactCreationPermissionMarkdown(report);
    expect(markdown).toBe(formatGuardedArtifactCreationPermissionMarkdown(report));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("renders version, mode, allowed, creation-allowed false, and `- none` reasons", () => {
    const markdown = formatGuardedArtifactCreationPermissionMarkdown(
      evaluateGuardedArtifactCreationPermission(input()),
    );
    expect(markdown).toContain("# OH MY PM Guarded Artifact Creation Permission");
    expect(markdown).toContain("Version: `v0.1.0`");
    expect(markdown).toContain("Mode: `explicit`");
    expect(markdown).toContain("Allowed: `true`");
    expect(markdown).toContain("Creation allowed: `false`");
    expect(markdown).toContain("- none");
    expect(markdown).not.toMatch(/https?:\/\//);
    expect(markdown).not.toMatch(/output path|destination/i);
  });

  it("renders reason lines when blocked", () => {
    const markdown = formatGuardedArtifactCreationPermissionMarkdown(
      evaluateGuardedArtifactCreationPermission(input({ approved: false })),
    );
    expect(markdown).toContain("Allowed: `false`");
    expect(markdown).toContain("Creation allowed: `false`");
    expect(markdown).toContain("- `artifact_creation_permission_approval_required`");
    expect(markdown).not.toContain("- none");
  });
});

describe("exampleGuardedArtifactCreationPermissionInput", () => {
  it("is deterministic", () => {
    expect(exampleGuardedArtifactCreationPermissionInput()).toEqual(
      exampleGuardedArtifactCreationPermissionInput(),
    );
  });

  it("produces an ok dry run from the ready fixture chain while creation stays disallowed", () => {
    const fixture = exampleGuardedArtifactCreationPermissionInput();
    expect(fixture.assembly.ok).toBe(true);
    const dryRun = createGuardedArtifactCreationPermissionDryRun(fixture);
    expect(dryRun.ok).toBe(true);
    expect(dryRun.report.creationAllowed).toBe(false);
  });

  it("carries no adapter, output path, remote, or execution-result fields", () => {
    const fixture = exampleGuardedArtifactCreationPermissionInput();
    const report = evaluateGuardedArtifactCreationPermission(fixture);
    for (const key of Object.keys(report)) {
      expect(key).not.toMatch(
        /content|path|dest|command|adapter|object|url|bytes|result|remote/i,
      );
    }
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});
