// Regression guard for the repository's static-quality and CI reproducibility
// policy (Issue #32).
//
// The policy is only worth having if it cannot silently decay: a reverted
// `--frozen-lockfile`, a dropped lint step, a job with no timeout, or a release
// workflow that became cancelable are all invisible in a green run. These tests
// assert the policy itself, from the committed configuration.
//
// No network, no installs, no builds -- these read files and parse YAML-ish
// structure with plain string scanning, so they stay in the fast `unit` project.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowsDir = join(repoRoot, ".github", "workflows");

const readRepoFile = (relative) => readFileSync(join(repoRoot, relative), "utf8");
const packageJson = JSON.parse(readRepoFile("package.json"));

/** Workflows that run on push/pull_request. Historical release workflows for
 *  already-published lines are point-in-time records and are not re-gated. */
const ACTIVE_CI_WORKFLOWS = ["ci.yml", "v0.5-installed-qualification.yml"];

/** The active release workflow for the line currently being published. */
const ACTIVE_RELEASE_WORKFLOW = "release-v0.5.yml";

/**
 * Every `- name: <step>` / `run:` pair in a workflow, flattened. Good enough to
 * assert which commands a workflow invokes without a YAML dependency.
 */
function runLines(workflowSource) {
  return workflowSource
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("run:") || line.startsWith("- run:"));
}

describe("root quality scripts", () => {
  it("exposes the lint, format, and Rust gates as named scripts", () => {
    // Named scripts are what make the policy runnable identically in CI and on
    // a maintainer's machine; CI must never hold the only copy of a command.
    for (const script of [
      "lint",
      "lint:fix",
      "format",
      "format:check",
      "rust:fmt:check",
      "rust:clippy",
      "quality",
    ]) {
      expect(packageJson.scripts, `missing script: ${script}`).toHaveProperty(script);
    }
  });

  it("declares every tool its scripts invoke", () => {
    // Issue #32 was opened because `eslint` was declared but unconfigured and
    // `.prettierrc` existed with no Prettier. A declared-but-unused tool and an
    // invoked-but-undeclared tool are the same defect from opposite sides.
    const dev = packageJson.devDependencies ?? {};
    expect(dev).toHaveProperty("eslint");
    expect(dev).toHaveProperty("prettier");
    expect(dev).toHaveProperty("typescript-eslint");
    expect(dev).toHaveProperty("@eslint/js");
  });

  it("keeps formatting out of build and test", () => {
    // `format` rewrites files. Wiring it into build or test would make a
    // verification command mutate the tree it is verifying.
    for (const name of ["build", "test", "test:unit", "test:release"]) {
      const script = packageJson.scripts[name] ?? "";
      expect(script, `${name} must not run prettier --write`).not.toMatch(/prettier\s+--write/);
      expect(script, `${name} must not run the format script`).not.toMatch(/\bpnpm format\b/);
    }
  });

  it("runs all four gates from the composite quality script", () => {
    const quality = packageJson.scripts.quality;
    for (const gate of ["lint", "format:check", "rust:fmt:check", "rust:clippy"]) {
      expect(quality, `quality must run ${gate}`).toContain(gate);
    }
  });
});

describe("lint policy", () => {
  it("ships an active flat config", () => {
    expect(existsSync(join(repoRoot, "eslint.config.mjs"))).toBe(true);
    expect(packageJson.scripts.lint).toBe("eslint .");
  });

  it("ignores generated, built, and release output", () => {
    // Linting generated code reports defects that cannot be fixed at the source
    // file, because the next codegen run overwrites it.
    const config = readRepoFile("eslint.config.mjs");
    for (const ignored of [
      "contracts/generated/**",
      "kernel/binding/generated-node/**",
      "**/dist/**",
      "target/**",
      ".release/**",
      "coverage/**",
    ]) {
      expect(config, `eslint must ignore ${ignored}`).toContain(ignored);
    }
  });

  it("keeps no-console on the packages whose architecture forbids process output", () => {
    const config = readRepoFile("eslint.config.mjs");
    expect(config).toContain("no-console");
    for (const pkg of ["installer/src", "application/src", "mcp-server/src"]) {
      expect(config, `no-console scope must cover ${pkg}`).toContain(pkg);
    }
  });
});

describe("formatting policy", () => {
  it("preserves historical records and generated output", () => {
    // Historical release records are evidence of a fixed point in time; a
    // formatter must not rewrite them. Generated and release artifacts are
    // owned by their producers.
    const ignore = readRepoFile(".prettierignore");
    for (const entry of [
      "docs/releases/",
      "docs/v0.3/",
      "docs/v0.4/",
      "contracts/generated/",
      "pnpm-lock.yaml",
      ".release/",
    ]) {
      expect(ignore, `.prettierignore must list ${entry}`).toContain(entry);
    }
  });

  it("still formats active documentation", () => {
    // The exclusions above must not be so broad that current docs drift.
    const ignore = readRepoFile(".prettierignore");
    for (const active of ["README.md", "CHANGELOG.md", "ROADMAP.md", "docs/architecture.md"]) {
      const listed = ignore
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .includes(active);
      expect(listed, `${active} is active documentation and must stay formatted`).toBe(false);
    }
  });
});

