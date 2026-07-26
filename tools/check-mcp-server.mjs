#!/usr/bin/env node
// Local MCP stdio smoke check. Spawns the built MCP server over stdio, lists
// tools, calls project_brief on the public fixture, and asserts a safe result.
// This is a validation utility, not package runtime source. It prints exactly
// one concise success line, only after the server process has closed.

import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

// Source/workspace Phase 5 surface: the legacy ten plus one read-only Project
// Brain projection. Release-bundle checks deliberately retain the historical
// v0.2 ten-tool expectation.
// The smoke calls only the offline local project_brief; no GitHub tool is
// invoked, so this smoke never touches the network and needs no token.
const EXPECTED_TOOLS = [
  "github_project_brief",
  "github_project_handoff",
  "github_project_next",
  "github_project_risks",
  "github_provider_diagnostics",
  "project_brief",
  "project_changes",
  "project_handoff",
  "project_next",
  "project_risks",
  "provider_status",
];
const LEGACY_V02_MCP_TOOL_COUNT = 10;
const SOURCE_V03_PHASE5_MCP_TOOL_COUNT = 11;
const PROJECT_BRAIN_MCP_WRITE_TOOL_COUNT = 0;
const PROJECT_BRAIN_MCP_READ_TOOL_COUNT = 1;
if (
  EXPECTED_TOOLS.length !== SOURCE_V03_PHASE5_MCP_TOOL_COUNT ||
  SOURCE_V03_PHASE5_MCP_TOOL_COUNT !==
    LEGACY_V02_MCP_TOOL_COUNT + PROJECT_BRAIN_MCP_READ_TOOL_COUNT ||
  PROJECT_BRAIN_MCP_WRITE_TOOL_COUNT !== 0
) {
  throw new Error("Phase 5 MCP tool-count constants are inconsistent");
}

let capturedStderr = "";
const isolatedDataBase = mkdtempSync(join(tmpdir(), "oh-my-pm-mcp-phase5-"));
const expectedDataRoot = join(isolatedDataBase, "oh-my-pm");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [binPath],
  cwd: repoRoot,
  env: {
    ...process.env,
    XDG_DATA_HOME: isolatedDataBase,
    MCP_PHASE5_PLANTED_SECRET: "MCP-SMOKE-TOKEN-SENTINEL",
  },
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

  const changesResult = await client.callTool({
    name: "project_changes",
    arguments: { projectId: "mcp-smoke-nonexistent" },
  });
  if (changesResult.isError) {
    ok = false;
    fail(`project_changes returned an error: ${changesResult.content?.[0]?.text ?? "unknown"}`);
  }
  const changesStructured = changesResult.structuredContent;
  if (
    !changesStructured ||
    changesStructured.schemaVersion !== 1 ||
    changesStructured.status !== "noPriorMemory" ||
    changesStructured.chronology !== "capture-order"
  ) {
    ok = false;
    fail("project_changes did not return the controlled noPriorMemory result");
  }
  const changesSerialized = `${JSON.stringify(changesStructured)}\n${changesResult.content?.[0]?.text ?? ""}`;
  for (const forbidden of [
    "MCP-SMOKE-TOKEN-SENTINEL",
    "Authorization",
    "Bearer ",
    "rawBody",
    "diffHunk",
    "runtimeResponse",
    "providerResponses",
    "trace",
    "projectRoot",
    "dataRoot",
    isolatedDataBase,
    expectedDataRoot,
  ]) {
    if (changesSerialized.includes(forbidden)) {
      ok = false;
      fail(`project_changes leaked forbidden sentinel: ${forbidden}`);
    }
  }
  if (existsSync(expectedDataRoot)) {
    ok = false;
    fail("project_changes created application-state data for missing memory");
  }

  // provider_status is offline and safe to call from the smoke check. It must
  // return a valid structured status report and never leak forbidden fields.
  const statusResult = await client.callTool({ name: "provider_status", arguments: {} });
  if (statusResult.isError) {
    ok = false;
    fail(`provider_status returned an error: ${statusResult.content?.[0]?.text ?? "unknown"}`);
  }
  const statusStructured = statusResult.structuredContent;
  if (!statusStructured || statusStructured.schemaVersion !== 1) {
    ok = false;
    fail("provider_status structured content missing schemaVersion 1");
  }
  const statusSerialized = JSON.stringify(statusStructured);
  for (const forbidden of ["runtimeResponse", "providerResponses", "trace", "Authorization", "Bearer "]) {
    if (statusSerialized.includes(forbidden)) {
      ok = false;
      fail(`provider_status leaked forbidden field: ${forbidden}`);
    }
  }
} catch (error) {
  ok = false;
  fail(`smoke run threw: ${error instanceof Error ? error.message : "unknown"}`);
} finally {
  await client.close();
  await transport.close();
  rmSync(isolatedDataBase, { recursive: true, force: true });
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
