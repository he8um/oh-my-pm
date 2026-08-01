#!/usr/bin/env node
// Local MCP stdio smoke check. Spawns the built MCP server over stdio, lists
// tools, calls project_brief on the public fixture, provider_status offline, and
// the two read-only Project Brain memory tools (project_changes, and as of v0.4
// project_timeline) against an ISOLATED standard data root holding no memory. It
// asserts a safe TWELVE-tool source/workspace surface in a FIXED registration
// order, zero write tools, an empty project_timeline result, that neither memory
// tool created a data directory/file/lock, and that no forbidden sentinel leaks.
// This is a validation utility, not package runtime source. It performs no
// network request and prints exactly one concise success line after the server
// closes.

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpPkgDir = join(repoRoot, "mcp-server");
const binPath = join(mcpPkgDir, "bin", "ohmypm-mcp.mjs");
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

// The source/workspace surface: ten historical tools, the v0.3 read-only
// project_changes tool, and the v0.4 read-only project_timeline tool (twelve),
// compared as a sorted set. The smoke calls only the offline local
// project_brief, offline provider_status, and the two read-only memory tools
// over an empty store, so it never touches the network.
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
  "project_timeline",
  "provider_status",
];

// The exact REGISTRATION order. The ten historical tools keep their positions,
// project_changes is eleventh, and project_timeline is appended twelfth. A
// reorder is a compatibility break and must fail here.
const EXPECTED_TOOL_ORDER = [
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
  "project_changes",
  "project_timeline",
];

// An isolated standard data root: the MCP server resolves the STANDARD
// application-data location (the agent supplies no path), so we point the
// standard resolution at a temp directory via env for the spawned process only.
// LOCALAPPDATA covers Windows; XDG_DATA_HOME + HOME cover Linux/macOS.
const dataHome = mkdtempSync(join(tmpdir(), "oh-my-pm-mcp-smoke-"));
const isolatedEnv = {
  ...process.env,
  LOCALAPPDATA: dataHome,
  XDG_DATA_HOME: dataHome,
  HOME: dataHome,
  USERPROFILE: dataHome,
};
// The resolved store root under the isolated data home (never printed by the
// server); used only to assert project_changes wrote nothing.
const forbiddenSentinels = [
  "runtimeResponse",
  "providerResponses",
  '"trace"',
  "previousValue",
  "currentValue",
  "evidenceRefs",
  "fingerprintInput",
  "projectRoot",
  "dataRoot",
  "Authorization",
  "Bearer ",
];

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

