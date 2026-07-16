#!/usr/bin/env node
// Private local MCP stdio server wrapper for OH MY PM. stdout is reserved for
// MCP protocol messages; a fatal startup error writes one concise line to
// stderr and sets a non-zero exit code. This is not a production release and is
// not distributed.

import { startOhMyPmMcpStdioServer } from "../dist/index.js";

try {
  await startOhMyPmMcpStdioServer();
} catch {
  process.stderr.write("OH MY PM MCP server failed to start\n");
  process.exitCode = 1;
}
