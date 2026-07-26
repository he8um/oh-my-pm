// v0.3 Phase 4 — memory boundary invariants: runCli fails closed on memory, the
// Project Memory package is imported only lazily on the memory path, and legacy
// commands never statically resolve it.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { runCli } from "../src/cli.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("runCli fails closed on the memory command", () => {
  it("never routes a memory command through the Runtime", async () => {
    const runtime = createRuntime({
      kernel: createNodeWasmKernelApi(),
      providers: createProviderRegistry([createLocalProvider({ items: [] })]),
      skills: createDefaultSkillRegistry(),
      version: "0.2.0",
      now: "2026-01-01T00:00:00.000Z",
    });
    const result = await runCli(["memory", "status"], { runtime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("memory command must be handled at the process boundary");
  });
});

describe("Project Memory is imported only lazily on the memory path", () => {
  const memoryProcessSource = readFileSync(join(srcDir, "memory-process.ts"), "utf8");

  it("uses a dynamic import of @oh-my-pm/project-memory", () => {
    expect(memoryProcessSource).toContain('import("@oh-my-pm/project-memory")');
  });

  it("does not statically import @oh-my-pm/project-memory anywhere", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      // A static import specifier is `from "@oh-my-pm/project-memory"`. The
      // dynamic `import("@oh-my-pm/project-memory")` form is the only allowed use.
      expect(contents, `${file} must not statically import project-memory`).not.toContain(
        'from "@oh-my-pm/project-memory"',
      );
    }
  });

  it("keeps the memory package out of the CLI production dependency set", () => {
    const pkg = JSON.parse(readFileSync(join(srcDir, "..", "package.json"), "utf8"));
    expect(pkg.dependencies?.["@oh-my-pm/project-memory"]).toBeUndefined();
    // It is a dev/build-time dependency only (workspace type resolution).
    expect(pkg.devDependencies?.["@oh-my-pm/project-memory"]).toBe("workspace:*");
  });
});
