// Mutation tests for the v0.5.3 documentation-truth guards.
//
// A guard that has never been observed to FAIL is not evidence of anything: it
// may be matching nothing at all. Each test here introduces exactly one
// contradiction into a disposable copy of the repository, asserts that
// validate-doc-truth rejects it with the specific message for that guard, then
// asserts the unmutated copy passes. That is what makes these regression tests
// rather than smoke tests.
//
// The copy is a real git repository because the classification guard enumerates
// documents with `git ls-files`. Only the files the guards read are copied, so a
// case sets up in milliseconds instead of cloning the whole tree.
//
// Fixture content is read from the git INDEX (`git show :path`), never from the
// working tree. tools/test/doc-truth.test.mjs drives the same validator by
// temporarily editing real repository files and restoring them afterwards; with
// Vitest file parallelism those edits are visible to this suite for as long as
// they are in place. Reading committed content makes the two suites independent
// regardless of interleaving, rather than relying on them never overlapping.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [];

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Read a path's committed content from the git index.
 *
 * Returns null when the path is not tracked, so a caller can skip it the same
 * way it would skip a missing file.
 */
function committed(rel) {
  const r = spawnSync("git", ["show", `:${rel}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}

/** Committed content as UTF-8 text, or null when untracked. */
function committedText(rel) {
  const buf = committed(rel);
  return buf === null ? null : buf.toString("utf8");
}

/**
 * The files the documentation guards actually read: the three canonical
 * contracts, the derived-fact sources, and every classified document.
 */
function fixtureFileList() {
  const manifest = JSON.parse(committedText("docs/manifest.json"));
  return [
    "version.json",
    "release-state.json",
    "command-surface.json",
    "pnpm-workspace.yaml",
    "docs/manifest.json",
    "mcp-server/src/server.ts",
    "application/src/memory-types.ts",
    "application/package.json",
    ...manifest.documents.map((d) => d.path),
  ];
}

/** A disposable git repository containing just enough of the tree to validate. */
function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-doc-truth-"));
  roots.push(root);

  const workspaceDirs = [
    ...committedText("pnpm-workspace.yaml").matchAll(/^\s*-\s*"([^"]+)"/gm),
  ].map((m) => m[1]);

  const files = [...new Set(fixtureFileList().filter((f) => typeof f === "string"))];
  for (const dir of workspaceDirs) files.push(`${dir}/package.json`);

  // The tools themselves, so the validator runs against the fixture tree.
  for (const tool of [
    "validate-doc-truth.mjs",
    "docs-manifest.mjs",
    "docs-inventory.mjs",
    "release-state.mjs",
    "command-surface.mjs",
  ]) {
    files.push(`tools/${tool}`);
  }

  for (const rel of files) {
    const content = committed(rel);
    // A file the guards tolerate as absent stays absent.
    if (content === null) continue;
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

/** Run validate-doc-truth inside a fixture repo. */
function validate(root) {
  const r = spawnSync(process.execPath, [join(root, "tools", "validate-doc-truth.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

const readFixture = (root, rel) => readFileSync(join(root, rel), "utf8");
const writeFixture = (root, rel, text) => {
  writeFileSync(join(root, rel), text);
  execFileSync("git", ["add", "-A"], { cwd: root });
};
const patchManifest = (root, mutate) => {
  const manifest = JSON.parse(readFixture(root, "docs/manifest.json"));
  mutate(manifest);
  writeFixture(root, "docs/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
};

describe("validate-doc-truth documentation classification guards", () => {
  it("accepts the repository as committed", () => {
    const result = validate(fixtureRepo());
    expect(result.output).toContain("validate-doc-truth: OK");
    expect(result.status).toBe(0);
  });

  // -- Guard: active docs must not name a nonexistent package ---------------

  it("rejects an active document that names a nonexistent workspace package", () => {
    const root = fixtureRepo();
    const before = validate(root);
    expect(before.status).toBe(0);

    // The exact drift the v0.5.3 audit looked for: a package that does not exist
    // presented as part of the implemented system.
    writeFixture(
      root,
      "docs/architecture.md",
      `${readFixture(root, "docs/architecture.md")}\n\n### Brain\n\n\`@oh-my-pm/brain\` owns task graph logic.\n`,
    );

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("@oh-my-pm/brain");
    expect(after.output).toContain("not a workspace package");
  });

  // -- Guard: the package map must omit no real package ---------------------

  it("rejects an authoritative package map that omits a real workspace package", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    // Remove every mention of one real package from the architecture map.
    const stripped = readFixture(root, "docs/architecture.md").replaceAll(
      "@oh-my-pm/planner",
      "the planning layer",
    );
    writeFixture(root, "docs/architecture.md", stripped);

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("omits the real workspace package");
    expect(after.output).toContain("@oh-my-pm/planner");
  });

  // -- Guard: a superseded document must not be linked as normative ---------

  it("rejects an active normative document that links a superseded document", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    // Mark a real historical document superseded, then link it from an active
    // normative document as though it were current guidance.
    patchManifest(root, (manifest) => {
      const doc = manifest.documents.find((d) => d.path === "docs/v0.3/architecture.md");
      doc.status = "superseded";
      doc.replacement = "docs/architecture.md";
    });
    writeFixture(
      root,
      "docs/getting-started.md",
      `${readFixture(root, "docs/getting-started.md")}\n\nSee [the architecture](v0.3/architecture.md).\n`,
    );

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("superseded document");
    expect(after.output).toContain("docs/v0.3/architecture.md");
  });

  it("accepts a superseded document that is linked only from a historical document", () => {
    const root = fixtureRepo();
    // Superseding a document must not retroactively break the historical
    // documents that legitimately reference it as part of their own record.
    patchManifest(root, (manifest) => {
      const doc = manifest.documents.find((d) => d.path === "docs/v0.3/architecture.md");
      doc.status = "superseded";
      doc.replacement = "docs/architecture.md";
    });

    const after = validate(root);
    expect(after.output).toContain("validate-doc-truth: OK");
    expect(after.status).toBe(0);
  });

  // -- Guard: one authoritative document per concern ------------------------

  it("rejects two active normative documents claiming the same concern", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    patchManifest(root, (manifest) => {
      const architecture = manifest.documents.find((d) => d.path === "docs/architecture.md");
      const other = manifest.documents.find((d) => d.path === "docs/security-model.md");
      other.concern = architecture.concern;
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("duplicate authoritative document");
    expect(after.output).toContain("architecture");
  });

  // -- Guard: every tracked document is classified --------------------------

  it("rejects a tracked document that the manifest does not classify", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    writeFixture(root, "docs/new-untracked-concern.md", "# A new document\n\nUnclassified.\n");

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("docs/new-untracked-concern.md");
    expect(after.output).toContain("not classified");
  });

  // -- Manifest structural invariants ---------------------------------------

  it("rejects a superseded document with no replacement", () => {
    const root = fixtureRepo();
    patchManifest(root, (manifest) => {
      const doc = manifest.documents.find((d) => d.path === "docs/v0.3/architecture.md");
      doc.status = "superseded";
      doc.replacement = null;
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("replacement must name the replacing document");
  });

  it("rejects a replacement path that does not resolve", () => {
    const root = fixtureRepo();
    patchManifest(root, (manifest) => {
      const doc = manifest.documents.find((d) => d.path === "docs/v0.3/architecture.md");
      doc.status = "superseded";
      doc.replacement = "docs/does-not-exist.md";
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("docs/does-not-exist.md does not exist");
  });

  it("rejects a classified document that has been deleted", () => {
    const root = fixtureRepo();
    rmSync(join(root, "docs/security-model.md"));
    execFileSync("git", ["add", "-A"], { cwd: root });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("docs/security-model.md is classified but does not exist");
  });

  it("rejects a document classified twice", () => {
    const root = fixtureRepo();
    patchManifest(root, (manifest) => {
      const doc = manifest.documents.find((d) => d.path === "docs/security-model.md");
      manifest.documents.push({ ...doc, concern: "security-model-duplicate" });
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("is listed more than once");
  });

  it("rejects an active document that declares a replacement", () => {
    const root = fixtureRepo();
    patchManifest(root, (manifest) => {
      const doc = manifest.documents.find((d) => d.path === "docs/security-model.md");
      doc.replacement = "docs/architecture.md";
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("an active document must not declare a replacement");
  });

  it("rejects an unknown status or authority", () => {
    const root = fixtureRepo();
    patchManifest(root, (manifest) => {
      manifest.documents.find((d) => d.path === "docs/security-model.md").status = "provisional";
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("status must be one of");
  });
});

describe("docs-inventory command", () => {
  function inventory(root, args) {
    const r = spawnSync(process.execPath, [join(root, "tools", "docs-inventory.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
    });
    return { status: r.status, output: `${r.stdout}${r.stderr}` };
  }

  it("reports a clean inventory for the repository as committed", () => {
    const root = fixtureRepo();
    const result = inventory(root, ["--json"]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.output);
    expect(report.totals.unclassified).toBe(0);
    expect(report.totals.brokenReplacements).toBe(0);
    expect(report.totals.missingFiles).toBe(0);
    expect(report.totals.activeNormative).toBeGreaterThan(0);
    expect(report.totals.releaseRecords).toBeGreaterThan(0);
  });

  it("is deterministic across runs", () => {
    const root = fixtureRepo();
    expect(inventory(root, ["--json"]).output).toBe(inventory(root, ["--json"]).output);
  });

  it("reports an unclassified document and fails under --strict", () => {
    const root = fixtureRepo();
    writeFixture(root, "docs/brand-new.md", "# New\n");

    const report = JSON.parse(inventory(root, ["--json"]).output);
    expect(report.unclassified).toContain("docs/brand-new.md");

    expect(inventory(root, ["--strict"]).status).toBe(1);
  });

  it("excludes test fixtures from the unclassified report", () => {
    const root = fixtureRepo();
    mkdirSync(join(root, "examples/fixtures/markdown-project"), { recursive: true });
    writeFixture(root, "examples/fixtures/markdown-project/status.md", "# Status\n");

    const report = JSON.parse(inventory(root, ["--json"]).output);
    expect(report.unclassified).not.toContain("examples/fixtures/markdown-project/status.md");
    expect(inventory(root, ["--strict"]).status).toBe(0);
  });
});
