import { describe, expect, it } from "vitest";
import {
  createInstallerWriteExecutionPlan,
  createInstallerWriteExecutionPlanDryRun,
  createInstallerWriteExecutionPlanSteps,
  exampleInstallerWriteExecutionPlanInput,
  mapInstallOperationToWriteStepKind,
  mapRollbackImpactToWriteStepKind,
  mapUpdateImpactToWriteStepKind,
} from "../src/index.js";
import type {
  InstallerWriteCapabilityReport,
  InstallerWriteExecutionPlanInput,
  PlannedFileOperation,
  RollbackImpactOperation,
  UpdateImpactOperation,
} from "../src/index.js";

const allowedCapability: InstallerWriteCapabilityReport = {
  ok: true,
  intent: "install",
  mode: "explicit",
  allowed: true,
  reasons: [],
};

const blockedCapability: InstallerWriteCapabilityReport = {
  ok: false,
  intent: "install",
  mode: "preview-only",
  allowed: false,
  reasons: ["write_capability_preview_only"],
};

const installOperations: PlannedFileOperation[] = [
  { kind: "create", path: "bin/oh-my-pm", checksum: "sha256:a" },
  { kind: "replace", path: "README.md" },
  { kind: "remove", path: "old.txt" },
  { kind: "backup", path: "bin/oh-my-pm" },
];

const updateOperations: UpdateImpactOperation[] = [
  { kind: "create", path: "new.txt", afterChecksum: "sha256:new" },
  { kind: "replace", path: "bin/oh-my-pm", beforeChecksum: "sha256:old", afterChecksum: "sha256:next" },
  { kind: "remove", path: "gone.txt", beforeChecksum: "sha256:gone" },
  { kind: "unchanged", path: "README.md", beforeChecksum: "sha256:same", afterChecksum: "sha256:same" },
];

const rollbackOperations: RollbackImpactOperation[] = [
  { kind: "restore", path: "bin/oh-my-pm", beforeChecksum: "sha256:cur", afterChecksum: "sha256:bak" },
  { kind: "remove", path: "extra.txt", beforeChecksum: "sha256:extra" },
  { kind: "missing", path: "gone.txt" },
  { kind: "unchanged", path: "README.md", beforeChecksum: "sha256:same" },
];

function input(overrides: Partial<InstallerWriteExecutionPlanInput> = {}): InstallerWriteExecutionPlanInput {
  return {
    intent: "install",
    capability: allowedCapability,
    installOperations,
    updateImpact: { ok: true, root: "/tmp/oh-my-pm", operations: updateOperations, summary: {
      creates: 1, replaces: 1, removes: 1, unchanged: 1, beforeSizeBytes: 0, afterSizeBytes: 0,
    }, policyDecision: "allowed", reasons: [] },
    rollbackImpact: { ok: true, root: "/tmp/oh-my-pm", rollbackId: "rb-1", operations: rollbackOperations, summary: {
      restores: 1, removes: 1, missing: 1, unchanged: 1, beforeSizeBytes: 0, afterSizeBytes: 0,
    }, reasons: [] },
    ...overrides,
  };
}

describe("mapInstallOperationToWriteStepKind", () => {
  it("maps every install operation kind", () => {
    expect(mapInstallOperationToWriteStepKind("create")).toBe("install-create");
    expect(mapInstallOperationToWriteStepKind("replace")).toBe("install-replace");
    expect(mapInstallOperationToWriteStepKind("remove")).toBe("install-remove");
    expect(mapInstallOperationToWriteStepKind("backup")).toBe("install-backup");
  });
});

describe("mapUpdateImpactToWriteStepKind", () => {
  it("maps write kinds and skips unchanged", () => {
    expect(mapUpdateImpactToWriteStepKind("create")).toBe("update-create");
    expect(mapUpdateImpactToWriteStepKind("replace")).toBe("update-replace");
    expect(mapUpdateImpactToWriteStepKind("remove")).toBe("update-remove");
    expect(mapUpdateImpactToWriteStepKind("unchanged")).toBeUndefined();
  });
});

describe("mapRollbackImpactToWriteStepKind", () => {
  it("maps write kinds and skips missing and unchanged", () => {
    expect(mapRollbackImpactToWriteStepKind("restore")).toBe("rollback-restore");
    expect(mapRollbackImpactToWriteStepKind("remove")).toBe("rollback-remove");
    expect(mapRollbackImpactToWriteStepKind("missing")).toBeUndefined();
    expect(mapRollbackImpactToWriteStepKind("unchanged")).toBeUndefined();
  });
});

