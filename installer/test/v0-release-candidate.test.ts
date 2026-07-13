import { describe, expect, it } from "vitest";
import {
  createV0ReleaseCandidateChecklist,
  createV0ReleaseCandidateChecklistDryRun,
  createV0ReleaseCandidateChecklistItems,
  exampleV0ReleaseCandidateChecklistInput,
  formatV0ReleaseCandidateChecklistMarkdown,
} from "../src/index.js";
import type {
  V0ReleaseCandidateChecklistInput,
  V0ReleaseCandidateChecklistItemId,
} from "../src/index.js";

const ITEM_ORDER: V0ReleaseCandidateChecklistItemId[] = [
  "contracts-valid",
  "public-surface-clean",
  "structure-valid",
  "boundaries-valid",
  "builds-pass",
  "tests-pass",
  "wasm-build-pass",
  "cli-smoke-pass",
  "installer-release-readiness-reviewed",
  "no-production-install-command",
  "no-release-artifacts",
  "no-publishing-metadata",
  "no-private-docs",
  "docs-updated",
];

const LABELS: Record<V0ReleaseCandidateChecklistItemId, string> = {
  "contracts-valid": "Contracts are generated and valid",
  "public-surface-clean": "Public surface is clean",
  "structure-valid": "Repository structure is valid",
  "boundaries-valid": "Repository boundaries are valid",
  "builds-pass": "Package builds pass",
  "tests-pass": "Test suites pass",
  "wasm-build-pass": "WASM kernel build passes",
  "cli-smoke-pass": "CLI smoke checks pass",
  "installer-release-readiness-reviewed": "Installer release readiness has been reviewed",
  "no-production-install-command": "No production install command is exposed",
  "no-release-artifacts": "No release artifacts are committed",
  "no-publishing-metadata": "No publishing metadata is present",
  "no-private-docs": "No private docs are committed",
  "docs-updated": "Public docs are updated",
};

function input(
  overrides: Partial<V0ReleaseCandidateChecklistInput> = {},
): V0ReleaseCandidateChecklistInput {
  return { ...exampleV0ReleaseCandidateChecklistInput(), ...overrides };
}

