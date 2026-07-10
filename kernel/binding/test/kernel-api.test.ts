import type { UpdatePlan } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { createUnavailableKernelApi, describeKernelBinding } from "../src/index.js";

const plan: UpdatePlan = {
  id: "plan-1",
  fromVersion: "2.0.0-alpha.0",
  toVersion: "2.0.0-alpha.1",
  steps: [{ kind: "replace", path: "bin/omp" }],
  rollback: { id: "rb-1", createdAt: "caller-supplied", paths: ["bin"] },
};

describe("unavailable kernel api", () => {
  it("reports an unavailable version", () => {
    expect(createUnavailableKernelApi().version()).toBe("unavailable");
  });

  it("fails validation closed with one blocking error", () => {
    const report = createUnavailableKernelApi("test_reason").validateJson("systemRequest", {});
    expect(report.target).toBe("systemRequest");
    expect(report.passed).toBe(false);
    expect(report.errors).toEqual([
      {
        code: "OMP-K-1002",
        message: "Kernel binding unavailable: test_reason",
        path: "",
        blocking: true,
      },
    ]);
    expect(report.warnings).toEqual([]);
  });

  it("blocks update plans with a deterministic placeholder hash", () => {
    const decision = createUnavailableKernelApi("test_reason").checkUpdatePlan(plan);
    expect(decision).toEqual({
      status: "blocked",
      planId: "plan-1",
      planHash: "unavailable:plan-1",
      reasons: ["test_reason"],
    });
  });

  it("refuses state transitions while preserving from/to", () => {
    const decision = createUnavailableKernelApi().decideTransition({
      from: "idea",
      to: "source",
    });
    expect(decision).toEqual({
      from: "idea",
      to: "source",
      allowed: false,
      reason: "kernel_binding_not_configured",
    });
  });

  it("is reported as unavailable by describeKernelBinding", () => {
    const api = createUnavailableKernelApi("why_not");
    expect(describeKernelBinding(api)).toEqual({ status: "unavailable", reason: "why_not" });
  });
});
