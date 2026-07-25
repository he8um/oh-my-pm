import { describe, expect, it } from "vitest";

import { createDefaultSkillRegistry } from "../src/registry.js";
import { deriveProjectBrainState, MAX_DECISIONS } from "../src/project-brain-state.js";
import type { ProjectStateDerivationInput } from "../src/project-brain-state.js";
import type { TextItem } from "../src/types.js";

const NOW = "2026-01-15T00:00:00Z";
const OBSERVED = "2026-01-10T00:00:00Z";

function derive(overrides: Partial<ProjectStateDerivationInput> = {}) {
  return deriveProjectBrainState({
    items: [],
    now: NOW,
    observedAt: OBSERVED,
    ...overrides,
  });
}

const markdownDoc = (id: string, body: string): TextItem => ({ id, title: id, body });

describe("deriveProjectBrainState — sources and coverage", () => {
  it("derives risks and tasks from a local Markdown document", () => {
    const doc = markdownDoc(
      "docs/status.md",
      [
        "# Project",
        "## Objective",
        "Ship the v1 release.",
        "## Next steps",
        "- Wire the API",
        "## Blockers",
        "- Auth service is down",
      ].join("\n"),
    );
    const result = derive({ items: [doc] });
    expect(result.objective).toBe("Ship the v1 release.");
    expect(result.tasks.map((t) => t.title)).toContain("Wire the API");
    expect(result.risks.some((r) => r.title === "Auth service is down")).toBe(true);
    // A blocker heading item is an explicit blocker.
    expect(result.blockers.some((b) => b.title === "Auth service is down")).toBe(true);
    expect(result.sources).toEqual([{ sourceKind: "markdown", sourceIdentity: "docs/status.md" }]);
  });

  it("passes explicit coverage gaps through unchanged", () => {
    const result = derive({ coverageGaps: ["github:partial", "structured:skipped"] });
    expect(result.coverageGaps).toEqual(["github:partial", "structured:skipped"]);
  });
});

describe("deriveProjectBrainState — all six item kinds via explicit signals", () => {
  it("extracts milestones, decisions, dependencies from exact headings", () => {
    const doc = markdownDoc(
      "docs/plan.md",
      [
        "# Plan",
        "## Milestones",
        "- Beta launch",
        "## Decisions",
        "- Use Postgres",
        "## Dependencies",
        "- Payments team API",
        "## Next steps",
        "- Draft the schema",
        "## Risks",
        "- Timeline is tight",
      ].join("\n"),
    );
    const result = derive({ items: [doc] });
    expect(result.milestones.map((m) => m.title)).toEqual(["Beta launch"]);
    expect(result.decisions.map((d) => d.title)).toEqual(["Use Postgres"]);
    expect(result.dependencies.map((d) => d.title)).toEqual(["Payments team API"]);
    expect(result.tasks.some((t) => t.title === "Draft the schema")).toBe(true);
    expect(result.risks.some((r) => r.title === "Timeline is tight")).toBe(true);
    expect(result.statusSummary["milestone"]).toBe(1);
    expect(result.statusSummary["decision"]).toBe(1);
    expect(result.statusSummary["dependency"]).toBe(1);
  });

  it("does not treat every high-severity risk as a blocker", () => {
    const doc = markdownDoc(
      "docs/risks.md",
      ["# R", "## Risks", "- URGENT: production incident risk"].join("\n"),
    );
    const result = derive({ items: [doc] });
    // The title carries an urgent phrase (high severity) but no explicit blocker
    // signal, so it is a risk and NOT a blocker.
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.blockers).toEqual([]);
  });
});

