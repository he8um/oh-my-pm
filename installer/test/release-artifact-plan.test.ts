import { describe, expect, it } from "vitest";
import {
  collectGuardedReleaseArtifactPlanReasons,
  createGuardedReleaseArtifactPlan,
  createGuardedReleaseArtifactPlanDryRun,
  createGuardedReleaseArtifactPlanItems,
  exampleGuardedReleaseArtifactPlanInput,
  formatGuardedReleaseArtifactPlanMarkdown,
  summarizeGuardedReleaseArtifactPlan,
} from "../src/index.js";
import type {
  GuardedReleaseArtifactPlanInput,
  GuardedReleaseArtifactPlanItemKind,
} from "../src/index.js";

const ITEM_ORDER: GuardedReleaseArtifactPlanItemKind[] = [
  "release-notes",
  "package-manifest",
  "archive-plan",
  "release-metadata",
  "integrity-metadata",
  "channel-metadata",
];

const NAMES: Record<GuardedReleaseArtifactPlanItemKind, string> = {
  "release-notes": "Public v0 release notes draft",
  "package-manifest": "Package manifest",
  "archive-plan": "Archive plan",
  "release-metadata": "Release metadata",
  "integrity-metadata": "Release integrity metadata",
  "channel-metadata": "Release channel metadata",
};

function input(
  overrides: Partial<GuardedReleaseArtifactPlanInput> = {},
): GuardedReleaseArtifactPlanInput {
  return { ...exampleGuardedReleaseArtifactPlanInput(), ...overrides };
}

describe("createGuardedReleaseArtifactPlanItems", () => {
  it("returns items in the exact fixed order", () => {
    const items = createGuardedReleaseArtifactPlanItems(input());
    expect(items.map((item) => item.kind)).toEqual(ITEM_ORDER);
  });

  it("uses contiguous sequences starting at 1", () => {
    const items = createGuardedReleaseArtifactPlanItems(input());
    expect(items.map((item) => item.sequence)).toEqual(items.map((_item, index) => index + 1));
  });

  it("uses stable names", () => {
    for (const item of createGuardedReleaseArtifactPlanItems(input())) {
      expect(item.name).toBe(NAMES[item.kind]);
    }
  });

  it("omits reason on planned items", () => {
    for (const item of createGuardedReleaseArtifactPlanItems(input())) {
      expect(item.planned).toBe(true);
      expect(item).not.toHaveProperty("reason");
    }
  });

  it("includes reason only on non-planned items", () => {
    const base = input();
    const items = createGuardedReleaseArtifactPlanItems({
      ...base,
      archive: { ...base.archive, ok: false },
    });
    const failed = items.find((item) => item.kind === "archive-plan");
    expect(failed?.planned).toBe(false);
    expect(failed?.reason).toBe("guarded_release_artifact_archive_plan_blocked");
    expect(items.find((item) => item.kind === "release-notes")).not.toHaveProperty("reason");
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createGuardedReleaseArtifactPlanItems(base);
    expect(base).toEqual(snapshot);
  });
});

