#!/usr/bin/env node
// Portable OH MY PM release-bundle installer entrypoint. Thin process adapter
// over the release install core: it infers its own bundle root as the parent of
// this bin/ directory and hands everything else to runReleaseInstallCli.
//
// Behavior lives entirely in the core: an explicit --prefix is required, the
// default is a preview, installation happens only with --apply, and exact managed
// targets are replaced only with --force. No network access, no publishing, no
// PATH edits, no shell-profile edits, and no MCP client-config edits.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReleaseInstallCli } from "../libexec/release-install-core.mjs";

const bundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

process.exitCode = runReleaseInstallCli({
  bundleRoot,
  argv: process.argv.slice(2),
  writeStdout: (text) => process.stdout.write(text),
  writeStderr: (text) => process.stderr.write(text),
});
