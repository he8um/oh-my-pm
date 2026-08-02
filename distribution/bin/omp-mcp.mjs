#!/usr/bin/env node
// Portable OH MY PM MCP stdio server entrypoint. stdout is reserved for MCP
// protocol messages; a fatal startup error writes one concise stderr line and
// sets a non-zero exit code. Contains no repository-relative path.

import { startOhMyPmMcpStdioServer } from "@oh-my-pm/mcp-server";

try {
  await startOhMyPmMcpStdioServer();
} catch {
  process.stderr.write("OH MY PM MCP server failed to start\n");
  process.exitCode = 1;
}
