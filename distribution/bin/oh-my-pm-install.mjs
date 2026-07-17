#!/usr/bin/env node
// Portable OH MY PM release-bundle installer entrypoint. Thin process adapter
// over the release install core. It infers its own bundle root as the parent of
// this bin/ directory, requires an explicit --prefix, previews by default,
// installs only with --apply, and replaces exact managed targets only with
// --force. It performs no network access, no publishing, no PATH edits, no
// shell-profile edits, and no MCP client-config edits.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyReleaseInstallPlan,
  formatReleaseInstallPlan,
  parseReleaseInstallArgs,
  resolveReleaseInstallPlan,
} from "../libexec/release-install-core.mjs";

const bundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const parsed = parseReleaseInstallArgs(process.argv.slice(2), { allowBundle: false });
if (!parsed.ok) {
  process.stderr.write(`release install error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const plan = resolveReleaseInstallPlan({
    bundleRoot,
    prefix: parsed.prefix,
    apply: parsed.apply,
    force: parsed.force,
  });

  if (!parsed.apply) {
    process.stdout.write(formatReleaseInstallPlan(plan, parsed.outputMode));
    process.exitCode = plan.ok ? 0 : 2;
  } else if (!plan.ok) {
    process.stdout.write(formatReleaseInstallPlan(plan, parsed.outputMode));
    process.exitCode = 2;
  } else {
    const result = applyReleaseInstallPlan(plan);
    if (result.ok) {
      const applied =
        result.code === "already-installed"
          ? { ...plan, action: "already-installed" }
          : { ...plan, apply: true };
      process.stdout.write(formatReleaseInstallPlan(applied, parsed.outputMode));
      process.exitCode = 0;
    } else if (result.code === "plan_not_applicable" || result.code === "force_required") {
      process.stderr.write(`release install blocked: ${result.reasons.join(", ")}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`release install failed: ${result.code}\n`);
      process.exitCode = 1;
    }
  }
}
