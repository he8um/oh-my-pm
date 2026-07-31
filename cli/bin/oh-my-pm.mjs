#!/usr/bin/env node
// Deprecated compatibility alias for the OH MY PM CLI. The canonical command is
// `ohmypm`; this name is retained so an existing script or shell alias keeps
// working. No removal is scheduled.
//
// This wrapper duplicates no application logic. It runs the same
// runLocalCliProcess runner as the canonical entrypoint, with the same process
// boundary values, and forwards argv, stdout, stderr, and the exit code
// unchanged. It runs in-process rather than launching a second interpreter, so
// stdin, the environment, the working directory, and signal/termination behavior
// are all inherited exactly.
//
// The deprecation warning goes to stderr and only to stderr. stdout must stay a
// clean document: a `--json` command's stdout has to remain parseable JSON, so a
// warning written there would corrupt a machine-readable contract.

import { commandDeprecationWarning, runLocalCliProcess } from "../dist/index.js";

process.stderr.write(`${commandDeprecationWarning("oh-my-pm")}\n`);

// Identical boundary wiring to bin/ohmypm.mjs: the real clock, the process id
// used only to derive the memory operation id, and the entry-script path used
// only by mcp-config to infer the installed prefix. Passing this script's own
// path keeps prefix inference correct for the deprecated shim too, because the
// inference matches on the installed directory shape, not on the filename.
const result = await runLocalCliProcess(process.argv.slice(2), {
  clock: () => new Date().toISOString(),
  processId: process.pid,
  entryScriptPath: process.argv[1] ?? "",
});

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}
if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
