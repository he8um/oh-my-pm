import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runMcpProjectToolExamples } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = join(repoRoot, "examples", "fixtures", "markdown-project");

describe("mcp project tool examples", () => {
  it("runs all four tools over the configured fixture document set", () => {
    const examples = runMcpProjectToolExamples(fixtureRoot);
    for (const execution of Object.values(examples)) {
      expect(execution.ok, execution.ok ? "" : execution.message).toBe(true);
      if (!execution.ok) continue;
      // The same config-aware document set is used across all four tools.
      expect(execution.documents.filesLoaded).toBe(4);
      expect(execution.documents.filesExcluded).toBe(2);
      expect(execution.documents.configExists).toBe(true);
      // Excluded sentinel content never appears in any workflow's output.
      const serialized = `${JSON.stringify(execution.output)}\n${execution.markdown}`;
      expect(serialized).not.toContain("ARCHIVED-SENTINEL");
      expect(serialized).not.toContain("SCRATCH-SENTINEL");
    }
  });

  it("produces identical document selection across tools", () => {
    const examples = runMcpProjectToolExamples(fixtureRoot);
    const docs = Object.values(examples).map((execution) =>
      execution.ok ? execution.documents.filesLoaded : -1,
    );
    expect(docs).toEqual([4, 4, 4, 4]);
  });
});
