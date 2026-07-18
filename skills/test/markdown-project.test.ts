import { describe, expect, it } from "vitest";
import {
  collectMarkdownSectionItems,
  collectMarkdownUncheckedTasks,
  inferMarkdownProjectTitle,
  matchActionMarker,
  matchRiskMarker,
  normalizeMarkdownHeading,
  parseMarkdownProjectSections,
  parseMarkdownSignalEntries,
} from "../src/index.js";
import type { TextItem } from "../src/index.js";

function doc(id: string, title: string, body: string): TextItem {
  return { id, title, body };
}

describe("normalizeMarkdownHeading", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeMarkdownHeading(" Current Objective ")).toBe("current objective");
    expect(normalizeMarkdownHeading("NEXT   ACTIONS")).toBe("next actions");
  });

  it("removes a single trailing colon", () => {
    expect(normalizeMarkdownHeading("Decisions:")).toBe("decisions");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeMarkdownHeading("   ")).toBe("");
  });
});

describe("parseMarkdownProjectSections", () => {
  it("returns [] when the body is absent", () => {
    expect(parseMarkdownProjectSections({ id: "d", title: "D" })).toEqual([]);
  });

  it("parses an H1 as a document-level section", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["# Overview", "", "A short summary paragraph."].join("\n")),
    );
    expect(sections).toEqual([
      {
        documentId: "d",
        documentTitle: "D",
        heading: "Overview",
        normalizedHeading: "overview",
        items: ["A short summary paragraph."],
      },
    ]);
  });

  it("parses deeper headings and lets later headings replace the section", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["## Active", "- One", "### Blocked", "- Two"].join("\n")),
    );
    expect(sections.map((s) => s.normalizedHeading)).toEqual(["active", "blocked"]);
    expect(sections[0]?.items).toEqual(["One"]);
    expect(sections[1]?.items).toEqual(["Two"]);
  });

  it("collects unordered list items with dash, star, and plus markers", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["## List", "- Dash", "* Star", "+ Plus"].join("\n")),
    );
    expect(sections[0]?.items).toEqual(["Dash", "Star", "Plus"]);
  });

  it("collects numbered list items with dot and paren markers", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["## Steps", "1. First", "2) Second"].join("\n")),
    );
    expect(sections[0]?.items).toEqual(["First", "Second"]);
  });

  it("strips checkbox markers and drops the checked/unchecked state", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["## Tasks", "- [ ] Open task", "- [x] Done task", "- [X] Also done"].join("\n")),
    );
    expect(sections[0]?.items).toEqual(["Open task", "Done task", "Also done"]);
  });

  it("emits a merged paragraph when a section has no list items", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["## Note", "This line wraps", "across two lines."].join("\n")),
    );
    expect(sections[0]?.items).toEqual(["This line wraps across two lines."]);
  });

  it("merges wrapped continuation lines into the preceding list item", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["## Risks", "- A risk that spans", "  two lines."].join("\n")),
    );
    expect(sections[0]?.items).toEqual(["A risk that spans two lines."]);
  });

  it("omits preamble paragraphs when a section also carries list items", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["# Delivery", "Intro prose here.", "", "- Real risk"].join("\n")),
    );
    expect(sections[0]?.items).toEqual(["Real risk"]);
  });

  it("ignores fenced code block contents for backtick and tilde fences", () => {
    const sections = parseMarkdownProjectSections(
      doc(
        "d",
        "D",
        ["## Code", "```", "- not a real item", "```", "~~~", "* also ignored", "~~~", "- real item"].join(
          "\n",
        ),
      ),
    );
    expect(sections[0]?.items).toEqual(["real item"]);
  });

  it("ignores content before the first heading", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["Loose prose.", "- Loose item", "# Heading", "- Kept"].join("\n")),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.items).toEqual(["Kept"]);
  });

  it("preserves document section order", () => {
    const sections = parseMarkdownProjectSections(
      doc("d", "D", ["# One", "- a", "## Two", "- b", "## Three", "- c"].join("\n")),
    );
    expect(sections.map((s) => s.heading)).toEqual(["One", "Two", "Three"]);
  });

  it("does not mutate the source item", () => {
    const item = doc("d", "D", ["# H", "- item"].join("\n"));
    const snapshot = JSON.parse(JSON.stringify(item));
    parseMarkdownProjectSections(item);
    expect(item).toEqual(snapshot);
  });
});

