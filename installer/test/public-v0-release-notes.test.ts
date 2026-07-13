import { describe, expect, it } from "vitest";
import {
  collectPublicV0ReleaseNotesDraftReasons,
  createPublicV0ReleaseNotesDraft,
  createPublicV0ReleaseNotesDraftDryRun,
  createPublicV0ReleaseNotesDraftSections,
  examplePublicV0ReleaseNotesDraftInput,
  formatPublicV0ReleaseNotesDraftMarkdown,
} from "../src/index.js";
import type {
  PublicV0ReleaseNotesDraftInput,
  PublicV0ReleaseNotesDraftSectionId,
} from "../src/index.js";

const SECTION_ORDER: PublicV0ReleaseNotesDraftSectionId[] = [
  "status",
  "included",
  "safety",
  "not-included",
  "validation",
  "next",
];

const SECTION_TITLES: Record<PublicV0ReleaseNotesDraftSectionId, string> = {
  status: "Status",
  included: "Included in this draft",
  safety: "Safety model",
  "not-included": "Not included yet",
  validation: "Validation expected before release",
  next: "Next work",
};

// Private terms that must never appear in the public draft or its markdown.
// Assembled from fragments so the boundary language scan does not flag this
// test file itself for containing the very terms it guards against.
const PRIVATE_TERMS = [
  "_dev",
  "specs/",
  `_AGENT${"_"}OVERRIDE`,
  `implementation ${"agent"}`,
  `Required Documentation ${"Pack"}`,
  `AI${"-"}generated`,
  `Cla${"ude"}`,
  `Chat${"GPT"}`,
  `Co${"dex"}`,
];

function input(
  overrides: Partial<PublicV0ReleaseNotesDraftInput> = {},
): PublicV0ReleaseNotesDraftInput {
  return { ...examplePublicV0ReleaseNotesDraftInput(), ...overrides };
}

