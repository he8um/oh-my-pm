// v0.3 Phase 4 — memory boundary invariants: runCli fails closed on memory.
//
// v0.5.1: the memory orchestration and its lazy Project Memory import moved to
// @oh-my-pm/application, which asserts the lazy-import invariant in its own
// suite (application/test/memory-boundary.test.ts). What remains here is the
// CLI-side invariant: the pure runCli path never handles a memory command, and
// no CLI source statically resolves Project Memory.

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
      version: "0.3.1",
      now: "2026-01-01T00:00:00.000Z",
    });
    const result = await runCli(["memory", "status"], { runtime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("memory command must be handled at the process boundary");
  });
});

describe("the CLI never statically resolves Project Memory", () => {
  it("does not statically import @oh-my-pm/project-memory anywhere", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      expect(contents, `${file} must not statically import project-memory`).not.toContain(
        'from "@oh-my-pm/project-memory"',
      );
    }
  });

  it("takes project-memory as a runtime dependency reached only via lazy import", () => {
    // The CLI takes @oh-my-pm/project-memory as a RUNTIME dependency so the
    // self-contained bundle ships it and the installed memory commands resolve
    // without a workspace checkout. It is still reached ONLY through the
    // application layer's dynamic import, never a static startup import, so a
    // genuine absence falls back safely. It must not be a dev-only dependency.
    const pkg = JSON.parse(readFileSync(join(srcDir, "..", "package.json"), "utf8"));
    expect(pkg.dependencies?.["@oh-my-pm/project-memory"]).toBe("workspace:*");
    expect(pkg.devDependencies?.["@oh-my-pm/project-memory"]).toBeUndefined();
  });
});
