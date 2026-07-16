import type { NormalizedProviderItem, TaskNode } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import {
  notesFromPlannerContext,
  providerItemsToTextItems,
  providerRequestFromNode,
  skillIdForIntent,
  skillInputForPlan,
} from "../src/index.js";

describe("skillIdForIntent", () => {
  it("maps every intent to a deterministic skill", () => {
    expect(skillIdForIntent("status")).toBe("summarizeStatus");
    expect(skillIdForIntent("riskReview")).toBe("extractRisks");
    expect(skillIdForIntent("nextTask")).toBe("deriveNextTasks");
    expect(skillIdForIntent("planning")).toBe("deriveNextTasks");
    expect(skillIdForIntent("handoff")).toBe("createHandoff");
  });
});

describe("providerRequestFromNode", () => {
  const validNode: TaskNode = {
    id: "provider:0:local:list",
    kind: "providerRead",
    title: "Read local context",
    dependsOn: [],
    payload: { providerRequest: { providerId: "local", action: "list", query: "", limit: 3 } },
  };

  it("parses a valid provider node", () => {
    expect(providerRequestFromNode(validNode)).toEqual({
      providerId: "local",
      action: "list",
      query: "",
      limit: 3,
    });
  });

  it("returns null for invalid nodes", () => {
    expect(providerRequestFromNode({ ...validNode, kind: "skillExecution" })).toBeNull();
    expect(providerRequestFromNode({ ...validNode, payload: {} })).toBeNull();
    expect(
      providerRequestFromNode({
        ...validNode,
        payload: { providerRequest: { providerId: "nope", action: "list", query: "" } },
      }),
    ).toBeNull();
    expect(
      providerRequestFromNode({
        ...validNode,
        payload: { providerRequest: { providerId: "local", action: "write", query: "" } },
      }),
    ).toBeNull();
  });
});

describe("providerItemsToTextItems", () => {
  it("maps data fields and preserves order", () => {
    const items: NormalizedProviderItem[] = [
      {
        id: "1",
        type: "task",
        title: "One",
        source: "local",
        data: { body: "b", status: "open", owner: "sam", due: "2026-08-01", tags: ["x"] },
      },
      { id: "2", type: "task", title: "Two", source: "local", data: { summary: "s" } },
      { id: "3", type: "task", title: "Three", source: "local", data: {} },
    ];
    expect(providerItemsToTextItems(items)).toEqual([
      { id: "1", title: "One", body: "b", status: "open", owner: "sam", due: "2026-08-01", tags: ["x"] },
      { id: "2", title: "Two", body: "s" },
      { id: "3", title: "Three" },
    ]);
  });

  it("maps document data.content into body as the third fallback", () => {
    const items: NormalizedProviderItem[] = [
      {
        id: "docs/a.md",
        type: "document",
        title: "A",
        source: "local",
        data: { path: "docs/a.md", content: "The launch is blocked.", bytes: 22 },
      },
    ];
    expect(providerItemsToTextItems(items)).toEqual([
      { id: "docs/a.md", title: "A", body: "The launch is blocked." },
    ]);
  });

  it("keeps body over summary over content precedence", () => {
    const withAll: NormalizedProviderItem = {
      id: "1",
      type: "document",
      title: "T",
      source: "local",
      data: { body: "the-body", summary: "the-summary", content: "the-content" },
    };
    const withSummaryAndContent: NormalizedProviderItem = {
      id: "2",
      type: "document",
      title: "T",
      source: "local",
      data: { summary: "the-summary", content: "the-content" },
    };
    expect(providerItemsToTextItems([withAll])[0]?.body).toBe("the-body");
    expect(providerItemsToTextItems([withSummaryAndContent])[0]?.body).toBe("the-summary");
  });

  it("does not copy path or bytes and does not mutate the provider item", () => {
    const item: NormalizedProviderItem = {
      id: "docs/a.md",
      type: "document",
      title: "A",
      source: "local",
      data: { path: "docs/a.md", content: "text", bytes: 4 },
    };
    const snapshot = JSON.parse(JSON.stringify(item));
    const mapped = providerItemsToTextItems([item]);
    expect(mapped).toEqual([{ id: "docs/a.md", title: "A", body: "text" }]);
    expect(item).toEqual(snapshot);
  });
});

describe("notesFromPlannerContext", () => {
  it("extracts trimmed non-empty notes", () => {
    expect(notesFromPlannerContext({ notes: [" a ", "", 4, "b"] })).toEqual(["a", "b"]);
    expect(notesFromPlannerContext("nope")).toEqual([]);
    expect(notesFromPlannerContext({})).toEqual([]);
  });
});

describe("skillInputForPlan", () => {
  it("builds the expected envelope with the supplied now", () => {
    const envelope = skillInputForPlan({
      skillId: "deriveNextTasks",
      locale: "en",
      now: "injected-now",
      request: "what is next",
      graph: { nodes: [] },
      providerItems: [
        { id: "1", type: "task", title: "One", source: "local", data: {} },
      ],
      notes: ["remember"],
    });
    expect(envelope.skillId).toBe("deriveNextTasks");
    expect(envelope.context).toEqual({ locale: "en", now: "injected-now" });
    const input = envelope.input as Record<string, unknown>;
    expect(input["title"]).toBe("what is next");
    expect(input["items"]).toEqual([{ id: "1", title: "One" }]);
    expect(input["tasks"]).toEqual([{ id: "1", title: "One" }]);
    expect(input["notes"]).toEqual(["remember"]);
    expect(input["context"]).toEqual({ graph: { nodes: [] } });
  });

  it("omits empty arrays", () => {
    const envelope = skillInputForPlan({
      skillId: "summarizeStatus",
      locale: "fa",
      now: "t0",
      request: "status",
      graph: { nodes: [] },
      providerItems: [],
      notes: [],
    });
    const input = envelope.input as Record<string, unknown>;
    expect("items" in input).toBe(false);
    expect("notes" in input).toBe(false);
  });
});
