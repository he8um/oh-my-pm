import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  executeMcpProjectTool,
  projectOperationForToolName,
  toolNameForProjectOperation,
} from "../src/index.js";
import type {
  McpProjectOperation,
  McpProjectToolName,
  McpProjectToolSuccess,
} from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = join(repoRoot, "examples", "fixtures", "markdown-project");

function successOf(operation: McpProjectOperation, root: string): McpProjectToolSuccess {
  const execution = executeMcpProjectTool(operation, root);
  expect(execution.ok, execution.ok ? "" : execution.message).toBe(true);
  if (!execution.ok) throw new Error("unreachable");
  return execution;
}

describe("tool/operation mapping", () => {
  it("maps each operation to its exact tool name and back", () => {
    const pairs: Array<[McpProjectOperation, McpProjectToolName]> = [
      ["brief", "project_brief"],
      ["risks", "project_risks"],
      ["next", "project_next"],
      ["handoff", "project_handoff"],
    ];
    for (const [operation, toolName] of pairs) {
      expect(toolNameForProjectOperation(operation)).toBe(toolName);
      expect(projectOperationForToolName(toolName)).toBe(operation);
    }
  });
});

describe("executeMcpProjectTool over the fixture", () => {
  it("produces a config-aware brief without sentinel content", () => {
    const execution = successOf("brief", fixtureRoot);
    expect(execution.operation).toBe("brief");
    expect(execution.root).toBe(fixtureRoot);
    expect(execution.documents.configExists).toBe(true);
    expect(execution.documents.filesLoaded).toBe(4);
    expect(execution.documents.filesExcluded).toBe(2);
    const output = execution.output as { counts?: unknown };
    expect(output.counts).toBeDefined();
    expect(execution.markdown).toContain("# OH MY PM Plan");
    // Excluded documents never reach the loaded set or the markdown.
    expect(JSON.stringify(execution.output)).not.toContain("ARCHIVED-SENTINEL");
    expect(execution.markdown).not.toContain("SCRATCH-SENTINEL");
    // The brief markdown lists highlights, not raw document bodies.
    expect(execution.markdown).not.toContain("Trail survey for the north loop");
  });

  it("produces the CLI-equivalent risk set", () => {
    const execution = successOf("risks", fixtureRoot);
    expect(execution.output).toEqual({
      risks: [
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
      ],
    });
    expect(JSON.stringify(execution.output)).not.toContain("explicit");
    expect(JSON.stringify(execution.output)).not.toContain("SENTINEL");
  });

  it("derives exactly the three unchecked fixture tasks", () => {
    const execution = successOf("next", fixtureRoot);
    expect(execution.output).toEqual({
      tasks: [
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
      ],
    });
    expect(JSON.stringify(execution.output)).not.toContain("Approve the map legend");
    expect(JSON.stringify(execution.output)).not.toContain("SENTINEL");
  });

  it("assembles the fixture handoff sections", () => {
    const execution = successOf("handoff", fixtureRoot);
    const output = execution.output as {
      title: string;
      sections: Array<{ heading: string; items: string[] }>;
    };
    expect(output.title).toBe("Riverline Field Guide");
    expect(output.sections.map((s) => s.heading)).toEqual([
      "Summary",
      "Open Tasks",
      "Risks",
      "Decisions",
    ]);
    const openTasks = output.sections.find((s) => s.heading === "Open Tasks")?.items ?? [];
    expect(openTasks).toEqual([
      "Confirm final paper stock with the supplier.",
      "Export the elevation maps for print.",
      "Assemble the print-ready guide draft.",
    ]);
    expect(JSON.stringify(output)).not.toContain("SENTINEL");
  });
});

describe("executeMcpProjectTool failure mapping", () => {
  it("returns project_root_not_found for an empty string root", () => {
    const execution = executeMcpProjectTool("brief", "   ");
    expect(execution).toMatchObject({ ok: false, code: "project_root_not_found" });
  });

  it("returns project_root_not_found for a missing root", () => {
    const execution = executeMcpProjectTool("brief", join(repoRoot, "does-not-exist"));
    expect(execution).toMatchObject({ ok: false, code: "project_root_not_found" });
  });

  it("returns project_root_not_directory for a file root", () => {
    const base = mkdtempSync(join(tmpdir(), "oh-my-pm-mcp-"));
    try {
      const file = join(base, "file.md");
      writeFileSync(file, "# Not a dir\n", "utf8");
      const execution = executeMcpProjectTool("brief", file);
      expect(execution).toMatchObject({ ok: false, code: "project_root_not_directory" });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("returns project_config_invalid for a malformed config", () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-mcp-cfg-"));
    try {
      writeFileSync(join(root, "README.md"), "# R\n", "utf8");
      writeFileSync(join(root, "oh-my-pm.config.json"), "{ invalid", "utf8");
      const execution = executeMcpProjectTool("brief", root);
      expect(execution).toMatchObject({ ok: false, code: "project_config_invalid" });
      if (!execution.ok) {
        // The message carries the config code and echoes the caller-provided
        // root's config path (here absolute because the caller passed absolute),
        // never a separately resolved path, and no raw JSON.
        expect(execution.message).toContain("project_config_invalid_json");
        expect(execution.message).toBe(
          `invalid project config: ${root}/oh-my-pm.config.json (project_config_invalid_json)`,
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns project_documents_empty when the config excludes everything", () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-mcp-empty-"));
    try {
      writeFileSync(join(root, "README.md"), "# R\n", "utf8");
      writeFileSync(
        join(root, "oh-my-pm.config.json"),
        JSON.stringify({ version: 1, documents: { include: ["docs/**/*.md"] } }),
        "utf8",
      );
      const execution = executeMcpProjectTool("brief", root);
      expect(execution).toMatchObject({ ok: false, code: "project_documents_empty" });
      if (!execution.ok) {
        expect(execution.message).toBe(`no markdown project documents matched under: ${root}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("executeMcpProjectTool safety", () => {
  it("never places the root in the Runtime request payload", () => {
    const execution = successOf("brief", fixtureRoot);
    const data = execution.runtimeResponse.data as { plannerInput?: unknown };
    expect(JSON.stringify(data.plannerInput)).not.toContain("markdown-project");
  });

  it("runs the real WASM Kernel pipeline", () => {
    const execution = successOf("brief", fixtureRoot);
    const steps = (execution.runtimeResponse.trace ?? []).map((entry) => entry.step);
    expect(steps).toContain("kernel.validate.taskGraph");
    expect(steps).toContain("provider.execute");
    expect(steps).toContain("skill.execute");
  });

  it("is deterministic across repeated runs", () => {
    const first = successOf("handoff", fixtureRoot);
    const second = successOf("handoff", fixtureRoot);
    expect(first.output).toEqual(second.output);
    expect(first.markdown).toBe(second.markdown);
  });

  it("leaves the fixture untouched (no writes)", () => {
    const before = executeMcpProjectTool("brief", fixtureRoot);
    const after = executeMcpProjectTool("brief", fixtureRoot);
    expect(JSON.stringify(before)).toBe(JSON.stringify(after));
  });
});
