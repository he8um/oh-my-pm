// Installer examples: dry-run planning, controlled execution, rollback
// capture, and update guard flow — all through in-memory adapters and the
// injected example Kernel boundary. No CLI install command, no release
// packaging, and no remote retrieval.

import type {
  ArchiveDryRunReport,
  InstallDryRunReport,
  InstallerFailure,
  InstallExecutionReport,
  PackageAssemblyDryRunReport,
  ReleaseChannelDryRunReport,
  ReleaseIntegrityDryRunReport,
  ReleaseMetadataDryRunReport,
  RollbackCapturePlan,
  RollbackExecutionReport,
} from "@oh-my-pm/installer";
import {
  createArchiveDryRunFromAssembly,
  createInstaller,
  createMemoryFilesystem,
  createMemoryWriteFilesystem,
  createPackageAssemblyDryRun,
  createReleaseChannelDryRun,
  createReleaseIntegrityDryRun,
  createReleaseMetadataDryRun,
  exampleFilesystemEntries,
  examplePackageAssemblyInput,
  examplePackageManifest,
  exampleRollbackManifest,
  exampleUpdatePlan,
} from "@oh-my-pm/installer";
import { createExampleKernelApi } from "./kernel.js";

const EXAMPLE_ROOT = "/tmp/oh-my-pm";
const EXAMPLE_INSTALLED_AT = "2026-01-01T00:00:00.000Z";

export type InstallerDryRunExample = {
  dryRun: InstallDryRunReport;
};

export type InstallerControlledExecutionExample = {
  dryRun: InstallDryRunReport;
  execution: InstallExecutionReport;
  snapshotVersion: string | undefined;
};

export type InstallerRollbackExample = {
  capturePlan: RollbackCapturePlan;
  execution: RollbackExecutionReport;
};

export type InstallerPackageAssemblyExample = {
  assembly: PackageAssemblyDryRunReport;
};

export type InstallerArchivePlanExample = {
  archive: ArchiveDryRunReport;
};

export type InstallerSignedMetadataExample = {
  metadata: ReleaseMetadataDryRunReport;
};

export type InstallerReleaseIntegrityExample = {
  integrity: ReleaseIntegrityDryRunReport;
};

export type InstallerReleaseChannelExample = {
  channel: ReleaseChannelDryRunReport;
};

export type InstallerUpdateExample = {
  ok: boolean;
  planId?: string;
  appliedSteps?: string[];
  snapshotVersion?: string;
};

// Example inputs are fixed and valid, so failures never occur at runtime;
// this narrows the union without hiding a genuine defect.
function expectOk<T extends object>(result: T | InstallerFailure): T {
  if ("code" in result) {
    throw new Error(`installer example unexpectedly failed: ${result.message}`);
  }
  return result;
}

function exampleInstallInput() {
  return {
    packageManifest: examplePackageManifest(),
    root: EXAMPLE_ROOT,
    installedAt: EXAMPLE_INSTALLED_AT,
  };
}

/** Plan an installation without mutating anything. */
export function runInstallerDryRunExample(): InstallerDryRunExample {
  const installer = createInstaller({ kernel: createExampleKernelApi() });
  const filesystem = createMemoryFilesystem(exampleFilesystemEntries());
  const dryRun = expectOk(installer.planInstall(exampleInstallInput(), { filesystem }));
  return { dryRun };
}

/** Plan and then execute an installation through the in-memory writer. */
export function runInstallerControlledExecutionExample(): InstallerControlledExecutionExample {
  const installer = createInstaller({ kernel: createExampleKernelApi() });
  const filesystem = createMemoryFilesystem(exampleFilesystemEntries());
  const writer = createMemoryWriteFilesystem(exampleFilesystemEntries());
  const input = exampleInstallInput();

  const dryRun = expectOk(installer.planInstall(input, { filesystem }));
  const checksum = input.packageManifest.checksum;
  const execution = expectOk(
    installer.executeInstall(
      {
        input,
        plan: dryRun.plan,
        files: [
          { path: `${EXAMPLE_ROOT}/bin/oh-my-pm`, content: "new binary", checksum },
          { path: `${EXAMPLE_ROOT}/README.md`, content: "new readme", checksum },
        ],
      },
      { filesystem, writer },
    ),
  );

  return {
    dryRun,
    execution,
    snapshotVersion: installer.snapshot().manifest?.version,
  };
}

