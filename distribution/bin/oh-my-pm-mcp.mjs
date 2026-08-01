#!/usr/bin/env node
// Deprecated compatibility alias for the portable OH MY PM MCP stdio server. The
// canonical command is `ohmypm-mcp`; this name is retained so an existing MCP
// client configuration keeps working without being edited. No removal is
// scheduled.
//
// stdout is reserved exclusively for MCP protocol messages, so the deprecation
// warning is written to stderr and only to stderr, before the transport is
// connected. A stray byte on stdout would desynchronize the JSON-RPC stream.
//
// Contains no repository-relative path and duplicates no server logic.

import { commandDeprecationWarning } from "@oh-my-pm/cli";
import { startOhMyPmMcpStdioServer } from "@oh-my-pm/mcp-server";

process.stderr.write(`${commandDeprecationWarning("oh-my-pm-mcp")}\n`);

try {
  await startOhMyPmMcpStdioServer();
} catch {
  process.stderr.write("OH MY PM MCP server failed to start\n");
  process.exitCode = 1;
}
