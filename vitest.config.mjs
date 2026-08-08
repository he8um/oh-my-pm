// Deterministic test topology (Vitest 4.x projects).
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
//
// v0.6.3: migrated from vitest.workspace.mjs. Vitest 4 removed the standalone
// workspace file in favour of `projects` here, and replaced the Tinypool
// options with top-level worker settings: poolOptions.threads.singleThread and
// maxThreads/minThreads are now maxWorkers. Isolation is left at its default
// (true) -- the release project needs serialization, not shared module state.
import { defineConfig } from "vitest/config";

import { releaseIntegrationIncludes, unitExcludes } from "./tools/test-suite-inventory.mjs";

const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.release/**", "**/target/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
          exclude: [...DEFAULT_EXCLUDE, ...unitExcludes()],
          // v0.6.3: Vitest 2 did not enforce testTimeout against a synchronous
          // test body -- execFileSync blocks the event loop, so the timeout
          // timer never fired and an over-budget test still reported a pass.
          // Vitest 4 enforces it correctly. The mutation suites that shell out
          // (package-catalog, local-install-check, docs-manifest) build a
          // disposable git fixture and run a validator per case, measured at
          // 3.5-6.9s per test on both 2.x and 4.x -- they were always over the
          // 5s default and only ever passed because it went unenforced.
          // 30s covers the measured worst case plus parallel-contention jitter
          // without masking a real hang: nothing here legitimately runs that
          // long, and the release project keeps its own 300s contract below.
          testTimeout: 30_000,
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
          maxWorkers: 1,
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
