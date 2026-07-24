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
      {
        id: "1",
        title: "One",
        source: "local",
        type: "task",
        body: "b",
        status: "open",
        owner: "sam",
        due: "2026-08-01",
        tags: ["x"],
      },
      { id: "2", title: "Two", source: "local", type: "task", body: "s" },
      { id: "3", title: "Three", source: "local", type: "task" },
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
      { id: "docs/a.md", title: "A", source: "local", type: "document", body: "The launch is blocked." },
    ]);
  });

  it("maps selected github provenance and drops raw data/unknown fields", () => {
    const items: NormalizedProviderItem[] = [
      {
        id: "github:issue:o/r#7",
        type: "issue",
        title: "#7 T",
        url: "https://github.com/o/r/issues/7",
        source: "github",
        data: {
          repository: "o/r",
          number: 7,
          kind: "issue",
          body: "b",
          status: "open",
          owner: "alice",
          labels: ["bug", "bug"],
          assignees: ["bob"],
          author: "carol",
          milestone: "M1",
          due: "2026-04-01",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
          closedAt: "2026-01-03T00:00:00Z",
          mergedAt: "2026-01-04T00:00:00Z",
          requestedReviewers: ["rev"],
          nodeId: "SHOULD_NOT_LEAK",
          comments: 3,
        },
      },
    ];
    const mapped = providerItemsToTextItems(items);
    expect(mapped[0]).toEqual({
      id: "github:issue:o/r#7",
      title: "#7 T",
      source: "github",
      type: "issue",
      url: "https://github.com/o/r/issues/7",
      body: "b",
      status: "open",
      owner: "alice",
      due: "2026-04-01",
      repository: "o/r",
      number: 7,
      kind: "issue",
      labels: ["bug"],
      assignees: ["bob"],
      author: "carol",
      milestone: "M1",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      closedAt: "2026-01-03T00:00:00Z",
      mergedAt: "2026-01-04T00:00:00Z",
      requestedReviewers: ["rev"],
    });
    const serialized = JSON.stringify(mapped[0]);
    expect(serialized).not.toContain("SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("comments");
    expect(serialized).not.toContain("nodeId");
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
    expect(mapped).toEqual([
      { id: "docs/a.md", title: "A", source: "local", type: "document", body: "text" },
    ]);
    expect(item).toEqual(snapshot);
  });

  it("carries only the approved review provenance and discards raw/diff/commit fields", () => {
    const review: NormalizedProviderItem = {
      id: "github:o/r:pull-request:7:review:1",
      type: "note",
      title: "Review by @alice: approved",
      source: "github",
      url: "https://github.com/o/r/pull/7#pullrequestreview-1",
      data: {
        kind: "pullRequestReview",
        repository: "o/r",
        parentNumber: 7,
        parentType: "pullRequest",
        parentStatus: "open",
        author: "alice",
        authorAssociation: "MEMBER",
        reviewState: "approved",
        submittedAt: "2026-02-01T00:00:00Z",
        body: "LGTM",
        // Raw fields that must never be carried through.
        state: "APPROVED",
        node_id: "SHOULD_NOT_LEAK",
        commit_id: "SHOULD_NOT_LEAK",
        diff_hunk: "SHOULD_NOT_LEAK",
        user: { login: "alice" },
        reactions: { total: 1 },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(review));
    const [mapped] = providerItemsToTextItems([review]);
    expect(mapped).toEqual({
      id: "github:o/r:pull-request:7:review:1",
      title: "Review by @alice: approved",
      source: "github",
      type: "note",
      url: "https://github.com/o/r/pull/7#pullrequestreview-1",
      body: "LGTM",
      repository: "o/r",
      kind: "pullRequestReview",
      author: "alice",
      parentNumber: 7,
      parentType: "pullRequest",
      parentStatus: "open",
      authorAssociation: "MEMBER",
      reviewState: "approved",
      submittedAt: "2026-02-01T00:00:00Z",
    });
    const serialized = JSON.stringify(mapped);
    for (const forbidden of ["SHOULD_NOT_LEAK", "node_id", "commit_id", "diff_hunk", "reactions"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(review).toEqual(snapshot);
  });

  it("carries review-comment file/line/side provenance with valid values only", () => {
    const reviewComment: NormalizedProviderItem = {
      id: "github:o/r:pull-request:7:review-comment:11",
      type: "note",
      title: "Review comment by @alice on src/app.ts",
      source: "github",
      data: {
        kind: "pullRequestReviewComment",
        repository: "o/r",
        parentNumber: 7,
        parentType: "pullRequest",
        parentStatus: "open",
        author: "alice",
        filePath: "src/app.ts",
        line: 42,
        startLine: 40,
        side: "right",
        startSide: "right",
        body: "here",
        diff_hunk: "SHOULD_NOT_LEAK",
      },
    };
    const [mapped] = providerItemsToTextItems([reviewComment]);
    expect(mapped?.filePath).toBe("src/app.ts");
    expect(mapped?.line).toBe(42);
    expect(mapped?.startLine).toBe(40);
    expect(mapped?.side).toBe("right");
    expect(mapped?.startSide).toBe("right");
    expect(JSON.stringify(mapped)).not.toContain("SHOULD_NOT_LEAK");
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
    expect(input["items"]).toEqual([{ id: "1", title: "One", source: "local", type: "task" }]);
    expect(input["notes"]).toEqual(["remember"]);
    expect(input["context"]).toEqual({ graph: { nodes: [] } });
  });

  it("supplies generic provider items as items only, never as declarations", () => {
    const envelope = skillInputForPlan({
      skillId: "extractRisks",
      locale: "en",
      now: "t0",
      request: "review project risks",
      graph: { nodes: [] },
      providerItems: [
        { id: "docs/a.md", type: "document", title: "A", source: "local", data: { content: "x" } },
      ],
      notes: [],
    });
    const input = envelope.input as Record<string, unknown>;
    expect(input["items"]).toEqual([
      { id: "docs/a.md", title: "A", source: "local", type: "document", body: "x" },
    ]);
    expect("tasks" in input).toBe(false);
    expect("risks" in input).toBe(false);
    expect("changes" in input).toBe(false);
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
