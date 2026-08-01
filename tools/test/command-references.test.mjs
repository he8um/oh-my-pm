// The reference-regression check must do two things that pull in opposite
// directions: catch a deprecated command reintroduced as the primary one, and
// leave the many legitimate uses of the product name "oh-my-pm" alone.
//
// A validator that only ever passes proves nothing, so these tests plant real
// regressions in a scratch file inside the repository (so `git ls-files
// --others` sees it), run the checker, and assert it fails for the right reason.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(toolsDir, "..");
const checker = join(toolsDir, "validate-command-references.mjs");

const scratchDirs = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function run() {
  const result = spawnSync(process.execPath, [checker], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Write a scratch file inside the repository (untracked but not ignored, so the
 * checker sees it) and return its repo-relative path.
 */
function plant(contents, extension = ".md") {
  const dir = mkdtempSync(join(repoRoot, "docs", "scratch-refcheck-"));
  scratchDirs.push(dir);
  const file = join(dir, `sample${extension}`);
  writeFileSync(file, contents, "utf8");
  return relative(repoRoot, file);
}

describe("the repository is clean", () => {
  it("passes with no legacy command references in active surfaces", () => {
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate-command-references: OK");
  }, 30000);
});

describe("catches a reintroduced legacy command", () => {
  it("fails when active documentation invokes the old CLI", () => {
    const rel = plant("# Sample\n\n```bash\noh-my-pm status\n```\n");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(rel);
    expect(result.stderr).toContain("legacy command invocation");
  }, 30000);

  it("fails for each legacy command family", () => {
    for (const line of ["oh-my-pm brief .", "oh-my-pm-mcp", "oh-my-pm-install --prefix /x"]) {
      const rel = plant(`# Sample\n\n\`\`\`bash\n${line}\n\`\`\`\n`);
      const result = run();
      expect(result.status, line).toBe(1);
      expect(result.stderr, line).toContain(rel);
      scratchDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
    }
  }, 60000);

  it("fails when a generated configuration invokes the old MCP command", () => {
    const rel = plant(
      JSON.stringify({ mcpServers: { "oh-my-pm": { command: "bin/oh-my-pm-mcp" } } }, null, 2),
      ".json",
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(rel);
  }, 30000);

  it("fails when a help or usage line names the old executable", () => {
    const rel = plant("Usage:\n  oh-my-pm <command> [options]\n", ".md");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(rel);
  }, 30000);

  it("fails when an installer completion message names an old bin path", () => {
    const rel = plant("Installed:\n- <prefix>/bin/oh-my-pm\n", ".md");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(rel);
    expect(result.stderr).toContain("installed bin path");
  }, 30000);

  it("explains where a legacy name is allowed", () => {
    plant("# Sample\n\n```bash\noh-my-pm status\n```\n");
    const result = run();
    // The guidance is wrapped across lines, so normalize whitespace before
    // asserting the phrases a contributor needs to see.
    const guidance = result.stderr.replace(/\s+/g, " ");
    expect(guidance).toContain("compatibility wrapper");
    expect(guidance).toContain("migration documentation");
    expect(guidance).toContain("historical release content");
    expect(guidance).toContain("command-surface manifest");
  }, 30000);
});

describe("does not flag product identity", () => {
  // These are the uses the v0.5 migration deliberately preserves. Flagging any
  // of them would make the check unusable and would push a future contributor to
  // "fix" a name that must not change.
  //
  // Each case asserts only that its OWN planted file is not reported, so the
  // assertion is about the pattern precision rather than the whole repository's
  // current state.
  it("allows the package scope, env prefix, and Rust identifier", () => {
    const rel = plant(
      [
        "# Sample",
        "",
        `The \`@oh-my-pm/cli\` package reads \`OH_MY_PM${"_"}GITHUB_TOKEN\`.`,
        "The Rust binding is `oh_my_pm_kernel`.",
        "",
      ].join("\n"),
    );
    const result = run();
    expect(result.stderr, "planted file must not be reported").not.toContain(rel);
  }, 30000);

  it("allows the installation directory and release archive names", () => {
    const rel = plant(
      [
        "# Sample",
        "",
        "Installed under `<prefix>/lib/oh-my-pm/versions/0.5.0/`.",
        "Archives are `oh-my-pm-v0.5.0.tar.gz` and `oh-my-pm-v0.5.0.zip`.",
        "",
      ].join("\n"),
    );
    const result = run();
    expect(result.stderr, "planted file must not be reported").not.toContain(rel);
  }, 30000);

  it("allows the project config filename and config directories", () => {
    const rel = plant(
      [
        "# Sample",
        "",
        "Configure with `oh-my-pm.config.json` in the project root.",
        "Provider config resolves from `~/.config/oh-my-pm/providers.json`.",
        "",
      ].join("\n"),
    );
    const result = run();
    expect(result.stderr, "planted file must not be reported").not.toContain(rel);
  }, 30000);

  it("allows the MCP server key and the repository slug", () => {
    const rel = plant(
      [
        "# Sample",
        "",
        'The server key remains `"oh-my-pm"`.',
        "The repository is `he8um/oh-my-pm`.",
        "",
      ].join("\n"),
    );
    const result = run();
    expect(result.stderr, "planted file must not be reported").not.toContain(rel);
  }, 30000);

  it("allows the canonical commands", () => {
    const rel = plant(
      [
        "# Sample",
        "",
        "```bash",
        "ohmypm status",
        "ohmypm brief . --markdown",
        "ohmypm memory timeline --project-id example",
        "ohmypm-mcp",
        "ohmypm-install --prefix /opt/omp --apply",
        "```",
        "",
      ].join("\n"),
    );
    const result = run();
    expect(result.stderr, "planted file must not be reported").not.toContain(rel);
  }, 30000);
});
