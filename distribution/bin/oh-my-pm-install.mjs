#!/usr/bin/env node
// Deprecated compatibility alias for the portable OH MY PM release-bundle
// installer. The canonical command is `ohmypm-install`; this name is retained so
// an existing installation script keeps working. No removal is scheduled.
//
// This wrapper duplicates no installer logic: it calls the same
// runReleaseInstallCli in the release install core as the canonical entrypoint,
// in-process, and returns its exit code unchanged.
//
// The deprecation warning goes to stderr and only to stderr, so `--json` preview
// output on stdout stays a complete, parseable document.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReleaseInstallCli } from "../libexec/release-install-core.mjs";

// The warning text is restated here rather than imported from the CLI package:
// the installer must remain runnable from inside an extracted bundle using only
// the shipped libexec core, with no workspace package resolution. The wording is
// asserted against the shared helper by the compatibility tests.
process.stderr.write(
  "Warning: `oh-my-pm-install` is a deprecated compatibility alias.\nUse `ohmypm-install` instead.\n",
);

const bundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

process.exitCode = runReleaseInstallCli({
  bundleRoot,
  argv: process.argv.slice(2),
  writeStdout: (text) => process.stdout.write(text),
  writeStderr: (text) => process.stderr.write(text),
});
