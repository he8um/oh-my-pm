#!/usr/bin/env node
// Read-only verifier for a local installation. Confirms every shim the command
// manifest declares exists and is executable, runs the installed CLI (status + fixture brief), and
// drives the installed MCP command over stdio (list tools + project_brief).
// No writes, no environment lookups. It may spawn the explicitly installed
// commands; package source stays free of child-process usage.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The installed command set comes from the one place that defines it, so this
// verifier can never check a stale list.
import {
  LOCAL_CANONICAL_COMMAND_NAMES,
  LOCAL_COMMAND_NAMES,
  LOCAL_LEGACY_COMMAND_NAMES,
} from "./local-install-utils.mjs";

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
  // The functional checks below run the *canonical* commands. Both alias classes
  // are verified to exist, to be launchable, and to warn correctly, but the
  // canonical pair is what the check treats as the product surface.
  const platformCommand = (name) => join(binDir, isWindows ? `${name}.cmd` : name);
  const cliCommand = platformCommand(LOCAL_CANONICAL_COMMAND_NAMES[0]);
  const mcpCommand = platformCommand(LOCAL_CANONICAL_COMMAND_NAMES[1]);

  // v0.6: every canonical command, every compatibility alias, and every
  // deprecated alias is installed in both POSIX and .cmd form.
  const shimPaths = LOCAL_COMMAND_NAMES.flatMap((name) => [
    join(binDir, name),
    join(binDir, `${name}.cmd`),
  ]);
  for (const shim of shimPaths) {
    if (!isRegularFile(shim)) {
      return fail(`missing shim: ${shim}`);
    }
  }
  if (!isWindows) {
    // The POSIX launcher must carry the executable bit; the .cmd launcher need
    // not, and is not checked for it on POSIX.
    for (const name of LOCAL_COMMAND_NAMES) {
      const shim = join(binDir, name);
      if (!isExecutable(shim)) {
        return fail(`shim is not executable: ${shim}`);
      }
    }
  }

  // Every CLI alias must run and must write its notice to stderr only, never
  // polluting stdout. Each class is checked with its own wording so a
  // compatibility alias can never be reported as deprecated.
  for (const alias of LOCAL_LEGACY_COMMAND_NAMES.filter((n) => !n.endsWith("-mcp"))) {
    const aliasCommand = platformCommand(alias);
    try {
      const aliasOut = execFileSync(aliasCommand, ["status"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!aliasOut.includes("OH MY PM status: healthy")) {
        return fail(`alias ${alias} status was not healthy`);
      }
      if (aliasOut.includes("Warning:")) {
        return fail(`alias ${alias} wrote its notice to stdout`);
      }
    } catch {
      return fail(`alias ${alias} did not exit cleanly`);
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
    // This verifier installs from the SOURCE workspace, where the local Project
    // Memory capability resolves, so the installed MCP command exposes the
    // twelve-tool source/workspace surface (four local + four GitHub + two
    // diagnostics + the read-only project_changes and project_timeline),
    // compared sorted. A bundled RELEASE install that excludes Project Memory
    // stays at ten tools — verified by tools/check-release-install.mjs. Only the
    // offline local project_brief is exercised below; the two memory tools are
    // exercised end-to-end (with an isolated data root) by
    // tools/check-mcp-server.mjs. No GitHub workflow tool and no network
    // diagnostic is ever called, so this verifier stays network-free and needs
    // no token.
    const expected = [
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
