import { describe, expect, it } from "vitest";
import {
  collectLocalArtifactCreationExecutionPlanReasons,
  createLocalArtifactCreationExecutionPlan,
  createLocalArtifactCreationExecutionPlanDryRun,
  createLocalArtifactCreationExecutionPlanSteps,
  exampleLocalArtifactCreationExecutionPlanInput,
  formatLocalArtifactCreationExecutionPlanMarkdown,
  summarizeLocalArtifactCreationExecutionPlan,
} from "../src/index.js";
import type {
  GuardedReleaseArtifactPlanItem,
  LocalArtifactCreationExecutionPlanInput,
} from "../src/index.js";

function input(
  overrides: Partial<LocalArtifactCreationExecutionPlanInput> = {},
): LocalArtifactCreationExecutionPlanInput {
  return { ...exampleLocalArtifactCreationExecutionPlanInput(), ...overrides };
}

/** Rebuild the input with the artifact plan items replaced. */
function withItems(
  base: LocalArtifactCreationExecutionPlanInput,
  items: GuardedReleaseArtifactPlanItem[],
): LocalArtifactCreationExecutionPlanInput {
  return {
    ...base,
    artifactPlan: {
      ...base.artifactPlan,
      plan: { ...base.artifactPlan.plan, items },
    },
  };
}

describe("createLocalArtifactCreationExecutionPlanSteps", () => {
  it("mirrors the artifact plan item order with contiguous sequences from 1", () => {
    const base = input();
    const steps = createLocalArtifactCreationExecutionPlanSteps(base);
    expect(steps).toHaveLength(base.artifactPlan.plan.items.length);
    steps.forEach((step, index) => {
      expect(step.sequence).toBe(index + 1);
      expect(step.name).toBe(base.artifactPlan.plan.items[index]?.name);
    });
  });

  it("maps all six artifact plan item kinds to prepare step kinds", () => {
    const steps = createLocalArtifactCreationExecutionPlanSteps(input());
    expect(steps.map((step) => step.kind)).toEqual([
      "prepare-release-notes",
      "prepare-package-manifest",
      "prepare-archive",
      "prepare-release-metadata",
      "prepare-integrity-metadata",
      "prepare-channel-metadata",
    ]);
  });

  it("omits reason on planned steps and carries the source reason on failed steps", () => {
    const base = input();
    const items = base.artifactPlan.plan.items.map((item, index) =>
      index === 2 ? { ...item, planned: false, reason: "guarded_release_artifact_archive_plan_blocked" } : item,
    );
    const steps = createLocalArtifactCreationExecutionPlanSteps(withItems(base, items));
    expect(steps[2]?.planned).toBe(false);
    expect(steps[2]?.reason).toBe("guarded_release_artifact_archive_plan_blocked");
    for (const step of steps.filter((candidate) => candidate.planned)) {
      expect(step).not.toHaveProperty("reason");
    }
  });

  it("falls back to a fixed reason when a failed source item has none", () => {
    const base = input();
    const items = base.artifactPlan.plan.items.map((item, index) => {
      if (index !== 0) {
        return item;
      }
      const { reason: _reason, ...rest } = { ...item, planned: false };
      return rest;
    });
    const steps = createLocalArtifactCreationExecutionPlanSteps(withItems(base, items));
    expect(steps[0]?.reason).toBe("local_artifact_creation_step_not_planned");
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createLocalArtifactCreationExecutionPlanSteps(base);
    expect(base).toEqual(snapshot);
  });
});