/** Plan a rollback capture and execute it through the in-memory writer. */
export function runInstallerRollbackExample(): InstallerRollbackExample {
  const installer = createInstaller({ kernel: createExampleKernelApi() });
  const filesystem = createMemoryFilesystem(exampleFilesystemEntries());
  // The rollback manifest carries root-relative paths, so the writer store
  // is keyed the same way.
  const writer = createMemoryWriteFilesystem(
    exampleFilesystemEntries().map((entry) => ({
      ...entry,
      path: entry.path.slice(`${EXAMPLE_ROOT}/`.length),
    })),
  );

  const capturePlan = expectOk(
    installer.planRollbackCapture(
      {
        id: "rollback-1",
        root: EXAMPLE_ROOT,
        paths: ["bin/oh-my-pm", "README.md"],
        createdAt: EXAMPLE_INSTALLED_AT,
      },
      { filesystem },
    ),
  );
  const execution = expectOk(
    installer.executeRollback({ rollback: exampleRollbackManifest() }, { filesystem, writer }),
  );

  return { capturePlan, execution };
}

/** Assemble the example package as a dry run; nothing is archived. */
export function runInstallerPackageAssemblyDryRunExample(): InstallerPackageAssemblyExample {
  const filesystem = createMemoryFilesystem(exampleFilesystemEntries());
  const assembly = createPackageAssemblyDryRun(examplePackageAssemblyInput(), filesystem);
  return { assembly };
}

/** Plan an archive from the assembly dry run; no archive file is created. */
export function runInstallerArchivePlanExample(): InstallerArchivePlanExample {
  const { assembly } = runInstallerPackageAssemblyDryRunExample();
  return { archive: createArchiveDryRunFromAssembly(assembly, "zip") };
}

/** Build signed release metadata with a placeholder signature only. */
export function runInstallerSignedMetadataExample(): InstallerSignedMetadataExample {
  const { archive } = runInstallerArchivePlanExample();
  const metadata = createReleaseMetadataDryRun({
    archive: archive.plan,
    createdAt: EXAMPLE_INSTALLED_AT,
    keyId: "example-key",
  });
  return { metadata };
}

/** Verify placeholder-signed metadata against its archive plan. */
export function runInstallerReleaseIntegrityExample(): InstallerReleaseIntegrityExample {
  const { archive } = runInstallerArchivePlanExample();
  const signed = runInstallerSignedMetadataExample();
  const integrity = createReleaseIntegrityDryRun({
    metadata: signed.metadata.metadata,
    archive: archive.plan,
  });
  return { integrity };
}

/** Group one verified release into local dev channel metadata. */
export function runInstallerReleaseChannelExample(): InstallerReleaseChannelExample {
  const signed = runInstallerSignedMetadataExample();
  const { integrity } = runInstallerReleaseIntegrityExample();
  const channel = createReleaseChannelDryRun({
    channel: "dev",
    entries: [
      {
        version: signed.metadata.metadata.packageVersion,
        createdAt: EXAMPLE_INSTALLED_AT,
        metadata: signed.metadata.metadata,
        integrity: integrity.verification,
      },
    ],
  });
  return { channel };
}

/** Install the example package, then apply the example update plan. */
export function runInstallerUpdateExample(): InstallerUpdateExample {
  const installer = createInstaller({ kernel: createExampleKernelApi() });

  const installed = installer.install(exampleInstallInput());
  if ("code" in installed) {
    return { ok: false };
  }
  const currentManifest = installer.snapshot().manifest;
  if (currentManifest === undefined) {
    return { ok: false };
  }

  const applied = installer.applyUpdate({ currentManifest, plan: exampleUpdatePlan() });
  if ("code" in applied) {
    return { ok: false };
  }

  const snapshotVersion = installer.snapshot().manifest?.version;
  return {
    ok: applied.ok,
    planId: applied.planId,
    appliedSteps: [...applied.appliedSteps],
    ...(snapshotVersion === undefined ? {} : { snapshotVersion }),
  };
}
