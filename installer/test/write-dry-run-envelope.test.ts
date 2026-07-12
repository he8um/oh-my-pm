import { describe, expect, it } from "vitest";
import {
  collectControlledWriteDryRunReasons,
  createControlledWriteExecutionDryRun,
  createControlledWriteExecutionDryRunEnvelope,
  exampleControlledWriteExecutionDryRunEnvelopeInput,
  summarizeControlledWriteExecutionDryRunEnvelope,
} from "../src/index.js";
import type { ControlledWriteExecutionDryRunEnvelopeInput } from "../src/index.js";

function input(
  overrides: Partial<ControlledWriteExecutionDryRunEnvelopeInput> = {},
): ControlledWriteExecutionDryRunEnvelopeInput {
  return { ...exampleControlledWriteExecutionDryRunEnvelopeInput(), ...overrides };
}

describe("collectControlledWriteDryRunReasons", () => {
  it("returns no reasons for the aligned fixture", () => {
    expect(collectControlledWriteDryRunReasons(input())).toEqual([]);
  });

  it("flags an intent mismatch", () => {
    const base = input();
    const reasons = collectControlledWriteDryRunReasons({
      ...base,
      capability: { ...base.capability, intent: "update" },
    });
    expect(reasons).toContain("controlled_write_intent_mismatch");
  });

  it("flags a not-allowed capability", () => {
    const base = input();
    const reasons = collectControlledWriteDryRunReasons({
      ...base,
      capability: { ...base.capability, allowed: false },
    });
    expect(reasons).toContain("controlled_write_capability_not_allowed");
  });

  it("flags an invalid approval", () => {
    const base = input();
    const reasons = collectControlledWriteDryRunReasons({
      ...base,
      approval: { ...base.approval, ok: false },
    });
    expect(reasons).toContain("controlled_write_approval_invalid");
  });

  it("flags a not-ready execution plan", () => {
    const base = input();
    const reasons = collectControlledWriteDryRunReasons({
      ...base,
      executionPlan: { ...base.executionPlan, ok: false },
    });
    expect(reasons).toContain("controlled_write_execution_plan_not_ready");
  });

  it("flags a not-ready confirmation", () => {
    const base = input();
    const reasons = collectControlledWriteDryRunReasons({
      ...base,
      confirmation: { ...base.confirmation, ok: false },
    });
    expect(reasons).toContain("controlled_write_confirmation_not_ready");
  });

  it("flags a not-ready adapter contract", () => {
    const base = input();
    const reasons = collectControlledWriteDryRunReasons({
      ...base,
      adapterContract: { ...base.adapterContract, ok: false },
    });
    expect(reasons).toContain("controlled_write_adapter_contract_not_ready");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const base = input();
    const reasons = collectControlledWriteDryRunReasons({
      ...base,
      capability: { ...base.capability, intent: "update", allowed: false },
      approval: { ...base.approval, ok: false },
      executionPlan: { ...base.executionPlan, ok: false },
      confirmation: { ...base.confirmation, ok: false },
      adapterContract: { ...base.adapterContract, ok: false },
    });
    expect(reasons).toEqual([
      "controlled_write_intent_mismatch",
      "controlled_write_capability_not_allowed",
      "controlled_write_approval_invalid",
      "controlled_write_execution_plan_not_ready",
      "controlled_write_confirmation_not_ready",
      "controlled_write_adapter_contract_not_ready",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe("summarizeControlledWriteExecutionDryRunEnvelope", () => {
  it("reflects each layer's readiness", () => {
    const summary = summarizeControlledWriteExecutionDryRunEnvelope(input());
    expect(summary).toMatchObject({
      intent: "install",
      allowed: true,
      approved: true,
      planReady: true,
      confirmationReady: true,
      adapterReady: true,
    });
    expect(summary.reasons).toEqual([]);
  });

  it("reports plannedSteps from the execution plan step count", () => {
    const base = input();
    const summary = summarizeControlledWriteExecutionDryRunEnvelope(base);
    expect(summary.plannedSteps).toBe(base.executionPlan.steps.length);
    expect(summary.plannedSteps).toBeGreaterThan(0);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    summarizeControlledWriteExecutionDryRunEnvelope(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createControlledWriteExecutionDryRunEnvelope", () => {
  it("is ok when every layer is ready", () => {
    const envelope = createControlledWriteExecutionDryRunEnvelope(input());
    expect(envelope.ok).toBe(true);
    expect(envelope.summary.reasons).toEqual([]);
  });

  it("is not ok when any layer is not ready", () => {
    const base = input();
    const envelope = createControlledWriteExecutionDryRunEnvelope({
      ...base,
      confirmation: { ...base.confirmation, ok: false },
    });
    expect(envelope.ok).toBe(false);
  });

  it("passes through each readiness layer", () => {
    const base = input();
    const envelope = createControlledWriteExecutionDryRunEnvelope(base);
    expect(envelope.capability).toBe(base.capability);
    expect(envelope.approval).toBe(base.approval);
    expect(envelope.executionPlan).toBe(base.executionPlan);
    expect(envelope.confirmation).toBe(base.confirmation);
    expect(envelope.adapterContract).toBe(base.adapterContract);
  });

  it("carries no content, command, destination, remote, adapter object, method, or result fields", () => {
    const envelope = createControlledWriteExecutionDryRunEnvelope(input());
    for (const key of Object.keys(envelope)) {
      expect(key).not.toMatch(/content|command|dest|remote|url|object|fn|func|method|result/i);
    }
    for (const key of Object.keys(envelope.summary)) {
      expect(key).not.toMatch(/content|command|dest|remote|url|object|fn|func|method|result/i);
    }
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe("createControlledWriteExecutionDryRun", () => {
  it("omits warnings for a ready envelope", () => {
    const dryRun = createControlledWriteExecutionDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a not-ready envelope", () => {
    const base = input();
    const dryRun = createControlledWriteExecutionDryRun({
      ...base,
      capability: { ...base.capability, allowed: false },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "controlled_write_capability_not_allowed"),
    ).toBe(true);
  });
});

describe("exampleControlledWriteExecutionDryRunEnvelopeInput", () => {
  it("is deterministic", () => {
    expect(exampleControlledWriteExecutionDryRunEnvelopeInput()).toEqual(
      exampleControlledWriteExecutionDryRunEnvelopeInput(),
    );
  });

  it("produces an ok dry run", () => {
    const dryRun = createControlledWriteExecutionDryRun(
      exampleControlledWriteExecutionDryRunEnvelopeInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.envelope.summary.plannedSteps).toBeGreaterThan(0);
  });
});