describe("collectGuardedReleaseArtifactPlanReasons", () => {
  it("returns no reasons for the ready fixture", () => {
    const base = input();
    const items = createGuardedReleaseArtifactPlanItems(base);
    expect(collectGuardedReleaseArtifactPlanReasons(base, items)).toEqual([]);
  });

  it("flags a missing version", () => {
    const base = input({ version: "   " });
    const items = createGuardedReleaseArtifactPlanItems(base);
    expect(collectGuardedReleaseArtifactPlanReasons(base, items)).toContain(
      "guarded_release_artifact_version_missing",
    );
  });

  it("flags a blocked v0 checklist", () => {
    const base = input();
    const blocked = { ...base, v0Checklist: { ...base.v0Checklist, ok: false } };
    const items = createGuardedReleaseArtifactPlanItems(blocked);
    expect(collectGuardedReleaseArtifactPlanReasons(blocked, items)).toContain(
      "guarded_release_artifact_v0_checklist_blocked",
    );
  });

  it("flags blocked release readiness", () => {
    const base = input();
    const blocked = { ...base, releaseReadiness: { ...base.releaseReadiness, ok: false } };
    const items = createGuardedReleaseArtifactPlanItems(blocked);
    expect(collectGuardedReleaseArtifactPlanReasons(blocked, items)).toContain(
      "guarded_release_artifact_release_readiness_blocked",
    );
  });

  it("appends failed item reasons in item order after the gates", () => {
    const base = input();
    const blocked = {
      ...base,
      version: "",
      metadata: { ...base.metadata, ok: false },
      assembly: { ...base.assembly, ok: false },
    };
    const items = createGuardedReleaseArtifactPlanItems(blocked);
    const reasons = collectGuardedReleaseArtifactPlanReasons(blocked, items);
    expect(reasons).toEqual([
      "guarded_release_artifact_version_missing",
      "guarded_release_artifact_package_manifest_blocked",
      "guarded_release_artifact_metadata_blocked",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("does not copy raw source report reasons into the plan reasons", () => {
    const base = input();
    // Give a source report a raw reason of its own; the plan must not surface it.
    const blocked = {
      ...base,
      archive: {
        ...base.archive,
        ok: false,
        warnings: [{ code: "OMP-I-6001", message: "archive_files_must_not_be_empty" }],
      },
    };
    const items = createGuardedReleaseArtifactPlanItems(blocked);
    const reasons = collectGuardedReleaseArtifactPlanReasons(blocked, items);
    expect(reasons).toContain("guarded_release_artifact_archive_plan_blocked");
    expect(reasons).not.toContain("archive_files_must_not_be_empty");
  });
});

describe("summarizeGuardedReleaseArtifactPlan", () => {
  it("counts planned and blocked items and always disallows creation", () => {
    const base = input({ version: "v0.1.0" });
    const blocked = { ...base, channel: { ...base.channel, ok: false } };
    const items = createGuardedReleaseArtifactPlanItems(blocked);
    const summary = summarizeGuardedReleaseArtifactPlan(blocked, items);
    expect(summary.plannedItems).toBe(5);
    expect(summary.blockedItems).toBe(1);
    expect(summary.totalItems).toBe(6);
    expect(summary.creationAllowed).toBe(false);
    expect(summary.version).toBe("v0.1.0");
  });
});

describe("createGuardedReleaseArtifactPlan", () => {
  it("is ok when all gates pass and every item is planned", () => {
    const plan = createGuardedReleaseArtifactPlan(input());
    expect(plan.ok).toBe(true);
    expect(plan.reasons).toEqual([]);
    expect(plan.summary.creationAllowed).toBe(false);
  });

  it("keeps creationAllowed false even when ready", () => {
    const plan = createGuardedReleaseArtifactPlan(input());
    expect(plan.summary.creationAllowed).toBe(false);
  });

  it("is blocked when any gate fails", () => {
    const base = input();
    const plan = createGuardedReleaseArtifactPlan({
      ...base,
      integrity: { ...base.integrity, ok: false },
    });
    expect(plan.ok).toBe(false);
    expect(plan.reasons).toContain("guarded_release_artifact_integrity_blocked");
  });

  it("is blocked when a top-level gate fails even if all items are planned", () => {
    const plan = createGuardedReleaseArtifactPlan(input({ version: "" }));
    expect(plan.ok).toBe(false);
    expect(plan.reasons).toContain("guarded_release_artifact_version_missing");
  });

  it("carries no file content, output path, destination, command, publish, adapter, URL, bytes, or result fields", () => {
    const plan = createGuardedReleaseArtifactPlan(input());
    const scan = (keys: string[]) => {
      for (const key of keys) {
        expect(key).not.toMatch(
          /content|path|dest|command|publish|adapter|object|url|bytes|result|remote|download|upload/i,
        );
      }
    };
    scan(Object.keys(plan));
    scan(Object.keys(plan.summary));
    for (const item of plan.items) {
      scan(Object.keys(item));
    }
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe("createGuardedReleaseArtifactPlanDryRun", () => {
  it("omits warnings for a ready plan", () => {
    const dryRun = createGuardedReleaseArtifactPlanDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked plan", () => {
    const base = input();
    const dryRun = createGuardedReleaseArtifactPlanDryRun({
      ...base,
      releaseNotes: { ...base.releaseNotes, ok: false },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "guarded_release_artifact_release_notes_blocked"),
    ).toBe(true);
  });
});

describe("formatGuardedReleaseArtifactPlanMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const plan = createGuardedReleaseArtifactPlan(input());
    const markdown = formatGuardedReleaseArtifactPlanMarkdown(plan);
    expect(markdown).toBe(formatGuardedReleaseArtifactPlanMarkdown(plan));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("renders version, status, creation-allowed false, and `- none` reasons when ready", () => {
    const plan = createGuardedReleaseArtifactPlan(input());
    const markdown = formatGuardedReleaseArtifactPlanMarkdown(plan);
    expect(markdown).toContain("# OH MY PM Guarded Release Artifact Plan");
    expect(markdown).toContain("Version: `v0.1.0`");
    expect(markdown).toContain("Status: `ready`");
    expect(markdown).toContain("Creation allowed: `false`");
    expect(markdown).toContain("`[x]` `1` `release-notes` - Public v0 release notes draft");
    expect(markdown).toContain("- none");
    expect(markdown).not.toMatch(/https?:\/\//);
  });

  it("renders reason lines and blocked status when blocked", () => {
    const base = input();
    const plan = createGuardedReleaseArtifactPlan({
      ...base,
      channel: { ...base.channel, ok: false },
    });
    const markdown = formatGuardedReleaseArtifactPlanMarkdown(plan);
    expect(markdown).toContain("Status: `blocked`");
    expect(markdown).toContain(
      "`[ ]` `6` `channel-metadata` - Release channel metadata - reason: `guarded_release_artifact_channel_blocked`",
    );
    expect(markdown).toContain("- `guarded_release_artifact_channel_blocked`");
  });
});

describe("exampleGuardedReleaseArtifactPlanInput", () => {
  it("is deterministic", () => {
    expect(exampleGuardedReleaseArtifactPlanInput()).toEqual(
      exampleGuardedReleaseArtifactPlanInput(),
    );
  });

  it("produces a ready dry run from the ready fixture chain", () => {
    const dryRun = createGuardedReleaseArtifactPlanDryRun(exampleGuardedReleaseArtifactPlanInput());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.plan.items).toHaveLength(6);
    expect(dryRun.plan.summary.creationAllowed).toBe(false);
  });
});