describe("createV0ReleaseCandidateChecklistItems", () => {
  it("returns items in the exact fixed order", () => {
    const items = createV0ReleaseCandidateChecklistItems(input());
    expect(items.map((item) => item.id)).toEqual(ITEM_ORDER);
  });

  it("uses stable labels", () => {
    for (const item of createV0ReleaseCandidateChecklistItems(input())) {
      expect(item.label).toBe(LABELS[item.id]);
    }
  });

  it("omits reason on passing items", () => {
    for (const item of createV0ReleaseCandidateChecklistItems(input())) {
      expect(item.ok).toBe(true);
      expect(item).not.toHaveProperty("reason");
    }
  });

  it("includes reason only on failing items", () => {
    const base = input();
    const items = createV0ReleaseCandidateChecklistItems({
      ...base,
      validation: { ...base.validation, tests: false },
    });
    const failed = items.find((item) => item.id === "tests-pass");
    expect(failed?.ok).toBe(false);
    expect(failed?.reason).toBe("v0_rc_tests_failed");
    expect(items.find((item) => item.id === "contracts-valid")).not.toHaveProperty("reason");
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createV0ReleaseCandidateChecklistItems(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createV0ReleaseCandidateChecklist", () => {
  it("is ok when all items pass and release readiness is not blocked", () => {
    const checklist = createV0ReleaseCandidateChecklist(input());
    expect(checklist.ok).toBe(true);
    expect(checklist.reasons).toEqual([]);
    expect(checklist.items).toHaveLength(14);
  });

  const validationCases: [keyof V0ReleaseCandidateChecklistInput["validation"], string][] = [
    ["contracts", "v0_rc_contracts_invalid"],
    ["publicSurface", "v0_rc_public_surface_dirty"],
    ["structure", "v0_rc_structure_invalid"],
    ["boundaries", "v0_rc_boundaries_invalid"],
    ["builds", "v0_rc_builds_failed"],
    ["tests", "v0_rc_tests_failed"],
    ["wasmBuild", "v0_rc_wasm_build_failed"],
    ["cliSmoke", "v0_rc_cli_smoke_failed"],
  ];
  for (const [key, reason] of validationCases) {
    it(`fails with ${reason} when validation.${key} is false`, () => {
      const base = input();
      const checklist = createV0ReleaseCandidateChecklist({
        ...base,
        validation: { ...base.validation, [key]: false },
      });
      expect(checklist.ok).toBe(false);
      expect(checklist.reasons).toContain(reason);
    });
  }

  const hygieneCases: [keyof V0ReleaseCandidateChecklistInput["hygiene"], string][] = [
    ["noProductionInstallCommand", "v0_rc_production_install_command_present"],
    ["noReleaseArtifacts", "v0_rc_release_artifacts_present"],
    ["noPublishingMetadata", "v0_rc_publishing_metadata_present"],
    ["noPrivateDocs", "v0_rc_private_docs_present"],
    ["docsUpdated", "v0_rc_docs_outdated"],
  ];
  for (const [key, reason] of hygieneCases) {
    it(`fails with ${reason} when hygiene.${key} is false`, () => {
      const base = input();
      const checklist = createV0ReleaseCandidateChecklist({
        ...base,
        hygiene: { ...base.hygiene, [key]: false },
      });
      expect(checklist.ok).toBe(false);
      expect(checklist.reasons).toContain(reason);
    });
  }

  it("fails when release readiness is blocked", () => {
    const base = input();
    const checklist = createV0ReleaseCandidateChecklist({
      ...base,
      releaseReadiness: { ...base.releaseReadiness, status: "blocked" },
    });
    expect(checklist.ok).toBe(false);
    expect(checklist.reasons).toContain("v0_rc_release_readiness_blocked");
  });

  it("does not fail this checklist for a review-required release readiness", () => {
    const base = input();
    const checklist = createV0ReleaseCandidateChecklist({
      ...base,
      releaseReadiness: { ...base.releaseReadiness, status: "review-required" },
    });
    expect(checklist.reasons).not.toContain("v0_rc_release_readiness_blocked");
    const item = checklist.items.find((i) => i.id === "installer-release-readiness-reviewed");
    expect(item?.ok).toBe(true);
  });

  it("returns reasons in exact item order with each reason once", () => {
    const checklist = createV0ReleaseCandidateChecklist({
      releaseReadiness: {
        ...input().releaseReadiness,
        status: "blocked",
      },
      validation: {
        contracts: false,
        publicSurface: false,
        structure: false,
        boundaries: false,
        builds: false,
        tests: false,
        wasmBuild: false,
        cliSmoke: false,
      },
      hygiene: {
        noProductionInstallCommand: false,
        noReleaseArtifacts: false,
        noPublishingMetadata: false,
        noPrivateDocs: false,
        docsUpdated: false,
      },
    });
    expect(checklist.reasons).toEqual([
      "v0_rc_contracts_invalid",
      "v0_rc_public_surface_dirty",
      "v0_rc_structure_invalid",
      "v0_rc_boundaries_invalid",
      "v0_rc_builds_failed",
      "v0_rc_tests_failed",
      "v0_rc_wasm_build_failed",
      "v0_rc_cli_smoke_failed",
      "v0_rc_release_readiness_blocked",
      "v0_rc_production_install_command_present",
      "v0_rc_release_artifacts_present",
      "v0_rc_publishing_metadata_present",
      "v0_rc_private_docs_present",
      "v0_rc_docs_outdated",
    ]);
    expect(new Set(checklist.reasons).size).toBe(checklist.reasons.length);
  });

  it("carries no content, artifact, destination, command, adapter object, or result fields", () => {
    const checklist = createV0ReleaseCandidateChecklist(input());
    for (const item of checklist.items) {
      for (const key of Object.keys(item)) {
        expect(key).not.toMatch(/content|artifact|asset|dest|command|adapter|object|result|remote|url/i);
      }
    }
    const serialized = JSON.stringify(checklist);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe("createV0ReleaseCandidateChecklistDryRun", () => {
  it("omits warnings for a passing checklist", () => {
    const dryRun = createV0ReleaseCandidateChecklistDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a failing checklist", () => {
    const base = input();
    const dryRun = createV0ReleaseCandidateChecklistDryRun({
      ...base,
      validation: { ...base.validation, tests: false },
    });
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(dryRun.warnings?.some((warning) => warning.message === "v0_rc_tests_failed")).toBe(true);
  });
});

describe("formatV0ReleaseCandidateChecklistMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const checklist = createV0ReleaseCandidateChecklist(input());
    const markdown = formatV0ReleaseCandidateChecklistMarkdown(checklist);
    expect(markdown).toBe(formatV0ReleaseCandidateChecklistMarkdown(checklist));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("renders a ready status and checkbox lines with `- none` reasons", () => {
    const checklist = createV0ReleaseCandidateChecklist(input());
    const markdown = formatV0ReleaseCandidateChecklistMarkdown(checklist);
    expect(markdown).toContain("# OH MY PM v0 Release Candidate Checklist");
    expect(markdown).toContain("Status: `ready`");
    expect(markdown).toContain("`[x]` `contracts-valid` — Contracts are generated and valid");
    expect(markdown).toContain("- none");
    expect(markdown).not.toMatch(/https?:\/\//);
  });

  it("renders a blocked status and reason lines when items fail", () => {
    const base = input();
    const checklist = createV0ReleaseCandidateChecklist({
      ...base,
      validation: { ...base.validation, tests: false },
    });
    const markdown = formatV0ReleaseCandidateChecklistMarkdown(checklist);
    expect(markdown).toContain("Status: `blocked`");
    expect(markdown).toContain("`[ ]` `tests-pass` — Test suites pass — reason: `v0_rc_tests_failed`");
    expect(markdown).toContain("- `v0_rc_tests_failed`");
  });
});

describe("exampleV0ReleaseCandidateChecklistInput", () => {
  it("is deterministic", () => {
    expect(exampleV0ReleaseCandidateChecklistInput()).toEqual(
      exampleV0ReleaseCandidateChecklistInput(),
    );
  });

  it("is consistent with the release readiness fixture (not blocked, so ok)", () => {
    const dryRun = createV0ReleaseCandidateChecklistDryRun(
      exampleV0ReleaseCandidateChecklistInput(),
    );
    expect(dryRun.ok).toBe(true);
    expect(dryRun.checklist.items).toHaveLength(14);
  });
});
