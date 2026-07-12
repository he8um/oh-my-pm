import { describe, expect, it } from "vitest";
import {
  collectRequiredWriteAdapterCapabilities,
  createInstallerWriteAdapterContractDryRun,
  evaluateInstallerWriteAdapterContract,
  exampleInstallerWriteAdapterContractInput,
  mapWriteStepKindToAdapterCapability,
  validateInstallerWriteAdapterCapability,
  validateInstallerWriteAdapterContract,
} from "../src/index.js";
import type {
  InstallerWriteAdapterContract,
  InstallerWriteAdapterContractInput,
  InstallerWriteExecutionPlan,
  InstallerWriteExecutionPlanStep,
  InstallerWriteExecutionPlanStepKind,
} from "../src/index.js";

const ALL_STEP_KINDS: InstallerWriteExecutionPlanStepKind[] = [
  "install-create",
  "install-replace",
  "install-remove",
  "install-backup",
  "update-create",
  "update-replace",
  "update-remove",
  "rollback-restore",
  "rollback-remove",
];

function planWithKinds(kinds: InstallerWriteExecutionPlanStepKind[]): InstallerWriteExecutionPlan {
  const steps: InstallerWriteExecutionPlanStep[] = kinds.map((kind, index) => ({
    sequence: index + 1,
    kind,
    path: `path/${index}`,
  }));
  return { ok: true, intent: "install", steps, reasons: [] };
}

function input(
  overrides: Partial<InstallerWriteAdapterContractInput> = {},
): InstallerWriteAdapterContractInput {
  return { ...exampleInstallerWriteAdapterContractInput(), ...overrides };
}

describe("validateInstallerWriteAdapterCapability", () => {
  it("accepts the supported capabilities", () => {
    expect(validateInstallerWriteAdapterCapability("write-file")).toBe(true);
    expect(validateInstallerWriteAdapterCapability("remove-file")).toBe(true);
    expect(validateInstallerWriteAdapterCapability("backup-file")).toBe(true);
  });

  it("rejects an unsupported capability", () => {
    expect(validateInstallerWriteAdapterCapability("read-file")).toBe(false);
    expect(validateInstallerWriteAdapterCapability("")).toBe(false);
  });
});

