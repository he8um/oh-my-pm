import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { describe, expect, it } from "vitest";
import {
  loadConfiguredMarkdownProjectDocuments,
  loadMarkdownProjectDocuments,
  runCli,
} from "../src/index.js";
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
  it("runs status", async () => {
    const result = await runCli(["status"], { runtime: localRuntime() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
  });

  it("runs doctor in markdown", async () => {
    const result = await runCli(["doctor", "--markdown"], { runtime: localRuntime() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Doctor");
  });

  it("runs a provider-backed plan end-to-end", async () => {
    const result = await runCli(
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

  it("runs brief end-to-end over configured fixture documents", async () => {
    // The wrapper uses the configured loader, which applies the fixture's
    // oh-my-pm.config.json: exactly the four included documents, with the
    // archived and scratch documents excluded.
    const configured = loadConfiguredMarkdownProjectDocuments(fixtureRoot);
    expect(configured.ok).toBe(true);
    if (!configured.ok) return;
    expect(configured.configExists).toBe(true);
    expect(configured.documents.filesLoaded).toBe(4);
    const runtime = createRuntime({
      kernel: createNodeWasmKernelApi(),
      providers: createProviderRegistry([
        createLocalProvider({ items: configured.documents.items }),
      ]),
      skills: createDefaultSkillRegistry(),
      version: "2.0.0-alpha.0-local",
      now: "2026-01-01T00:00:00.000Z",
    });
    const result = await runCli(["brief", fixtureRoot, "--json"], { runtime });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.skillOutput.skillId).toBe("summarizeStatus");
    expect(parsed.data.output.counts.total).toBe(4);
  });
});

describe("bin wrapper brief smoke", () => {
  it("produces a fixture-grounded json brief through the full pipeline", async () => {
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

  it("renders a markdown brief with fixture titles", async () => {
    const result = runBin(["brief", "examples/fixtures/markdown-project", "--markdown"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Plan");
    expect(result.stdout).toContain("- Total: 4");
    expect(result.stdout).toContain("Riverline Field Guide");
  });

  it("exits with 2 for a missing root without executing the runtime", async () => {
    const result = runBin(["brief", "examples/fixtures/does-not-exist"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("project root was not found");
    expect(result.stderr).toContain("examples/fixtures/does-not-exist");
  });

  it("exits with 2 for a root without markdown documents", async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "oh-my-pm-empty-"));
    try {
      const result = runBin(["brief", emptyRoot]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`no markdown project documents matched under: ${emptyRoot}\n`);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

describe("bin wrapper risks smoke", () => {
  it("detects body-grounded risks through the full pipeline in json mode", async () => {
    const loaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(loaded.ok).toBe(true);

    const result = runBin(["risks", "examples/fixtures/markdown-project", "--json"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe("cli-risks");
    expect(parsed.ok).toBe(true);

    // Full Runtime path with the final risk skill.
    const steps = parsed.trace.map((entry: { step: string }) => entry.step);
    expect(steps).toContain("planner.plan");
    expect(steps).toContain("kernel.validate.taskGraph");
    expect(steps).toContain("provider.execute");
    expect(steps).toContain("skill.execute");
    expect(parsed.data.skillOutput.skillId).toBe("extractRisks");
    expect(parsed.data.skillOutput.ok).toBe(true);

    // The constraints document has a neutral title and keywords only in its
    // Markdown body, so this detection proves data.content reaches the skill.
    // Only keyword-bearing documents are reported: keyword-free documents are
    // no longer aliased into explicit risks by the Runtime.
    expect(parsed.data.output.risks).toEqual([
      {
        id: "docs/risks.md",
        title: "Delivery Constraints",
        severity: "high",
        reason: "keyword:blocked",
      },
      {
        id: "docs/status.md",
        title: "Status",
        severity: "high",
        reason: "keyword:blocked",
      },
    ]);
    expect(JSON.stringify(parsed.data.output)).not.toContain("explicit");

    // The root path stays out of the Runtime payload and the seed items are gone.
    expect(JSON.stringify(parsed.data.plannerInput)).not.toContain("markdown-project");
    expect(result.stdout).not.toContain("Finalize project roadmap");
    expect(result.stdout).not.toContain("Prepare launch handoff");

    // The read-only run left the fixture project untouched.
    const reloaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(reloaded).toEqual(loaded);
  });

  it("renders a markdown risk report limited to keyword-bearing documents", async () => {
    const result = runBin(["risks", "examples/fixtures/markdown-project", "--markdown"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Project Risks");
    expect(result.stdout).toContain("- Total: 2");
    expect(result.stdout).toContain("- High: 2");
    expect(result.stdout).toContain("- **high** — Delivery Constraints — `keyword:blocked`");
    expect(result.stdout).toContain("- **high** — Status — `keyword:blocked`");
    expect(result.stdout).not.toContain("Riverline Field Guide");
    expect(result.stdout).not.toContain("Decisions");
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.endsWith("\n\n")).toBe(false);
    // The report lists titles and reasons, never document bodies.
    expect(result.stdout).not.toContain("paper supplier");
  });

  it("exits with 2 for a missing risks root without executing the runtime", async () => {
    const result = runBin(["risks", "examples/fixtures/does-not-exist", "--json"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "project root was not found: examples/fixtures/does-not-exist\n",
    );
  });

  it("exits with 2 for a risks root without markdown documents", async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "oh-my-pm-empty-"));
    try {
      const result = runBin(["risks", emptyRoot]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`no markdown project documents matched under: ${emptyRoot}\n`);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

describe("bin wrapper next smoke", () => {
  it("derives fixture checkbox tasks through the full pipeline in json mode", async () => {
    const loaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(loaded.ok).toBe(true);

    const result = runBin(["next", "examples/fixtures/markdown-project", "--json"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe("cli-next");
    expect(parsed.ok).toBe(true);
    expect(parsed.data.skillOutput.skillId).toBe("deriveNextTasks");
    expect(parsed.data.skillOutput.ok).toBe(true);

    // Exactly the three unchecked fixture checkboxes, in Markdown order; the
    // checked task and plain document titles never become tasks.
    expect(parsed.data.output.tasks).toEqual([
      {
        id: "docs/status.md#task-1",
        title: "Confirm final paper stock with the supplier.",
        reason: "markdown_unchecked_task",
      },
      {
        id: "docs/status.md#task-2",
        title: "Export the elevation maps for print.",
        reason: "markdown_unchecked_task",
      },
      {
        id: "docs/status.md#task-3",
        title: "Assemble the print-ready guide draft.",
        reason: "markdown_unchecked_task",
      },
    ]);
    // The checked checkbox appears in the raw document content that the JSON
    // response carries, but it must never appear in the derived task output.
    expect(JSON.stringify(parsed.data.output)).not.toContain("Approve the map legend");
    expect(result.stdout).not.toContain("Finalize project roadmap");
    expect(result.stdout).not.toContain("Prepare launch handoff");
    expect(JSON.stringify(parsed.data.plannerInput)).not.toContain("markdown-project");

    // The read-only run left the fixture project untouched.
    const reloaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(reloaded).toEqual(loaded);
  });

  it("renders a markdown next-task report with totals and reasons", async () => {
    const result = runBin(["next", "examples/fixtures/markdown-project", "--markdown"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Next Tasks");
    expect(result.stdout).toContain("- Total: 3");
    expect(result.stdout).toContain(
      "- Confirm final paper stock with the supplier. — `markdown_unchecked_task`",
    );
    expect(result.stdout).toContain(
      "- Export the elevation maps for print. — `markdown_unchecked_task`",
    );
    expect(result.stdout).toContain(
      "- Assemble the print-ready guide draft. — `markdown_unchecked_task`",
    );
    expect(result.stdout).not.toContain("Approve the map legend");
    // The report lists task titles and reasons, never document bodies.
    expect(result.stdout).not.toContain("Trail survey");
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.endsWith("\n\n")).toBe(false);
  });

  it("exits with 2 for a missing next root without executing the runtime", async () => {
    const result = runBin(["next", "examples/fixtures/does-not-exist", "--json"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "project root was not found: examples/fixtures/does-not-exist\n",
    );
  });

  it("exits with 2 for a next root without markdown documents", async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "oh-my-pm-empty-"));
    try {
      const result = runBin(["next", emptyRoot]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`no markdown project documents matched under: ${emptyRoot}\n`);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

describe("bin wrapper handoff smoke", () => {
  it("assembles a fixture-grounded json handoff through the full pipeline", async () => {
    const loaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(loaded.ok).toBe(true);

    const result = runBin(["handoff", "examples/fixtures/markdown-project", "--json"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe("cli-handoff");
    expect(parsed.ok).toBe(true);

    // Full Runtime path with the final handoff skill.
    const steps = parsed.trace.map((entry: { step: string }) => entry.step);
    expect(steps).toContain("planner.plan");
    expect(steps).toContain("kernel.validate.taskGraph");
    expect(steps).toContain("provider.execute");
    expect(steps).toContain("skill.execute");
    expect(parsed.data.skillOutput.skillId).toBe("createHandoff");
    expect(parsed.data.skillOutput.ok).toBe(true);

    const output = parsed.data.output;
    expect(output.title).toBe("Riverline Field Guide");
    expect(output.sections.map((s: { heading: string }) => s.heading)).toEqual([
      "Summary",
      "Open Tasks",
      "Risks",
      "Decisions",
    ]);

    const byHeading = (heading: string): string[] =>
      output.sections.find((s: { heading: string }) => s.heading === heading)?.items ?? [];

    // Open tasks: exactly the three unchecked fixture checkboxes; the checked
    // task and generic document titles never become tasks.
    expect(byHeading("Open Tasks")).toEqual([
      "Confirm final paper stock with the supplier.",
      "Export the elevation maps for print.",
      "Assemble the print-ready guide draft.",
    ]);
    expect(JSON.stringify(output)).not.toContain("Approve the map legend");
    expect(byHeading("Open Tasks")).not.toContain("Riverline Field Guide");
    expect(byHeading("Open Tasks")).not.toContain("Status");

    // Risks: body-grounded blocker/constraint lines from the neutral-title
    // constraints document and the status Blocked section.
    expect(byHeading("Risks")).toEqual([
      "The printing quote is blocked until the paper supplier responds (owner: Jordan).",
      "The updated cover artwork approval is urgent and due this week (owner: Sam).",
      "Elevation data licensing is an external dependency that still needs a final confirmation (owner: Alex).",
      "A courier strike could cause a delay for the sample shipment (owner: Jordan).",
      "The printing quote is blocked waiting on the paper supplier (owner: Jordan).",
    ]);

    // Decisions: the fixture decision lines from the Decisions document.
    expect(byHeading("Decisions")).toEqual([
      "Decision: the spring edition ships as a single printed volume, not two booklets.",
      "Decided by: Jordan",
      "Date: 2026-03-02",
    ]);

    // The Runtime never aliases generic items into explicit collections, and
    // the seed titles never appear.
    expect(JSON.stringify(parsed.data.plannerInput)).not.toContain("markdown-project");
    expect(result.stdout).not.toContain("Finalize project roadmap");
    expect(result.stdout).not.toContain("Prepare launch handoff");

    // The read-only run left the fixture project untouched.
    const reloaded = loadMarkdownProjectDocuments(fixtureRoot);
    expect(reloaded).toEqual(loaded);
  });

  it("renders a markdown handoff without dumping full document bodies", async () => {
    const result = runBin(["handoff", "examples/fixtures/markdown-project", "--markdown"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# OH MY PM Project Handoff");
    expect(result.stdout).toContain("- Project: Riverline Field Guide");
    expect(result.stdout).toContain("## Summary");
    expect(result.stdout).toContain("## Open Tasks");
    expect(result.stdout).toContain("## Risks");
    expect(result.stdout).toContain("## Decisions");
    expect(result.stdout).toContain("Generated at: `2026-01-01T00:00:00.000Z`");
    expect(result.stdout).toContain("Ship the printable spring edition of the trail guide.");
    // Neutral preamble prose from the constraints document must not appear.
    expect(result.stdout).not.toContain("proves that document content");
    // The read-only survey narrative from the constraints doc is not dumped.
    expect(result.stdout).not.toContain("Open constraints for the fictional");
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.endsWith("\n\n")).toBe(false);
  });

  it("exits with 2 for a missing handoff root without executing the runtime", async () => {
    const result = runBin(["handoff", "examples/fixtures/does-not-exist", "--json"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("project root was not found: examples/fixtures/does-not-exist\n");
  });

  it("exits with 2 for a handoff root without markdown documents", async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "oh-my-pm-empty-"));
    try {
      const result = runBin(["handoff", emptyRoot]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`no markdown project documents matched under: ${emptyRoot}\n`);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

describe("bin wrapper configured document selection", () => {
  const commands = ["brief", "risks", "next", "handoff"] as const;

  it("applies the fixture config so sentinels never reach any workflow", async () => {
    for (const command of commands) {
      const result = runBin([command, "examples/fixtures/markdown-project", "--json"]);
      expect(result.stderr, command).toBe("");
      expect(result.status, command).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.ok, command).toBe(true);

      // Provider context is exactly the four included documents; the archived
      // and scratch documents are excluded before the provider ever sees them.
      const items = parsed.data.providerResponses[0].items;
      expect(items.map((item: { id: string }) => item.id), command).toEqual([
        "README.md",
        "docs/decisions.md",
        "docs/risks.md",
        "docs/status.md",
      ]);

      // Excluded content never enters the response at all — the whole JSON
      // (including raw provider content) is free of both sentinels.
      expect(result.stdout, command).not.toContain("ARCHIVED-SENTINEL");
      expect(result.stdout, command).not.toContain("SCRATCH-SENTINEL");
      // Old hard-coded seed titles never appear.
      expect(result.stdout, command).not.toContain("Finalize project roadmap");
      expect(result.stdout, command).not.toContain("Prepare launch handoff");
    }
  });

  it("keeps included content present across the workflows", async () => {
    const brief = runBin(["brief", "examples/fixtures/markdown-project", "--markdown"]);
    expect(brief.stdout).toContain("Riverline Field Guide");
    const handoff = runBin(["handoff", "examples/fixtures/markdown-project", "--markdown"]);
    expect(handoff.stdout).toContain("Ship the printable spring edition of the trail guide.");
  });

  it("produces deterministic output across repeated runs", async () => {
    const first = runBin(["handoff", "examples/fixtures/markdown-project", "--json"]);
    const second = runBin(["handoff", "examples/fixtures/markdown-project", "--json"]);
    expect(first.status).toBe(0);
    expect(first.stdout).toBe(second.stdout);
  });

  it("preserves current behavior when no config exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-noconfig-"));
    try {
      writeFileSync(join(root, "README.md"), "# Solo\n\n## Current objective\n\nShip it.\n", "utf8");
      const result = runBin(["handoff", root, "--json"]);
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.data.providerResponses[0].items.map((i: { id: string }) => i.id)).toEqual([
        "README.md",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits with 2 and skips the runtime for an invalid config", async () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-badconfig-"));
    try {
      writeFileSync(join(root, "README.md"), "# Solo\n", "utf8");
      writeFileSync(join(root, "oh-my-pm.config.json"), "{ invalid json", "utf8");
      const result = runBin(["brief", root, "--json"]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("invalid project config:");
      expect(result.stderr).toContain("project_config_invalid_json");
      expect(result.stderr).toContain(`${root}/oh-my-pm.config.json`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits with 2 when the config excludes every document", async () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-excludeall-"));
    try {
      writeFileSync(join(root, "README.md"), "# Solo\n", "utf8");
      writeFileSync(
        join(root, "oh-my-pm.config.json"),
        JSON.stringify({ version: 1, documents: { include: ["docs/**/*.md"] } }),
        "utf8",
      );
      const result = runBin(["risks", root, "--json"]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`no markdown project documents matched under: ${root}\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies a configured limit to reduce selected documents deterministically", async () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-limit-"));
    try {
      writeFileSync(join(root, "a.md"), "# A\n\n## Current objective\n\nOne.\n", "utf8");
      writeFileSync(join(root, "b.md"), "# B\n", "utf8");
      writeFileSync(join(root, "c.md"), "# C\n", "utf8");
      writeFileSync(
        join(root, "oh-my-pm.config.json"),
        JSON.stringify({ version: 1, documents: { include: ["*.md"], maxFiles: 2 } }),
        "utf8",
      );
      const result = runBin(["brief", root, "--json"]);
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.data.providerResponses[0].items.map((i: { id: string }) => i.id)).toEqual([
        "a.md",
        "b.md",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
