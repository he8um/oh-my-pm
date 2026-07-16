import { describe, expect, it } from "vitest";
import {
  createLocalArtifactCreationConfirmationChecklist,
  createLocalArtifactCreationConfirmationChecklistDryRun,
  createLocalArtifactCreationConfirmationChecklistItems,
  exampleLocalArtifactCreationConfirmationChecklistInput,
  formatLocalArtifactCreationConfirmationChecklistMarkdown,
} from "../src/index.js";
import type {
  LocalArtifactCreationConfirmationChecklistInput,
  LocalArtifactCreationConfirmationChecklistItemId,
} from "../src/index.js";

function input(
  overrides: Partial<LocalArtifactCreationConfirmationChecklistInput> = {},
): LocalArtifactCreationConfirmationChecklistInput {
  return { ...exampleLocalArtifactCreationConfirmationChecklistInput(), ...overrides };
}

const ITEM_IDS: LocalArtifactCreationConfirmationChecklistItemId[] = [
  "version-present",
  "permission-allowed",
  "execution-plan-ready",
  "execution-steps-present",
  "adapter-contract-ready",
  "required-capabilities-present",
  "creation-remains-disabled",
];

const ITEM_LABELS = [
  "Artifact version is present",
  "Guarded artifact creation permission is allowed",
  "Local artifact creation execution plan is ready",
  "Local artifact creation execution steps are present",
  "Local artifact creation adapter contract is ready",
  "Required artifact adapter capabilities are present",
  "Artifact creation remains disabled in this phase",
];

function itemById(
  base: LocalArtifactCreationConfirmationChecklistInput,
  id: LocalArtifactCreationConfirmationChecklistItemId,
) {
  return createLocalArtifactCreationConfirmationChecklistItems(base).find(
    (item) => item.id === id,
  );
}

