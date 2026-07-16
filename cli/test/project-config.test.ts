// Tests for the read-only Node project-configuration loader. Temporary
// directories are created and removed only inside these tests; the loader under
// test must never mutate anything.

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
  OH_MY_PM_PROJECT_CONFIG_FILENAME,
  OH_MY_PM_PROJECT_CONFIG_VERSION,
  loadConfiguredMarkdownProjectDocuments,
  loadLocalProjectConfig,
} from "../src/index.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-config-"));
  roots.push(root);
  return root;
}

function writeConfig(root: string, text: string): void {
  writeFileSync(join(root, OH_MY_PM_PROJECT_CONFIG_FILENAME), text, "utf8");
}

function snapshot(root: string): string[] {
  return readdirSync(root).sort();
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("loadLocalProjectConfig", () => {
  it("exposes the canonical filename and version", () => {
    expect(OH_MY_PM_PROJECT_CONFIG_FILENAME).toBe("oh-my-pm.config.json");
    expect(OH_MY_PM_PROJECT_CONFIG_VERSION).toBe(1);
  });

  it("resolves defaults when the config is absent", () => {
    const root = makeRoot();
    const result = loadLocalProjectConfig(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exists).toBe(false);
    expect(result.config).toEqual({
      include: ["**/*.md", "**/*.markdown"],
      exclude: [],
      maxFiles: DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
      maxBytesPerFile: 262144,
      maxTotalBytes: 2097152,
    });
  });

  it("loads a valid minimal config", () => {
    const root = makeRoot();
    writeConfig(root, JSON.stringify({ version: 1 }));
    const result = loadLocalProjectConfig(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.exists).toBe(true);
  });

  it("loads a valid full config with lower limits", () => {
    const root = makeRoot();
    writeConfig(
      root,
      JSON.stringify({
        version: 1,
        documents: {
          include: ["README.md", "docs/**/*.md"],
          exclude: ["docs/archive/**"],
          maxFiles: 50,
          maxBytesPerFile: 1024,
          maxTotalBytes: 4096,
        },
      }),
    );
    const result = loadLocalProjectConfig(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toEqual({
      include: ["README.md", "docs/**/*.md"],
      exclude: ["docs/archive/**"],
      maxFiles: 50,
      maxBytesPerFile: 1024,
      maxTotalBytes: 4096,
    });
  });

  it("uses the user-provided root for displayPath and leaks no absolute path", () => {
    const root = makeRoot();
    const result = loadLocalProjectConfig(".");
    expect(result.displayPath).toBe("./oh-my-pm.config.json");
    expect(result.displayPath).not.toContain(root);
    expect(result.displayPath).not.toMatch(/^\//);
  });

  it("considers only the exact filename and does not search parents", () => {
    const parent = makeRoot();
    // A parent config with a distinctive lower limit must never apply to a
    // child root that has no config of its own.
    writeConfig(parent, JSON.stringify({ version: 1, documents: { maxFiles: 5 } }));
    const childRoot = mkdtempSync(join(parent, "child-"));
    roots.push(childRoot);
    const result = loadLocalProjectConfig(childRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exists).toBe(false);
    expect(result.config.maxFiles).toBe(DEFAULT_PROJECT_DOCUMENT_MAX_FILES);
  });

  it("also ignores a differently named config file", () => {
    const root = makeRoot();
    writeFileSync(join(root, "config.json"), JSON.stringify({ version: 1 }), "utf8");
    const result = loadLocalProjectConfig(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.exists).toBe(false);
  });

  it("does not follow a symlinked config", () => {
    const root = makeRoot();
    const real = join(makeRoot(), "real.json");
    writeFileSync(real, JSON.stringify({ version: 1 }), "utf8");
    symlinkSync(real, join(root, OH_MY_PM_PROJECT_CONFIG_FILENAME));
    const result = loadLocalProjectConfig(root);
    expect(result).toMatchObject({ ok: false, code: "project_config_read_failed" });
  });

  it("rejects a config larger than 64 KiB", () => {
    const root = makeRoot();
    const padding = " ".repeat(70 * 1024);
    writeConfig(root, `${JSON.stringify({ version: 1 })}${padding}`);
    const result = loadLocalProjectConfig(root);
    expect(result).toMatchObject({ ok: false, code: "project_config_read_failed" });
  });

  it("rejects malformed JSON", () => {
    const root = makeRoot();
    writeConfig(root, "{ not json");
    expect(loadLocalProjectConfig(root)).toMatchObject({
      ok: false,
      code: "project_config_invalid_json",
    });
  });

  it("rejects array and null roots", () => {
    const arrayRoot = makeRoot();
    writeConfig(arrayRoot, "[]");
    expect(loadLocalProjectConfig(arrayRoot)).toMatchObject({
      ok: false,
      code: "project_config_invalid_shape",
    });
    const nullRoot = makeRoot();
    writeConfig(nullRoot, "null");
    expect(loadLocalProjectConfig(nullRoot)).toMatchObject({
      ok: false,
      code: "project_config_invalid_shape",
    });
  });

  it("rejects unknown keys, bad versions, and bad shapes", () => {
    const cases: Array<[string, string]> = [
      [JSON.stringify({ version: 1, extra: 1 }), "project_config_invalid_shape"],
      [JSON.stringify({}), "project_config_unsupported_version"],
      [JSON.stringify({ version: 2 }), "project_config_unsupported_version"],
      [JSON.stringify({ version: 1, documents: 5 }), "project_config_documents_invalid"],
      [JSON.stringify({ version: 1, documents: { nope: 1 } }), "project_config_documents_invalid"],
      [JSON.stringify({ version: 1, documents: { include: 5 } }), "project_config_include_invalid"],
      [JSON.stringify({ version: 1, documents: { include: [] } }), "project_config_include_invalid"],
      [JSON.stringify({ version: 1, documents: { include: [5] } }), "project_config_pattern_invalid"],
      [JSON.stringify({ version: 1, documents: { include: ["/abs"] } }), "project_config_pattern_invalid"],
      [JSON.stringify({ version: 1, documents: { exclude: 5 } }), "project_config_exclude_invalid"],
      [JSON.stringify({ version: 1, documents: { maxFiles: 0 } }), "project_config_limit_invalid"],
      [JSON.stringify({ version: 1, documents: { maxFiles: -1 } }), "project_config_limit_invalid"],
      [JSON.stringify({ version: 1, documents: { maxFiles: 1.5 } }), "project_config_limit_invalid"],
      [
        JSON.stringify({ version: 1, documents: { maxFiles: DEFAULT_PROJECT_DOCUMENT_MAX_FILES + 1 } }),
        "project_config_limit_exceeds_default",
      ],
    ];
    for (const [text, code] of cases) {
      const root = makeRoot();
      writeConfig(root, text);
      expect(loadLocalProjectConfig(root), text).toMatchObject({ ok: false, code });
    }
  });

  it("dedupes patterns in first-occurrence order", () => {
    const root = makeRoot();
    writeConfig(root, JSON.stringify({ version: 1, documents: { include: ["a.md", "b.md", "a.md"] } }));
    const result = loadLocalProjectConfig(root);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.include).toEqual(["a.md", "b.md"]);
  });

  it("never returns raw config text and never mutates the filesystem", () => {
    const root = makeRoot();
    // Distinctive whitespace formatting that only survives if raw text leaks;
    // the resolved config carries structured values, never the source text.
    const text = `{\n  "version": 1,\n  "documents": { "include": ["README.md"] }\n}\n`;
    writeConfig(root, text);
    const before = snapshot(root);
    const beforeStat = statSync(join(root, OH_MY_PM_PROJECT_CONFIG_FILENAME)).mtimeMs;
    const result = loadLocalProjectConfig(root);
    // The literal source formatting must not appear in the returned result.
    expect(JSON.stringify(result)).not.toContain('\\n  "version"');
    expect(readFileSync(join(root, OH_MY_PM_PROJECT_CONFIG_FILENAME), "utf8")).toBe(text);
    expect(snapshot(root)).toEqual(before);
    expect(statSync(join(root, OH_MY_PM_PROJECT_CONFIG_FILENAME)).mtimeMs).toBe(beforeStat);
  });
});

describe("loadConfiguredMarkdownProjectDocuments", () => {
  it("applies include/exclude to the loaded document set", () => {
    const root = makeRoot();
    writeConfig(
      root,
      JSON.stringify({
        version: 1,
        documents: { include: ["docs/**/*.md"], exclude: ["docs/archive/**"] },
      }),
    );
    const archive = join(root, "docs", "archive");
    mkdirSync(archive, { recursive: true });
    writeFileSync(join(root, "README.md"), "# Readme\n", "utf8");
    writeFileSync(join(root, "docs", "status.md"), "# Status\n", "utf8");
    writeFileSync(join(archive, "old.md"), "# Archived\n", "utf8");

    const result = loadConfiguredMarkdownProjectDocuments(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.configExists).toBe(true);
    // README is not included (config include is docs/**/*.md), archive is
    // excluded, so only docs/status.md remains.
    expect(result.documents.items.map((item) => item.id)).toEqual(["docs/status.md"]);
  });

  it("stops on a config failure before reading documents", () => {
    const root = makeRoot();
    writeConfig(root, "{ invalid");
    writeFileSync(join(root, "README.md"), "# Readme\n", "utf8");
    const result = loadConfiguredMarkdownProjectDocuments(root);
    expect(result).toMatchObject({ ok: false, code: "project_config_invalid_json" });
  });
});
