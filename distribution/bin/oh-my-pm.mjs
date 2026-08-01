#!/usr/bin/env node
// Deprecated compatibility alias for the portable OH MY PM CLI. The canonical
// command is `ohmypm`; this name is retained so an existing script keeps working.
// No removal is scheduled.
//
// This wrapper duplicates no application logic: it runs the same public
// runLocalCliProcess runner as the canonical entrypoint, in-process, and
// forwards argv, stdout, stderr, and the exit code unchanged. Contains no
// repository-relative path, no build logic, and no project parsing.
//
// The deprecation warning goes to stderr and only to stderr, so a `--json`
// invocation's stdout stays a complete, parseable document.

import { commandDeprecationWarning, runLocalCliProcess } from "@oh-my-pm/cli";

process.stderr.write(`${commandDeprecationWarning("oh-my-pm")}\n`);

// Identical boundary wiring to bin/ohmypm.mjs: the real clock is read only here
// and consumed only by the explicit live github command; the entry-script path is
// used only by mcp-config to infer the installed prefix.
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
