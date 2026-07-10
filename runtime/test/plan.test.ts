import type {
  JsonValue,
  RuntimeRequest,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import type { Provider } from "@oh-my-pm/providers";
import type { SkillRegistry } from "@oh-my-pm/skills";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import type { RuntimeDeps } from "../src/index.js";

function passingReport(target: ValidationTarget): ValidationReport {
  return { target, passed: true, errors: [], warnings: [] };
}

function fakeKernel(overrides: Partial<KernelApi> = {}): KernelApi {
  return {
    version: () => "kernel-test",
    validateJson: (target) => passingReport(target),
    checkUpdatePlan: (plan) => ({
      status: "blocked",
      planId: plan.id,
      planHash: `test:${plan.id}`,
      reasons: ["unused"],
    }),
    decideTransition: (input) => ({
      from: input.from,
      to: input.to,
      allowed: false,
      reason: "unused",
    }),
    ...overrides,
  };
}

function planRequest(payload: JsonValue): RuntimeRequest {
  return { id: "req-plan", kind: "plan", locale: "en", payload };
}

function runtimeWith(overrides: Partial<RuntimeDeps> = {}) {
  return createRuntime({
    kernel: fakeKernel(),
    version: "2.0.0-alpha.0",
    now: "test-now",
    ...overrides,
  });
}

const localRegistry = () =>
  createProviderRegistry([
    createLocalProvider({
      items: [
        { id: "task-1", title: "Fix login flow" },
        { id: "task-2", title: "Write onboarding doc" },
      ],
    }),
  ]);

const steps = (response: { trace?: { step: string }[] }) =>
  (response.trace ?? []).map((entry) => entry.step);

describe("runtime plan execution", () => {
  it("plans and executes without provider requests", () => {
    const response = runtimeWith().handle(planRequest({ request: "what is next" }));
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    expect((data["plannerResult"] as Record<string, JsonValue>)["status"]).toBe("ok");
    expect(data["graph"]).toBeDefined();
    expect(data["providerResponses"]).toEqual([]);
    expect((data["skillOutput"] as Record<string, JsonValue>)["ok"]).toBe(true);
    expect(steps(response)).toEqual([
      "runtime.receive",
      "kernel.validate.systemRequest",
      "planner.input",
      "planner.plan",
      "kernel.validate.taskGraph",
      "skill.execute",
    ]);
  });

  it("executes local provider reads and feeds items to the skill", () => {
    const response = runtimeWith({ providers: localRegistry() }).handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    const providerResponses = data["providerResponses"] as Array<Record<string, JsonValue>>;
    expect(providerResponses).toHaveLength(1);
    const output = data["output"] as { tasks: Array<{ title: string }> };
    expect(output.tasks.map((t) => t.title)).toEqual(["Fix login flow", "Write onboarding doc"]);
    expect(steps(response)).toContain("provider.execute");
  });

  it("returns OMP-R-2004 when the payload cannot become planner input", () => {
    const response = runtimeWith().handle(planRequest({ context: {} }));
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OMP-R-2004");
  });

  it("returns OMP-R-2004 when the planner reports missing context", () => {
    const response = runtimeWith().handle(planRequest({ request: "   " }));
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OMP-R-2004");
    const data = response.data as Record<string, JsonValue>;
    expect(data["reason"]).toBe("request_missing");
  });

  it("stops before providers and skills when graph validation fails", () => {
    const kernel = fakeKernel({
      validateJson: (target) =>
        target === "taskGraph"
          ? {
              target,
              passed: false,
              errors: [{ code: "OMP-K-1006", message: "cycle", path: "", blocking: true }],
              warnings: [],
            }
          : passingReport(target),
    });
    const response = runtimeWith({ kernel, providers: localRegistry() }).handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.error?.code).toBe("OMP-R-2007");
    expect(steps(response)).not.toContain("provider.execute");
    expect(steps(response)).not.toContain("skill.execute");
  });

  it("returns OMP-R-2005 when the provider registry is missing", () => {
    const response = runtimeWith().handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.error?.code).toBe("OMP-R-2005");
    expect(response.error?.message).toBe("provider registry is not configured");
  });

  it("returns OMP-R-2005 when a provider execution fails", () => {
    const failingGithub: Provider = {
      descriptor: {
        id: "github",
        name: "Failing GitHub",
        readOnly: true,
        capabilities: [{ action: "search", readOnly: true }],
      },
      execute: () => ({
        ok: false,
        code: "OMP-P-4003",
        message: "credentials missing",
        response: { providerId: "github", items: [] },
      }),
    };
    const response = runtimeWith({ providers: createProviderRegistry([failingGithub]) }).handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "github", action: "search", query: "x" }] },
      }),
    );
    expect(response.error?.code).toBe("OMP-R-2005");
    expect(response.error?.message).toContain("credentials missing");
  });

  it("returns OMP-R-2006 when the skill fails", () => {
    const failingSkills: SkillRegistry = {
      list: () => [],
      get: () => undefined,
      execute: (input) => ({
        skillId: input.skillId,
        ok: false,
        output: { code: "OMP-S-5003", message: "skill exploded" },
        warnings: [{ code: "OMP-S-5003", message: "skill exploded" }],
      }),
    };
    const response = runtimeWith({ skills: failingSkills }).handle(
      planRequest({ request: "what is next" }),
    );
    expect(response.error?.code).toBe("OMP-R-2006");
  });

  it("keeps executeSkill unsupported", () => {
    const response = runtimeWith().handle({
      id: "req-skill",
      kind: "executeSkill",
      locale: "en",
      payload: {},
    });
    expect(response.error?.code).toBe("OMP-R-2002");
  });

  it("produces JSON-serializable responses without stack traces", () => {
    const throwingSkills: SkillRegistry = {
      list: () => [],
      get: () => undefined,
      execute: () => {
        throw new Error("secret skill stack");
      },
    };
    const ok = runtimeWith({ providers: localRegistry() }).handle(
      planRequest({ request: "status report" }),
    );
    expect(JSON.parse(JSON.stringify(ok))).toEqual(ok);
    const thrown = runtimeWith({ skills: throwingSkills }).handle(
      planRequest({ request: "status report" }),
    );
    expect(thrown.error?.code).toBe("OMP-R-2003");
    expect(JSON.stringify(thrown)).not.toContain("secret skill stack");
  });
});