describe("collectMarkdownSectionItems", () => {
  it("includes items only for exact normalized heading matches", () => {
    const items = [
      doc("a", "A", ["## Risks", "- keep me"].join("\n")),
      doc("b", "B", ["## Risky business", "- skip me"].join("\n")),
    ];
    expect(collectMarkdownSectionItems(items, ["risks"])).toEqual(["keep me"]);
  });

  it("normalizes accepted headings and matches aliases", () => {
    const items = [doc("a", "A", ["## Current Objective", "Do the thing."].join("\n"))];
    expect(collectMarkdownSectionItems(items, ["Current objective"])).toEqual(["Do the thing."]);
  });

  it("dedupes identical trimmed text in first-occurrence order", () => {
    const items = [
      doc("a", "A", ["## Risks", "- same", "- same", "- other"].join("\n")),
      doc("b", "B", ["## Risks", "- same"].join("\n")),
    ];
    expect(collectMarkdownSectionItems(items, ["risks"])).toEqual(["same", "other"]);
  });

  it("preserves input-item then section order", () => {
    const items = [
      doc("a", "A", ["## Active", "- a1", "## Active", "- a2"].join("\n")),
      doc("b", "B", ["## Active", "- b1"].join("\n")),
    ];
    expect(collectMarkdownSectionItems(items, ["active"])).toEqual(["a1", "a2", "b1"]);
  });

  it("never returns empty strings and never mutates input", () => {
    const items = [doc("a", "A", ["## Risks", "-   ", "- real"].join("\n"))];
    const snapshot = JSON.parse(JSON.stringify(items));
    expect(collectMarkdownSectionItems(items, ["risks"])).toEqual(["real"]);
    expect(items).toEqual(snapshot);
  });
});

describe("collectMarkdownUncheckedTasks", () => {
  it("collects unchecked boxes with per-document contiguous ids", () => {
    const items = [
      doc("docs/a.md", "A", ["- [ ] First", "- [x] Skipped", "- [ ] Second"].join("\n")),
      doc("docs/b.md", "B", ["- [ ] Only"].join("\n")),
    ];
    expect(collectMarkdownUncheckedTasks(items)).toEqual([
      { id: "docs/a.md#task-1", title: "First" },
      { id: "docs/a.md#task-2", title: "Second" },
      { id: "docs/b.md#task-1", title: "Only" },
    ]);
  });

  it("ignores checked tasks and empty titles", () => {
    const items = [doc("d", "D", ["- [x] Done", "- [ ]", "- [ ] Real"].join("\n"))];
    expect(collectMarkdownUncheckedTasks(items)).toEqual([{ id: "d#task-1", title: "Real" }]);
  });

  it("returns [] when a body is absent and does not mutate input", () => {
    const items: TextItem[] = [{ id: "d", title: "D" }];
    const snapshot = JSON.parse(JSON.stringify(items));
    expect(collectMarkdownUncheckedTasks(items)).toEqual([]);
    expect(items).toEqual(snapshot);
  });
});

describe("inferMarkdownProjectTitle", () => {
  it("returns the first non-empty item title", () => {
    expect(
      inferMarkdownProjectTitle([
        { id: "a", title: "   " },
        { id: "b", title: "Riverline Field Guide" },
      ]),
    ).toBe("Riverline Field Guide");
  });

  it("returns undefined when there are no items", () => {
    expect(inferMarkdownProjectTitle([])).toBeUndefined();
  });
});

describe("parseMarkdownSignalEntries", () => {
  const item = (body: string): TextItem => ({ id: "d1", title: "Doc", body });

  it("emits one-based line numbers in document order", () => {
    const entries = parseMarkdownSignalEntries(item("# H\n\n- one\n- two"));
    expect(entries.map((e) => [e.line, e.kind, e.text])).toEqual([
      [3, "list-item", "one"],
      [4, "list-item", "two"],
    ]);
  });

  it("preserves checkbox state and ignores fenced code", () => {
    const entries = parseMarkdownSignalEntries(
      item("# H\n\n- [ ] open\n- [x] done\n\n```\n- [ ] in code\n```\n\n- plain"),
    );
    expect(entries.map((e) => e.kind)).toEqual(["unchecked-task", "checked-task", "list-item"]);
  });

  it("merges list continuation lines", () => {
    const entries = parseMarkdownSignalEntries(item("# H\n\n- first line\n  continues here\n- second"));
    expect(entries.map((e) => e.text)).toEqual(["first line continues here", "second"]);
  });

  it("ignores content before the first heading except explicit markers", () => {
    const entries = parseMarkdownSignalEntries(item("plain preamble\nRisk: pre-heading risk\n# H\n\n- item"));
    expect(entries.map((e) => [e.kind, e.text])).toEqual([
      ["marker", "Risk: pre-heading risk"],
      ["list-item", "item"],
    ]);
  });

  it("does not mutate the input item", () => {
    const original = item("# H\n\n- a");
    const snapshot = JSON.parse(JSON.stringify(original));
    parseMarkdownSignalEntries(original);
    expect(original).toEqual(snapshot);
  });
});

describe("marker matchers", () => {
  it("matches an exact risk prefix plus colon and strips it", () => {
    expect(matchRiskMarker("Blocker: the build")).toEqual({ prefix: "blocker", body: "the build" });
    expect(matchRiskMarker("مانع: انتشار")).toEqual({ prefix: "مانع", body: "انتشار" });
  });
  it("rejects an arbitrary inline occurrence and an empty body", () => {
    expect(matchRiskMarker("There is a risk: maybe")).toBeNull();
    expect(matchRiskMarker("Risk:")).toBeNull();
  });
  it("matches action prefixes", () => {
    expect(matchActionMarker("Action: do it")).toEqual({ prefix: "action", body: "do it" });
    expect(matchActionMarker("اقدام: انجام بده")).toEqual({ prefix: "اقدام", body: "انجام بده" });
  });
});
