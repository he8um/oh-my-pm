// Canonical classification of the repository's Vitest files by shared-resource
// side effect. This is the single source of truth consumed by the Vitest
// workspace, the release stress runner, and the inventory regression guard --
// the list is never duplicated across scripts.
//
// Why this exists: the release/archive/install suites each spawn
// tools/build-release-bundle.mjs, which runs `pnpm deploy` and reads the shared
// workspace dist/ output while computing the bundle's internal SHA256SUMS. Two
// such suites running concurrently contend over the pnpm store and the deployed
// tree, so a bundle's manifest can stop matching its own contents --
// surfacing as source:sha256sums_checksum_mismatch. They must run serially.

/**
 * Test files that build a release bundle, build archives, install a bundle, or
 * otherwise mutate/consume shared build output. Serialized as one Vitest
 * project with file parallelism disabled.
 *
 * Paths are repository-relative and POSIX-separated.
 */
export const RELEASE_INTEGRATION_TESTS = Object.freeze([
  "tools/build-release-archives.test.mjs",
  "tools/check-release-archive-reproducibility.test.mjs",
  "tools/check-release-archives.test.mjs",
  "tools/check-release-install.test.mjs",
  "tools/install-release-bundle.test.mjs",
  "tools/release-archive-utils.test.mjs",
  "tools/release-install-e2e.test.mjs",
  "tools/test/release-bundle-e2e.test.mjs",
  "tools/test/v0.3-release-qualification.test.mjs",
]);

/**
 * Markers that indicate a test drives a shared-resource release workflow.
 * Used by the regression guard to catch a new heavy suite that was never added
 * to RELEASE_INTEGRATION_TESTS.
 */
export const SHARED_RESOURCE_MARKERS = Object.freeze([
  "build-release-bundle",
  "build-release-archives",
  "install-release-bundle",
  "check-release-install",
  "check-release-bundle",
  "check-release-archives",
  "pnpm deploy",
  "build:kernel",
]);

/**
 * Files that reference a marker only as inert data -- a string compared in an
 * assertion, a documented command name -- without ever spawning it. Each entry
 * records why it is exempt so the exemption stays reviewable.
 */
export const MARKER_EXEMPT_TESTS = Object.freeze({
  "distribution/libexec/release-install-core.test.mjs":
    "names check-release-bundle in assertion text only; spawns no subprocess and touches no shared build output",
});

/** Glob form of the serialized inventory, for Vitest include patterns. */
export function releaseIntegrationIncludes() {
  return [...RELEASE_INTEGRATION_TESTS];
}

/** Glob form of the exclusions applied to the parallel unit project. */
export function unitExcludes() {
  return [...RELEASE_INTEGRATION_TESTS];
}
