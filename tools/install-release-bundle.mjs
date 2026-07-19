#!/usr/bin/env node
// Repository-side adapter over the shared release install core. It installs an
// explicitly supplied, verified release bundle into an explicit --prefix. It
// duplicates no installation logic: all planning, validation, rendering, and
// controlled writes live in distribution/libexec/release-install-core.mjs. It
// performs no network access, no publishing, no tagging, no PATH edits, no
// shell-profile edits, and no MCP client-config edits.

import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyReleaseInstallPlan,
  formatReleaseInstallPlan,
  parseReleaseInstallArgs,
  resolveReleaseInstallPlan,
} from "../distribution/libexec/release-install-core.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const parsed = parseReleaseInstallArgs(process.argv.slice(2), {
  allowBundle: true,
  requireBundle: true,
});
if (!parsed.ok) {
  process.stderr.write(`release install error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const bundleRoot = isAbsolute(parsed.bundle) ? parsed.bundle : join(repoRoot, parsed.bundle);
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
      // reasons are bounded, path-free, content-free codes (e.g.
      // post_install_verification_failed, post_posix_shim_mode_mismatch) — safe
      // to surface for CI diagnosis without leaking paths or file contents.
      const detail = result.reasons && result.reasons.length ? ` (${result.reasons.join(", ")})` : "";
      process.stderr.write(`release install failed: ${result.code}${detail}\n`);
      process.exitCode = 1;
    }
  }
}
