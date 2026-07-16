import { describe, expect, it } from "vitest";
import {
  collectRequiredLocalArtifactCreationAdapterCapabilities,
  createLocalArtifactCreationAdapterContractDryRun,
  evaluateLocalArtifactCreationAdapterContract,
  exampleLocalArtifactCreationAdapterContractInput,
  formatLocalArtifactCreationAdapterContractMarkdown,
  mapLocalArtifactCreationStepToAdapterCapability,
  validateLocalArtifactCreationAdapterCapability,
  validateLocalArtifactCreationAdapterContract,
} from "../src/index.js";
import type {
  LocalArtifactCreationAdapterCapability,
  LocalArtifactCreationAdapterContract,
  LocalArtifactCreationAdapterContractInput,
  LocalArtifactCreationExecutionPlanStep,
} from "../src/index.js";

function input(
  overrides: Partial<LocalArtifactCreationAdapterContractInput> = {},
): LocalArtifactCreationAdapterContractInput {
  return { ...exampleLocalArtifactCreationAdapterContractInput(), ...overrides };
}

function contract(
  overrides: Partial<LocalArtifactCreationAdapterContract> = {},
): LocalArtifactCreationAdapterContract {
  return { ...exampleLocalArtifactCreationAdapterContractInput().contract, ...overrides };
}

/** Rebuild the input with the execution plan steps replaced. */
function withSteps(
  base: LocalArtifactCreationAdapterContractInput,
  steps: LocalArtifactCreationExecutionPlanStep[],
): LocalArtifactCreationAdapterContractInput {
  return { ...base, executionPlan: { ...base.executionPlan, steps } };
}

describe("validateLocalArtifactCreationAdapterCapability", () => {
  it("accepts the supported capabilities", () => {
    for (const capability of ["write-text-output", "write-binary-output"]) {
      expect(validateLocalArtifactCreationAdapterCapability(capability)).toBe(true);
    }
  });

  it("rejects unsupported capabilities", () => {
    for (const capability of ["", "write-file", "remove-file", "WRITE-TEXT-OUTPUT"]) {
      expect(validateLocalArtifactCreationAdapterCapability(capability)).toBe(false);
    }
  });
});

