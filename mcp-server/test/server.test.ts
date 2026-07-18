import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createOhMyPmMcpServer, executeMcpProjectTool } from "../src/index.js";
import type {
  McpGitHubOperation,
  McpGitHubToolExecution,
  McpGitHubToolInput,
  McpProjectToolExecution,
  McpProjectOperation,
} from "../src/index.js";

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
  it("lists exactly the ten tools in the required order", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    // Required exact order: four local, four GitHub, then two diagnostics.
    expect(names).toEqual([
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
    ]);
    for (const tool of tools) {
      expect(typeof tool.title === "string" || typeof tool.annotations?.title === "string").toBe(
        true,
      );
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it("gives project tools a root input and github tools a repository input", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("project_brief")!.inputSchema.properties).toHaveProperty("root");
    const gh = byName.get("github_project_brief")!;
    expect(gh.inputSchema.properties).toHaveProperty("repository");
    expect(gh.inputSchema.properties).toHaveProperty("limit");
    expect(gh.inputSchema.properties).not.toHaveProperty("root");
    expect(gh.inputSchema.properties).not.toHaveProperty("token");
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
    const cliMarkdown = ((await executeMcpProjectTool("handoff", fixtureRel)) as {
      markdown: string;
    }).markdown;
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
    const executeProjectTool = async (operation: McpProjectOperation, root: string) =>
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
    const executeProjectTool = async (operation: McpProjectOperation, root: string) =>
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
    const executeProjectTool = async () => {
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

describe("mcp github tools", () => {
  // A deterministic, offline GitHub executor stub: it records calls and
  // returns a fixed successful projection without any network access.
  function stubGitHub(): {
    executeGitHubTool: (
      operation: McpGitHubOperation,
      input: McpGitHubToolInput,
    ) => Promise<McpGitHubToolExecution>;
    calls: Array<{ operation: string; input: McpGitHubToolInput }>;
  } {
    const calls: Array<{ operation: string; input: McpGitHubToolInput }> = [];
    const executeGitHubTool = async (
      operation: McpGitHubOperation,
      input: McpGitHubToolInput,
    ): Promise<McpGitHubToolExecution> => {
      calls.push({ operation, input });
      return {
        ok: true,
        operation,
        repository: input.repository ?? "configured/default",
        selection: { mode: input.source ?? "overview", state: input.state ?? "open", limit: input.limit ?? 50 },
        sourceSummary: { total: 2, repositories: 1, issues: 1, pullRequests: 0 },
        sources: [{ type: "issue", number: 7, title: "#7 A", state: "open" }],
        output: { title: "brief" },
        markdown: "# GitHub brief\n",
      };
    };
    return { executeGitHubTool, calls };
  }

  it("invokes the executor for all four github tools", async () => {
    const { executeGitHubTool, calls } = stubGitHub();
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    for (const name of [
      "github_project_brief",
      "github_project_risks",
      "github_project_next",
      "github_project_handoff",
    ]) {
      const result = (await client.callTool({
        name,
        arguments: { repository: "octo/demo" },
      })) as ToolCallResult;
      expect(result.isError).not.toBe(true);
    }
    expect(calls.map((c) => c.operation)).toEqual(["brief", "risks", "next", "handoff"]);
    // Limit is optional at the schema layer; an omitted limit is passed through
    // as undefined so the executor resolves it from provider configuration.
    expect(calls.every((c) => c.input.limit === undefined)).toBe(true);
  });

  it("forwards source selection fields to the executor", async () => {
    const { executeGitHubTool, calls } = stubGitHub();
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    const result = (await client.callTool({
      name: "github_project_risks",
      arguments: { repository: "octo/demo", source: "search", query: "blocker", kind: "issues", state: "open" },
    })) as ToolCallResult;
    expect(result.isError).not.toBe(true);
    expect(calls[0]!.input).toMatchObject({
      repository: "octo/demo",
      source: "search",
      query: "blocker",
      kind: "issues",
      state: "open",
    });
  });

  it("passes an omitted repository through so the executor can use config", async () => {
    const { executeGitHubTool, calls } = stubGitHub();
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    const result = (await client.callTool({
      name: "github_project_brief",
      arguments: {},
    })) as ToolCallResult;
    expect(result.isError).not.toBe(true);
    expect(calls[0]!.input.repository).toBeUndefined();
  });

  it("rejects an empty-string repository at the schema before any executor call", async () => {
    const { executeGitHubTool, calls } = stubGitHub();
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    const result = (await client.callTool({
      name: "github_project_brief",
      arguments: { repository: "" },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("rejects an out-of-range limit before any executor call", async () => {
    const { executeGitHubTool, calls } = stubGitHub();
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    const result = (await client.callTool({
      name: "github_project_brief",
      arguments: { repository: "octo/demo", limit: 500 },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("projects a sanitized public result without provider internals or a token", async () => {
    const { executeGitHubTool } = stubGitHub();
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    const result = (await client.callTool({
      name: "github_project_brief",
      arguments: { repository: "octo/demo", limit: 5 },
    })) as ToolCallResult;
    const serialized = JSON.stringify(result.structuredContent ?? {});
    expect(serialized).toContain("sourceSummary");
    expect(serialized).not.toContain("providerResponses");
    expect(serialized).not.toContain("runtimeResponse");
    expect(serialized).not.toContain("plannerInput");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
  });

  it("maps a sanitized github failure to an MCP error", async () => {
    const executeGitHubTool = async (
      operation: McpGitHubOperation,
      repository: string,
    ): Promise<McpGitHubToolExecution> => ({
      ok: false,
      operation,
      repository,
      code: "OMP-P-4004",
      message: "provider authentication failed",
    });
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    const result = (await client.callTool({
      name: "github_project_brief",
      arguments: { repository: "octo/demo" },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("OMP-P-4004");
  });

  it("maps an unexpected github executor throw to a generic public-safe error", async () => {
    const executeGitHubTool = async (): Promise<McpGitHubToolExecution> => {
      throw new Error("secret github internal");
    };
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubTool }));
    const result = (await client.callTool({
      name: "github_project_risks",
      arguments: { repository: "octo/demo" },
    })) as ToolCallResult;
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("github_runtime_failed");
    expect(text).not.toContain("secret github internal");
  });
});

describe("mcp provider diagnostics tools", () => {
  it("provider_status takes an empty input schema and returns a status report", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const status = tools.find((t) => t.name === "provider_status")!;
    expect(Object.keys(status.inputSchema.properties ?? {})).toHaveLength(0);
    expect(status.inputSchema.properties).not.toHaveProperty("token");
    expect(status.inputSchema.properties).not.toHaveProperty("providerConfig");

    const executeProviderStatus = () => ({
      schemaVersion: 1 as const,
      config: { source: "defaults" as const, exists: false, displayPath: "defaults", valid: true },
      providers: [
        {
          id: "local" as const,
          enabled: true,
          readOnly: true as const,
          network: "none" as const,
          state: "ready" as const,
          token: "not-applicable" as const,
        },
        {
          id: "github" as const,
          enabled: true,
          readOnly: true as const,
          network: "explicit-opt-in" as const,
          state: "needs-repository" as const,
          defaultLimit: 50,
          token: "absent" as const,
        },
      ],
    });
    const c2 = await connectClient(createOhMyPmMcpServer({ executeProviderStatus }));
    const result = (await c2.callTool({ name: "provider_status", arguments: {} })) as ToolCallResult;
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent?.schemaVersion).toBe(1);
  });

  it("github_provider_diagnostics has repository and confirmNetwork but no token/config path", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    const diag = tools.find((t) => t.name === "github_provider_diagnostics")!;
    expect(diag.inputSchema.properties).toHaveProperty("repository");
    expect(diag.inputSchema.properties).toHaveProperty("confirmNetwork");
    expect(diag.inputSchema.properties).not.toHaveProperty("token");
    expect(diag.inputSchema.properties).not.toHaveProperty("limit");
    expect(diag.inputSchema.properties).not.toHaveProperty("providerConfig");
  });

  it("routes confirmNetwork through to the diagnostics executor", async () => {
    const calls: Array<{ repository?: string; confirmNetwork?: boolean }> = [];
    const executeGitHubProviderDiagnostics = async (input: { repository?: string; confirmNetwork?: boolean }) => {
      calls.push(input);
      return {
        schemaVersion: 1 as const,
        ok: true,
        networkAttempted: input.confirmNetwork === true,
        checks: [],
      };
    };
    const client = await connectClient(createOhMyPmMcpServer({ executeGitHubProviderDiagnostics }));
    const result = (await client.callTool({
      name: "github_provider_diagnostics",
      arguments: { repository: "octo/demo", confirmNetwork: true },
    })) as ToolCallResult;
    expect(result.isError).not.toBe(true);
    expect(calls[0]).toEqual({ repository: "octo/demo", confirmNetwork: true });
  });
});
