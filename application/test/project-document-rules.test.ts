import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_DOCUMENT_EXCLUDE,
  DEFAULT_PROJECT_DOCUMENT_INCLUDE,
  matchesLocalProjectDocumentPattern,
  matchesLocalProjectDocumentRules,
  validateLocalProjectConfig,
  validateLocalProjectDocumentPattern,
} from "../src/index.js";

const LIMITS = { maxFiles: 200, maxBytesPerFile: 262144, maxTotalBytes: 2097152 };

describe("default document patterns", () => {
  it("exposes deterministic default include and empty exclude", () => {
    expect(DEFAULT_PROJECT_DOCUMENT_INCLUDE).toEqual(["**/*.md", "**/*.markdown"]);
    expect(DEFAULT_PROJECT_DOCUMENT_EXCLUDE).toEqual([]);
  });

  it("matches root-level and nested Markdown with the default include", () => {
    expect(matchesLocalProjectDocumentPattern("README.md", "**/*.md")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("docs/status.md", "**/*.md")).toBe(true);
  });
});

describe("matchesLocalProjectDocumentPattern", () => {
  it("supports **, *, and ?", () => {
    expect(matchesLocalProjectDocumentPattern("docs/status.md", "docs/**/*.md")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("docs/nested/status.md", "docs/**/*.md")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("docs/nested/status.md", "docs/*.md")).toBe(false);
    expect(matchesLocalProjectDocumentPattern("docs/risk.md", "docs/?isk.md")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("docs/rrisk.md", "docs/?isk.md")).toBe(false);
  });

  it("lets ** span zero directory segments", () => {
    expect(matchesLocalProjectDocumentPattern("docs/x.md", "docs/**/x.md")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("docs/a/b/x.md", "docs/**/x.md")).toBe(true);
  });

  it("matches every descendant of a directory glob", () => {
    expect(matchesLocalProjectDocumentPattern("docs/archive/x.md", "docs/archive/**")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("docs/archive/a/b.md", "docs/archive/**")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("docs/other/x.md", "docs/archive/**")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(matchesLocalProjectDocumentPattern("README.MD", "**/*.md")).toBe(false);
    expect(matchesLocalProjectDocumentPattern("README.md", "**/*.md")).toBe(true);
  });

  it("treats regex metacharacters in patterns as literals", () => {
    expect(matchesLocalProjectDocumentPattern("a+b.md", "a+b.md")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("aaab.md", "a+b.md")).toBe(false);
    expect(matchesLocalProjectDocumentPattern("a.b.md", "a.b.md")).toBe(true);
    expect(matchesLocalProjectDocumentPattern("axb.md", "a.b.md")).toBe(false);
  });

  it("returns false for an invalid pattern instead of throwing", () => {
    expect(matchesLocalProjectDocumentPattern("README.md", "/README.md")).toBe(false);
  });
});

describe("matchesLocalProjectDocumentRules", () => {
  it("requires an include match and lets exclude win", () => {
    const config = { include: ["docs/**/*.md"], exclude: ["docs/archive/**"] };
    expect(matchesLocalProjectDocumentRules("docs/status.md", config)).toBe(true);
    expect(matchesLocalProjectDocumentRules("docs/archive/old.md", config)).toBe(false);
    expect(matchesLocalProjectDocumentRules("README.md", config)).toBe(false);
  });
});

describe("validateLocalProjectDocumentPattern", () => {
  it("rejects unsafe and malformed patterns", () => {
    expect(validateLocalProjectDocumentPattern("")).toBe(false);
    expect(validateLocalProjectDocumentPattern("/abs/path.md")).toBe(false);
    expect(validateLocalProjectDocumentPattern("C:/win.md")).toBe(false);
    expect(validateLocalProjectDocumentPattern("docs\\win.md")).toBe(false);
    expect(validateLocalProjectDocumentPattern("../escape.md")).toBe(false);
    expect(validateLocalProjectDocumentPattern("docs/../x.md")).toBe(false);
    expect(validateLocalProjectDocumentPattern("./docs/x.md")).toBe(false);
    expect(validateLocalProjectDocumentPattern("!docs/x.md")).toBe(false);
    expect(validateLocalProjectDocumentPattern("a".repeat(257))).toBe(false);
  });

  it("accepts safe relative POSIX patterns", () => {
    expect(validateLocalProjectDocumentPattern("README.md")).toBe(true);
    expect(validateLocalProjectDocumentPattern("docs/**/*.md")).toBe(true);
    expect(validateLocalProjectDocumentPattern("docs/?isk.md")).toBe(true);
  });
});

describe("validateLocalProjectConfig", () => {
  it("resolves defaults for a bare version-1 config", () => {
    const result = validateLocalProjectConfig({ version: 1 }, LIMITS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toEqual({
      include: ["**/*.md", "**/*.markdown"],
      exclude: [],
      ...LIMITS,
    });
  });

  it("rejects an unknown top-level key", () => {
    const result = validateLocalProjectConfig({ version: 1, extra: true }, LIMITS);
    expect(result).toMatchObject({ ok: false, code: "project_config_invalid_shape" });
  });

  it("rejects a missing or unsupported version", () => {
    expect(validateLocalProjectConfig({}, LIMITS)).toMatchObject({
      ok: false,
      code: "project_config_unsupported_version",
    });
    expect(validateLocalProjectConfig({ version: 2 }, LIMITS)).toMatchObject({
      ok: false,
      code: "project_config_unsupported_version",
    });
  });

  it("rejects an unknown documents key and an empty include", () => {
    expect(
      validateLocalProjectConfig({ version: 1, documents: { nope: 1 } }, LIMITS),
    ).toMatchObject({ ok: false, code: "project_config_documents_invalid" });
    expect(
      validateLocalProjectConfig({ version: 1, documents: { include: [] } }, LIMITS),
    ).toMatchObject({ ok: false, code: "project_config_include_invalid" });
  });

  it("rejects invalid pattern and non-array pattern lists", () => {
    expect(
      validateLocalProjectConfig({ version: 1, documents: { include: ["/abs"] } }, LIMITS),
    ).toMatchObject({ ok: false, code: "project_config_pattern_invalid" });
    expect(
      validateLocalProjectConfig({ version: 1, documents: { exclude: "docs" } }, LIMITS),
    ).toMatchObject({ ok: false, code: "project_config_exclude_invalid" });
  });

  it("rejects invalid and above-default limits but accepts lower ones", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, "10", true]) {
      expect(
        validateLocalProjectConfig({ version: 1, documents: { maxFiles: bad } }, LIMITS),
      ).toMatchObject({ ok: false, code: "project_config_limit_invalid" });
    }
    expect(
      validateLocalProjectConfig(
        { version: 1, documents: { maxFiles: LIMITS.maxFiles + 1 } },
        LIMITS,
      ),
    ).toMatchObject({ ok: false, code: "project_config_limit_exceeds_default" });
    const lower = validateLocalProjectConfig({ version: 1, documents: { maxFiles: 10 } }, LIMITS);
    expect(lower.ok).toBe(true);
    if (lower.ok) expect(lower.config.maxFiles).toBe(10);
  });

  it("dedupes patterns in first-occurrence order and never mutates input", () => {
    const raw = { version: 1, documents: { include: ["a.md", "b.md", "a.md"] } };
    const snapshot = JSON.parse(JSON.stringify(raw));
    const result = validateLocalProjectConfig(raw, LIMITS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.include).toEqual(["a.md", "b.md"]);
    expect(raw).toEqual(snapshot);
  });

  it("rejects array, null, and non-object roots", () => {
    for (const bad of [[], null, 5, "x"]) {
      expect(validateLocalProjectConfig(bad, LIMITS)).toMatchObject({
        ok: false,
        code: "project_config_invalid_shape",
      });
    }
    expect(
      validateLocalProjectConfig({ version: 1, documents: 5 }, LIMITS),
    ).toMatchObject({ ok: false, code: "project_config_documents_invalid" });
  });
});
