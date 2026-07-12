import { describe, expect, it } from "vitest";
import {
  createInstallerDecisionReport,
  createInstallerWriteApprovalToken,
  createInstallerWriteApprovalTokenDryRun,
  createInstallerWriteApprovalTokenValue,
  evaluateInstallerWriteCapability,
  exampleInstallerDecisionReportInput,
  exampleInstallerWriteApprovalTokenInput,
  exampleInstallerWriteCapabilityInput,
  matchInstallerWriteApprovalToken,
  validateInstallerWriteApprovalToken,
} from "../src/index.js";
import type {
  InstallerDecisionReport,
  InstallerWriteApprovalToken,
  InstallerWriteApprovalTokenInput,
  InstallerWriteCapabilityInput,
  InstallerWriteCapabilityPolicy,
} from "../src/index.js";

function decisionWith(decision: InstallerDecisionReport["decision"]): InstallerDecisionReport {
  const base = createInstallerDecisionReport(exampleInstallerDecisionReportInput());
  return { ...base, decision, ok: decision === "ready" };
}

function tokenInput(
  overrides: Partial<InstallerWriteApprovalTokenInput> = {},
): InstallerWriteApprovalTokenInput {
  return { ...exampleInstallerWriteApprovalTokenInput(), ...overrides };
}

const explicitPolicy: InstallerWriteCapabilityPolicy = {
  mode: "explicit",
  allowedIntents: ["install", "update", "rollback"],
  requireReadyDecision: true,
  requireExplicitApproval: true,
};

describe("createInstallerWriteApprovalTokenValue", () => {
  it("uses the deterministic descriptive format", () => {
    const input = tokenInput();
    expect(createInstallerWriteApprovalTokenValue(input)).toBe(
      `approve:${input.intent}:${input.root}:${input.decision.decision}`,
    );
  });

  it("is not a hash, signature, random, or timestamp", () => {
    const value = createInstallerWriteApprovalTokenValue(tokenInput());
    expect(value.startsWith("approve:")).toBe(true);
    expect(value).not.toMatch(/[0-9a-f]{32,}/);
    expect(value).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(value).not.toContain("sig");
  });
});

