import { describe, expect, it } from "vitest";
import {
  createInstallerWriteConfirmationChecklist,
  createInstallerWriteConfirmationChecklistDryRun,
  createInstallerWriteConfirmationChecklistItems,
  exampleInstallerWriteConfirmationChecklistInput,
} from "../src/index.js";
import type {
  InstallerWriteConfirmationChecklistInput,
  InstallerWriteConfirmationItemId,
} from "../src/index.js";

const ITEM_ORDER: InstallerWriteConfirmationItemId[] = [
  "intent-consistent",
  "decision-ready",
  "capability-allowed",
  "execution-plan-ready",
  "execution-steps-present",
];

const LABELS: Record<InstallerWriteConfirmationItemId, string> = {
  "intent-consistent": "Capability and execution plan target the same intent",
  "decision-ready": "Installer decision is ready",
  "capability-allowed": "Write capability is allowed",
  "execution-plan-ready": "Write execution plan is ready",
  "execution-steps-present": "Write execution plan has steps",
};

function input(
  overrides: Partial<InstallerWriteConfirmationChecklistInput> = {},
): InstallerWriteConfirmationChecklistInput {
  return { ...exampleInstallerWriteConfirmationChecklistInput(), ...overrides };
}

describe("createInstallerWriteConfirmationChecklistItems", () => {
  it("returns items in the exact fixed order", () => {
    const items = createInstallerWriteConfirmationChecklistItems(input());
    expect(items.map((item) => item.id)).toEqual(ITEM_ORDER);
  });

  it("uses stable labels", () => {
    const items = createInstallerWriteConfirmationChecklistItems(input());
    for (const item of items) {
      expect(item.label).toBe(LABELS[item.id]);
    }
  });

  it("omits reason on passing items", () => {
    const items = createInstallerWriteConfirmationChecklistItems(input());
    for (const item of items) {
      expect(item.ok).toBe(true);
      expect(item).not.toHaveProperty("reason");
    }
  });

  it("includes reason only on failing items", () => {
    const base = input();
    const items = createInstallerWriteConfirmationChecklistItems({
      ...base,
      capability: { ...base.capability, allowed: false },
    });
    const failed = items.find((item) => item.id === "capability-allowed");
    expect(failed?.ok).toBe(false);
    expect(failed?.reason).toBe("write_confirmation_capability_not_allowed");
    const passed = items.find((item) => item.id === "intent-consistent");
    expect(passed).not.toHaveProperty("reason");
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createInstallerWriteConfirmationChecklistItems(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createInstallerWriteConfirmationChecklist", () => {
  it("is ok when all items pass", () => {
    const checklist = createInstallerWriteConfirmationChecklist(input());
    expect(checklist.ok).toBe(true);
    expect(checklist.reasons).toEqual([]);
    expect(checklist.intent).toBe("install");
  });

  it("fails on an intent mismatch", () => {
    const base = input();
    const checklist = createInstallerWriteConfirmationChecklist({
      ...base,
      capability: { ...base.capability, intent: "update" },
    });
    expect(checklist.ok).toBe(false);
    expect(checklist.reasons).toContain("write_confirmation_intent_mismatch");
  });

  it("fails on a non-ready decision", () => {
    const base = input();
    const checklist = createInstallerWriteConfirmationChecklist({
      ...base,
      decision: { ...base.decision, decision: "review-required", ok: false },
    });
    expect(checklist.reasons).toContain("write_confirmation_decision_not_ready");
  });

  it("fails on blocked capability", () => {
    const base = input();
    const checklist = createInstallerWriteConfirmationChecklist({
      ...base,
      capability: { ...base.capability, allowed: false },
    });
    expect(checklist.reasons).toContain("write_confirmation_capability_not_allowed");
  });

  it("fails on an invalid execution plan", () => {
    const base = input();
    const checklist = createInstallerWriteConfirmationChecklist({
      ...base,
      executionPlan: { ...base.executionPlan, ok: false },
    });
    expect(checklist.reasons).toContain("write_confirmation_execution_plan_not_ready");
  });

  it("fails on empty steps", () => {
    const base = input();
    const checklist = createInstallerWriteConfirmationChecklist({
      ...base,
      executionPlan: { ...base.executionPlan, steps: [] },
    });
    expect(checklist.reasons).toContain("write_confirmation_steps_empty");
  });

  it("returns reasons in exact item order with each reason once", () => {
    const base = input();
    const checklist = createInstallerWriteConfirmationChecklist({
      decision: { ...base.decision, decision: "blocked", ok: false },
      capability: { ...base.capability, intent: "update", allowed: false },
      executionPlan: { ...base.executionPlan, ok: false, steps: [] },
    });
    expect(checklist.reasons).toEqual([
      "write_confirmation_intent_mismatch",
      "write_confirmation_decision_not_ready",
      "write_confirmation_capability_not_allowed",
      "write_confirmation_execution_plan_not_ready",
      "write_confirmation_steps_empty",
    ]);
    expect(new Set(checklist.reasons).size).toBe(checklist.reasons.length);
  });

  it("carries no content, command, destination, adapter, or execution-result fields", () => {
    const checklist = createInstallerWriteConfirmationChecklist(input());
    for (const item of checklist.items) {
      for (const key of Object.keys(item)) {
        expect(key).not.toMatch(/content|command|dest|adapter|writer|result|remote|url/i);
      }
    }
    const serialized = JSON.stringify(checklist);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("backupFile");
    expect(serialized).not.toContain("removeFile");
    expect(serialized).not.toContain("executeInstall");
  });
});

describe("createInstallerWriteConfirmationChecklistDryRun", () => {
  it("omits warnings for a passing checklist", () => {
    const dryRun = createInstallerWriteConfirmationChecklistDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a failing checklist", () => {
    const base = input();
    const dryRun = createInstallerWriteConfirmationChecklistDryRun({
      ...base,
      capability: { ...base.capability, allowed: false },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "write_confirmation_capability_not_allowed"),
    ).toBe(true);
  });
});

describe("exampleInstallerWriteConfirmationChecklistInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerWriteConfirmationChecklistInput()).toEqual(
      exampleInstallerWriteConfirmationChecklistInput(),
    );
  });

  it("produces a passing dry run", () => {
    const dryRun = createInstallerWriteConfirmationChecklistDryRun(
      exampleInstallerWriteConfirmationChecklistInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.checklist.items).toHaveLength(5);
    expect(dryRun.checklist.items.every((item) => item.ok)).toBe(true);
  });
});
