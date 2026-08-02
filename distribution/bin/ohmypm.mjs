#!/usr/bin/env node
// Compatibility alias for the portable OH MY PM CLI entrypoint. `ohmypm` was the
// canonical command in v0.5; the canonical command is now `omp`. This name
// remains fully supported and no removal is scheduled, so an existing script or
// shell alias keeps working unchanged.
//
// The notice is written to stderr before the runner produces any output, so an
// invocation's stdout stays a complete, parseable document.

import { commandAliasWarning, runLocalCliProcess } from "@oh-my-pm/cli";

process.stderr.write(`${commandAliasWarning("ohmypm")}\n`);

// Identical boundary wiring to bin/omp.mjs: the real clock is read only here at
// the process boundary, and the entry-script path is used only by mcp-config to
// infer the installed prefix.
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
