#!/usr/bin/env node
// Private local development wrapper for the OH MY PM CLI core. This is a thin
// process adapter: all behavior lives in the public runLocalCliProcess runner,
// which uses the real Rust Kernel through the WASM binding and the config-aware
// Markdown loader. This wrapper only forwards argv and writes the result.

import { runLocalCliProcess } from "../dist/index.js";

const result = await runLocalCliProcess(process.argv.slice(2));

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}
if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
