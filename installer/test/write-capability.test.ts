import { describe, expect, it } from "vitest";
import {
  createInstallerDecisionReport,
  createInstallerWriteCapabilityDryRun,
  DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
  evaluateInstallerWriteCapability,
  exampleInstallerDecisionReportInput,
  exampleInstallerWriteCapabilityInput,
  validateInstallerWriteCapabilityMode,
  validateInstallerWriteCapabilityPolicy,
  validateInstallerWriteIntent,
} from "../src/index.js";
import type {
  InstallerDecisionReport,
  InstallerWriteCapabilityInput,
  InstallerWriteCapabilityPolicy,
} from "../src/index.js";

// A decision report with a chosen classification for capability tests.
function decisionWith(decision: InstallerDecisionReport["decision"]): InstallerDecisionReport {
  const base = createInstallerDecisionReport(exampleInstallerDecisionReportInput());
  return { ...base, decision, ok: decision === "ready" };
}

function input(overrides: Partial<InstallerWriteCapabilityInput>): InstallerWriteCapabilityInput {
  return { ...exampleInstallerWriteCapabilityInput(), ...overrides };
}

const explicitPolicy: InstallerWriteCapabilityPolicy = {
  mode: "explicit",
  allowedIntents: ["install", "update", "rollback"],
  requireReadyDecision: true,
  requireExplicitApproval: true,
};

describe("validateInstallerWriteIntent", () => {
  it("accepts the supported intents", () => {
    expect(validateInstallerWriteIntent("install")).toBe(true);
    expect(validateInstallerWriteIntent("update")).toBe(true);
    expect(validateInstallerWriteIntent("rollback")).toBe(true);
  });

  it("rejects an unsupported value", () => {
    expect(validateInstallerWriteIntent("delete")).toBe(false);
    expect(validateInstallerWriteIntent("")).toBe(false);
  });
});

describe("validateInstallerWriteCapabilityMode", () => {
  it("accepts the supported modes", () => {
    expect(validateInstallerWriteCapabilityMode("disabled")).toBe(true);
    expect(validateInstallerWriteCapabilityMode("preview-only")).toBe(true);
    expect(validateInstallerWriteCapabilityMode("explicit")).toBe(true);
  });

  it("rejects an unsupported value", () => {
    expect(validateInstallerWriteCapabilityMode("enabled")).toBe(false);
    expect(validateInstallerWriteCapabilityMode("")).toBe(false);
  });
});