describe("CI installation is reproducible", () => {
  it("installs with --frozen-lockfile in every active workflow", () => {
    // A bare `pnpm install` silently re-resolves when the lockfile does not
    // match package.json, so CI can pass against a dependency graph that was
    // never committed and that the release build will not reproduce.
    for (const file of [...ACTIVE_CI_WORKFLOWS, ACTIVE_RELEASE_WORKFLOW]) {
      const source = readFileSync(join(workflowsDir, file), "utf8");
      const installs = runLines(source).filter((line) => /\bpnpm install\b/.test(line));
      expect(installs.length, `${file} should install dependencies`).toBeGreaterThan(0);
      for (const line of installs) {
        expect(line, `${file}: install must be frozen -- got "${line}"`).toContain(
          "--frozen-lockfile",
        );
      }
    }
  });

  it("resolves the committed lockfile without changing it", () => {
    // The strongest available offline proof that a clean checkout installs:
    // --frozen-lockfile --lockfile-only exits non-zero if pnpm-lock.yaml does
    // not already satisfy every workspace manifest. Run with --ignore-scripts
    // and offline resolution so the test performs no build and no network I/O.
    expect(() =>
      execFileSync(
        "pnpm",
        ["install", "--frozen-lockfile", "--lockfile-only", "--ignore-scripts"],
        { cwd: repoRoot, stdio: "pipe", env: { ...process.env, CI: "1" } },
      ),
    ).not.toThrow();

    // The lockfile must be unchanged by that resolution.
    const status = execFileSync("git", ["status", "--porcelain", "pnpm-lock.yaml"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(status.trim(), "pnpm-lock.yaml was modified by a frozen install").toBe("");
  });
});

describe("CI enforces the quality policy", () => {
  it("runs lint, formatting, Rust formatting, and clippy", () => {
    const ci = readFileSync(join(workflowsDir, "ci.yml"), "utf8");
    const runs = runLines(ci).join("\n");
    for (const gate of [
      "pnpm lint",
      "pnpm format:check",
      "pnpm rust:fmt:check",
      "pnpm rust:clippy",
    ]) {
      expect(runs, `ci.yml must run ${gate}`).toContain(gate);
    }
  });

  it("keeps clippy failing on warnings", () => {
    // -D warnings is the whole gate; without it clippy reports and passes.
    expect(packageJson.scripts["rust:clippy"]).toContain("-D warnings");
  });

  it("keeps every existing qualification step", () => {
    // The quality additions must not have displaced release qualification.
    const ci = readFileSync(join(workflowsDir, "ci.yml"), "utf8");
    for (const step of [
      "Portable release bundle smoke",
      "Release archives smoke",
      "Release install smoke",
      "MCP smoke",
      "Application boundary parity",
    ]) {
      expect(ci, `ci.yml lost the "${step}" step`).toContain(step);
    }
  });
});

describe("workflow jobs are bounded", () => {
  it("gives every job in an active workflow an explicit timeout", () => {
    // Without timeout-minutes a hung job runs to GitHub's six-hour default,
    // holding a runner and, for the publish job, a contents: write token.
    for (const file of [...ACTIVE_CI_WORKFLOWS, ACTIVE_RELEASE_WORKFLOW]) {
      const source = readFileSync(join(workflowsDir, file), "utf8");
      // Scan only the `jobs:` block -- two-space-indented keys also appear
      // under `on:` (push, pull_request), which are triggers, not jobs.
      const jobsBlock = source.slice(source.indexOf("\njobs:"));
      const jobKeys = [...jobsBlock.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]);
      const timeouts = jobsBlock.match(/^ {4}timeout-minutes: \d+$/gm) ?? [];
      expect(jobKeys.length, `${file} should declare jobs`).toBeGreaterThan(0);
      expect(
        timeouts.length,
        `${file}: ${jobKeys.length} jobs but ${timeouts.length} timeout-minutes`,
      ).toBe(jobKeys.length);
    }
  });

  it("keeps timeouts bounded rather than nominal", () => {
    // An arbitrarily huge value satisfies "has a timeout" while defeating it.
    for (const file of readdirSync(workflowsDir)) {
      const source = readFileSync(join(workflowsDir, file), "utf8");
      for (const match of source.matchAll(/timeout-minutes: (\d+)/g)) {
        expect(Number(match[1]), `${file}: implausible timeout ${match[1]}`).toBeLessThanOrEqual(
          60,
        );
      }
    }
  });
});

describe("concurrency is safe for releases", () => {
  it("cancels superseded pull-request runs only", () => {
    for (const file of ACTIVE_CI_WORKFLOWS) {
      const source = readFileSync(join(workflowsDir, file), "utf8");
      expect(source, `${file} needs a concurrency group`).toMatch(/^concurrency:$/m);
      // Cancellation is conditional on the event, never an unconditional true:
      // a push run on main is the evidence a release qualifies against.
      expect(source).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
      expect(source).not.toMatch(/cancel-in-progress: true/);
      // Grouping by PR number keeps one PR's runs from cancelling another's.
      expect(source).toContain("github.event.pull_request.number || github.ref");
    }
  });

  it("never cancels the release workflow", () => {
    const source = readFileSync(join(workflowsDir, ACTIVE_RELEASE_WORKFLOW), "utf8");
    expect(source).toContain("cancel-in-progress: false");
    expect(source).not.toMatch(/cancel-in-progress: true/);
  });

  it("keeps publication manually gated behind the protected environment", () => {
    const source = readFileSync(join(workflowsDir, ACTIVE_RELEASE_WORKFLOW), "utf8");
    // Manual dispatch only: no push, pull_request, tag, schedule, or release
    // trigger may reach a job that can create a tag or a GitHub Release.
    const triggerBlock = source.slice(source.indexOf("\non:"), source.indexOf("\npermissions:"));
    expect(triggerBlock).toContain("workflow_dispatch:");
    for (const trigger of ["push:", "pull_request:", "schedule:", "release:"]) {
      expect(triggerBlock, `release workflow must not trigger on ${trigger}`).not.toContain(
        trigger,
      );
    }
    // The publish job stays behind the protected environment.
    expect(source).toContain("environment:");
    expect(source).toContain("name: github-release");
  });
});
