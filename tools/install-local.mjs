#!/usr/bin/env node
// Preview-first local installer for the oh-my-pm and oh-my-pm-mcp command
// shims. Preview by default; writes only with --apply, and only inside
// <prefix>/bin. No PATH edits, no shell-profile edits, no network, no env.

import {
  applyLocalInstallPlan,
  formatLocalInstallPlan,
  parseLocalInstallArgs,
  resolveLocalInstallPlan,
} from "./local-install-utils.mjs";

const parsed = parseLocalInstallArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`local install error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const plan = resolveLocalInstallPlan({
    prefix: parsed.prefix,
    apply: parsed.apply,
    force: parsed.force,
  });

  if (!parsed.apply) {
    process.stdout.write(formatLocalInstallPlan(plan, parsed.outputMode));
    // A blocked preview (missing target or an existing shim) exits 2 so callers
    // can distinguish a ready plan from one that cannot be applied as-is.
    process.exitCode = plan.ok ? 0 : 2;
  } else if (!plan.ok) {
    process.stdout.write(formatLocalInstallPlan(plan, parsed.outputMode));
    process.exitCode = 2;
  } else {
    const result = applyLocalInstallPlan(plan);
    if (result.ok) {
      process.stdout.write(formatLocalInstallPlan(plan, parsed.outputMode));
      process.exitCode = 0;
    } else if (result.code === "shim_exists" || result.code === "plan_not_applicable") {
      process.stderr.write(`local install blocked: ${result.reasons.join(", ")}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`local install failed: ${result.code}\n`);
      process.exitCode = 1;
    }
  }
}