describe("validateInstallerWriteAdapterContract", () => {
  const valid: InstallerWriteAdapterContract = {
    name: "memory-write-adapter",
    capabilities: ["write-file", "remove-file", "backup-file"],
    requiresExplicitApproval: true,
    supportsRollbackCapture: true,
  };

  it("passes a valid contract", () => {
    expect(validateInstallerWriteAdapterContract(valid)).toEqual([]);
  });

  it("flags a missing name", () => {
    expect(validateInstallerWriteAdapterContract({ ...valid, name: "" })).toContain(
      "write_adapter_contract_name_missing",
    );
  });

  it("flags empty capabilities", () => {
    expect(validateInstallerWriteAdapterContract({ ...valid, capabilities: [] })).toContain(
      "write_adapter_contract_capabilities_empty",
    );
  });

  it("flags an invalid capability", () => {
    expect(
      validateInstallerWriteAdapterContract({
        ...valid,
        capabilities: ["write-file", "boom" as InstallerWriteAdapterContract["capabilities"][number]],
      }),
    ).toContain("write_adapter_contract_capability_invalid");
  });

  it("flags a contract that does not require explicit approval", () => {
    expect(
      validateInstallerWriteAdapterContract({ ...valid, requiresExplicitApproval: false }),
    ).toContain("write_adapter_contract_explicit_approval_required");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const reasons = validateInstallerWriteAdapterContract({
      name: "",
      capabilities: ["boom" as InstallerWriteAdapterContract["capabilities"][number]],
      requiresExplicitApproval: false,
      supportsRollbackCapture: false,
    });
    expect(reasons).toEqual([
      "write_adapter_contract_name_missing",
      "write_adapter_contract_capability_invalid",
      "write_adapter_contract_explicit_approval_required",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe("mapWriteStepKindToAdapterCapability", () => {
  it("maps every write step kind", () => {
    expect(ALL_STEP_KINDS.map((kind) => mapWriteStepKindToAdapterCapability(kind))).toEqual([
      "write-file",
      "write-file",
      "remove-file",
      "backup-file",
      "write-file",
      "write-file",
      "remove-file",
      "write-file",
      "remove-file",
    ]);
  });
});

describe("collectRequiredWriteAdapterCapabilities", () => {
  it("dedupes in first-occurrence order", () => {
    const required = collectRequiredWriteAdapterCapabilities(
      input({ executionPlan: planWithKinds(ALL_STEP_KINDS) }),
    );
    expect(required).toEqual(["write-file", "remove-file", "backup-file"]);
  });

  it("does not mutate its input", () => {
    const base = input({ executionPlan: planWithKinds(ALL_STEP_KINDS) });
    const snapshot = structuredClone(base);
    collectRequiredWriteAdapterCapabilities(base);
    expect(base).toEqual(snapshot);
  });
});

describe("evaluateInstallerWriteAdapterContract", () => {
  it("adds a reason for an invalid contract", () => {
    const base = input();
    const report = evaluateInstallerWriteAdapterContract({
      ...base,
      contract: { ...base.contract, name: "" },
    });
    expect(report.ok).toBe(false);
    expect(report.reasons).toContain("write_adapter_contract_invalid");
  });

  it("adds a reason when confirmation is not ready", () => {
    const base = input();
    const report = evaluateInstallerWriteAdapterContract({
      ...base,
      confirmation: { ...base.confirmation, ok: false },
    });
    expect(report.reasons).toContain("write_adapter_confirmation_not_ready");
  });

  it("adds a reason when the execution plan is not ready", () => {
    const base = input();
    const report = evaluateInstallerWriteAdapterContract({
      ...base,
      executionPlan: { ...base.executionPlan, ok: false },
    });
    expect(report.reasons).toContain("write_adapter_execution_plan_not_ready");
  });

  it("adds a reason when no capabilities are required", () => {
    const base = input();
    const report = evaluateInstallerWriteAdapterContract({
      ...base,
      executionPlan: { ...base.executionPlan, steps: [] },
    });
    expect(report.reasons).toContain("write_adapter_required_capabilities_empty");
  });

  it("adds a reason when a required capability is not declared", () => {
    const base = input({ executionPlan: planWithKinds(["install-remove"]) });
    const report = evaluateInstallerWriteAdapterContract({
      ...base,
      contract: { ...base.contract, capabilities: ["write-file"] },
    });
    expect(report.reasons).toContain("write_adapter_capability_missing");
  });

  it("adds a reason when backup is required but rollback capture is unsupported", () => {
    const base = input({ executionPlan: planWithKinds(["install-backup"]) });
    const report = evaluateInstallerWriteAdapterContract({
      ...base,
      contract: {
        ...base.contract,
        capabilities: ["write-file", "remove-file", "backup-file"],
        supportsRollbackCapture: false,
      },
    });
    expect(report.reasons).toContain("write_adapter_rollback_capture_not_supported");
  });

  it("orders reasons deterministically when several checks fail at once", () => {
    const report = evaluateInstallerWriteAdapterContract({
      contract: {
        name: "",
        capabilities: ["write-file"],
        requiresExplicitApproval: false,
        supportsRollbackCapture: false,
      },
      confirmation: {
        ok: false,
        intent: "install",
        items: [],
        reasons: ["x"],
      },
      executionPlan: { ...planWithKinds(["install-backup"]), ok: false },
    });
    expect(report.reasons).toEqual([
      "write_adapter_contract_invalid",
      "write_adapter_confirmation_not_ready",
      "write_adapter_execution_plan_not_ready",
      "write_adapter_capability_missing",
      "write_adapter_rollback_capture_not_supported",
    ]);
    expect(new Set(report.reasons).size).toBe(report.reasons.length);
  });

  it("is ok for the valid fixture", () => {
    const report = evaluateInstallerWriteAdapterContract(exampleInstallerWriteAdapterContractInput());
    expect(report.ok).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.name).toBe("memory-write-adapter");
  });

  it("carries no adapter object, function, content, command, or execution-result fields", () => {
    const report = evaluateInstallerWriteAdapterContract(exampleInstallerWriteAdapterContractInput());
    for (const key of Object.keys(report)) {
      expect(key).not.toMatch(/adapter$|object|fn|func|method|content|command|dest|result|remote|url/i);
    }
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
  });
});

describe("createInstallerWriteAdapterContractDryRun", () => {
  it("omits warnings for an ok report", () => {
    const dryRun = createInstallerWriteAdapterContractDryRun(
      exampleInstallerWriteAdapterContractInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for an invalid report", () => {
    const base = input();
    const dryRun = createInstallerWriteAdapterContractDryRun({
      ...base,
      confirmation: { ...base.confirmation, ok: false },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "write_adapter_confirmation_not_ready"),
    ).toBe(true);
  });
});

describe("exampleInstallerWriteAdapterContractInput", () => {
  it("is deterministic", () => {
    expect(exampleInstallerWriteAdapterContractInput()).toEqual(
      exampleInstallerWriteAdapterContractInput(),
    );
  });

  it("produces an ok dry run", () => {
    const dryRun = createInstallerWriteAdapterContractDryRun(
      exampleInstallerWriteAdapterContractInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.report.declaredCapabilities).toHaveLength(3);
  });
});
