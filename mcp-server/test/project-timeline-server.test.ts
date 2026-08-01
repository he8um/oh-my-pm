// v0.4 — project_timeline MCP server registration + result tests.
//
// Asserts the conditional registration (the tool appears only with an executor),
// the FIXED registration order with project_timeline appended twelfth, the
// read-only annotations, zero write tools, the strict output projection and its
// rejection of an unexpected shape, and the privacy of the tool result. Uses the
// in-memory transport so no process/stdio is involved.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createOhMyPmMcpServer } from "../src/index.js";
import type {
  McpProjectChangesExecutor,
  McpProjectTimelineExecution,
  McpProjectTimelineExecutor,
  McpProjectTimelineInput,
  McpProjectTimelineResult,
} from "../src/index.js";

type Closeable = { close: () => Promise<void> };
const openSides: Closeable[] = [];
afterEach(async () => {
  for (const side of openSides.splice(0)) await side.close();
});

async function connect(server: ReturnType<typeof createOhMyPmMcpServer>): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openSides.push(client, server);
  return client;
}

const TEN_TOOLS = [
  "project_brief",
  "project_risks",
  "project_next",
  "project_handoff",
  "github_project_brief",
  "github_project_risks",
  "github_project_next",
  "github_project_handoff",
  "provider_status",
  "github_provider_diagnostics",
];

/** The exact expected registration order of the full twelve-tool surface. */
const TWELVE_TOOLS_IN_ORDER = [...TEN_TOOLS, "project_changes", "project_timeline"];

const SAMPLE_RESULT: McpProjectTimelineResult = {
  schemaVersion: 1,
  projectId: "p",
  eventCount: 2,
  hasMore: true,
  nextBeforeSequence: 3,
  chronology: "capture-order",
  events: [
    {
      eventId: `event:sha256:${"a".repeat(64)}`,
      snapshotId: "snapshot:three",
      captureSequence: 3,
      eventSequence: 0,
      capturedAt: "2026-01-03T00:00:00Z",
      category: "added",
      kind: "task",
      subjectId: "task-1",
      title: "Wire the API",
      status: "open",
      severity: "medium",
      dueDate: "2026-03-01",
      evidenceCount: 2,
    },
    {
      eventId: `event:sha256:${"b".repeat(64)}`,
      snapshotId: "snapshot:three",
      captureSequence: 3,
      eventSequence: 1,
      capturedAt: "2026-01-03T00:00:00Z",
      category: "stale",
      kind: "risk",
      subjectId: "risk-1",
      evidenceCount: 0,
    },
  ],
};

/** A stub executor returning a fixed populated result. */
function stubExecutor(over?: McpProjectTimelineExecution): McpProjectTimelineExecutor {
  return async (_input: McpProjectTimelineInput) => over ?? { ok: true, result: SAMPLE_RESULT };
}

/** A stub project_changes executor so the twelve-tool surface can be built. */
const changesExecutor: McpProjectChangesExecutor = async () => ({
  ok: true,
  result: {
    schemaVersion: 1,
    status: "noPriorMemory",
    projectId: "p",
    chronology: "capture-order",
    summary: {
      totalChanges: 0,
      returnedChanges: 0,
      truncated: false,
      countsByCategory: {
        added: 0,
        removed: 0,
        resolved: 0,
        reopened: 0,
        becameOverdue: 0,
        noLongerOverdue: 0,
        severityIncreased: 0,
        severityDecreased: 0,
        fresh: 0,
        stale: 0,
        evidenceChanged: 0,
        modified: 0,
      },
    },
    changes: [],
  },
});

