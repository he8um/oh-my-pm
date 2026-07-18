#!/usr/bin/env node
// Read-only verifier for a local installation. Confirms the four shims exist
// and are executable, runs the installed CLI (status + fixture brief), and
// drives the installed MCP command over stdio (list tools + project_brief).
// No writes, no environment lookups. It may spawn the explicitly installed
// commands; package source stays free of child-process usage.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(repoRoot, "examples", "fixtures", "markdown-project");
const isWindows = process.platform === "win32";

function fail(message) {
  process.stderr.write(`local install check failed: ${message}\n`);
  process.exitCode = 1;
  return false;
}

function parseArgs(args) {
  let prefix;
  let seen = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--prefix") {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--") || seen) {
        return { ok: false, message: "--prefix requires a single value" };
      }
      prefix = value;
      seen = true;
      i += 1;
    } else if (arg === "--json") {
      // accepted for symmetry; output is a single line either way
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (!seen) return { ok: false, message: "--prefix is required" };
  return { ok: true, prefix };
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isExecutable(path) {
  try {
    return (lstatSync(path).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`local install check error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const ok = await run(parsed.prefix);
  if (ok) {
    process.stdout.write("OH MY PM local install check: OK\n");
  }
}

async function run(prefix) {
  const binDir = join(prefix, "bin");
  const cliCommand = join(binDir, isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
  const mcpCommand = join(binDir, isWindows ? "oh-my-pm-mcp.cmd" : "oh-my-pm-mcp");

  const shimPaths = [
    join(binDir, "oh-my-pm"),
    join(binDir, "oh-my-pm.cmd"),
    join(binDir, "oh-my-pm-mcp"),
    join(binDir, "oh-my-pm-mcp.cmd"),
  ];
  for (const shim of shimPaths) {
    if (!isRegularFile(shim)) {
      return fail(`missing shim: ${shim}`);
    }
  }
  if (!isWindows) {
    for (const shim of [join(binDir, "oh-my-pm"), join(binDir, "oh-my-pm-mcp")]) {
      if (!isExecutable(shim)) {
        return fail(`shim is not executable: ${shim}`);
      }
    }
  }

  // Installed CLI: status
  let statusOut;
  try {
    statusOut = execFileSync(cliCommand, ["status"], { encoding: "utf8" });
  } catch {
    return fail("installed CLI status did not exit cleanly");
  }
  if (!statusOut.includes("OH MY PM status: healthy")) {
    return fail("installed CLI status was not healthy");
  }

  // Installed CLI: fixture brief JSON
  let briefOut;
  try {
    briefOut = execFileSync(cliCommand, ["brief", fixtureRoot, "--json"], { encoding: "utf8" });
  } catch {
    return fail("installed CLI brief did not exit cleanly");
  }
  let brief;
  try {
    brief = JSON.parse(briefOut);
  } catch {
    return fail("installed CLI brief did not emit valid JSON");
  }
  if (brief.ok !== true) {
    return fail("installed CLI brief was not successful");
  }
  if (briefOut.includes("ARCHIVED-SENTINEL") || briefOut.includes("SCRATCH-SENTINEL")) {
    return fail("installed CLI brief leaked excluded document content");
  }

  // Installed MCP command over stdio
  const requireFromMcp = createRequire(join(repoRoot, "mcp-server", "package.json"));
  const { Client } = await import(
    pathToFileURL(requireFromMcp.resolve("@modelcontextprotocol/sdk/client/index.js")).href
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(requireFromMcp.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href
  );

  const transport = new StdioClientTransport({
    command: mcpCommand,
    args: [],
    cwd: repoRoot,
    stderr: "pipe",
  });
  const client = new Client({ name: "oh-my-pm-local-check", version: "0.0.0" });
  let mcpOk = true;
  let mcpMessage = "";
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    // The ten-tool surface (four local + four GitHub + two diagnostics),
    // compared sorted. Only the offline local project_brief is exercised below;
    // no GitHub workflow tool and no network diagnostic is ever called, so this
    // verifier stays network-free and needs no token.
    const expected = [
      "github_project_brief",
      "github_project_handoff",
      "github_project_next",
      "github_project_risks",
      "github_provider_diagnostics",
      "project_brief",
      "project_handoff",
      "project_next",
      "project_risks",
      "provider_status",
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      mcpOk = false;
      mcpMessage = `unexpected MCP tool list: ${names.join(", ")}`;
    } else {
      const result = await client.callTool({
        name: "project_brief",
        arguments: { root: fixtureRoot },
      });
      const serialized = JSON.stringify(result.structuredContent ?? {});
      if (result.isError) {
        mcpOk = false;
        mcpMessage = "installed MCP project_brief returned an error";
      } else if (!serialized.includes("Riverline Field Guide")) {
        mcpOk = false;
        mcpMessage = "installed MCP project_brief missing expected fixture title";
      } else if (
        serialized.includes("runtimeResponse") ||
        serialized.includes("providerResponses") ||
        serialized.includes("ARCHIVED-SENTINEL")
      ) {
        mcpOk = false;
        mcpMessage = "installed MCP project_brief leaked a forbidden field";
      }
    }
  } catch {
    mcpOk = false;
    mcpMessage = "installed MCP command did not respond over stdio";
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
    try {
      await transport.close();
    } catch {
      // ignore close errors
    }
  }
  if (!mcpOk) {
    return fail(mcpMessage);
  }
  return true;
}
