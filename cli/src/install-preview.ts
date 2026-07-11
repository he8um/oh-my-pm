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
  createInstaller,
  createNodeFilesystemAdapter,
  exampleRichPackageManifest,
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

/** Plan what installing the example package under `root` would do. */
export function runInstallerPreview(root: string): InstallerPreviewResult {
  const packageManifest = exampleRichPackageManifest();
  const installer = createInstaller({ kernel: createPreviewKernelApi() });
  const result = installer.planInstall(
    { packageManifest, root, installedAt: "preview-installed-at" },
    { filesystem: createNodeFilesystemAdapter({ root }) },
  );

  if ("code" in result) {
    return {
      ok: false,
      root,
      operations: [],
      packageName: packageManifest.name,
      packageVersion: packageManifest.version,
      warnings: [result.message],
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
    warnings: result.warnings?.map((warning) => `${warning.code}: ${warning.message}`) ?? [],
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