describe("project_timeline — conditional registration", () => {
  it("is absent without an executor (the ten-tool surface is preserved)", async () => {
    const client = await connect(createOhMyPmMcpServer());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TEN_TOOLS);
    expect(tools.map((t) => t.name)).not.toContain("project_timeline");
  });

  it("is the eleventh tool when only the timeline executor is supplied", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...TEN_TOOLS, "project_timeline"]);
  });

  it("is appended TWELFTH, after project_changes, on the full surface", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectChanges: changesExecutor,
        executeProjectTimeline: stubExecutor(),
      }),
    );
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(12);
    expect(tools.map((t) => t.name)).toEqual(TWELVE_TOOLS_IN_ORDER);
    // The ten historical tools keep their exact positions.
    expect(tools.slice(0, 10).map((t) => t.name)).toEqual(TEN_TOOLS);
  });

  it("declares zero write tools across the whole twelve-tool surface", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectChanges: changesExecutor,
        executeProjectTimeline: stubExecutor(),
      }),
    );
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const annotations = (tool.annotations ?? {}) as Record<string, unknown>;
      expect(annotations["destructiveHint"]).not.toBe(true);
      expect(annotations["readOnlyHint"]).not.toBe(false);
    }
  });

  it("declares the read-only annotation set", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const { tools } = await client.listTools();
    const timelineTool = tools.find((t) => t.name === "project_timeline")!;
    expect(timelineTool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });
});

describe("project_timeline — input schema", () => {
  it("accepts only the five documented inputs", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const { tools } = await client.listTools();
    const schema = tools.find((t) => t.name === "project_timeline")!.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(
      ["beforeSequence", "category", "kind", "limit", "projectId"].sort(),
    );
    expect(schema.required).toEqual(["projectId"]);
  });

  it("declares NO path, dataDir, token, apply, migrate, or capture INPUT field", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "project_timeline")!;
    // Scan the input SCHEMA only. The prose description legitimately says what
    // the tool does NOT do ("does not migrate, export, delete…"), so scanning the
    // whole descriptor would match its own safety statement.
    const inputSchema = tool.inputSchema as { properties?: Record<string, unknown> };
    const propertyNames = Object.keys(inputSchema.properties ?? {});
    for (const forbidden of [
      "dataDir",
      "dataRoot",
      "root",
      "path",
      "apply",
      "migrate",
      "confirm",
      "force",
      "token",
      "destination",
      "capture",
    ]) {
      expect(propertyNames).not.toContain(forbidden);
    }
    // The output schema must equally carry no such field.
    const outputSerialized = JSON.stringify(tool.outputSchema);
    for (const forbidden of ["dataDir", "dataRoot", "projectRoot", "evidenceRefs"]) {
      expect(outputSerialized).not.toContain(forbidden);
    }
    // Additional properties are rejected on both schemas.
    expect(JSON.stringify(inputSchema)).toContain('"additionalProperties":false');
    expect(outputSerialized).toContain('"additionalProperties":false');
  });

  it("rejects a limit above 100 at the schema boundary", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p", limit: 101 },
    });
    expect(result.isError).toBe(true);
  });

  it("rejects a negative beforeSequence at the schema boundary", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p", beforeSequence: -1 },
    });
    expect(result.isError).toBe(true);
  });

  it("rejects a category or kind outside the existing taxonomy", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    for (const args of [
      { projectId: "p", category: "invented" },
      { projectId: "p", kind: "epic" },
    ]) {
      const result = await client.callTool({ name: "project_timeline", arguments: args });
      expect(result.isError).toBe(true);
    }
  });

  it("requires a project id", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const result = await client.callTool({ name: "project_timeline", arguments: {} });
    expect(result.isError).toBe(true);
  });
});

