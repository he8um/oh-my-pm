// Deterministic test topology (Vitest 2.x workspace).
//
// Two projects with different concurrency contracts:
//
//   unit    -- every test except the release-integration inventory. Keeps full
//              file parallelism; these tests touch no shared build output.
//   release -- the canonical release/archive/install inventory. Runs with file
//              parallelism disabled and a single worker so no two suites can
//              build a bundle, run `pnpm deploy`, or read the shared workspace
//              dist/ at the same time. That concurrency is what produced
//              intermittent source:sha256sums_checksum_mismatch failures.
//
// The suite list lives in tools/test-suite-inventory.mjs and is not duplicated.
import { releaseIntegrationIncludes, unitExcludes } from "./tools/test-suite-inventory.mjs";

const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.release/**", "**/target/**"];

export default [
  {
    test: {
      name: "unit",
      include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      exclude: [...DEFAULT_EXCLUDE, ...unitExcludes()],
    },
  },
  {
    test: {
      name: "release",
      include: releaseIntegrationIncludes(),
      exclude: DEFAULT_EXCLUDE,
      // Serialize completely: no parallel files, no parallel suites, one worker.
      fileParallelism: false,
      sequence: { concurrent: false },
      poolOptions: { threads: { singleThread: true, maxThreads: 1, minThreads: 1 } },
      testTimeout: 300_000,
      hookTimeout: 300_000,
    },
  },
];
