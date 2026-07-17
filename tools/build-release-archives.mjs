#!/usr/bin/env node
// Preview-first deterministic release archive builder. Preview by default;
// creates the three release assets only with --apply into the explicit
// --output directory. It performs no tagging, no GitHub Release, no external
// transmission, and no publishing.

import {
  applyReleaseArchivePlan,
  formatReleaseArchivePlan,
  parseReleaseArchiveArgs,
  resolveReleaseArchivePlan,
} from "./release-archive-utils.mjs";

const parsed = parseReleaseArchiveArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`release archives error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const plan = resolveReleaseArchivePlan({
    bundle: parsed.bundle,
    output: parsed.output,
    apply: parsed.apply,
    force: parsed.force,
  });

  if (!parsed.apply) {
    process.stdout.write(formatReleaseArchivePlan(plan, parsed.outputMode));
    process.exitCode = plan.ok ? 0 : 2;
  } else if (!plan.ok) {
    process.stdout.write(formatReleaseArchivePlan(plan, parsed.outputMode));
    process.exitCode = 2;
  } else {
    const result = applyReleaseArchivePlan(plan);
    if (result.ok) {
      process.stdout.write(formatReleaseArchivePlan(plan, parsed.outputMode));
      process.exitCode = 0;
    } else if (result.code === "archive_exists" || result.code === "plan_not_applicable") {
      process.stderr.write(`release archives blocked: ${result.reasons.join(", ")}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`release archives failed: ${result.code}: ${result.reasons.join(", ")}\n`);
      process.exitCode = 1;
    }
  }
}
