#!/usr/bin/env node
// Private local development wrapper for the OH MY PM CLI core. This is a thin
// process adapter: all behavior lives in the public runLocalCliProcess runner,
// which uses the real Rust Kernel through the WASM binding and the config-aware
// Markdown loader. This wrapper only forwards argv and writes the result.

import { runLocalCliProcess } from "../dist/index.js";

// The real clock is read only here, at the process boundary, and is consumed by
// the runner only for the explicit live github command; local/offline commands
// ignore it and use their fixed deterministic clock.
const result = await runLocalCliProcess(process.argv.slice(2), {
  clock: () => new Date().toISOString(),
});

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}
if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