describe("collectLocalArtifactCreationExecutionPlanReasons", () => {
  it("returns no reasons for the ready fixture", () => {
    const base = input();
    const steps = createLocalArtifactCreationExecutionPlanSteps(base);
    expect(collectLocalArtifactCreationExecutionPlanReasons(base, steps)).toEqual([]);
  });

  it("flags a missing version", () => {
    const base = input({ version: "  " });
    const steps = createLocalArtifactCreationExecutionPlanSteps(base);
    expect(collectLocalArtifactCreationExecutionPlanReasons(base, steps)).toEqual([
      "local_artifact_creation_version_missing",
    ]);
  });

  it("flags a not-allowed permission", () => {
    const base = input();
    const blocked = {
      ...base,
      permission: {
        ...base.permission,
        report: { ...base.permission.report, allowed: false },
      },
    };
    const steps = createLocalArtifactCreationExecutionPlanSteps(blocked);
    expect(collectLocalArtifactCreationExecutionPlanReasons(blocked, steps)).toEqual([
      "local_artifact_creation_permission_not_allowed",
    ]);
  });

  it("flags a not-ready assembly", () => {
    const base = input();
    const blocked = { ...base, assembly: { ...base.assembly, ok: false } };
    const steps = createLocalArtifactCreationExecutionPlanSteps(blocked);
    expect(collectLocalArtifactCreationExecutionPlanReasons(blocked, steps)).toEqual([
      "local_artifact_creation_assembly_not_ready",
    ]);
  });

  it("flags an empty step list", () => {
    const base = withItems(input(), []);
    const steps = createLocalArtifactCreationExecutionPlanSteps(base);
    expect(collectLocalArtifactCreationExecutionPlanReasons(base, steps)).toEqual([
      "local_artifact_creation_no_steps",
    ]);
  });

  it("appends failed step reasons in step order after the gates", () => {
    const base = input({ version: "" });
    const items = base.artifactPlan.plan.items.map((item, index) =>
      index === 1 || index === 4
        ? { ...item, planned: false, reason: `step_${index}_blocked` }
        : item,
    );
    const blocked = withItems(
      {
        ...base,
        permission: {
          ...base.permission,
          report: { ...base.permission.report, allowed: false },
        },
        assembly: { ...base.assembly, ok: false },
      },
      items,
    );
    const steps = createLocalArtifactCreationExecutionPlanSteps(blocked);
    const reasons = collectLocalArtifactCreationExecutionPlanReasons(blocked, steps);
    expect(reasons).toEqual([
      "local_artifact_creation_version_missing",
      "local_artifact_creation_permission_not_allowed",
      "local_artifact_creation_assembly_not_ready",
      "step_1_blocked",
      "step_4_blocked",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("lists a repeated failed step reason once", () => {
    const base = input();
    const items = base.artifactPlan.plan.items.map((item, index) =>
      index <= 1 ? { ...item, planned: false, reason: "shared_reason" } : item,
    );
    const blocked = withItems(base, items);
    const steps = createLocalArtifactCreationExecutionPlanSteps(blocked);
    const reasons = collectLocalArtifactCreationExecutionPlanReasons(blocked, steps);
    expect(reasons.filter((reason) => reason === "shared_reason")).toHaveLength(1);
  });

  it("does not copy raw permission, assembly, or artifact-plan report reasons", () => {
    const base = input();
    const blocked = {
      ...base,
      permission: {
        ...base.permission,
        ok: false,
        report: {
          ...base.permission.report,
          allowed: false,
          reasons: ["artifact_creation_permission_approval_required"],
        },
      },
      assembly: {
        ...base.assembly,
        ok: false,
        warnings: [
          { code: "OMP-I-6001", message: "guarded_local_artifact_assembly_channel_not_ready" },
        ],
      },
    };
    const steps = createLocalArtifactCreationExecutionPlanSteps(blocked);
    const reasons = collectLocalArtifactCreationExecutionPlanReasons(blocked, steps);
    expect(reasons).not.toContain("artifact_creation_permission_approval_required");
    expect(reasons).not.toContain("guarded_local_artifact_assembly_channel_not_ready");
    expect(reasons).toEqual([
      "local_artifact_creation_permission_not_allowed",
      "local_artifact_creation_assembly_not_ready",
    ]);
  });
});

describe("summarizeLocalArtifactCreationExecutionPlan", () => {
  it("mirrors gate readiness and step counts and always disallows creation", () => {
    const base = input();
    const steps = createLocalArtifactCreationExecutionPlanSteps(base);
    expect(summarizeLocalArtifactCreationExecutionPlan(base, steps)).toEqual({
      version: "v0.1.0",
      permissionAllowed: true,
      assemblyReady: true,
      plannedSteps: 6,
      blockedSteps: 0,
      totalSteps: 6,
      creationAllowed: false,
    });
  });

  it("counts blocked steps and keeps creation disallowed", () => {
    const base = input();
    const items = base.artifactPlan.plan.items.map((item, index) =>
      index === 0 ? { ...item, planned: false, reason: "blocked" } : item,
    );
    const blocked = withItems(base, items);
    const steps = createLocalArtifactCreationExecutionPlanSteps(blocked);
    const summary = summarizeLocalArtifactCreationExecutionPlan(blocked, steps);
    expect(summary.plannedSteps).toBe(5);
    expect(summary.blockedSteps).toBe(1);
    expect(summary.creationAllowed).toBe(false);
  });
});

describe("createLocalArtifactCreationExecutionPlan", () => {
  it("is ok only when all gates pass and every step is planned, with creation still disallowed", () => {
    const plan = createLocalArtifactCreationExecutionPlan(input());
    expect(plan.ok).toBe(true);
    expect(plan.reasons).toEqual([]);
    expect(plan.steps.every((step) => step.planned)).toBe(true);
    expect(plan.summary.creationAllowed).toBe(false);
  });

  it("is blocked when permission is not allowed", () => {
    const base = input();
    const plan = createLocalArtifactCreationExecutionPlan({
      ...base,
      permission: {
        ...base.permission,
        report: { ...base.permission.report, allowed: false },
      },
    });
    expect(plan.ok).toBe(false);
    expect(plan.reasons).toContain("local_artifact_creation_permission_not_allowed");
    expect(plan.summary.creationAllowed).toBe(false);
  });

  it("is blocked when any step is not planned", () => {
    const base = input();
    const items = base.artifactPlan.plan.items.map((item, index) =>
      index === 3 ? { ...item, planned: false, reason: "metadata_blocked" } : item,
    );
    const plan = createLocalArtifactCreationExecutionPlan(withItems(base, items));
    expect(plan.ok).toBe(false);
    expect(plan.reasons).toContain("metadata_blocked");
  });

  it("carries no file content, output path, destination, command, target, adapter, URL, bytes, or result fields", () => {
    const plan = createLocalArtifactCreationExecutionPlan(input());
    const keys = [
      ...Object.keys(plan),
      ...Object.keys(plan.summary),
      ...plan.steps.flatMap((step) => Object.keys(step)),
    ];
    for (const key of keys) {
      expect(key).not.toMatch(
        /content|path|dest|command|target|publish|adapter|object|url|bytes|result|remote|download|upload/i,
      );
    }
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toContain("executeRollback");
    expect(serialized).not.toMatch(/https?:\/\//);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createLocalArtifactCreationExecutionPlan(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createLocalArtifactCreationExecutionPlanDryRun", () => {
  it("omits warnings for a ready plan", () => {
    const dryRun = createLocalArtifactCreationExecutionPlanDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked plan", () => {
    const base = input();
    const dryRun = createLocalArtifactCreationExecutionPlanDryRun({
      ...base,
      assembly: { ...base.assembly, ok: false },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some(
        (warning) => warning.message === "local_artifact_creation_assembly_not_ready",
      ),
    ).toBe(true);
  });
});

describe("formatLocalArtifactCreationExecutionPlanMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const plan = createLocalArtifactCreationExecutionPlan(input());
    const markdown = formatLocalArtifactCreationExecutionPlanMarkdown(plan);
    expect(markdown).toBe(formatLocalArtifactCreationExecutionPlanMarkdown(plan));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("renders header lines, steps, and `- none` reasons for a ready plan", () => {
    const markdown = formatLocalArtifactCreationExecutionPlanMarkdown(
      createLocalArtifactCreationExecutionPlan(input()),
    );
    expect(markdown).toContain("# OH MY PM Local Artifact Creation Execution Plan");
    expect(markdown).toContain("Version: `v0.1.0`");
    expect(markdown).toContain("Status: `ready`");
    expect(markdown).toContain("Permission allowed: `true`");
    expect(markdown).toContain("Assembly ready: `true`");
    expect(markdown).toContain("Creation allowed: `false`");
    expect(markdown).toContain("- Planned steps: 6");
    expect(markdown).toContain("- `[x]` `1` `prepare-release-notes` —");
    expect(markdown).toContain("- `[x]` `6` `prepare-channel-metadata` —");
    expect(markdown).toContain("- none");
    expect(markdown).not.toMatch(/https?:\/\//);
    expect(markdown).not.toMatch(/output path|destination/i);
  });

  it("renders blocked status and failed step lines with reasons", () => {
    const base = input();
    const items = base.artifactPlan.plan.items.map((item, index) =>
      index === 2 ? { ...item, planned: false, reason: "archive_blocked" } : item,
    );
    const markdown = formatLocalArtifactCreationExecutionPlanMarkdown(
      createLocalArtifactCreationExecutionPlan(withItems(base, items)),
    );
    expect(markdown).toContain("Status: `blocked`");
    expect(markdown).toContain("- `[ ]` `3` `prepare-archive` —");
    expect(markdown).toContain("— reason: `archive_blocked`");
    expect(markdown).toContain("- `archive_blocked`");
    expect(markdown).not.toContain("- none");
  });
});

describe("exampleLocalArtifactCreationExecutionPlanInput", () => {
  it("is deterministic", () => {
    expect(exampleLocalArtifactCreationExecutionPlanInput()).toEqual(
      exampleLocalArtifactCreationExecutionPlanInput(),
    );
  });

  it("produces a ready dry run from the ready fixture chain while creation stays disallowed", () => {
    const fixture = exampleLocalArtifactCreationExecutionPlanInput();
    expect(fixture.permission.report.allowed).toBe(true);
    expect(fixture.assembly.ok).toBe(true);
    const dryRun = createLocalArtifactCreationExecutionPlanDryRun(fixture);
    expect(dryRun.ok).toBe(true);
    expect(dryRun.plan.summary.creationAllowed).toBe(false);
  });
});
