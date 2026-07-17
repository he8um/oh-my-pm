#!/usr/bin/env node
// Preview-first portable release bundle builder. Preview by default; assembles
// only with --apply into the explicit --output directory. It performs no
// publishing, no external transmission, no tagging, and no GitHub Release.

import {
  applyReleaseBundlePlan,
  formatReleaseBundlePlan,
  parseReleaseBundleArgs,
  resolveReleaseBundlePlan,
} from "./release-bundle-utils.mjs";

const parsed = parseReleaseBundleArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`release bundle error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const plan = resolveReleaseBundlePlan({
    output: parsed.output,
    apply: parsed.apply,
    force: parsed.force,
  });

  if (!parsed.apply) {
    process.stdout.write(formatReleaseBundlePlan(plan, parsed.outputMode));
    process.exitCode = plan.ok ? 0 : 2;
  } else if (!plan.ok) {
    process.stdout.write(formatReleaseBundlePlan(plan, parsed.outputMode));
    process.exitCode = 2;
  } else {
    const result = applyReleaseBundlePlan(plan);
    if (result.ok) {
      process.stdout.write(formatReleaseBundlePlan(plan, parsed.outputMode));
      process.exitCode = 0;
    } else if (result.code === "bundle_exists" || result.code === "plan_not_applicable") {
      process.stderr.write(`release bundle blocked: ${result.reasons.join(", ")}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`release bundle failed: ${result.code}: ${result.reasons.join(", ")}\n`);
      process.exitCode = 1;
    }
  }
}
