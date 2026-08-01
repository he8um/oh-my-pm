#!/usr/bin/env node
// Private local MCP stdio server wrapper for OH MY PM. stdout is reserved for
// MCP protocol messages; a fatal startup error writes one concise line to
// stderr and sets a non-zero exit code. This is not a production release and is
// not distributed.

import { startOhMyPmMcpStdioServer } from "../dist/index.js";

try {
  // The real clock is supplied only here, at the process boundary. The server,
  // projector, and runtime never read a system clock; the read-only
  // project_changes tool reads it exactly once per invocation.
  await startOhMyPmMcpStdioServer({ clock: () => new Date().toISOString() });
} catch {
  process.stderr.write("OH MY PM MCP server failed to start\n");
  process.exitCode = 1;
}