describe("project_timeline — result projection", () => {
  it("returns the strict structured result and deterministic Markdown", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(SAMPLE_RESULT);
    const markdown = (result.content as { text: string }[])[0]!.text;
    expect(markdown).toContain("# Project Timeline");
    expect(markdown).toContain("### Capture #3");
    expect(markdown).toContain("task-1");
    // Repeated calls are byte-identical.
    const again = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    expect(JSON.stringify(again.structuredContent)).toBe(JSON.stringify(result.structuredContent));
    expect((again.content as { text: string }[])[0]!.text).toBe(markdown);
  });

  it("returns an empty result without inventing content", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectTimeline: stubExecutor({
          ok: true,
          result: {
            schemaVersion: 1,
            projectId: "p",
            eventCount: 0,
            hasMore: false,
            chronology: "capture-order",
            events: [],
          },
        }),
      }),
    );
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { eventCount: number }).eventCount).toBe(0);
    expect((result.content as { text: string }[])[0]!.text).toContain("No timeline events");
  });

  it("maps a controlled runner failure to a stable MCP error", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectTimeline: stubExecutor({
          ok: false,
          code: "project_timeline_read_failed",
          message: "reading local memory failed",
        }),
      }),
    );
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]!.text).toContain(
      "project_timeline_read_failed",
    );
  });

  it("maps an unexpected executor exception to one generic error", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectTimeline: async () => {
          throw new Error("/Users/someone/secret leaked");
        },
      }),
    );
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("project_timeline_failed");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("/Users/");
  });

  it("rejects a result that does not match the strict public shape", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectTimeline: stubExecutor({
          ok: true,
          // An extra field must fail the strict validator rather than pass through.
          result: {
            ...SAMPLE_RESULT,
            dataRoot: "/Users/someone/data",
          } as never,
        }),
      }),
    );
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("project_timeline_output_invalid");
    expect(text).not.toContain("/Users/");
  });

  it("rejects an event carrying a forbidden field", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectTimeline: stubExecutor({
          ok: true,
          result: {
            ...SAMPLE_RESULT,
            events: [{ ...SAMPLE_RESULT.events[0]!, evidenceRefs: ["ev_1"] } as never],
          },
        }),
      }),
    );
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]!.text).toContain(
      "project_timeline_output_invalid",
    );
  });

  it("carries no forbidden field in a successful result", async () => {
    const client = await connect(createOhMyPmMcpServer({ executeProjectTimeline: stubExecutor() }));
    const result = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p" },
    });
    const serialized = `${JSON.stringify(result.structuredContent)}\n${(result.content as { text: string }[])[0]!.text}`;
    for (const forbidden of [
      "evidenceRefs",
      "previousValue",
      "currentValue",
      '"trace"',
      "stateFingerprint",
      "snapshotHistory",
      "projectRoot",
      "dataRoot",
      "runtimeResponse",
      "providerResponses",
      "Authorization",
      "Bearer ",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
  });

  it("forwards only the validated inputs to the executor", async () => {
    const seen: McpProjectTimelineInput[] = [];
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectTimeline: async (input) => {
          seen.push(input);
          return { ok: true, result: SAMPLE_RESULT };
        },
      }),
    );
    await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "p", limit: 5, beforeSequence: 4, category: "added", kind: "task" },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      projectId: "p",
      limit: 5,
      beforeSequence: 4,
      category: "added",
      kind: "task",
    });
  });

  it("omits absent optional inputs rather than forwarding undefined keys", async () => {
    const seen: McpProjectTimelineInput[] = [];
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectTimeline: async (input) => {
          seen.push(input);
          return { ok: true, result: SAMPLE_RESULT };
        },
      }),
    );
    await client.callTool({ name: "project_timeline", arguments: { projectId: "p" } });
    expect(Object.keys(seen[0]!)).toEqual(["projectId"]);
  });
});

describe("project_timeline — existing tools unchanged", () => {
  it("leaves every historical tool's schema and description intact", async () => {
    const baseline = await connect(createOhMyPmMcpServer());
    const baselineTools = (await baseline.listTools()).tools;
    const withTimeline = await connect(
      createOhMyPmMcpServer({
        executeProjectChanges: changesExecutor,
        executeProjectTimeline: stubExecutor(),
      }),
    );
    const fullTools = (await withTimeline.listTools()).tools;
    for (const name of TEN_TOOLS) {
      const before = baselineTools.find((t) => t.name === name)!;
      const after = fullTools.find((t) => t.name === name)!;
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    }
  });

  it("keeps project_changes callable and unchanged alongside the timeline", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectChanges: changesExecutor,
        executeProjectTimeline: stubExecutor(),
      }),
    );
    const result = await client.callTool({
      name: "project_changes",
      arguments: { projectId: "p" },
    });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { status: string }).status).toBe("noPriorMemory");
  });
});
