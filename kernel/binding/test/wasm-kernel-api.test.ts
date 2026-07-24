// Proves the TypeScript boundary reaches the real Rust Kernel through the
// generated WASM binding. Requires the binding build to have run first.

import type { TaskGraph, UpdatePlan } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  createNodeWasmKernelApi,
  describeKernelBinding,
  isNodeWasmKernelAvailable,
} from "../src/index.js";

const validGraph: TaskGraph = {
  nodes: [
    {
      id: "read",
      kind: "providerRead",
      title: "Read provider items",
      dependsOn: [],
      payload: {},
    },
    {
      id: "summarize",
      kind: "skillExecution",
      title: "Summarize items",
      dependsOn: ["read"],
      payload: {},
    },
  ],
};

const duplicateIdGraph: TaskGraph = {
  nodes: [
    { id: "read", kind: "providerRead", title: "Read once", dependsOn: [], payload: {} },
    { id: "read", kind: "providerRead", title: "Read twice", dependsOn: [], payload: {} },
  ],
};

const validPlan: UpdatePlan = {
  id: "plan-1",
  fromVersion: "2.0.0-alpha.0",
  toVersion: "2.0.0-alpha.1",
  steps: [{ kind: "replace", path: "bin/omp" }],
  rollback: { id: "rb-1", createdAt: "caller-supplied", paths: ["bin"] },
};

const sameVersionPlan: UpdatePlan = {
  ...validPlan,
  toVersion: validPlan.fromVersion,
};

describe("node wasm kernel api", () => {
  it("reports the binding as available after a build", () => {
    expect(isNodeWasmKernelAvailable()).toBe(true);
  });

  it("returns the real Kernel version", () => {
    expect(createNodeWasmKernelApi().version()).toBe("0.2.0-rc.1");
  });

  it("is described as a configured wasm binding", () => {
    expect(describeKernelBinding(createNodeWasmKernelApi())).toEqual({
      status: "configured",
      mode: "wasm",
    });
  });

  it("passes a valid task graph through Kernel validation", () => {
    const report = createNodeWasmKernelApi().validateJson("taskGraph", validGraph);
    expect(report.target).toBe("taskGraph");
    expect(report.passed).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("fails a task graph with duplicate node ids", () => {
    const report = createNodeWasmKernelApi().validateJson("taskGraph", duplicateIdGraph);
    expect(report.passed).toBe(false);
    expect(report.errors.some((finding) => finding.message.includes("duplicate"))).toBe(true);
  });

  it("allows a valid update plan through the update guard", () => {
    const decision = createNodeWasmKernelApi().checkUpdatePlan(validPlan);
    expect(decision.status).toBe("allowed");
    expect(decision.planId).toBe("plan-1");
    expect(decision.reasons).toEqual([]);
  });

  it("blocks a same-version update plan", () => {
    const decision = createNodeWasmKernelApi().checkUpdatePlan(sameVersionPlan);
    expect(decision.status).toBe("blocked");
    expect(decision.reasons).toContain("same_version");
  });

  it("allows the idea to source transition", () => {
    const decision = createNodeWasmKernelApi().decideTransition({ from: "idea", to: "source" });
    expect(decision).toEqual({ from: "idea", to: "source", allowed: true, reason: "allowed" });
  });

  it("blocks the frozen to source transition", () => {
    const decision = createNodeWasmKernelApi().decideTransition({
      from: "frozen",
      to: "source",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("transition_not_allowed");
  });
});
