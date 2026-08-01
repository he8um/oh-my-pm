// Regression guard for the serialized release-integration inventory.
//
// A new test that drives a release bundle, archive, or install workflow must be
// added to RELEASE_INTEGRATION_TESTS, or it will run in the parallel unit
// project and can race over the shared workspace build output -- the exact
// failure mode this configuration exists to prevent.
//
// The guard reads the canonical inventory rather than repeating the file list.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MARKER_EXEMPT_TESTS,
  RELEASE_INTEGRATION_TESTS,
  SHARED_RESOURCE_MARKERS,
} from "./test-suite-inventory.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every tracked test file, POSIX-separated and repository-relative. */
function trackedTestFiles() {
  return execFileSync("git", ["ls-files", "*.test.mjs", "*.test.ts", "*.spec.mjs", "*.spec.ts"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * Strip line and block comments plus import specifiers so a marker mentioned in
 * documentation, or the inventory's own import, is not treated as a spawn.
 */
function strippedSource(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import[\s\S]*?from\s*["'][^"']*["'];?\s*$/gm, "");
}

/** Markers a file references outside comments. */
function markersIn(relativePath) {
  const source = strippedSource(relativePath);
  return SHARED_RESOURCE_MARKERS.filter((marker) => source.includes(marker));
}

describe("release integration suite inventory", () => {
  it("lists only tracked test files", () => {
    const tracked = new Set(trackedTestFiles());
    for (const file of RELEASE_INTEGRATION_TESTS) {
      expect(tracked.has(file), `inventory lists a file git does not track: ${file}`).toBe(true);
    }
  });

  it("is sorted and free of duplicates so the list stays reviewable", () => {
    expect(RELEASE_INTEGRATION_TESTS).toEqual([...new Set(RELEASE_INTEGRATION_TESTS)]);
    expect(RELEASE_INTEGRATION_TESTS).toEqual([...RELEASE_INTEGRATION_TESTS].sort());
  });

  it("classifies every shared-resource test as release integration", () => {
    const inventory = new Set(RELEASE_INTEGRATION_TESTS);
    const unclassified = [];

    for (const file of trackedTestFiles()) {
      if (inventory.has(file)) continue;
      if (Object.hasOwn(MARKER_EXEMPT_TESTS, file)) continue;
      const markers = markersIn(file);
      if (markers.length > 0) unclassified.push({ file, markers });
    }

    expect(
      unclassified,
      unclassified
        .map(
          ({ file, markers }) =>
            `${file} references shared-resource marker(s) [${markers.join(", ")}] but is not in ` +
            "RELEASE_INTEGRATION_TESTS. Add it there so it runs serialized, or record an " +
            "exemption in MARKER_EXEMPT_TESTS explaining why it touches no shared build output.",
        )
        .join("\n"),
    ).toEqual([]);
  });

  it("keeps every exemption pointing at a real, still-inert test file", () => {
    const tracked = new Set(trackedTestFiles());
    for (const [file, why] of Object.entries(MARKER_EXEMPT_TESTS)) {
      expect(tracked.has(file), `exempt file no longer tracked: ${file}`).toBe(true);
      expect(typeof why === "string" && why.length > 0).toBe(true);
      // An exempt file must still not spawn a subprocess; if it starts to, the
      // exemption is stale and must be re-reviewed.
      expect(strippedSource(file).includes("spawnSync"), `${file} now spawns a subprocess`).toBe(
        false,
      );
    }
  });
});
