import type { RuntimeRequest, RuntimeResponse } from "@oh-my-pm/contracts";
import type { Runtime } from "@oh-my-pm/runtime";
import { describe, expect, it } from "vitest";
import { createRuntimeRequest, runCli } from "../src/index.js";

function respondingRuntime(): { runtime: Runtime; requests: RuntimeRequest[] } {
  const requests: RuntimeRequest[] = [];
  const runtime: Runtime = {
    handle(request: RuntimeRequest): RuntimeResponse {
      requests.push(request);
      if (request.kind === "status") {
        return {
          id: request.id,
          ok: true,
          data: { version: "2.0.0-alpha.0", kernelVersion: "kernel-test", healthy: true },
        };
      }
      return {
        id: request.id,
        ok: true,
        data: {
          checks: [
            { id: "kernel.validation", status: "ok", message: "Kernel validation is available" },
          ],
        },
      };
    },
  };
  return { runtime, requests };
}

const failingRuntime: Runtime = {
  handle(request: RuntimeRequest): RuntimeResponse {
    return {
      id: request.id,
      ok: false,
      data: { code: "OMP-R-2001", message: "request failed kernel validation" },
      error: { code: "OMP-R-2001", message: "request failed kernel validation", blocking: true },
    };
  },
};

const throwingRuntime: Runtime = {
  handle(): RuntimeResponse {
    throw new Error("secret stack detail");
  },
};

describe("cli core execution", () => {
  it("runs status with exit 0 and brief stdout", () => {
    const { runtime, requests } = respondingRuntime();
    const result = runCli(["status"], { runtime });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
    expect(result.stderr).toBe("");
    expect(requests).toEqual([createRuntimeRequest("status")]);
  });

  it("runs doctor with json stdout", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["doctor", "--json"], { runtime });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe("cli-doctor");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 2 and stderr for an invalid command", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["nonsense"], { runtime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("error OMP-C-3001: unsupported command: nonsense\n");
  });

  it("infers the requested mode for parse errors", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["nonsense", "--json"], { runtime });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("OMP-C-3001");
  });

  it("returns exit 1 with formatted error for a failed runtime response", () => {
    const result = runCli(["status"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
    expect(result.response?.ok).toBe(false);
  });

  it("converts a thrown runtime into OMP-C-3003 without stack traces", () => {
    const result = runCli(["status"], { runtime: throwingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
    expect(result.stderr).not.toContain("secret stack detail");
    expect(result.stderr).not.toContain("at ");
  });

  it("uses a custom request factory when supplied", () => {
    const { runtime, requests } = respondingRuntime();
    runCli(["status"], { runtime }, (command) => ({
      id: `custom-${command}`,
      kind: command,
      locale: "en",
      payload: { source: "custom" },
    }));
    expect(requests[0]?.id).toBe("custom-status");
  });
});
