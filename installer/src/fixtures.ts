// Deterministic example inputs for tests and examples. All time values are
// fixed literals; nothing here reads a clock.

import type {
  PackageFileEntry,
  PackageManifest,
  RollbackManifest,
  UpdatePlan,
} from "@oh-my-pm/contracts";
import type { ArchivePlanInput, FilesystemEntry, PackageAssemblyInput } from "./types.js";
import { createPackageManifest } from "./package-manifest.js";

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

/** Example per-file metadata matching the rich package manifest. */
export function examplePackageFileEntries(): PackageFileEntry[] {
  return [
    { path: "bin/oh-my-pm", checksum: "sha256:example-bin", sizeBytes: 14 },
    { path: "README.md", checksum: "sha256:example-readme", sizeBytes: 14 },
  ];
}

/** Example release package manifest with per-file metadata. */
export function exampleRichPackageManifest(): PackageManifest {
  return createPackageManifest({
    name: "oh-my-pm-local",
    version: "2.0.0-alpha.0",
    platform: "linux",
    architecture: "x64",
    createdAt: "2026-01-01T00:00:00.000Z",
    files: [
      { path: "bin/oh-my-pm", content: "example binary", checksum: "sha256:example-bin" },
      { path: "README.md", content: "example readme", checksum: "sha256:example-readme" },
    ],
  });
}

/** Example archive plan input with package-relative file paths. */
export function exampleArchivePlanInput(): ArchivePlanInput {
  return {
    format: "zip",
    packageName: "oh-my-pm-local",
    packageVersion: "2.0.0-alpha.0",
    files: exampleFilesystemEntries().map((entry) => ({
      ...entry,
      path: entry.path.slice("/tmp/oh-my-pm/".length),
    })),
  };
}

/** Example package assembly dry-run input. */
export function examplePackageAssemblyInput(): PackageAssemblyInput {
  return {
    name: "oh-my-pm-local",
    version: "2.0.0-alpha.0",
    root: "/tmp/oh-my-pm",
    include: ["bin/oh-my-pm", "README.md"],
    platform: "linux",
    architecture: "x64",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Example entries for an in-memory filesystem adapter. */
export function exampleFilesystemEntries(): FilesystemEntry[] {
  return [
    {
      path: "/tmp/oh-my-pm/bin/oh-my-pm",
      content: "old binary",
      checksum: "sha256:old",
    },
    {
      path: "/tmp/oh-my-pm/README.md",
      content: "old readme",
      checksum: "sha256:old-readme",
    },
  ];
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