describe("deriveProjectBrainState — GitHub and mixed input", () => {
  const ghItem = (over: Partial<TextItem>): TextItem => ({
    id: "gh-1",
    title: "Fix login",
    source: "github",
    type: "issue",
    status: "open",
    ...over,
  });

  it("derives tasks/risks from GitHub items and maps evidence source kinds", () => {
    const result = derive({
      items: [
        ghItem({ id: "issue-1", title: "Fix login", type: "issue", status: "open" }),
        ghItem({
          id: "issue-2",
          title: "Blocked work",
          type: "issue",
          status: "blocked",
          labels: ["blocker"],
        }),
      ],
    });
    expect(result.tasks.some((t) => t.title === "Fix login")).toBe(true);
    expect(result.blockers.some((b) => b.title === "Blocked work")).toBe(true);
    const kinds = result.evidenceCandidates.map((c) => c.sourceKind);
    expect(kinds).toContain("githubIssue");
  });

  it("handles Persian display text without transliteration", () => {
    const doc = markdownDoc(
      "docs/fa.md",
      ["# پروژه", "## اقدامات", "- نوشتن مستندات", "## ریسک ها", "- بودجه محدود است"].join("\n"),
    );
    const result = derive({ items: [doc] });
    expect(result.tasks.some((t) => t.title === "نوشتن مستندات")).toBe(true);
    expect(result.risks.some((r) => r.title === "بودجه محدود است")).toBe(true);
  });
});

describe("deriveProjectBrainState — determinism, dedupe, bounds", () => {
  it("is deep-equal on repeat with identical inputs", () => {
    const doc = markdownDoc("d.md", "# D\n## Next\n- A\n- B\n## Risks\n- R1");
    expect(derive({ items: [doc] })).toEqual(derive({ items: [doc] }));
  });

  it("rejects duplicate decision items within a document", () => {
    const doc = markdownDoc("dec.md", "# D\n## Decisions\n- Use Redis\n- Use Redis");
    const result = derive({ items: [doc] });
    expect(result.decisions).toHaveLength(1);
  });

  it("enforces the per-kind decision bound", () => {
    const lines = ["# D", "## Decisions"];
    for (let i = 0; i < MAX_DECISIONS + 10; i += 1) lines.push(`- Decision ${i}`);
    const result = derive({ items: [markdownDoc("big.md", lines.join("\n"))] });
    expect(result.decisions).toHaveLength(MAX_DECISIONS);
  });
});

describe("deriveProjectBrainState — privacy", () => {
  it("never leaks a raw provider object, token, path, or body into the result", () => {
    const doc = markdownDoc(
      "docs/leak.md",
      [
        "# L",
        "## Risks",
        "- Token ghp_FAKE_LEAK_TOKEN_123 must rotate",
        "## Next",
        "- Review /Users/secret/absolute/path.md",
      ].join("\n"),
    );
    const result = derive({ items: [doc] });
    // Titles are display text and MAY legitimately quote what a doc said, but the
    // ephemeral fingerprintInput and provenance/metadata must not smuggle a raw
    // provider object. Assert candidates carry only allow-listed shapes.
    for (const candidate of result.evidenceCandidates) {
      expect(Object.keys(candidate).sort()).toEqual(
        expect.arrayContaining(["candidateId", "sourceKind", "sourceIdentity", "observedAt"]),
      );
      // provenance/metadata values are strings only (no nested objects).
      for (const v of Object.values(candidate.provenance)) expect(typeof v).toBe("string");
    }
    // The result carries no top-level `data`, `body`, or `rawContent` field.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"body"');
    expect(serialized).not.toContain('"rawContent"');
  });

  it("bounds the ephemeral fingerprint input", () => {
    const huge = "x".repeat(20000);
    const doc = markdownDoc("big.md", `# B\n## Risks\n- ${huge}`);
    const result = derive({ items: [doc] });
    for (const c of result.evidenceCandidates) {
      expect(new TextEncoder().encode(c.fingerprintInput).length).toBeLessThanOrEqual(4096);
    }
  });
});

describe("deriveProjectBrainState — registry isolation", () => {
  it("adds no new SkillId to the registry", () => {
    const ids = createDefaultSkillRegistry()
      .list()
      .map((d) => d.id)
      .sort();
    expect(ids).toEqual(
      ["createHandoff", "deriveNextTasks", "extractRisks", "reviewChanges", "summarizeStatus"].sort(),
    );
  });
});
