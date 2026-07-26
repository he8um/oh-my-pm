// v0.3 Phase 5 — project_changes MCP server registration + result tests.
//
// Asserts the conditional registration (ten tools without an executor, eleven
// with one, existing ten unchanged and in order, project_changes appended last),
// the read-only annotations, the strict output projection, and the privacy of
// the tool result. Uses the in-memory transport so no process/stdio is involved.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createOhMyPmMcpServer } from "../src/index.js";
import type {
  McpProjectChangesExecution,
  McpProjectChangesExecutor,
  McpProjectChangesInput,
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

/** A stub executor returning a fixed compared result for one change. */
function stubExecutor(over?: Partial<McpProjectChangesExecution>): McpProjectChangesExecutor {
  return async (_input: McpProjectChangesInput) =>
    (over ?? {
      ok: true,
      result: {
        schemaVersion: 1,
        status: "compared",
        projectId: "p",
        previousSnapshotId: "snapshot:prev",
        currentSnapshotId: "snapshot:curr",
        chronology: "capture-order",
        summary: {
          totalChanges: 1,
          returnedChanges: 1,
          truncated: false,
          countsByCategory: {
            added: 1,
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
        changes: [
          { category: "added", itemKind: "task", itemId: "task-1", title: "Ship it", evidenceCount: 2 },
        ],
      },
    }) as McpProjectChangesExecution;
}

describe("project_changes registration", () => {
  it("exposes exactly the ten historical tools without an executor", async () => {
    const client = await connect(createOhMyPmMcpServer());
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(TEN_TOOLS);
    expect(names).not.toContain("project_changes");
  });

  it("appends project_changes as the eleventh tool when an executor is supplied", async () => {
    const client = await connect(
      createOhMyPmMcpServer({ executeProjectChanges: stubExecutor() }),
    );
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual([...TEN_TOOLS, "project_changes"]);
    // The existing ten keep their exact order; project_changes is last.
    expect(names.slice(0, 10)).toEqual(TEN_TOOLS);
    expect(names[10]).toBe("project_changes");
  });

  it("declares read-only, non-destructive, idempotent, closed-world annotations", async () => {
    const client = await connect(
      createOhMyPmMcpServer({ executeProjectChanges: stubExecutor() }),
    );
    const tool = (await client.listTools()).tools.find((t) => t.name === "project_changes");
    expect(tool).toBeDefined();
    const annotations = (tool as { annotations?: Record<string, unknown> }).annotations ?? {};
    expect(annotations.readOnlyHint).toBe(true);
    expect(annotations.destructiveHint).toBe(false);
    expect(annotations.idempotentHint).toBe(true);
    expect(annotations.openWorldHint).toBe(false);
  });

  it("registers no second Project Brain tool", async () => {
    const client = await connect(
      createOhMyPmMcpServer({ executeProjectChanges: stubExecutor() }),
    );
    const names = (await client.listTools()).tools.map((t) => t.name);
    const projectBrain = names.filter((n) => n === "project_changes");
    expect(projectBrain).toHaveLength(1);
    for (const forbidden of ["project_capture", "project_compare", "project_delete", "project_export", "project_migrate", "project_status", "project_history"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("project_changes result", () => {
  it("returns sanitized Markdown + strict structured content for a compared result", async () => {
    const client = await connect(
      createOhMyPmMcpServer({ executeProjectChanges: stubExecutor() }),
    );
    const result = (await client.callTool({
      name: "project_changes",
      arguments: { projectId: "p" },
    })) as { isError?: boolean; content: Array<{ text?: string }>; structuredContent?: Record<string, unknown> };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.schemaVersion).toBe(1);
    expect(result.structuredContent?.status).toBe("compared");
    expect(result.structuredContent?.chronology).toBe("capture-order");
    const md = result.content[0]?.text ?? "";
    expect(md).toContain("# Project Changes");
    expect(md).toContain("Ship it");
  });

  it("maps a runner failure to a stable MCP error", async () => {
    const client = await connect(
      createOhMyPmMcpServer({
        executeProjectChanges: stubExecutor({
          ok: false,
          code: "project_changes_migration_required",
          message: "the local memory store requires an explicit CLI migration",
        }),
      }),
    );
    const result = (await client.callTool({
      name: "project_changes",
      arguments: { projectId: "p" },
    })) as { isError?: boolean; content: Array<{ text?: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("project_changes_migration_required");
  });

  it("rejects a leaky projection with the output-invalid error", async () => {
    // A result carrying a forbidden structural marker inside a title must be
    // rejected by the server's final leak scan, not returned.
    const leaky = stubExecutor({
      ok: true,
      result: {
        schemaVersion: 1,
        status: "compared",
        projectId: "p",
        previousSnapshotId: "snapshot:prev",
        currentSnapshotId: "snapshot:curr",
        chronology: "capture-order",
        summary: {
          totalChanges: 1,
          returnedChanges: 1,
          truncated: false,
          countsByCategory: {
            added: 1, removed: 0, resolved: 0, reopened: 0, becameOverdue: 0,
            noLongerOverdue: 0, severityIncreased: 0, severityDecreased: 0,
            fresh: 0, stale: 0, evidenceChanged: 0, modified: 0,
          },
        },
        changes: [
          // A title that (pathologically) contains a structural leak marker.
          { category: "added", itemKind: "task", itemId: "t1", title: 'leak previousValue here', evidenceCount: 0 },
        ],
      },
    });
    const client = await connect(createOhMyPmMcpServer({ executeProjectChanges: leaky }));
    const result = (await client.callTool({
      name: "project_changes",
      arguments: { projectId: "p" },
    })) as { isError?: boolean; content: Array<{ text?: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("project_changes_output_invalid");
  });

  it("ignores unexpected input fields (root/dataDir/token have no effect)", async () => {
    // The input schema exposes no root/dataDir/token field, so such fields are
    // stripped by the SDK and never reach the runner — the agent can neither
    // choose a filesystem location nor supply a token. The forwarded input the
    // executor sees carries only the declared fields.
    let seen: McpProjectChangesInput | undefined;
    const capturing: McpProjectChangesExecutor = async (input) => {
      seen = input;
      return stubExecutor()(input);
    };
    const client = await connect(createOhMyPmMcpServer({ executeProjectChanges: capturing }));
    const result = (await client.callTool({
      name: "project_changes",
      arguments: { projectId: "p", root: "/etc", dataDir: "/tmp", token: "ghp_x" } as never,
    })) as { isError?: boolean };
    expect(result.isError).toBeFalsy();
    // No forbidden field was forwarded to the executor.
    expect(seen).toBeDefined();
    expect(Object.keys(seen ?? {})).toEqual(["projectId"]);
    expect((seen as Record<string, unknown>).root).toBeUndefined();
    expect((seen as Record<string, unknown>).dataDir).toBeUndefined();
    expect((seen as Record<string, unknown>).token).toBeUndefined();
  });

  it("rejects an out-of-range limit at the schema boundary", async () => {
    const client = await connect(
      createOhMyPmMcpServer({ executeProjectChanges: stubExecutor() }),
    );
    const bad = (await client.callTool({
      name: "project_changes",
      arguments: { projectId: "p", limit: 999 } as never,
    })) as { isError?: boolean };
    // The declared numeric bounds (1..100) ARE enforced by the SDK schema.
    expect(bad.isError).toBe(true);
  });

  it("does not leak forbidden fields in a compared result", async () => {
    const client = await connect(
      createOhMyPmMcpServer({ executeProjectChanges: stubExecutor() }),
    );
    const result = (await client.callTool({
      name: "project_changes",
      arguments: { projectId: "p" },
    })) as { structuredContent?: Record<string, unknown>; content: Array<{ text?: string }> };
    const serialized = `${JSON.stringify(result.structuredContent)}\n${result.content[0]?.text ?? ""}`;
    for (const forbidden of ["previousValue", "currentValue", "evidenceRefs", "runtimeResponse", "providerResponses", '"trace"', "fingerprintInput", "projectRoot", "dataRoot"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
