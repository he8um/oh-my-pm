import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOhMyPmMcpServer,
  emptyCategoryCounts,
  renderProjectChangesMarkdown,
  type McpProjectChangesExecutor,
  type McpProjectChangesResult,
} from "../src/index.js";

const EXISTING_TOOLS = [
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

type Closeable = { close: () => Promise<void> };
const openSides: Closeable[] = [];

async function connect(executeProjectChanges?: McpProjectChangesExecutor): Promise<Client> {
  const server = createOhMyPmMcpServer({
    ...(executeProjectChanges !== undefined ? { executeProjectChanges } : {}),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "phase-5-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openSides.push(client, server);
  return client;
}

afterEach(async () => {
  for (const side of openSides.splice(0)) await side.close();
});

function noMemory(projectId = "example-project"): McpProjectChangesResult {
  return {
    schemaVersion: 1,
    status: "noPriorMemory",
    projectId,
    chronology: "capture-order",
    summary: {
      totalChanges: 0,
      returnedChanges: 0,
      truncated: false,
      countsByCategory: emptyCategoryCounts(),
    },
    changes: [],
  };
}

describe("project_changes registration", () => {
  it("preserves the exact ten-tool default and appends one capability tool", async () => {
    const defaultClient = await connect();
    expect((await defaultClient.listTools()).tools.map((tool) => tool.name)).toEqual(
      EXISTING_TOOLS,
    );

    const execute: McpProjectChangesExecutor = async ({ projectId }) => {
      const result = noMemory(projectId);
      return { ok: true, result, markdown: renderProjectChangesMarkdown(result) };
    };
    const capabilityClient = await connect(execute);
    const tools = (await capabilityClient.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toEqual([...EXISTING_TOOLS, "project_changes"]);
    const changes = tools.at(-1)!;
    expect(changes.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tools.filter((tool) => tool.name.startsWith("project_"))).toHaveLength(5);
  });
});

describe("project_changes strict input and output", () => {
  it("accepts a valid bounded input and returns controlled no-history success", async () => {
    const calls: unknown[] = [];
    const execute: McpProjectChangesExecutor = async (input) => {
      calls.push(input);
      const result = noMemory(input.projectId);
      return { ok: true, result, markdown: renderProjectChangesMarkdown(result) };
    };
    const client = await connect(execute);
    const result = await client.callTool({
      name: "project_changes",
      arguments: { projectId: "project-1", staleAfterSeconds: 0, limit: 100 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      schemaVersion: 1,
      status: "noPriorMemory",
      projectId: "project-1",
      chronology: "capture-order",
      changes: [],
    });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [{}, "missing project"],
    [{ projectId: "/tmp/project" }, "path-like project"],
    [{ projectId: "project", previousSnapshotId: `snapshot:${"a".repeat(64)}` }, "half pair"],
    [
      {
        projectId: "project",
        previousSnapshotId: `snapshot:${"a".repeat(64)}`,
        currentSnapshotId: `snapshot:${"a".repeat(64)}`,
      },
      "equal pair",
    ],
    [{ projectId: "project", previousSnapshotId: "snap-1", currentSnapshotId: "snap-2" }, "bad ids"],
    [{ projectId: "project", staleAfterSeconds: -1 }, "stale low"],
    [{ projectId: "project", staleAfterSeconds: 31_536_001 }, "stale high"],
    [{ projectId: "project", limit: 0 }, "limit low"],
    [{ projectId: "project", limit: 101 }, "limit high"],
    [{ projectId: "project", root: "." }, "unknown root"],
    [{ projectId: "project", dataDir: "." }, "unknown data dir"],
    [{ projectId: "project", token: "secret" }, "unknown token"],
    [{ projectId: "project", apply: true }, "unknown apply"],
    [{ projectId: "project", migrate: true }, "unknown migrate"],
  ])("rejects %s (%s) before execution", async (argumentsValue) => {
    let calls = 0;
    const client = await connect(async () => {
      calls += 1;
      const result = noMemory();
      return { ok: true, result, markdown: renderProjectChangesMarkdown(result) };
    });
    const result = await client.callTool({
      name: "project_changes",
      arguments: argumentsValue,
    });
    expect(result.isError).toBe(true);
    expect(calls).toBe(0);
  });

  it("maps throws and unsafe result shapes to stable errors", async () => {
    const throwing = await connect(async () => {
      throw new Error("/tmp/private TOKEN-SENTINEL");
    });
    const thrown = await throwing.callTool({
      name: "project_changes",
      arguments: { projectId: "project" },
    });
    expect(thrown.content[0]).toMatchObject({
      text: "project_changes_failed: unexpected project changes failure",
    });

    const malformed = await connect(async () => {
      const result = noMemory() as McpProjectChangesResult & { dataRoot: string };
      result.dataRoot = "/tmp/private";
      return { ok: true, result, markdown: "# Project Changes\n" };
    });
    const invalid = await malformed.callTool({
      name: "project_changes",
      arguments: { projectId: "project" },
    });
    expect(invalid.content[0]).toMatchObject({
      text: "project_changes_output_invalid: result did not match the safe public shape",
    });
  });
});