describe("createLocalArtifactCreationConfirmationChecklistItems", () => {
  it("builds items in the exact fixed order with stable labels", () => {
    const items = createLocalArtifactCreationConfirmationChecklistItems(input());
    expect(items.map((item) => item.id)).toEqual(ITEM_IDS);
    expect(items.map((item) => item.label)).toEqual(ITEM_LABELS);
  });

  it("flags a missing version", () => {
    const item = itemById(input({ version: "  " }), "version-present");
    expect(item?.ok).toBe(false);
    expect(item?.reason).toBe("local_artifact_confirmation_version_missing");
  });

  it("flags a not-allowed permission", () => {
    const base = input();
    const item = itemById(
      { ...base, permission: { ...base.permission, allowed: false } },
      "permission-allowed",
    );
    expect(item?.ok).toBe(false);
    expect(item?.reason).toBe("local_artifact_confirmation_permission_not_allowed");
  });

  it("flags a not-ready execution plan", () => {
    const base = input();
    const item = itemById(
      { ...base, executionPlan: { ...base.executionPlan, ok: false } },
      "execution-plan-ready",
    );
    expect(item?.ok).toBe(false);
    expect(item?.reason).toBe("local_artifact_confirmation_execution_plan_not_ready");
  });

  it("flags empty execution steps", () => {
    const base = input();
    const item = itemById(
      { ...base, executionPlan: { ...base.executionPlan, steps: [] } },
      "execution-steps-present",
    );
    expect(item?.ok).toBe(false);
    expect(item?.reason).toBe("local_artifact_confirmation_execution_steps_empty");
  });

  it("flags a not-ready adapter contract", () => {
    const base = input();
    const item = itemById(
      { ...base, adapterContract: { ...base.adapterContract, ok: false } },
      "adapter-contract-ready",
    );
    expect(item?.ok).toBe(false);
    expect(item?.reason).toBe("local_artifact_confirmation_adapter_contract_not_ready");
  });

  it("flags empty required capabilities", () => {
    const base = input();
    const item = itemById(
      { ...base, adapterContract: { ...base.adapterContract, requiredCapabilities: [] } },
      "required-capabilities-present",
    );
    expect(item?.ok).toBe(false);
    expect(item?.reason).toBe("local_artifact_confirmation_required_capabilities_empty");
  });

  it("passes the creation-remains-disabled item for the standard fixture chain", () => {
    const item = itemById(input(), "creation-remains-disabled");
    expect(item?.ok).toBe(true);
    expect(item?.reason).toBeUndefined();
  });

  it("fails the creation-remains-disabled item when any source creationAllowed is forced true", () => {
    const base = input();
    const malformed = [
      { ...base, permission: { ...base.permission, creationAllowed: true } },
      {
        ...base,
        executionPlan: {
          ...base.executionPlan,
          summary: { ...base.executionPlan.summary, creationAllowed: true },
        },
      },
      { ...base, adapterContract: { ...base.adapterContract, creationAllowed: true } },
    ] as unknown as LocalArtifactCreationConfirmationChecklistInput[];
    for (const candidate of malformed) {
      const item = itemById(candidate, "creation-remains-disabled");
      expect(item?.ok).toBe(false);
      expect(item?.reason).toBe("local_artifact_confirmation_creation_must_remain_disabled");
    }
  });

  it("omits reason on passed items and carries only the specified reason on failed items", () => {
    const base = input();
    const items = createLocalArtifactCreationConfirmationChecklistItems({
      ...base,
      version: "",
      permission: { ...base.permission, allowed: false },
    });
    for (const item of items) {
      if (item.ok) {
        expect(item.reason).toBeUndefined();
      } else {
        expect(item.reason).toMatch(/^local_artifact_confirmation_/);
      }
    }
    expect(items.filter((item) => !item.ok).map((item) => item.reason)).toEqual([
      "local_artifact_confirmation_version_missing",
      "local_artifact_confirmation_permission_not_allowed",
    ]);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createLocalArtifactCreationConfirmationChecklistItems(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createLocalArtifactCreationConfirmationChecklist", () => {
  it("is ready only when all items pass, while creation stays disallowed", () => {
    const checklist = createLocalArtifactCreationConfirmationChecklist(input());
    expect(checklist.ok).toBe(true);
    expect(checklist.version).toBe("v0.1.0");
    expect(checklist.items.every((item) => item.ok)).toBe(true);
    expect(checklist.reasons).toEqual([]);
    expect(checklist.creationAllowed).toBe(false);

    const blocked = createLocalArtifactCreationConfirmationChecklist(input({ version: "" }));
    expect(blocked.ok).toBe(false);
  });

  it("collects reasons in item order with each reason at most once", () => {
    const base = input();
    const checklist = createLocalArtifactCreationConfirmationChecklist({
      ...base,
      version: "",
      permission: { ...base.permission, allowed: false },
      executionPlan: { ...base.executionPlan, ok: false, steps: [] },
      adapterContract: { ...base.adapterContract, ok: false, requiredCapabilities: [] },
    });
    expect(checklist.reasons).toEqual([
      "local_artifact_confirmation_version_missing",
      "local_artifact_confirmation_permission_not_allowed",
      "local_artifact_confirmation_execution_plan_not_ready",
      "local_artifact_confirmation_execution_steps_empty",
      "local_artifact_confirmation_adapter_contract_not_ready",
      "local_artifact_confirmation_required_capabilities_empty",
    ]);
    expect(new Set(checklist.reasons).size).toBe(checklist.reasons.length);
  });

  it("does not copy raw source-report reasons", () => {
    const base = input();
    const checklist = createLocalArtifactCreationConfirmationChecklist({
      ...base,
      permission: {
        ...base.permission,
        allowed: false,
        reasons: ["artifact_creation_permission_not_approved"],
      },
      executionPlan: {
        ...base.executionPlan,
        ok: false,
        reasons: ["local_artifact_creation_permission_not_allowed"],
      },
      adapterContract: {
        ...base.adapterContract,
        ok: false,
        reasons: ["local_artifact_adapter_capability_missing"],
      },
    });
    expect(checklist.reasons).not.toContain("artifact_creation_permission_not_approved");
    expect(checklist.reasons).not.toContain("local_artifact_creation_permission_not_allowed");
    expect(checklist.reasons).not.toContain("local_artifact_adapter_capability_missing");
    expect(checklist.reasons.every((reason) => reason.startsWith("local_artifact_confirmation_"))).toBe(
      true,
    );
  });

  it("keeps creationAllowed false whether ready or blocked", () => {
    expect(createLocalArtifactCreationConfirmationChecklist(input()).creationAllowed).toBe(false);
    expect(
      createLocalArtifactCreationConfirmationChecklist(input({ version: "" })).creationAllowed,
    ).toBe(false);
  });

  it("carries no adapter object, function, method, content, bytes, output path, destination, command, target, URL, or result field", () => {
    const checklist = createLocalArtifactCreationConfirmationChecklist(input());
    for (const key of Object.keys(checklist)) {
      expect(key).not.toMatch(
        /adapter|object|fn|func|method|content|bytes|path|dest|command|target|publish|url|result|remote|download|upload/i,
      );
    }
    const serialized = JSON.stringify(checklist);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(Object.values(checklist).some((value) => typeof value === "function")).toBe(false);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createLocalArtifactCreationConfirmationChecklist(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createLocalArtifactCreationConfirmationChecklistDryRun", () => {
  it("omits warnings for a ready checklist", () => {
    const dryRun = createLocalArtifactCreationConfirmationChecklistDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked checklist", () => {
    const dryRun = createLocalArtifactCreationConfirmationChecklistDryRun(input({ version: "" }));
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some(
        (warning) => warning.message === "local_artifact_confirmation_version_missing",
      ),
    ).toBe(true);
  });
});

describe("formatLocalArtifactCreationConfirmationChecklistMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const checklist = createLocalArtifactCreationConfirmationChecklist(input());
    const markdown = formatLocalArtifactCreationConfirmationChecklistMarkdown(checklist);
    expect(markdown).toBe(formatLocalArtifactCreationConfirmationChecklistMarkdown(checklist));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("renders a ready checklist with checkbox lines and `- none` reasons", () => {
    const markdown = formatLocalArtifactCreationConfirmationChecklistMarkdown(
      createLocalArtifactCreationConfirmationChecklist(input()),
    );
    expect(markdown).toContain("# OH MY PM Local Artifact Creation Confirmation Checklist");
    expect(markdown).toContain("Version: `v0.1.0`");
    expect(markdown).toContain("Status: `ready`");
    expect(markdown).toContain("Creation allowed: `false`");
    expect(markdown).toContain("- `[x]` `version-present` — Artifact version is present");
    expect(markdown).toContain(
      "- `[x]` `creation-remains-disabled` — Artifact creation remains disabled in this phase",
    );
    expect(markdown).not.toContain("- `[ ]`");
    expect(markdown).toContain("- none");
    expect(markdown).not.toMatch(/https?:\/\//);
    expect(markdown).not.toMatch(/output path|destination/i);
  });

  it("renders a blocked checklist with failed checkbox lines and reason lines", () => {
    const markdown = formatLocalArtifactCreationConfirmationChecklistMarkdown(
      createLocalArtifactCreationConfirmationChecklist(input({ version: "" })),
    );
    expect(markdown).toContain("Status: `blocked`");
    expect(markdown).toContain(
      "- `[ ]` `version-present` — Artifact version is present — reason: `local_artifact_confirmation_version_missing`",
    );
    expect(markdown).toContain("- `local_artifact_confirmation_version_missing`");
    expect(markdown).not.toContain("- none");
  });
});

describe("exampleLocalArtifactCreationConfirmationChecklistInput", () => {
  it("is deterministic", () => {
    expect(exampleLocalArtifactCreationConfirmationChecklistInput()).toEqual(
      exampleLocalArtifactCreationConfirmationChecklistInput(),
    );
  });

  it("keeps its dry-run consistent with the source fixture statuses", () => {
    const fixture = exampleLocalArtifactCreationConfirmationChecklistInput();
    const dryRun = createLocalArtifactCreationConfirmationChecklistDryRun(fixture);
    const sourcesReady =
      fixture.version.trim().length > 0 &&
      fixture.permission.allowed &&
      fixture.executionPlan.ok &&
      fixture.executionPlan.steps.length > 0 &&
      fixture.adapterContract.ok &&
      fixture.adapterContract.requiredCapabilities.length > 0;
    expect(dryRun.ok).toBe(sourcesReady);
    expect(dryRun.checklist.creationAllowed).toBe(false);
    expect(fixture.permission.creationAllowed).toBe(false);
    expect(fixture.executionPlan.summary.creationAllowed).toBe(false);
    expect(fixture.adapterContract.creationAllowed).toBe(false);
  });

  it("performs no adapter call and no filesystem mutation: everything is plain data", () => {
    const fixture = exampleLocalArtifactCreationConfirmationChecklistInput();
    const values = [
      ...Object.values(fixture.permission),
      ...Object.values(fixture.executionPlan),
      ...Object.values(fixture.adapterContract),
    ];
    expect(values.some((value) => typeof value === "function")).toBe(false);
    // The fixture round-trips through JSON unchanged, so it holds no adapter
    // instance, method, or other live handle that could touch a filesystem.
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
  });
});
