import type { ProviderRequest } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { buildTaskGraph, collectPlannerNodeIds, finalNodeId, providerNodeId } from "../src/index.js";

const requests: ProviderRequest[] = [
  { providerId: "local", action: "list", query: "" },
  { providerId: "github", action: "search", query: "login" },
];

describe("task graph builder", () => {
  it("formats provider node ids", () => {
    expect(providerNodeId(0, requests[0]!)).toBe("provider:0:local:list");
    expect(providerNodeId(1, requests[1]!)).toBe("provider:1:github:search");
  });

  it("formats final node ids", () => {
    expect(finalNodeId("status")).toBe("plan:status");
    expect(finalNodeId("riskReview")).toBe("plan:riskReview");
  });

  it("builds a one-node graph without provider requests", () => {
    const graph = buildTaskGraph({
      intent: "planning",
      request: "organize the roadmap",
      locale: "en",
      providerRequests: [],
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toEqual({
      id: "plan:planning",
      kind: "skillExecution",
      title: "Create project plan",
      dependsOn: [],
      payload: { intent: "planning", request: "organize the roadmap", locale: "en" },
    });
  });

  it("creates provider nodes first and a final node depending on all of them", () => {
    const graph = buildTaskGraph({
      intent: "nextTask",
      request: "what is next",
      locale: "en",
      providerRequests: requests,
    });
    expect(graph.nodes.map((n) => n.id)).toEqual([
      "provider:0:local:list",
      "provider:1:github:search",
      "plan:nextTask",
    ]);
    expect(graph.nodes[0]?.kind).toBe("providerRead");
    expect(graph.nodes[0]?.title).toBe("Read local context");
    expect(graph.nodes[0]?.payload).toEqual({ providerRequest: requests[0] });
    expect(graph.nodes[2]?.dependsOn).toEqual([
      "provider:0:local:list",
      "provider:1:github:search",
    ]);
  });

  it("uses intent-specific final titles", () => {
    const titles = {
      status: "Prepare project status",
      riskReview: "Review project risks",
      nextTask: "Derive next tasks",
      planning: "Create project plan",
      handoff: "Create project handoff",
    } as const;
    for (const [intent, title] of Object.entries(titles)) {
      const graph = buildTaskGraph({
        intent: intent as keyof typeof titles,
        request: "r",
        locale: "en",
        providerRequests: [],
      });
      expect(graph.nodes[0]?.title).toBe(title);
    }
  });

  it("collects planner node ids deterministically", () => {
    const graph = buildTaskGraph({
      intent: "handoff",
      request: "prepare handoff",
      locale: "fa",
      providerRequests: requests,
    });
    expect(collectPlannerNodeIds(graph)).toEqual({
      providerNodeIds: ["provider:0:local:list", "provider:1:github:search"],
      finalNodeId: "plan:handoff",
    });
  });
});