describe("createInstallerWriteExecutionPlanSteps", () => {
  it("builds install-prefixed steps for the install intent", () => {
    const steps = createInstallerWriteExecutionPlanSteps(input({ intent: "install" }));
    expect(steps.map((step) => step.kind)).toEqual([
      "install-create",
      "install-replace",
      "install-remove",
      "install-backup",
    ]);
  });

  it("builds update-prefixed steps and skips unchanged", () => {
    const steps = createInstallerWriteExecutionPlanSteps(input({ intent: "update" }));
    expect(steps.map((step) => step.kind)).toEqual([
      "update-create",
      "update-replace",
      "update-remove",
    ]);
  });

  it("builds rollback-prefixed steps and skips unchanged and missing", () => {
    const steps = createInstallerWriteExecutionPlanSteps(input({ intent: "rollback" }));
    expect(steps.map((step) => step.kind)).toEqual(["rollback-restore", "rollback-remove"]);
  });

  it("uses contiguous sequences starting at 1", () => {
    const steps = createInstallerWriteExecutionPlanSteps(input({ intent: "install" }));
    expect(steps.map((step) => step.sequence)).toEqual(steps.map((_step, index) => index + 1));
  });

  it("includes a checksum only when the source operation has one", () => {
    const installSteps = createInstallerWriteExecutionPlanSteps(input({ intent: "install" }));
    expect(installSteps[0].checksum).toBe("sha256:a");
    expect(installSteps[1]).not.toHaveProperty("checksum");

    const updateSteps = createInstallerWriteExecutionPlanSteps(input({ intent: "update" }));
    // create -> afterChecksum; replace -> afterChecksum preferred over before.
    expect(updateSteps[0].checksum).toBe("sha256:new");
    expect(updateSteps[1].checksum).toBe("sha256:next");
    // remove -> only beforeChecksum available.
    expect(updateSteps[2].checksum).toBe("sha256:gone");

    const rollbackSteps = createInstallerWriteExecutionPlanSteps(input({ intent: "rollback" }));
    expect(rollbackSteps[0].checksum).toBe("sha256:bak");
    expect(rollbackSteps[1].checksum).toBe("sha256:extra");
  });

  it("does not mutate its input", () => {
    const base = input({ intent: "install" });
    const snapshot = structuredClone(base);
    createInstallerWriteExecutionPlanSteps(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createInstallerWriteExecutionPlan", () => {
  it("adds a reason when capability is not allowed", () => {
    const plan = createInstallerWriteExecutionPlan(input({ capability: blockedCapability }));
    expect(plan.ok).toBe(false);
    expect(plan.reasons).toContain("write_execution_capability_not_allowed");
    // Steps are still built so the preview remains inspectable.
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("adds a reason for an invalid intent", () => {
    const plan = createInstallerWriteExecutionPlan(
      input({ intent: "delete" as InstallerWriteExecutionPlanInput["intent"] }),
    );
    expect(plan.reasons).toContain("write_execution_intent_invalid");
    // An unknown intent maps no steps.
    expect(plan.reasons).toContain("write_execution_steps_empty");
  });

  it("adds a reason when no steps map", () => {
    const plan = createInstallerWriteExecutionPlan(
      input({
        intent: "install",
        installOperations: [],
      }),
    );
    expect(plan.reasons).toContain("write_execution_steps_empty");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const plan = createInstallerWriteExecutionPlan(
      input({
        intent: "delete" as InstallerWriteExecutionPlanInput["intent"],
        capability: blockedCapability,
        installOperations: [],
      }),
    );
    expect(plan.reasons).toEqual([
      "write_execution_capability_not_allowed",
      "write_execution_intent_invalid",
      "write_execution_steps_empty",
    ]);
    expect(new Set(plan.reasons).size).toBe(plan.reasons.length);
  });

  it("is ok with allowed capability and non-empty steps", () => {
    const plan = createInstallerWriteExecutionPlan(input({ intent: "install" }));
    expect(plan.ok).toBe(true);
    expect(plan.reasons).toEqual([]);
    expect(plan.intent).toBe("install");
  });

  it("carries no content, command, destination, adapter, or execution-result fields", () => {
    const plan = createInstallerWriteExecutionPlan(input({ intent: "install" }));
    for (const step of plan.steps) {
      for (const key of Object.keys(step)) {
        expect(key).not.toMatch(/content|command|dest|adapter|writer|result|remote|url/i);
      }
    }
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("backupFile");
    expect(serialized).not.toContain("removeFile");
    expect(serialized).not.toContain("executeInstall");
  });
});

describe("createInstallerWriteExecutionPlanDryRun", () => {
  it("omits warnings for a valid plan", () => {
    const dryRun = createInstallerWriteExecutionPlanDryRun(input({ intent: "install" }));
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for an invalid plan", () => {
    const dryRun = createInstallerWriteExecutionPlanDryRun(
      input({ capability: blockedCapability }),
    );
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "write_execution_capability_not_allowed"),
    ).toBe(true);
  });
});

describe("exampleInstallerWriteExecutionPlanInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerWriteExecutionPlanInput()).toEqual(
      exampleInstallerWriteExecutionPlanInput(),
    );
  });

  it("produces a valid dry run with at least one install step", () => {
    const dryRun = createInstallerWriteExecutionPlanDryRun(
      exampleInstallerWriteExecutionPlanInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.plan.steps.length).toBeGreaterThan(0);
    expect(dryRun.plan.steps.every((step) => step.kind.startsWith("install-"))).toBe(true);
  });
});
