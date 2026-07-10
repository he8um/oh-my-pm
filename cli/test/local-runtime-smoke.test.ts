import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import type { RuntimeRequestFactory } from "../src/index.js";

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
});