describe("validateInstallerWriteCapabilityPolicy", () => {
  it("passes the default policy", () => {
    expect(validateInstallerWriteCapabilityPolicy(DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY)).toEqual(
      [],
    );
  });

  it("flags an invalid mode", () => {
    const reasons = validateInstallerWriteCapabilityPolicy({
      ...DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
      mode: "enabled" as InstallerWriteCapabilityPolicy["mode"],
    });
    expect(reasons).toContain("write_capability_mode_invalid");
  });

  it("flags empty allowed intents", () => {
    const reasons = validateInstallerWriteCapabilityPolicy({
      ...DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
      allowedIntents: [],
    });
    expect(reasons).toContain("write_capability_allowed_intents_empty");
  });

  it("flags an invalid allowed intent", () => {
    const reasons = validateInstallerWriteCapabilityPolicy({
      ...DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
      allowedIntents: ["install", "delete" as InstallerWriteCapabilityPolicy["allowedIntents"][number]],
    });
    expect(reasons).toContain("write_capability_allowed_intent_invalid");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const reasons = validateInstallerWriteCapabilityPolicy({
      mode: "enabled" as InstallerWriteCapabilityPolicy["mode"],
      allowedIntents: [],
      requireReadyDecision: true,
      requireExplicitApproval: true,
    });
    expect(reasons).toEqual([
      "write_capability_mode_invalid",
      "write_capability_allowed_intents_empty",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("validates all allowed intents, not just the first", () => {
    const reasons = validateInstallerWriteCapabilityPolicy({
      ...DEFAULT_INSTALLER_WRITE_CAPABILITY_POLICY,
      allowedIntents: ["install", "bogus" as InstallerWriteCapabilityPolicy["allowedIntents"][number]],
    });
    expect(reasons).toEqual(["write_capability_allowed_intent_invalid"]);
  });
});

describe("evaluateInstallerWriteCapability", () => {
  it("blocks the default preview-only fixture", () => {
    const report = evaluateInstallerWriteCapability(exampleInstallerWriteCapabilityInput());
    expect(report.allowed).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.mode).toBe("preview-only");
    expect(report.reasons).toContain("write_capability_preview_only");
  });

  it("blocks a disabled policy", () => {
    const report = evaluateInstallerWriteCapability(
      input({
        policy: { ...explicitPolicy, mode: "disabled" },
        decision: decisionWith("ready"),
        approved: true,
      }),
    );
    expect(report.allowed).toBe(false);
    expect(report.reasons).toContain("write_capability_disabled");
  });

  it("blocks a preview-only policy even when otherwise ready and approved", () => {
    const report = evaluateInstallerWriteCapability(
      input({
        policy: { ...explicitPolicy, mode: "preview-only" },
        decision: decisionWith("ready"),
        approved: true,
      }),
    );
    expect(report.allowed).toBe(false);
    expect(report.reasons).toContain("write_capability_preview_only");
  });

  it("blocks explicit mode with an unapproved request when approval is required", () => {
    const report = evaluateInstallerWriteCapability(
      input({ policy: explicitPolicy, decision: decisionWith("ready"), approved: false }),
    );
    expect(report.allowed).toBe(false);
    expect(report.reasons).toEqual(["write_capability_approval_required"]);
  });

  it("allows explicit mode with a ready decision and an approved request", () => {
    const report = evaluateInstallerWriteCapability(
      input({ policy: explicitPolicy, decision: decisionWith("ready"), approved: true }),
    );
    expect(report.allowed).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.intent).toBe("install");
    expect(report.mode).toBe("explicit");
  });

  it("blocks explicit mode with a non-ready decision when ready is required", () => {
    const report = evaluateInstallerWriteCapability(
      input({ policy: explicitPolicy, decision: decisionWith("review-required"), approved: true }),
    );
    expect(report.allowed).toBe(false);
    expect(report.reasons).toContain("write_capability_decision_not_ready");
  });

  it("allows explicit mode with a non-ready decision when ready is not required", () => {
    const report = evaluateInstallerWriteCapability(
      input({
        policy: { ...explicitPolicy, requireReadyDecision: false },
        decision: decisionWith("review-required"),
        approved: true,
      }),
    );
    expect(report.allowed).toBe(true);
    expect(report.reasons).toEqual([]);
  });

  it("blocks a disallowed intent", () => {
    const report = evaluateInstallerWriteCapability(
      input({
        policy: { ...explicitPolicy, allowedIntents: ["update", "rollback"] },
        decision: decisionWith("ready"),
        approved: true,
        intent: "install",
      }),
    );
    expect(report.allowed).toBe(false);
    expect(report.reasons).toContain("write_capability_intent_not_allowed");
  });

  it("blocks an invalid policy", () => {
    const report = evaluateInstallerWriteCapability(
      input({
        policy: {
          ...explicitPolicy,
          mode: "enabled" as InstallerWriteCapabilityPolicy["mode"],
        },
        decision: decisionWith("ready"),
        approved: true,
      }),
    );
    expect(report.allowed).toBe(false);
    expect(report.reasons).toContain("write_capability_policy_invalid");
  });

  it("orders reasons deterministically when several guards fail at once", () => {
    const report = evaluateInstallerWriteCapability({
      intent: "bogus" as InstallerWriteCapabilityInput["intent"],
      approved: false,
      decision: decisionWith("blocked"),
      policy: {
        mode: "enabled" as InstallerWriteCapabilityPolicy["mode"],
        allowedIntents: [],
        requireReadyDecision: true,
        requireExplicitApproval: true,
      },
    });
    expect(report.reasons).toEqual([
      "write_capability_policy_invalid",
      "write_capability_intent_invalid",
      "write_capability_intent_not_allowed",
      "write_capability_decision_not_ready",
      "write_capability_approval_required",
    ]);
    expect(new Set(report.reasons).size).toBe(report.reasons.length);
  });

  it("does not mutate its input", () => {
    const base = exampleInstallerWriteCapabilityInput();
    const snapshot = structuredClone(base);
    evaluateInstallerWriteCapability(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createInstallerWriteCapabilityDryRun", () => {
  it("omits warnings for an allowed request", () => {
    const dryRun = createInstallerWriteCapabilityDryRun(
      input({ policy: explicitPolicy, decision: decisionWith("ready"), approved: true }),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
    expect(dryRun.report.allowed).toBe(true);
  });

  it("returns OMP-I-6001 warnings for a blocked request", () => {
    const dryRun = createInstallerWriteCapabilityDryRun(exampleInstallerWriteCapabilityInput());
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "write_capability_preview_only"),
    ).toBe(true);
  });
});

describe("exampleInstallerWriteCapabilityInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerWriteCapabilityInput()).toEqual(exampleInstallerWriteCapabilityInput());
  });
});
