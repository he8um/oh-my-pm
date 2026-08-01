#!/usr/bin/env node
// Portable OH MY PM CLI entrypoint. Thin process adapter over the public
// runLocalCliProcess runner; contains no repository-relative path, no build
// logic, and no project parsing.

import { runLocalCliProcess } from "@oh-my-pm/cli";

// The real clock is read only here, at the process boundary, and is consumed by
// the runner only for the explicit live github command; local/offline commands
// ignore it and use their fixed deterministic clock. The entry-script path is
// read here and used only by mcp-config to infer the installed prefix.
const result = await runLocalCliProcess(process.argv.slice(2), {
  clock: () => new Date().toISOString(),
  entryScriptPath: process.argv[1] ?? "",
});

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}
if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
