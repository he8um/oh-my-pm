import type { RuntimeRequest, ValidationReport, ValidationTarget } from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";

type FakeKernel = { api: KernelApi; validateCalls: ValidationTarget[] };

function passingReport(target: ValidationTarget): ValidationReport {
  return { target, passed: true, errors: [], warnings: [] };
}

function failingReport(target: ValidationTarget): ValidationReport {
  return {
    target,
    passed: false,
    errors: [{ code: "OMP-K-1002", message: "bad payload", path: "", blocking: true }],
    warnings: [],
  };
}

function fakeKernel(overrides: Partial<KernelApi> = {}): FakeKernel {
  const validateCalls: ValidationTarget[] = [];
  const api: KernelApi = {
    version: () => "kernel-test",
    validateJson: (target) => {
      validateCalls.push(target);
      return passingReport(target);
    },
    checkUpdatePlan: (plan) => ({
      status: "blocked",
      planId: plan.id,
      planHash: `test:${plan.id}`,
      reasons: ["not_used_in_these_tests"],
    }),
    decideTransition: (input) => ({
      from: input.from,
      to: input.to,
      allowed: false,
      reason: "not_used_in_these_tests",
    }),
    ...overrides,
  };
  return { api, validateCalls };
}

function request(kind: RuntimeRequest["kind"]): RuntimeRequest {
  return { id: `req-${kind}`, kind, locale: "en", payload: {} };
}

const traceSteps = (response: { trace?: { step: string }[] }) =>
  (response.trace ?? []).map((entry) => entry.step);

describe("runtime foundation", () => {
  it("validates the request through the kernel before dispatch", async () => {
    const kernel = fakeKernel();
    const runtime = createRuntime({ kernel: kernel.api, version: "2.0.0-alpha.0" });
    await runtime.handle(request("status"));
    expect(kernel.validateCalls).toEqual(["systemRequest"]);
  });

  it("answers status with version data and the full trace", async () => {
    const runtime = createRuntime({ kernel: fakeKernel().api, version: "2.0.0-alpha.0" });
    const response = await runtime.handle(request("status"));
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({
      version: "2.0.0-alpha.0",
      kernelVersion: "kernel-test",
      healthy: true,
    });
    expect(traceSteps(response)).toEqual([
      "runtime.receive",
      "kernel.validate.systemRequest",
      "runtime.status",
    ]);
    expect(() => JSON.stringify(response)).not.toThrow();
  });

  it("answers doctor with a kernel validation check", async () => {
    const runtime = createRuntime({ kernel: fakeKernel().api, version: "2.0.0-alpha.0" });
    const response = await runtime.handle(request("doctor"));
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({
      checks: [
        { id: "kernel.validation", status: "ok", message: "Kernel validation is available" },
      ],
    });
    expect(traceSteps(response)).toContain("runtime.doctor");
  });

  it("fails closed when kernel validation rejects the request", async () => {
    const kernel = fakeKernel({
      validateJson: (target) => failingReport(target),
    });
    const runtime = createRuntime({ kernel: kernel.api, version: "2.0.0-alpha.0" });
    const response = await runtime.handle(request("status"));
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OMP-R-2001");
    expect(traceSteps(response)).not.toContain("runtime.status");
    expect(traceSteps(response)).not.toContain("runtime.doctor");
  });

  it("rejects the unimplemented executeSkill kind", async () => {
    const runtime = createRuntime({ kernel: fakeKernel().api, version: "2.0.0-alpha.0" });
    const response = await runtime.handle(request("executeSkill"));
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OMP-R-2002");
    expect(response.error?.message).toContain("executeSkill");
  });

  it("converts thrown kernel errors into OMP-R-2003 without stack traces", async () => {
    const kernel = fakeKernel({
      validateJson: () => {
        throw new Error("secret internal stack detail");
      },
    });
    const runtime = createRuntime({ kernel: kernel.api, version: "2.0.0-alpha.0" });
    const response = await runtime.handle(request("status"));
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OMP-R-2003");
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("secret internal stack detail");
    expect(serialized).not.toContain("at ");
  });

  it("returns JSON-serializable responses for every kind", async () => {
    const runtime = createRuntime({ kernel: fakeKernel().api, version: "2.0.0-alpha.0" });
    for (const kind of ["status", "doctor", "plan", "executeSkill"] as const) {
      const response = await runtime.handle(request(kind));
      expect(JSON.parse(JSON.stringify(response))).toEqual(response);
    }
  });
});