let capturedStderr = "";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [binPath],
  cwd: repoRoot,
  env: isolatedEnv,
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
  if (names.length !== 12) {
    ok = false;
    fail(`expected exactly 12 tools, found ${names.length}`);
  }
  // Fixed registration order: the historical tools must not be reordered.
  const registrationOrder = tools.map((tool) => tool.name);
  if (JSON.stringify(registrationOrder) !== JSON.stringify(EXPECTED_TOOL_ORDER)) {
    ok = false;
    fail(`unexpected tool registration order: ${registrationOrder.join(", ")}`);
  }
  // Zero write tools: every tool must declare readOnlyHint and must not declare
  // a destructive or open-world mutation. Tools without annotations are the
  // historical read-only document/provider tools, which take no write path.
  for (const tool of tools) {
    const annotations = tool.annotations ?? {};
    if (annotations.destructiveHint === true) {
      ok = false;
      fail(`tool ${tool.name} declares destructiveHint: true (zero write tools allowed)`);
    }
    if (annotations.readOnlyHint === false) {
      ok = false;
      fail(`tool ${tool.name} declares readOnlyHint: false (zero write tools allowed)`);
    }
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
  for (const forbidden of [
    "runtimeResponse",
    "providerResponses",
    "trace",
    "Authorization",
    "Bearer ",
  ]) {
    if (statusSerialized.includes(forbidden)) {
      ok = false;
      fail(`provider_status leaked forbidden field: ${forbidden}`);
    }
  }

  // project_changes (Phase 5): a read-only compare over the isolated empty
  // store. A nonexistent project must yield the controlled noPriorMemory status,
  // create no data directory/file/lock, and leak no forbidden sentinel.
  const changesResult = await client.callTool({
    name: "project_changes",
    arguments: { projectId: "smoke-nonexistent-project" },
  });
  if (changesResult.isError) {
    ok = false;
    fail(`project_changes returned an error: ${changesResult.content?.[0]?.text ?? "unknown"}`);
  }
  const changesStructured = changesResult.structuredContent;
  if (!changesStructured || changesStructured.schemaVersion !== 1) {
    ok = false;
    fail("project_changes structured content missing schemaVersion 1");
  }
  if (changesStructured && changesStructured.status !== "noPriorMemory") {
    ok = false;
    fail(`project_changes expected noPriorMemory, got: ${changesStructured.status}`);
  }
  const changesSerialized = `${JSON.stringify(changesStructured)}\n${changesResult.content?.[0]?.text ?? ""}`;
  for (const forbidden of forbiddenSentinels) {
    if (changesSerialized.includes(forbidden)) {
      ok = false;
      fail(`project_changes leaked forbidden sentinel: ${forbidden}`);
    }
  }
  // The resolved path must never appear in the output.
  if (changesSerialized.includes(dataHome)) {
    ok = false;
    fail("project_changes leaked the resolved data-root path");
  }
  // project_timeline (v0.4): a read-only derivation over the isolated empty
  // store. A nonexistent project must yield a valid EMPTY result, create no data
  // directory/file/lock, and leak no forbidden sentinel or path.
  const timelineResult = await client.callTool({
    name: "project_timeline",
    arguments: { projectId: "smoke-nonexistent-project" },
  });
  if (timelineResult.isError) {
    ok = false;
    fail(`project_timeline returned an error: ${timelineResult.content?.[0]?.text ?? "unknown"}`);
  }
  const timelineStructured = timelineResult.structuredContent;
  if (!timelineStructured || timelineStructured.schemaVersion !== 1) {
    ok = false;
    fail("project_timeline structured content missing schemaVersion 1");
  }
  if (timelineStructured && timelineStructured.eventCount !== 0) {
    ok = false;
    fail(`project_timeline expected 0 events, got: ${timelineStructured.eventCount}`);
  }
  if (timelineStructured && timelineStructured.hasMore !== false) {
    ok = false;
    fail("project_timeline expected hasMore false on an empty store");
  }
  if (timelineStructured && timelineStructured.chronology !== "capture-order") {
    ok = false;
    fail("project_timeline must report capture-order chronology");
  }
  const timelineSerialized = `${JSON.stringify(timelineStructured)}\n${timelineResult.content?.[0]?.text ?? ""}`;
  for (const forbidden of forbiddenSentinels) {
    if (timelineSerialized.includes(forbidden)) {
      ok = false;
      fail(`project_timeline leaked forbidden sentinel: ${forbidden}`);
    }
  }
  if (timelineSerialized.includes(dataHome)) {
    ok = false;
    fail("project_timeline leaked the resolved data-root path");
  }
  // A bounded limit must be enforced: over the maximum is a controlled error.
  const overLimit = await client.callTool({
    name: "project_timeline",
    arguments: { projectId: "smoke-nonexistent-project", limit: 101 },
  });
  if (!overLimit.isError) {
    ok = false;
    fail("project_timeline accepted a limit above the maximum of 100");
  }

  // Neither memory tool created any application-state file on a missing store.
  const storeRoot = join(dataHome, "oh-my-pm");
  const written = listFiles(storeRoot).concat(listFiles(join(dataHome, "Library")));
  if (written.length > 0) {
    ok = false;
    fail(`a read-only memory tool created application-state files: ${written.join(", ")}`);
  }
} catch (error) {
  ok = false;
  fail(`smoke run threw: ${error instanceof Error ? error.message : "unknown"}`);
} finally {
  await client.close();
  await transport.close();
  rmSync(dataHome, { recursive: true, force: true });
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
