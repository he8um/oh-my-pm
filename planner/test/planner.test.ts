import type { PlannerInput } from "@oh-my-pm/contracts";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { createPlanner, planProject } from "../src/index.js";

const registry = createProviderRegistry([
  createLocalProvider({ items: [{ id: "task-1", title: "Fix login flow" }] }),
]);

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return { request: "organize the roadmap", locale: "en", context: {}, ...overrides };
}

describe("planner core", () => {
  it("returns request_missing for an empty request", () => {
    expect(planProject(input({ request: "  " }))).toEqual({
      status: "missingContext",
      missingContext: { reason: "request_missing", requestedContext: ["request"] },
    });
  });

  it("plans a basic request into an ok graph", () => {
    const result = planProject(input());
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.graph.nodes.map((n) => n.id)).toEqual(["plan:planning"]);
    }
  });

  it("creates providerRead nodes for provider requests", () => {
    const result = planProject(
      input({
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
      { providers: registry },
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.graph.nodes.map((n) => n.kind)).toEqual(["providerRead", "skillExecution"]);
    }
  });

  it("fails when the registry is missing a requested provider", () => {
    const result = planProject(
      input({
        context: { providerRequests: [{ providerId: "github", action: "search", query: "x" }] },
      }),
      { providers: registry },
    );
    expect(result).toEqual({
      status: "missingContext",
      missingContext: {
        reason: "provider_not_available",
        requestedContext: ["provider:github"],
      },
    });
  });

  it("does not block provider ids without a registry", () => {
    const result = planProject(
      input({
        context: { providerRequests: [{ providerId: "github", action: "search", query: "x" }] },
      }),
    );
    expect(result.status).toBe("ok");
  });

  it("propagates context extraction failures", () => {
    const result = planProject(input({ context: "not-an-object" }));
    expect(result).toEqual({
      status: "missingContext",
      missingContext: { reason: "context_must_be_object", requestedContext: ["context"] },
    });
  });

  it("creates intent-specific final nodes", () => {
    const status = planProject(input({ request: "project status please" }));
    const risk = planProject(input({ request: "review open risks" }));
    if (status.status === "ok" && risk.status === "ok") {
      expect(status.graph.nodes[0]?.id).toBe("plan:status");
      expect(risk.graph.nodes[0]?.id).toBe("plan:riskReview");
    } else {
      throw new Error("expected ok results");
    }
  });

  it("createPlanner binds deps", () => {
    const planner = createPlanner({ providers: registry });
    const result = planner.plan(
      input({
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(result.status).toBe("ok");
  });
});