describe("createInstallerWriteApprovalToken", () => {
  it("builds a token bound to the decision value", () => {
    const input = tokenInput();
    const token = createInstallerWriteApprovalToken(input);
    expect(token.intent).toBe("install");
    expect(token.root).toBe("/tmp/oh-my-pm");
    expect(token.decision).toBe(input.decision.decision);
    expect(token.value).toBe(createInstallerWriteApprovalTokenValue(input));
  });

  it("carries no secret, key, signature, or timestamp fields", () => {
    const token = createInstallerWriteApprovalToken(tokenInput());
    for (const key of Object.keys(token)) {
      expect(key).not.toMatch(/secret|key|signature|token|timestamp|expiry|user|machine/i);
    }
    const serialized = JSON.stringify(token);
    expect(serialized).not.toContain("BEGIN");
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("validateInstallerWriteApprovalToken", () => {
  it("passes a well-formed token", () => {
    const report = validateInstallerWriteApprovalToken(
      createInstallerWriteApprovalToken(tokenInput()),
    );
    expect(report.ok).toBe(true);
    expect(report.reasons).toEqual([]);
  });

  it("flags an invalid intent", () => {
    const token: InstallerWriteApprovalToken = {
      ...createInstallerWriteApprovalToken(tokenInput()),
      intent: "delete" as InstallerWriteApprovalToken["intent"],
    };
    expect(validateInstallerWriteApprovalToken(token).reasons).toContain(
      "write_approval_token_intent_invalid",
    );
  });

  it("flags a missing root", () => {
    const token: InstallerWriteApprovalToken = {
      intent: "install",
      root: "",
      decision: "ready",
      value: "approve:install::ready",
    };
    expect(validateInstallerWriteApprovalToken(token).reasons).toContain(
      "write_approval_token_root_missing",
    );
  });

  it("flags an invalid decision", () => {
    const token: InstallerWriteApprovalToken = {
      intent: "install",
      root: "/tmp/oh-my-pm",
      decision: "maybe" as InstallerWriteApprovalToken["decision"],
      value: "approve:install:/tmp/oh-my-pm:maybe",
    };
    expect(validateInstallerWriteApprovalToken(token).reasons).toContain(
      "write_approval_token_decision_invalid",
    );
  });

  it("flags a missing value", () => {
    const token: InstallerWriteApprovalToken = {
      intent: "install",
      root: "/tmp/oh-my-pm",
      decision: "ready",
      value: "",
    };
    expect(validateInstallerWriteApprovalToken(token).reasons).toContain(
      "write_approval_token_value_missing",
    );
  });

  it("flags a value mismatch", () => {
    const token: InstallerWriteApprovalToken = {
      intent: "install",
      root: "/tmp/oh-my-pm",
      decision: "ready",
      value: "approve:install:/tmp/oh-my-pm:review-required",
    };
    expect(validateInstallerWriteApprovalToken(token).reasons).toContain(
      "write_approval_token_value_mismatch",
    );
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const token: InstallerWriteApprovalToken = {
      intent: "delete" as InstallerWriteApprovalToken["intent"],
      root: "",
      decision: "maybe" as InstallerWriteApprovalToken["decision"],
      value: "wrong",
    };
    const report = validateInstallerWriteApprovalToken(token);
    expect(report.reasons).toEqual([
      "write_approval_token_intent_invalid",
      "write_approval_token_root_missing",
      "write_approval_token_decision_invalid",
      "write_approval_token_value_mismatch",
    ]);
    expect(new Set(report.reasons).size).toBe(report.reasons.length);
  });
});

describe("matchInstallerWriteApprovalToken", () => {
  function request(
    overrides: Partial<InstallerWriteCapabilityInput> = {},
  ): InstallerWriteCapabilityInput {
    return {
      ...exampleInstallerWriteCapabilityInput(),
      policy: explicitPolicy,
      decision: decisionWith("ready"),
      approved: false,
      ...overrides,
    };
  }

  function tokenFor(req: InstallerWriteCapabilityInput): InstallerWriteApprovalToken {
    return createInstallerWriteApprovalToken({
      intent: req.intent,
      root: req.decision.root,
      decision: req.decision,
    });
  }

  it("flags a missing token", () => {
    const report = matchInstallerWriteApprovalToken({ token: undefined, request: request() });
    expect(report.approved).toBe(false);
    expect(report.reasons).toEqual(["write_approval_token_missing"]);
  });

  it("flags an invalid token", () => {
    const report = matchInstallerWriteApprovalToken({
      token: {
        intent: "install",
        root: "/tmp/oh-my-pm",
        decision: "ready",
        value: "not-the-expected-value",
      },
      request: request(),
    });
    expect(report.approved).toBe(false);
    expect(report.reasons).toContain("write_approval_token_invalid");
  });

  it("flags an intent mismatch", () => {
    const req = request();
    const token: InstallerWriteApprovalToken = {
      ...tokenFor(req),
      intent: "update",
      value: `approve:update:${req.decision.root}:${req.decision.decision}`,
    };
    const report = matchInstallerWriteApprovalToken({ token, request: req });
    expect(report.reasons).toContain("write_approval_token_intent_mismatch");
  });

  it("flags a root mismatch", () => {
    const req = request();
    const token = createInstallerWriteApprovalToken({
      intent: req.intent,
      root: "/other/root",
      decision: req.decision,
    });
    const report = matchInstallerWriteApprovalToken({ token, request: req });
    expect(report.reasons).toContain("write_approval_token_root_mismatch");
  });

  it("flags a decision mismatch", () => {
    const req = request();
    const token = createInstallerWriteApprovalToken({
      intent: req.intent,
      root: req.decision.root,
      decision: decisionWith("review-required"),
    });
    const report = matchInstallerWriteApprovalToken({ token, request: req });
    expect(report.reasons).toContain("write_approval_token_decision_mismatch");
  });

  it("approves a fully matching token", () => {
    const req = request();
    const report = matchInstallerWriteApprovalToken({ token: tokenFor(req), request: req });
    expect(report.ok).toBe(true);
    expect(report.approved).toBe(true);
    expect(report.reasons).toEqual([]);
  });

  it("does not mutate its input", () => {
    const req = request();
    const input = { token: tokenFor(req), request: req };
    const snapshot = structuredClone(input);
    matchInstallerWriteApprovalToken(input);
    expect(input).toEqual(snapshot);
  });
});

describe("createInstallerWriteApprovalTokenDryRun", () => {
  it("is ok and omits warnings for a valid token", () => {
    const dryRun = createInstallerWriteApprovalTokenDryRun(tokenInput());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
    expect(dryRun.validation.ok).toBe(true);
    expect(dryRun.token.value.startsWith("approve:install:")).toBe(true);
  });

  it("returns OMP-I-6001 warnings for an invalid token", () => {
    // A decision report whose classification is not a valid decision value.
    const dryRun = createInstallerWriteApprovalTokenDryRun(
      tokenInput({
        decision: {
          ...decisionWith("ready"),
          decision: "maybe" as InstallerDecisionReport["decision"],
        },
      }),
    );
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
  });
});

describe("write capability integration", () => {
  function readyRequest(): InstallerWriteCapabilityInput {
    return {
      ...exampleInstallerWriteCapabilityInput(),
      policy: explicitPolicy,
      decision: decisionWith("ready"),
      approved: false,
    };
  }

  it("allows explicit mode with a matching token even when approved is false", () => {
    const req = readyRequest();
    const token = createInstallerWriteApprovalToken({
      intent: req.intent,
      root: req.decision.root,
      decision: req.decision,
    });
    const report = evaluateInstallerWriteCapability({ ...req, approvalToken: token });
    expect(report.allowed).toBe(true);
    expect(report.reasons).toEqual([]);
  });

  it("blocks explicit mode with a mismatching token", () => {
    const req = readyRequest();
    const token = createInstallerWriteApprovalToken({
      intent: req.intent,
      root: "/other/root",
      decision: req.decision,
    });
    const report = evaluateInstallerWriteCapability({ ...req, approvalToken: token });
    expect(report.allowed).toBe(false);
    expect(report.reasons).toContain("write_capability_approval_required");
  });

  it("keeps the default preview-only policy blocked even with a matching token", () => {
    const base = exampleInstallerWriteCapabilityInput();
    const token = createInstallerWriteApprovalToken({
      intent: base.intent,
      root: base.decision.root,
      decision: base.decision,
    });
    const report = evaluateInstallerWriteCapability({ ...base, approvalToken: token });
    expect(report.allowed).toBe(false);
    expect(report.mode).toBe("preview-only");
    expect(report.reasons).toContain("write_capability_preview_only");
  });
});

describe("exampleInstallerWriteApprovalTokenInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerWriteApprovalTokenInput()).toEqual(
      exampleInstallerWriteApprovalTokenInput(),
    );
  });

  it("produces a valid dry run", () => {
    const dryRun = createInstallerWriteApprovalTokenDryRun(
      exampleInstallerWriteApprovalTokenInput(),
    );
    expect(dryRun.ok).toBe(true);
  });
});
