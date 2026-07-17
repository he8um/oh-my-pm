#!/usr/bin/env node
// Portable OH MY PM CLI entrypoint. Thin process adapter over the public
// runLocalCliProcess runner; contains no repository-relative path, no build
// logic, and no project parsing.

import { runLocalCliProcess } from "@oh-my-pm/cli";

const result = runLocalCliProcess(process.argv.slice(2));

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}
if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
