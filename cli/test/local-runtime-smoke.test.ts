import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { describe, expect, it } from "vitest";
import { loadMarkdownProjectDocuments, runCli } from "../src/index.js";
import type { RuntimeRequestFactory } from "../src/index.js";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pkgDir, "..");
const binPath = join(pkgDir, "bin", "oh-my-pm.mjs");
const fixtureRoot = join(repoRoot, "examples", "fixtures", "markdown-project");

function runBin(args: readonly string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function localRuntime() {
  // Real WASM Kernel binding; fails with a clear build hint when the
  // generated binding is missing.
  return createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers: createProviderRegistry([
      createLocalProvider({
        items: [
          { id: "task-1", title: "Finalize project roadmap", type: "task" },
          { id: "risk-1", title: "Blocked dependency on design review", type: "task" },
        ],
      }),
    ]),
    skills: createDefaultSkillRegistry(),
    version: "2.0.0-alpha.0-local",
    now: "2026-01-01T00:00:00.000Z",
  });
}

const providerBackedFactory: RuntimeRequestFactory = (command, input) => ({
  id: `cli-${command}`,
  kind: "plan",
  locale: "en",
  payload: {
    source: "cli",
    request: input ?? "review risks",
    context: {
      providerRequests: [{ providerId: "local", action: "search", query: "blocked", limit: 5 }],
    },
  },
});

describe("cli core with a wrapper-equivalent local runtime", () => {
  it("runs status", () => {
    const result = runCli(["status"], { runtime: localRuntime() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
  });

  it("runs doctor in markdown", () => {
    const result = runCli(["doctor", "--markdown"], { runtime: localRuntime() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Doctor");
  });

  it("runs a provider-backed plan end-to-end", () => {
    const result = runCli(
      ["plan", "review", "risks", "--json"],
      { runtime: localRuntime() },
      providerBackedFactory,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.providerResponses.length).toBeGreaterThanOrEqual(1);
    expect(parsed.data.skillOutput.ok).toBe(true);
    const steps = parsed.trace.map((entry: { step: string }) => entry.step);
    expect(steps).toContain("provider.execute");
  });

  it("runs brief end-to-end over loaded fixture documents", () => {
    const loaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(loaded.ok).toBe(true);
    expect(loaded.filesLoaded).toBe(4);
    const runtime = createRuntime({
      kernel: createNodeWasmKernelApi(),
      providers: createProviderRegistry([createLocalProvider({ items: loaded.items })]),
      skills: createDefaultSkillRegistry(),
      version: "2.0.0-alpha.0-local",
      now: "2026-01-01T00:00:00.000Z",
    });
    const result = runCli(["brief", fixtureRoot, "--json"], { runtime });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.skillOutput.skillId).toBe("summarizeStatus");
    expect(parsed.data.output.counts.total).toBe(4);
  });
});

describe("bin wrapper brief smoke", () => {
  it("produces a fixture-grounded json brief through the full pipeline", () => {
    const loaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(loaded.ok).toBe(true);

    const result = runBin(["brief", "examples/fixtures/markdown-project", "--json"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe("cli-brief");
    expect(parsed.ok).toBe(true);

    // Runtime path: planner, kernel graph validation, provider read, skill.
    const steps = parsed.trace.map((entry: { step: string }) => entry.step);
    expect(steps).toContain("planner.plan");
    expect(steps).toContain("kernel.validate.taskGraph");
    expect(steps).toContain("provider.execute");
    expect(steps).toContain("skill.execute");

    // Provider context is the fixture documents, not the seed items.
    const items = parsed.data.providerResponses[0].items;
    expect(items.map((item: { id: string }) => item.id)).toEqual([
      "README.md",
      "docs/decisions.md",
      "docs/risks.md",
      "docs/status.md",
    ]);
    expect(result.stdout).toContain("Riverline Field Guide");
    expect(result.stdout).not.toContain("Finalize project roadmap");
    expect(result.stdout).not.toContain("Prepare launch handoff");

    // The final status skill ran over the fixture documents.
    expect(parsed.data.skillOutput.skillId).toBe("summarizeStatus");
    expect(parsed.data.skillOutput.ok).toBe(true);
    expect(parsed.data.output.counts.total).toBe(4);

    // The read-only run left the fixture project untouched.
    const reloaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(reloaded).toEqual(loaded);
  });

  it("renders a markdown brief with fixture titles", () => {
    const result = runBin(["brief", "examples/fixtures/markdown-project", "--markdown"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Plan");
    expect(result.stdout).toContain("- Total: 4");
    expect(result.stdout).toContain("Riverline Field Guide");
  });

  it("exits with 2 for a missing root without executing the runtime", () => {
    const result = runBin(["brief", "examples/fixtures/does-not-exist"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("project root was not found");
    expect(result.stderr).toContain("examples/fixtures/does-not-exist");
  });

  it("exits with 2 for a root without markdown documents", () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "oh-my-pm-empty-"));
    try {
      const result = runBin(["brief", emptyRoot]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`no markdown project documents found under: ${emptyRoot}\n`);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});
