// Bounded stress runner for the serialized release-integration suite.
//
// Repeats the release Vitest project a fixed number of times and stops at the
// first failure, so a reintroduced race shows up as a real failure rather than
// being averaged away. This is a local/manual investigation tool: it is not part
// of `pnpm test`, and it adds no retries -- a failing iteration fails the run.
//
// Cross-platform: spawns the Vitest binary through Node with shell:false.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_ITERATIONS = 10;

function parseIterations(argv) {
  const flagIndex = argv.indexOf("--iterations");
  if (flagIndex === -1) return DEFAULT_ITERATIONS;
  const raw = argv[flagIndex + 1];
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(value) || value < 1) {
    process.stderr.write("--iterations requires a positive integer\n");
    process.exit(2);
  }
  return value;
}

const iterations = parseIterations(process.argv.slice(2));

// Resolve the Vitest CLI entry directly so no shell parsing is involved.
const vitestBin = join(repoRoot, "node_modules", "vitest", "vitest.mjs");

for (let iteration = 1; iteration <= iterations; iteration += 1) {
  process.stdout.write(`release stress iteration ${iteration}/${iterations}\n`);
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [vitestBin, "run", "--project", "release"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;

  if (result.error !== undefined) {
    process.stderr.write(`release stress iteration ${iteration} could not start: ${result.error.code ?? result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(
      `release stress FAILED on iteration ${iteration}/${iterations} after ${seconds.toFixed(1)}s (exit ${result.status})\n`,
    );
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`release stress iteration ${iteration} passed in ${seconds.toFixed(1)}s\n`);
}

process.stdout.write(`release stress: ${iterations}/${iterations} iterations passed\n`);