describe("validateLocalArtifactCreationAdapterContract", () => {
  it("returns no reasons for the example contract", () => {
    expect(validateLocalArtifactCreationAdapterContract(contract())).toEqual([]);
  });

  it("flags a missing name", () => {
    expect(validateLocalArtifactCreationAdapterContract(contract({ name: "  " }))).toEqual([
      "local_artifact_adapter_contract_name_missing",
    ]);
  });

  it("flags empty capabilities", () => {
    expect(validateLocalArtifactCreationAdapterContract(contract({ capabilities: [] }))).toEqual([
      "local_artifact_adapter_contract_capabilities_empty",
    ]);
  });

  it("flags an invalid capability", () => {
    expect(
      validateLocalArtifactCreationAdapterContract(
        contract({
          capabilities: [
            "write-text-output",
            "write-file" as LocalArtifactCreationAdapterCapability,
          ],
        }),
      ),
    ).toEqual(["local_artifact_adapter_contract_capability_invalid"]);
  });

  it("flags a contract without dry-run support", () => {
    expect(
      validateLocalArtifactCreationAdapterContract(contract({ supportsDryRun: false })),
    ).toEqual(["local_artifact_adapter_contract_dry_run_required"]);
  });

  it("flags a contract that does not require explicit permission", () => {
    expect(
      validateLocalArtifactCreationAdapterContract(
        contract({ requiresExplicitPermission: false }),
      ),
    ).toEqual(["local_artifact_adapter_contract_explicit_permission_required"]);
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const reasons = validateLocalArtifactCreationAdapterContract({
      name: "",
      capabilities: [],
      supportsDryRun: false,
      requiresExplicitPermission: false,
    });
    expect(reasons).toEqual([
      "local_artifact_adapter_contract_name_missing",
      "local_artifact_adapter_contract_capabilities_empty",
      "local_artifact_adapter_contract_dry_run_required",
      "local_artifact_adapter_contract_explicit_permission_required",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe("mapLocalArtifactCreationStepToAdapterCapability", () => {
  it("maps all six step kinds", () => {
    expect(mapLocalArtifactCreationStepToAdapterCapability("prepare-release-notes")).toBe(
      "write-text-output",
    );
    expect(mapLocalArtifactCreationStepToAdapterCapability("prepare-package-manifest")).toBe(
      "write-text-output",
    );
    expect(mapLocalArtifactCreationStepToAdapterCapability("prepare-archive")).toBe(
      "write-binary-output",
    );
    expect(mapLocalArtifactCreationStepToAdapterCapability("prepare-release-metadata")).toBe(
      "write-text-output",
    );
    expect(mapLocalArtifactCreationStepToAdapterCapability("prepare-integrity-metadata")).toBe(
      "write-text-output",
    );
    expect(mapLocalArtifactCreationStepToAdapterCapability("prepare-channel-metadata")).toBe(
      "write-text-output",
    );
  });
});

describe("collectRequiredLocalArtifactCreationAdapterCapabilities", () => {
  it("collects planned step capabilities deduped in first-occurrence order", () => {
    const required = collectRequiredLocalArtifactCreationAdapterCapabilities(input());
    expect(required).toEqual(["write-text-output", "write-binary-output"]);
  });

  it("ignores blocked steps", () => {
    const base = input();
    const steps = base.executionPlan.steps.map((step) =>
      step.kind === "prepare-archive" ? { ...step, planned: false, reason: "blocked" } : step,
    );
    expect(
      collectRequiredLocalArtifactCreationAdapterCapabilities(withSteps(base, steps)),
    ).toEqual(["write-text-output"]);
  });

  it("puts binary output first when the archive step leads", () => {
    const base = input();
    const archiveStep = base.executionPlan.steps.find((step) => step.kind === "prepare-archive");
    const textStep = base.executionPlan.steps.find(
      (step) => step.kind === "prepare-release-notes",
    );
    expect(archiveStep).toBeDefined();
    expect(textStep).toBeDefined();
    const reordered = withSteps(base, [
      archiveStep as LocalArtifactCreationExecutionPlanStep,
      textStep as LocalArtifactCreationExecutionPlanStep,
    ]);
    expect(collectRequiredLocalArtifactCreationAdapterCapabilities(reordered)).toEqual([
      "write-binary-output",
      "write-text-output",
    ]);
  });

  it("returns an empty list when no step is planned", () => {
    const base = input();
    const steps = base.executionPlan.steps.map((step) => ({
      ...step,
      planned: false,
      reason: "blocked",
    }));
    expect(collectRequiredLocalArtifactCreationAdapterCapabilities(withSteps(base, steps))).toEqual(
      [],
    );
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    collectRequiredLocalArtifactCreationAdapterCapabilities(base);
    expect(base).toEqual(snapshot);
  });
});

describe("evaluateLocalArtifactCreationAdapterContract", () => {
  it("is ok for the ready fixture while creation stays disallowed", () => {
    const report = evaluateLocalArtifactCreationAdapterContract(input());
    expect(report.ok).toBe(true);
    expect(report.name).toBe("memory-artifact-adapter");
    expect(report.requiredCapabilities).toEqual(["write-text-output", "write-binary-output"]);
    expect(report.declaredCapabilities).toEqual(["write-text-output", "write-binary-output"]);
    expect(report.reasons).toEqual([]);
    expect(report.creationAllowed).toBe(false);
  });

  it("flags an invalid contract", () => {
    const report = evaluateLocalArtifactCreationAdapterContract(
      input({ contract: contract({ supportsDryRun: false }) }),
    );
    expect(report.reasons).toEqual(["local_artifact_adapter_contract_invalid"]);
    expect(report.ok).toBe(false);
  });

  it("flags a not-allowed permission", () => {
    const base = input();
    const report = evaluateLocalArtifactCreationAdapterContract({
      ...base,
      permission: { ...base.permission, allowed: false },
    });
    expect(report.reasons).toEqual(["local_artifact_adapter_permission_not_allowed"]);
    expect(report.ok).toBe(false);
  });

  it("flags a not-ready execution plan", () => {
    const base = input();
    const report = evaluateLocalArtifactCreationAdapterContract({
      ...base,
      executionPlan: { ...base.executionPlan, ok: false },
    });
    expect(report.reasons).toEqual(["local_artifact_adapter_execution_plan_not_ready"]);
    expect(report.ok).toBe(false);
  });

  it("flags empty required capabilities", () => {
    const base = input();
    const steps = base.executionPlan.steps.map((step) => ({
      ...step,
      planned: false,
      reason: "blocked",
    }));
    const report = evaluateLocalArtifactCreationAdapterContract(withSteps(base, steps));
    expect(report.reasons).toContain("local_artifact_adapter_required_capabilities_empty");
    expect(report.ok).toBe(false);
  });

  it("flags a missing declared capability", () => {
    const report = evaluateLocalArtifactCreationAdapterContract(
      input({ contract: contract({ capabilities: ["write-text-output"] }) }),
    );
    expect(report.reasons).toEqual(["local_artifact_adapter_capability_missing"]);
    expect(report.ok).toBe(false);
  });

  it("returns evaluation reasons in the fixed order with each reason at most once", () => {
    const base = input();
    const steps = base.executionPlan.steps.map((step) => ({
      ...step,
      planned: false,
      reason: "blocked",
    }));
    const report = evaluateLocalArtifactCreationAdapterContract(
      withSteps(
        {
          ...base,
          contract: contract({ name: "" }),
          permission: { ...base.permission, allowed: false },
          executionPlan: { ...base.executionPlan, ok: false },
        },
        steps,
      ),
    );
    expect(report.reasons).toEqual([
      "local_artifact_adapter_contract_invalid",
      "local_artifact_adapter_permission_not_allowed",
      "local_artifact_adapter_execution_plan_not_ready",
      "local_artifact_adapter_required_capabilities_empty",
    ]);
    expect(new Set(report.reasons).size).toBe(report.reasons.length);
  });

  it("keeps creationAllowed false even when ok", () => {
    expect(evaluateLocalArtifactCreationAdapterContract(input()).creationAllowed).toBe(false);
    const base = input();
    expect(
      evaluateLocalArtifactCreationAdapterContract({
        ...base,
        permission: { ...base.permission, allowed: false },
      }).creationAllowed,
    ).toBe(false);
  });

  it("carries no adapter object, function, content, bytes, output path, destination, command, target, URL, or result field", () => {
    const report = evaluateLocalArtifactCreationAdapterContract(input());
    for (const key of Object.keys(report)) {
      expect(key).not.toMatch(
        /object|fn|func|method|content|bytes|path|dest|command|target|publish|url|result|remote|download|upload/i,
      );
    }
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(Object.values(report).some((value) => typeof value === "function")).toBe(false);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    evaluateLocalArtifactCreationAdapterContract(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createLocalArtifactCreationAdapterContractDryRun", () => {
  it("omits warnings for a passing contract", () => {
    const dryRun = createLocalArtifactCreationAdapterContractDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked contract", () => {
    const dryRun = createLocalArtifactCreationAdapterContractDryRun(
      input({ contract: contract({ capabilities: ["write-text-output"] }) }),
    );
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some(
        (warning) => warning.message === "local_artifact_adapter_capability_missing",
      ),
    ).toBe(true);
  });
});

describe("formatLocalArtifactCreationAdapterContractMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const report = evaluateLocalArtifactCreationAdapterContract(input());
    const markdown = formatLocalArtifactCreationAdapterContractMarkdown(report);
    expect(markdown).toBe(formatLocalArtifactCreationAdapterContractMarkdown(report));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("renders name, ready status, creation-allowed false, capabilities, and `- none` reasons", () => {
    const markdown = formatLocalArtifactCreationAdapterContractMarkdown(
      evaluateLocalArtifactCreationAdapterContract(input()),
    );
    expect(markdown).toContain("# OH MY PM Local Artifact Creation Adapter Contract");
    expect(markdown).toContain("Name: `memory-artifact-adapter`");
    expect(markdown).toContain("Status: `ready`");
    expect(markdown).toContain("Creation allowed: `false`");
    expect(markdown).toContain("- Required: `write-text-output`");
    expect(markdown).toContain("- Required: `write-binary-output`");
    expect(markdown).toContain("- Declared: `write-text-output`");
    expect(markdown).toContain("- Declared: `write-binary-output`");
    expect(markdown).toContain("- none");
    expect(markdown).not.toMatch(/https?:\/\//);
    expect(markdown).not.toMatch(/output path|destination/i);
  });

  it("renders a blocked status, `- none` for empty capability groups, and reason lines", () => {
    const base = input();
    const steps = base.executionPlan.steps.map((step) => ({
      ...step,
      planned: false,
      reason: "blocked",
    }));
    const markdown = formatLocalArtifactCreationAdapterContractMarkdown(
      evaluateLocalArtifactCreationAdapterContract(
        withSteps({ ...base, contract: contract({ capabilities: [] }) }, steps),
      ),
    );
    expect(markdown).toContain("Status: `blocked`");
    expect(markdown).not.toContain("- Required:");
    expect(markdown).not.toContain("- Declared:");
    expect(markdown).toContain("- none");
    expect(markdown).toContain("- `local_artifact_adapter_contract_invalid`");
    expect(markdown).toContain("- `local_artifact_adapter_required_capabilities_empty`");
  });
});

describe("exampleLocalArtifactCreationAdapterContractInput", () => {
  it("is deterministic", () => {
    expect(exampleLocalArtifactCreationAdapterContractInput()).toEqual(
      exampleLocalArtifactCreationAdapterContractInput(),
    );
  });

  it("stays consistent with the source fixture statuses", () => {
    const fixture = exampleLocalArtifactCreationAdapterContractInput();
    expect(fixture.permission.allowed).toBe(true);
    expect(fixture.executionPlan.ok).toBe(true);
    const dryRun = createLocalArtifactCreationAdapterContractDryRun(fixture);
    expect(dryRun.ok).toBe(true);
    expect(dryRun.report.creationAllowed).toBe(false);
  });

  it("declares metadata only: no adapter instance, function, or method", () => {
    const fixture = exampleLocalArtifactCreationAdapterContractInput();
    const values = [
      ...Object.values(fixture.contract),
      ...Object.values(fixture.permission),
      ...Object.values(fixture.executionPlan),
    ];
    expect(values.some((value) => typeof value === "function")).toBe(false);
  });
});
