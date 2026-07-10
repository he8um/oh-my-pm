// Deterministic example inputs for tests and examples. All time values are
// fixed literals; nothing here reads a clock.

import type { PackageManifest, RollbackManifest, UpdatePlan } from "@oh-my-pm/contracts";

/** Example installable package manifest. */
export function examplePackageManifest(): PackageManifest {
  return {
    name: "oh-my-pm-local",
    version: "2.0.0-alpha.0",
    checksum: "sha256:example",
    files: ["bin/oh-my-pm", "README.md"],
  };
}

/** Example rollback manifest. */
export function exampleRollbackManifest(): RollbackManifest {
  return {
    id: "rollback-1",
    paths: ["bin/oh-my-pm"],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Example update plan accepted by the Kernel update guard. */
export function exampleUpdatePlan(): UpdatePlan {
  return {
    id: "update-1",
    fromVersion: "2.0.0-alpha.0",
    toVersion: "2.0.0-alpha.1",
    steps: [{ kind: "replace", path: "bin/oh-my-pm", checksum: "sha256:next" }],
    rollback: {
      id: "rollback-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      paths: ["bin/oh-my-pm"],
    },
  };
}
