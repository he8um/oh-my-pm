#!/usr/bin/env node
// Local MCP stdio smoke check. Spawns the built MCP server over stdio, lists
// tools, calls project_brief on the public fixture, and asserts a safe result.
// This is a validation utility, not package runtime source. It prints exactly
// one concise success line, only after the server process has closed.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpPkgDir = join(repoRoot, "mcp-server");
const binPath = join(mcpPkgDir, "bin", "oh-my-pm-mcp.mjs");
const fixtureRoot = "examples/fixtures/markdown-project";

// The MCP SDK is a dependency of the mcp-server package; resolve it from there.
const requireFromPkg = createRequire(join(mcpPkgDir, "package.json"));
const clientUrl = pathToFileURL(
  requireFromPkg.resolve("@modelcontextprotocol/sdk/client/index.js"),
).href;
const stdioUrl = pathToFileURL(
  requireFromPkg.resolve("@modelcontextprotocol/sdk/client/stdio.js"),
).href;

const { Client } = await import(clientUrl);
const { StdioClientTransport } = await import(stdioUrl);

function fail(message) {
  process.stderr.write(`check-mcp-server: ${message}\n`);
  process.exitCode = 1;
}

// The eight-tool surface (four local + four GitHub), compared as a sorted set.
// The smoke calls only the offline local project_brief; no GitHub tool is
// invoked, so this smoke never touches the network and needs no token.
const EXPECTED_TOOLS = [
  "github_project_brief",
  "github_project_handoff",
  "github_project_next",
  "github_project_risks",
  "project_brief",
  "project_handoff",
  "project_next",
  "project_risks",
];

let capturedStderr = "";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [binPath],
  cwd: repoRoot,
  stderr: "pipe",
});

const client = new Client({ name: "oh-my-pm-smoke", version: "0.0.0" });

let ok = true;
try {
  await client.connect(transport);

  const stderrStream = transport.stderr;
  if (stderrStream) {
    stderrStream.on("data", (chunk) => {
      capturedStderr += chunk.toString();
    });
  }

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
    ok = false;
    fail(`unexpected tool list: ${names.join(", ")}`);
  }

  const result = await client.callTool({
    name: "project_brief",
    arguments: { root: fixtureRoot },
  });
  if (result.isError) {
    ok = false;
    fail(`project_brief returned an error: ${result.content?.[0]?.text ?? "unknown"}`);
  }
  const structured = result.structuredContent;
  if (!structured || structured.root !== fixtureRoot) {
    ok = false;
    fail("project_brief structured content missing the expected root");
  }
  const serialized = `${JSON.stringify(structured)}\n${result.content?.[0]?.text ?? ""}`;
  if (!serialized.includes("Riverline Field Guide")) {
    ok = false;
    fail("project_brief result did not include the expected fixture project title");
  }
  for (const forbidden of ["runtimeResponse", "providerResponses", "trace", "ARCHIVED-SENTINEL"]) {
    if (JSON.stringify(structured).includes(forbidden)) {
      ok = false;
      fail(`structured content leaked forbidden field: ${forbidden}`);
    }
  }
} catch (error) {
  ok = false;
  fail(`smoke run threw: ${error instanceof Error ? error.message : "unknown"}`);
} finally {
  await client.close();
  await transport.close();
}

if (ok && capturedStderr.trim() !== "") {
  ok = false;
  fail(`server stderr was not empty: ${capturedStderr.trim()}`);
}

if (ok) {
  process.stdout.write("check-mcp-server: OK\n");
} else {
  process.exitCode = 1;
}
