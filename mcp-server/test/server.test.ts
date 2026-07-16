import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createOhMyPmMcpServer, executeMcpProjectTool } from "../src/index.js";
import type { McpProjectToolExecution, McpProjectOperation } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = join(repoRoot, "examples", "fixtures", "markdown-project");
// A relative, non-absolute caller root that resolves regardless of the vitest
// working directory (repo root under `pnpm test`, package dir under a filter).
const fixtureRel = relative(process.cwd(), fixtureRoot) || ".";

type Closeable = { close: () => Promise<void> };
const openSides: Closeable[] = [];

async function connectClient(server = createOhMyPmMcpServer()): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openSides.push(client, server);
  return client;
}

afterEach(async () => {
  for (const side of openSides.splice(0)) {
    await side.close();
  }
});

type ToolCallResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
};

describe("mcp server tool listing", () => {
  it("lists exactly the four project tools with schemas", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["project_brief", "project_handoff", "project_next", "project_risks"]);
    for (const tool of tools) {
      expect(typeof tool.title === "string" || typeof tool.annotations?.title === "string").toBe(
        true,
      );
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty("root");
      expect(tool.outputSchema).toBeDefined();
    }
  });
});

describe("mcp server successful calls", () => {
  const tools = ["project_brief", "project_risks", "project_next", "project_handoff"] as const;

  it("returns aligned markdown and safe structured content for every tool", async () => {
    const client = await connectClient();
    for (const name of tools) {
      const result = (await client.callTool({
        name,
        arguments: { root: fixtureRel },
      })) as ToolCallResult;
      expect(result.isError, name).not.toBe(true);
      expect(result.content, name).toHaveLength(1);
      expect(result.content[0]?.type, name).toBe("text");

      const structured = result.structuredContent as Record<string, unknown> | undefined;
      expect(structured, name).toBeDefined();
      expect(structured?.root, name).toBe(fixtureRel);

      const serialized = JSON.stringify(structured);
      for (const forbidden of [
        "runtimeResponse",
        "providerResponses",
        "trace",
        "documentContent",
        "rawContent",
        "absolutePath",
        "resolvedRoot",
        "adapter",
        "credentials",
        "token",
        "secret",
        "ARCHIVED-SENTINEL",
        "SCRATCH-SENTINEL",
      ]) {
        expect(serialized, `${name}:${forbidden}`).not.toContain(forbidden);
      }
      // No absolute path leaks into the structured result.
      expect(serialized, name).not.toContain(repoRoot);
    }
  });

  it("aligns tool text with the CLI-equivalent markdown", async () => {
    const client = await connectClient();
    const result = (await client.callTool({
      name: "project_handoff",
      arguments: { root: fixtureRel },
    })) as ToolCallResult;
    const cliMarkdown = (executeMcpProjectTool("handoff", fixtureRel) as { markdown: string })
      .markdown;
    expect(result.content[0]?.text).toBe(cliMarkdown);
    expect(result.content[0]?.text).toContain("# OH MY PM Project Handoff");
  });

  it("defaults the root to '.' when omitted", async () => {
    // The input schema default is applied before the executor runs, so an
    // omitted root reaches the runner as ".". Proven with an injected executor
    // so the assertion does not depend on the vitest working directory.
    const seen: string[] = [];
    const executeProjectTool = (operation: McpProjectOperation, root: string) => {
      seen.push(root);
      return executeMcpProjectTool(operation, fixtureRoot);
    };
    const client = await connectClient(createOhMyPmMcpServer({ executeProjectTool }));
    const result = (await client.callTool({
      name: "project_brief",
      arguments: {},
    })) as ToolCallResult;
    expect(result.isError).not.toBe(true);
    expect(seen).toEqual(["."]);
  });
});

describe("mcp server error handling", () => {
  it("returns an MCP error for a missing root", async () => {
    const client = await connectClient();
    const result = (await client.callTool({
      name: "project_brief",
      arguments: { root: join(repoRoot, "does-not-exist") },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("project_root_not_found");
    expect(text).not.toContain("\n    at "); // no stack trace
  });

  it("returns an MCP error for an invalid config without leaking absolute paths", async () => {
    const executeProjectTool = (operation: McpProjectOperation, root: string) =>
      ({
        ok: false,
        operation,
        root,
        code: "project_config_invalid",
        message: "invalid project config: ./oh-my-pm.config.json (project_config_invalid_json)",
      }) satisfies McpProjectToolExecution;
    const client = await connectClient(createOhMyPmMcpServer({ executeProjectTool }));
    const result = (await client.callTool({
      name: "project_risks",
      arguments: { root: "." },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("project_config_invalid");
  });
});

describe("mcp server dependency injection", () => {
  it("passes the mapped operation and unchanged root to the executor", async () => {
    const seen: Array<{ operation: string; root: string }> = [];
    const executeProjectTool = (operation: McpProjectOperation, root: string) => {
      seen.push({ operation, root });
      return executeMcpProjectTool(operation, fixtureRoot);
    };
    const client = await connectClient(createOhMyPmMcpServer({ executeProjectTool }));
    await client.callTool({ name: "project_next", arguments: { root: "some/relative/root" } });
    expect(seen).toEqual([{ operation: "next", root: "some/relative/root" }]);
  });

  it("maps malformed success output to project_output_invalid", async () => {
    const executeProjectTool = (operation: McpProjectOperation, root: string) =>
      ({
        ok: true,
        operation,
        root,
        documents: {
          filesScanned: 1,
          filesMatched: 1,
          filesExcluded: 0,
          filesLoaded: 1,
          totalBytes: 10,
          configExists: false,
        },
        output: { unexpected: true },
        markdown: "# broken\n",
        runtimeResponse: { id: "x", ok: true, data: { output: { unexpected: true } } },
      }) satisfies McpProjectToolExecution;
    const client = await connectClient(createOhMyPmMcpServer({ executeProjectTool }));
    const result = (await client.callTool({
      name: "project_brief",
      arguments: { root: "." },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("project_output_invalid");
  });

  it("maps an unexpected executor throw to a generic public-safe error", async () => {
    const executeProjectTool = () => {
      throw new Error("secret internal detail");
    };
    const client = await connectClient(createOhMyPmMcpServer({ executeProjectTool }));
    const result = (await client.callTool({
      name: "project_brief",
      arguments: { root: "." },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toBe("project_runtime_failed: unexpected local project tool failure");
    expect(text).not.toContain("secret internal detail");
  });
});
