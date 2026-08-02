#!/usr/bin/env node
// Compatibility alias for the portable OH MY PM MCP stdio server entrypoint.
// `ohmypm-mcp` was the canonical command in v0.5; the canonical command is now
// `omp-mcp`. This name remains fully supported and no removal is scheduled, so
// an existing MCP client configuration keeps working without being edited.
//
// stdout is reserved exclusively for MCP protocol messages, so the notice goes
// to stderr only: a single stray byte on stdout would desynchronize the JSON-RPC
// stream. It is written before the transport connects, so it cannot interleave
// with protocol traffic.

import { commandAliasWarning } from "@oh-my-pm/cli";
import { startOhMyPmMcpStdioServer } from "@oh-my-pm/mcp-server";

process.stderr.write(`${commandAliasWarning("ohmypm-mcp")}\n`);

try {
  await startOhMyPmMcpStdioServer();
} catch {
  process.stderr.write("OH MY PM MCP server failed to start\n");
  process.exitCode = 1;
}
