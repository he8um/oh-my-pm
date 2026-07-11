// Dry-run installer preview. Reads the target root through the installer's
// read-only adapter and reports the planned operations. It never touches a
// write adapter, never executes an install, and never mutates files.

import type {
  CliOutputMode,
  StateTransitionDecision,
  StateTransitionInput,
  UpdateGuardDecision,
  UpdatePlan,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";
import {
  createArchiveDryRunFromAssembly,
  createInstaller,
  createNodeFilesystemAdapter,
  createPackageAssemblyDryRun,
} from "@oh-my-pm/installer";

export type InstallerPreviewResult = {
  ok: boolean;
  root: string;
  operations: {
    kind: string;
    path: string;
    checksum?: string;
  }[];
  packageName: string;
  packageVersion: string;
  warnings: string[];
  /** Planned archive summary; nothing is created. */
  archive?: {
    format: string;
    archiveName: string;
    entries: number;
    checksum: string;
  };
};

// Preview-only Kernel stand-in. planInstall never consults the Kernel; this
// object only satisfies createInstaller's dependency shape. It is not the
// production Kernel binding and must never be used for real decisions.
function createPreviewKernelApi() {
  return {
    version(): string {
      return "preview";
    },
    validateJson(target: ValidationTarget): ValidationReport {
      return { target, passed: true, errors: [], warnings: [] };
    },
    checkUpdatePlan(plan: UpdatePlan): UpdateGuardDecision {
      return {
        status: "allowed",
        planId: plan.id,
        planHash: `preview:${plan.id}`,
        reasons: [],
      };
    },
    decideTransition(input: StateTransitionInput): StateTransitionDecision {
      return { from: input.from, to: input.to, allowed: true, reason: "preview" };
    },
  };
}

/**
 * Assemble the local preview package from the target root as a dry run,
 * then plan what installing it would do. Missing source files surface as
 * warnings without failing the preview by themselves.
 */
export function runInstallerPreview(root: string): InstallerPreviewResult {
  const filesystem = createNodeFilesystemAdapter({ root });
  const assembly = createPackageAssemblyDryRun(
    {
      name: "oh-my-pm-local",
      version: "2.0.0-alpha.0",
      root,
      include: ["bin/oh-my-pm", "README.md"],
      platform: "local",
      architecture: "local",
      createdAt: "preview-created-at",
    },
    filesystem,
  );
  // Archive planning only: the report already carries assembly warnings
  // after its own, so it is the single warning source for the preview.
  const archiveReport = createArchiveDryRunFromAssembly(assembly, "zip");
  const warnings =
    archiveReport.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [];
  const archive = {
    format: archiveReport.plan.format,
    archiveName: archiveReport.plan.archiveName,
    entries: archiveReport.plan.entries.length,
    checksum: archiveReport.plan.checksum,
  };
  const packageManifest = assembly.manifest;

  const installer = createInstaller({ kernel: createPreviewKernelApi() });
  const result = installer.planInstall(
    { packageManifest, root, installedAt: "preview-installed-at" },
    { filesystem },
  );

  if ("code" in result) {
    return {
      ok: false,
      root,
      operations: [],
      packageName: packageManifest.name,
      packageVersion: packageManifest.version,
      warnings: [...warnings, result.message],
      archive,
    };
  }

  return {
    ok: true,
    root,
    operations: result.plan.operations.map((operation) => ({
      kind: operation.kind,
      path: operation.path,
      ...(operation.checksum === undefined ? {} : { checksum: operation.checksum }),
    })),
    packageName: packageManifest.name,
    packageVersion: packageManifest.version,
    warnings: [
      ...warnings,
      ...(result.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? []),
    ],
    archive,
  };
}

function formatBrief(result: InstallerPreviewResult): string {
  const lines = [
    `OH MY PM install-preview: ${result.ok ? "ok" : "failed"}`,
    `package: ${result.packageName}@${result.packageVersion}`,
    `root: ${result.root}`,
  ];
  if (result.ok) {
    lines.push(`operations: ${result.operations.length}`);
    for (const operation of result.operations) {
      lines.push(`- ${operation.kind} ${operation.path}`);
    }
  } else {
    for (const warning of result.warnings) {
      lines.push(`warning: ${warning}`);
    }
  }
  if (result.archive !== undefined) {
    lines.push(`archive-plan: ${result.archive.archiveName}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatMarkdown(result: InstallerPreviewResult): string {
  const lines = ["# OH MY PM Install Preview", ""];
  if (!result.ok) {
    lines.push("Status: failed", "");
  }
  lines.push(
    `Package: \`${result.packageName}@${result.packageVersion}\``,
    `Root: \`${result.root}\``,
    "",
  );
  if (result.ok) {
    lines.push("## Operations", "");
    for (const operation of result.operations) {
      lines.push(`- \`${operation.kind}\` \`${operation.path}\``);
    }
  } else {
    lines.push("## Warnings", "");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  if (result.archive !== undefined) {
    lines.push("", "## Archive Plan", "", `Planned archive: \`${result.archive.archiveName}\``);
  }
  return `${lines.join("\n")}\n`;
}

/** Format a preview result for the requested output mode. */
export function formatInstallerPreview(
  result: InstallerPreviewResult,
  mode: CliOutputMode,
): string {
  if (mode === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (mode === "markdown") {
    return formatMarkdown(result);
  }
  return formatBrief(result);
}
