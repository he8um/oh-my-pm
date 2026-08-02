#!/usr/bin/env node
// Compatibility alias for the portable OH MY PM release-bundle installer.
// `ohmypm-install` was the canonical command in v0.5; the canonical command is
// now `omp-install`. This name remains fully supported and no removal is
// scheduled, so an existing installation script keeps working unchanged.
//
// This wrapper duplicates no installer logic: it calls the same
// runReleaseInstallCli in the release install core as the canonical entrypoint,
// in-process, and returns its exit code unchanged.
//
// The notice goes to stderr and only to stderr, so `--json` preview output on
// stdout stays a complete, parseable document.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseInstallAliasWarning,
  runReleaseInstallCli,
} from "../libexec/release-install-core.mjs";

// The wording comes from the shipped core rather than a restated literal, so the
// installer stays runnable from inside an extracted bundle with no workspace
// package resolution while still having exactly one source for the text. The
// compatibility tests assert it matches the shared application helper verbatim.
process.stderr.write(`${releaseInstallAliasWarning("ohmypm-install")}\n`);

const bundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

process.exitCode = runReleaseInstallCli({
  bundleRoot,
  argv: process.argv.slice(2),
  writeStdout: (text) => process.stdout.write(text),
  writeStderr: (text) => process.stderr.write(text),
});