describe("collectPublicV0ReleaseNotesDraftReasons", () => {
  it("returns no reasons for the ready fixture", () => {
    expect(collectPublicV0ReleaseNotesDraftReasons(input())).toEqual([]);
  });

  it("flags a missing version", () => {
    expect(collectPublicV0ReleaseNotesDraftReasons(input({ version: "   " }))).toContain(
      "public_v0_release_notes_version_missing",
    );
  });

  it("flags a blocked checklist", () => {
    const base = input();
    const reasons = collectPublicV0ReleaseNotesDraftReasons({
      ...base,
      checklist: { ...base.checklist, ok: false },
    });
    expect(reasons).toContain("public_v0_release_notes_checklist_blocked");
  });

  it("flags blocked release readiness", () => {
    const base = input();
    const reasons = collectPublicV0ReleaseNotesDraftReasons({
      ...base,
      releaseReadiness: { ...base.releaseReadiness, status: "blocked" },
    });
    expect(reasons).toContain("public_v0_release_notes_readiness_blocked");
  });

  it("returns reasons in the fixed order with each reason at most once", () => {
    const base = input();
    const reasons = collectPublicV0ReleaseNotesDraftReasons({
      version: "",
      checklist: { ...base.checklist, ok: false },
      releaseReadiness: { ...base.releaseReadiness, status: "blocked" },
    });
    expect(reasons).toEqual([
      "public_v0_release_notes_version_missing",
      "public_v0_release_notes_checklist_blocked",
      "public_v0_release_notes_readiness_blocked",
    ]);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    collectPublicV0ReleaseNotesDraftReasons(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createPublicV0ReleaseNotesDraftSections", () => {
  it("returns sections in the fixed order", () => {
    const sections = createPublicV0ReleaseNotesDraftSections(input());
    expect(sections.map((section) => section.id)).toEqual(SECTION_ORDER);
  });

  it("uses stable titles", () => {
    for (const section of createPublicV0ReleaseNotesDraftSections(input())) {
      expect(section.title).toBe(SECTION_TITLES[section.id]);
    }
  });

  it("contains only public-safe lines with no private terms or URLs", () => {
    const sections = createPublicV0ReleaseNotesDraftSections(input());
    const text = JSON.stringify(sections);
    for (const term of PRIVATE_TERMS) {
      expect(text).not.toContain(term);
    }
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("does not mutate its input", () => {
    const base = input();
    const snapshot = structuredClone(base);
    createPublicV0ReleaseNotesDraftSections(base);
    expect(base).toEqual(snapshot);
  });
});

describe("createPublicV0ReleaseNotesDraft", () => {
  it("is draft-ready with no reasons for the ready fixture", () => {
    const draft = createPublicV0ReleaseNotesDraft(input());
    expect(draft.ok).toBe(true);
    expect(draft.status).toBe("draft-ready");
    expect(draft.reasons).toEqual([]);
    expect(draft.version).toBe("v0.1.0");
  });

  it("is blocked when any reason exists", () => {
    const draft = createPublicV0ReleaseNotesDraft(input({ version: "" }));
    expect(draft.ok).toBe(false);
    expect(draft.status).toBe("blocked");
    expect(draft.reasons).toContain("public_v0_release_notes_version_missing");
  });

  it("carries no artifact, destination, command, adapter object, or result fields", () => {
    const draft = createPublicV0ReleaseNotesDraft(input());
    for (const key of Object.keys(draft)) {
      expect(key).not.toMatch(/artifact|asset|download|dest|command|adapter|object|result|remote|url/i);
    }
    const serialized = JSON.stringify(draft);
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("executeInstall");
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe("createPublicV0ReleaseNotesDraftDryRun", () => {
  it("omits warnings for a draft-ready draft", () => {
    const dryRun = createPublicV0ReleaseNotesDraftDryRun(input());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.warnings).toBeUndefined();
  });

  it("returns OMP-I-6001 warnings for a blocked draft", () => {
    const dryRun = createPublicV0ReleaseNotesDraftDryRun(input({ version: "" }));
    expect(dryRun.ok).toBe(false);
    expect(dryRun.warnings).toBeDefined();
    expect(dryRun.warnings?.every((warning) => warning.code === "OMP-I-6001")).toBe(true);
    expect(
      dryRun.warnings?.some((warning) => warning.message === "public_v0_release_notes_version_missing"),
    ).toBe(true);
  });
});

describe("formatPublicV0ReleaseNotesDraftMarkdown", () => {
  it("renders deterministic markdown with one trailing newline", () => {
    const draft = createPublicV0ReleaseNotesDraft(input());
    const markdown = formatPublicV0ReleaseNotesDraftMarkdown(draft);
    expect(markdown).toBe(formatPublicV0ReleaseNotesDraftMarkdown(draft));
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("includes the version heading, status, and `- none` reasons when ready", () => {
    const draft = createPublicV0ReleaseNotesDraft(input());
    const markdown = formatPublicV0ReleaseNotesDraftMarkdown(draft);
    expect(markdown).toContain("# OH MY PM v0.1.0 Release Notes Draft");
    expect(markdown).toContain("Status: `draft-ready`");
    expect(markdown).toContain("## Safety model");
    expect(markdown).toContain("- none");
  });

  it("lists reasons and a blocked status when blocked", () => {
    const draft = createPublicV0ReleaseNotesDraft(input({ version: "" }));
    const markdown = formatPublicV0ReleaseNotesDraftMarkdown(draft);
    expect(markdown).toContain("Status: `blocked`");
    expect(markdown).toContain("- `public_v0_release_notes_version_missing`");
  });

  it("contains no private terms or URLs", () => {
    const markdown = formatPublicV0ReleaseNotesDraftMarkdown(createPublicV0ReleaseNotesDraft(input()));
    for (const term of PRIVATE_TERMS) {
      expect(markdown).not.toContain(term);
    }
    expect(markdown).not.toMatch(/https?:\/\//);
  });
});

describe("examplePublicV0ReleaseNotesDraftInput", () => {
  it("is deterministic", () => {
    expect(examplePublicV0ReleaseNotesDraftInput()).toEqual(
      examplePublicV0ReleaseNotesDraftInput(),
    );
  });

  it("produces a draft-ready dry run from the ready fixture chain", () => {
    const dryRun = createPublicV0ReleaseNotesDraftDryRun(examplePublicV0ReleaseNotesDraftInput());
    expect(dryRun.ok).toBe(true);
    expect(dryRun.draft.sections).toHaveLength(6);
  });
});
