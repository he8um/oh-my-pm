// Package assembly dry run: collect candidate files through a read-only
// adapter and build a rich package manifest. Nothing here creates archives,
// writes package files, uploads artifacts, or publishes releases.

import type { KernelWarning } from "@oh-my-pm/contracts";
import type {
  FilesystemAdapter,
  FilesystemEntry,
  PackageAssemblyDryRunReport,
  PackageAssemblyInput,
  PackageAssemblyPlan,
} from "./types.js";
import { installerWarning, OMP_I_INVALID_PACKAGE } from "./errors.js";
import { createPackageManifest } from "./package-manifest.js";
import { isSafeRelativePath, joinInstallerPath, normalizeInstallerPath } from "./paths.js";
import { isNonEmptyString } from "./validate.js";

/** Validate assembly input; empty result means valid. */
export function validatePackageAssemblyInput(input: PackageAssemblyInput): string[] {
  const reasons: string[] = [];
  if (!isNonEmptyString(input.name)) {
    reasons.push("missing_package_name");
  }
  if (!isNonEmptyString(input.version)) {
    reasons.push("missing_package_version");
  }
  if (!isNonEmptyString(input.root)) {
    reasons.push("missing_root");
  }
  if (input.include.length === 0) {
    reasons.push("assembly_include_must_not_be_empty");
  }
  if (input.include.some((path) => !isSafeRelativePath(path))) {
    reasons.push("assembly_include_path_must_be_safe");
  }
  const normalized = input.include.map(normalizeInstallerPath);
  if (new Set(normalized).size !== normalized.length) {
    reasons.push("duplicate_assembly_include_path");
  }
  return reasons;
}

/**
 * Resolve include paths through the adapter in include order. Missing files
 * are skipped, never thrown; nothing is written.
 */
export function planPackageAssembly(
  input: PackageAssemblyInput,
  filesystem: FilesystemAdapter,
): PackageAssemblyPlan {
  const root = normalizeInstallerPath(input.root);
  const files: FilesystemEntry[] = [];
  for (const includePath of input.include) {
    const entry = filesystem.read(joinInstallerPath(root, includePath));
    if (entry !== undefined) {
      files.push(entry);
    }
  }
  return { root: input.root, include: [...input.include], files };
}

/**
 * Build an assembly dry-run report: validated input, resolved plan, and a
 * rich manifest keyed by package-relative include paths.
 */
export function createPackageAssemblyDryRun(
  input: PackageAssemblyInput,
  filesystem: FilesystemAdapter,
): PackageAssemblyDryRunReport {
  const manifestBase = {
    name: input.name,
    version: input.version,
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    ...(input.architecture === undefined ? {} : { architecture: input.architecture }),
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
  };

  const reasons = validatePackageAssemblyInput(input);
  if (reasons.length > 0) {
    return {
      ok: false,
      plan: { root: input.root, include: [...input.include], files: [] },
      manifest: createPackageManifest({ ...manifestBase, files: [] }),
      warnings: reasons.map((reason): KernelWarning =>
        installerWarning(OMP_I_INVALID_PACKAGE, reason),
      ),
    };
  }

  const plan = planPackageAssembly(input, filesystem);

  // Manifest entries carry package-relative paths, not adapter paths, so
  // the manifest can feed install planning under any root.
  const root = normalizeInstallerPath(input.root);
  const manifestFiles: FilesystemEntry[] = [];
  let missing = false;
  for (const includePath of input.include) {
    const entry = filesystem.read(joinInstallerPath(root, includePath));
    if (entry === undefined) {
      missing = true;
      continue;
    }
    manifestFiles.push({ path: includePath, content: entry.content, checksum: entry.checksum });
  }

  const manifest = createPackageManifest({ ...manifestBase, files: manifestFiles });
  if (missing) {
    return {
      ok: false,
      plan,
      manifest,
      warnings: [installerWarning(OMP_I_INVALID_PACKAGE, "assembly_include_file_missing")],
    };
  }
  return { ok: true, plan, manifest };
}
