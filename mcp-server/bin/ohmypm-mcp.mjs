#!/usr/bin/env node
// Compatibility alias for the OH MY PM MCP stdio server. `ohmypm-mcp` was the
// canonical command in v0.5; the canonical command is now `omp-mcp`. This name
// remains fully supported and no removal is scheduled, so an existing MCP client
// configuration keeps working without being edited.
//
// stdout is reserved exclusively for MCP protocol messages. The notice is
// therefore written to stderr and only to stderr: a single stray byte on stdout
// would desynchronize the JSON-RPC stream and break the client handshake. MCP
// clients conventionally surface a server's stderr as a log, so the notice is
// still visible where it should be.
//
// The notice is written before the transport is connected, so it cannot
// interleave with protocol traffic. This wrapper duplicates no server logic: it
// starts the same startOhMyPmMcpStdioServer as the canonical entrypoint.

import { commandAliasWarning } from "@oh-my-pm/application";

import { startOhMyPmMcpStdioServer } from "../dist/index.js";

process.stderr.write(`${commandAliasWarning("ohmypm-mcp")}\n`);

try {
  // Identical boundary wiring to bin/omp-mcp.mjs: the real clock is supplied
  // only here, at the process boundary. The server, projector, and runtime never
  // read a system clock.
  await startOhMyPmMcpStdioServer({ clock: () => new Date().toISOString() });
} catch {
  process.stderr.write("OH MY PM MCP server failed to start\n");
  process.exitCode = 1;
}
