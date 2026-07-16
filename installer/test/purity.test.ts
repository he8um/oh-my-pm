// Static purity check: installer sources must not perform I/O or reach for
// nondeterministic APIs. The two Node adapters are scanned separately: the
// read-only adapter may read through node:fs but never write, and the write
// adapter may use an explicit allow-list of write APIs. Reading source files
// here is allowed only for this static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const NODE_READ_ADAPTER_FILE = "node-filesystem.ts";
const NODE_WRITE_ADAPTER_FILE = "node-write-filesystem.ts";

const NONDETERMINISM = [
  "process.env",
  "process.exit",
  "child_process",
  "fetch(",
  "XMLHttpRequest",
  "Date.now",
  "new Date",
  "Math.random",
  "crypto.randomUUID",
  "console.",
];

// No installer source may sign for real or hold key material. The word
// "signature" is allowed because release metadata models signatures; real
// signing arrives in a later phase behind explicit review.
// Deterministic consistency helpers (verifyReleaseIntegrity and friends)
// are allowed; a bare lowercase `verify(` call is not.
const SIGNING_FORBIDDEN = [
  "subtle",
  "generateKey",
  "sign(",
  "verify(",
  "privateKey",
  "publicKey",
  "BEGIN PRIVATE KEY",
  "BEGIN PUBLIC KEY",
  "BEGIN CERTIFICATE",
];

// Channel metadata is local-only: no remote locations, no distribution
// terms, and no transfer verbs anywhere in installer source.
const REMOTE_FORBIDDEN = [
  "http://",
  "https://",
  "publish",
  "upload",
  "download",
  "cdn",
  "bucket",
  "registry",
];

// No installer source may create archives or streamed artifacts; assembly
// and archive planning stay dry runs until a later distribution phase.
// Bare "zip"/"tar" plan values are allowed; library/API usage is not.
const ARCHIVE_FORBIDDEN = [
  "createWriteStream",
  "archiver",
  "zlib",
  "AdmZip",
  "JSZip",
  "tar.",
  "zip.",
  ".zip",
  ".tar",
  ".tgz",
];

// Node filesystem usage is matched precisely because installer type names
// legitimately contain the word "filesystem".
const CORE_FORBIDDEN = [
  'from "fs"',
  'from "node:fs"',
  'require("fs")',
  "fs.",
  "node:fs",
  "node:crypto",
  "crypto.",
  ...NONDETERMINISM,
  ...ARCHIVE_FORBIDDEN,
  ...SIGNING_FORBIDDEN,
  ...REMOTE_FORBIDDEN,
];

// The read-only adapter may read through node:fs/node:path/node:crypto but
// must never write or mutate.
const READ_ADAPTER_FORBIDDEN = [
  ...REMOTE_FORBIDDEN,
  "writeFile",
  "rmSync",
  "unlink",
  "mkdir",
  "rmdir",
  "rename",
  "appendFile",
  "copyFile",
  ...NONDETERMINISM,
  ...ARCHIVE_FORBIDDEN,
  ...SIGNING_FORBIDDEN,
];

// The write adapter may use writeFileSync/mkdirSync/rmSync/copyFileSync but
// nothing beyond that allow-list, and no nondeterminism.
const WRITE_ADAPTER_FORBIDDEN = [
  "unlink",
  "rmdir",
  "rename",
  "appendFile",
  "node:crypto",
  ...NONDETERMINISM,
  ...ARCHIVE_FORBIDDEN,
  ...SIGNING_FORBIDDEN,
  ...REMOTE_FORBIDDEN,
];

// The v0 release candidate checklist models a "no publishing metadata" hygiene
// gate, so these exact contract identifiers legitimately contain the substring
// "publish". They are stripped before the substring scan; any other "publish"
// occurrence still fails. This does not permit real publishing.
const PUBLISH_ALLOWED_IDENTIFIERS = [
  "no-publishing-metadata",
  "noPublishingMetadata",
  "v0_rc_publishing_metadata_present",
  "No publishing metadata is present",
  // Public-safe v0 release notes draft phrases that intentionally name what is
  // NOT done (no publishing) — stripped before the substring scan.
  "No publishing workflow in this draft",
  "Package publishing",
  "publishing and tagging manual",
];

function stripPublishAllowedIdentifiers(contents: string): string {
  let stripped = contents;
  for (const identifier of PUBLISH_ALLOWED_IDENTIFIERS) {
    stripped = stripped.split(identifier).join("");
  }
  return stripped;
}

describe("installer purity", () => {
  it("core source files contain no I/O or nondeterministic APIs", () => {
    const files = readdirSync(srcDir).filter(
      (f) =>
        f.endsWith(".ts") && f !== NODE_READ_ADAPTER_FILE && f !== NODE_WRITE_ADAPTER_FILE,
    );
    expect(files.length).toBeGreaterThanOrEqual(16);
    for (const file of files) {
      const contents = stripPublishAllowedIdentifiers(readFileSync(join(srcDir, file), "utf8"));
      for (const forbidden of CORE_FORBIDDEN) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("policy, impact, decision, and audit previews never execute installation or rollback", () => {
    for (const file of [
      "update-policy.ts",
      "update-impact.ts",
      "rollback-impact.ts",
      "decision-report.ts",
      "audit-events.ts",
    ]) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of ["executeInstall", "executeRollback"]) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the audit event model, export, capability, approval, write plan, and confirmation never log, persist, send, or execute", () => {
    for (const file of [
      "audit-events.ts",
      "audit-export.ts",
      "write-capability.ts",
      "write-approval.ts",
      "write-execution-plan.ts",
      "write-confirmation.ts",
    ]) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of [
        "console.log",
        "console.error",
        "logger",
        "telemetry",
        "writeFile",
        "rmSync",
        "unlink",
        "fs.",
        "executeInstall",
        "executeRollback",
        ...REMOTE_FORBIDDEN,
      ]) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the guarded local artifact assembly envelope never logs, executes, calls an adapter, publishes, or reaches the network", () => {
    // This module models release/artifact/assembly/archive readiness only, so
    // those words are allowed; actual creation, publish, network, write,
    // adapter, and execution APIs are not.
    const contents = readFileSync(join(srcDir, "local-artifact-assembly-envelope.ts"), "utf8");
    for (const forbidden of [
      "http://",
      "https://",
      "fetch(",
      "XMLHttpRequest",
      "publish",
      "upload",
      "download",
      "cdn",
      "bucket",
      "registry",
      "createWriteStream",
      "archiver",
      "executeInstall",
      "executeRollback",
      "executeInstallPlan",
      "executeRollbackPlan",
      "FilesystemWriteAdapter",
      "writeFile(",
      "removeFile(",
      "backupFile(",
      "rmSync",
      "unlink",
      "console.log",
      "console.error",
      "logger",
      "telemetry",
      "fs.",
      "crypto",
      "privateKey",
      "publicKey",
    ]) {
      expect(
        contents,
        `local-artifact-assembly-envelope.ts must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });

  it("the guarded release artifact plan never logs, executes, calls an adapter, publishes, or reaches the network", () => {
    // This module intentionally plans release artifacts, so the words
    // release/artifact/archive are allowed; actual creation, publish, network,
    // write, adapter, and execution APIs are not.
    const contents = readFileSync(join(srcDir, "release-artifact-plan.ts"), "utf8");
    for (const forbidden of [
      "http://",
      "https://",
      "fetch(",
      "XMLHttpRequest",
      "publish",
      "upload",
      "download",
      "cdn",
      "bucket",
      "registry",
      "createWriteStream",
      "archiver",
      "executeInstall",
      "executeRollback",
      "executeInstallPlan",
      "executeRollbackPlan",
      "FilesystemWriteAdapter",
      "writeFile(",
      "removeFile(",
      "backupFile(",
      "rmSync",
      "unlink",
      "console.log",
      "console.error",
      "logger",
      "telemetry",
      "fs.",
      "crypto",
      "privateKey",
      "publicKey",
    ]) {
      expect(
        contents,
        `release-artifact-plan.ts must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });

  it("the public v0 release notes draft never logs, executes, calls an adapter, or reaches the network", () => {
    // The draft names "No telemetry ..." as a thing NOT done; that exact
    // public-safe phrase is stripped before the scan.
    const contents = readFileSync(join(srcDir, "public-v0-release-notes.ts"), "utf8")
      .split("No telemetry, remote retrieval, or write adapter execution in this draft")
      .join("");
    for (const forbidden of [
      "http://",
      "https://",
      "fetch(",
      "XMLHttpRequest",
      "upload",
      "download",
      "cdn",
      "bucket",
      "registry",
      "executeInstall",
      "executeRollback",
      "executeInstallPlan",
      "executeRollbackPlan",
      "FilesystemWriteAdapter",
      "writeFile(",
      "removeFile(",
      "backupFile(",
      "rmSync",
      "unlink",
      "console.log",
      "console.error",
      "logger",
      "telemetry",
      "fs.",
      "crypto",
      "privateKey",
      "publicKey",
    ]) {
      expect(
        contents,
        `public-v0-release-notes.ts must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });

  it("the v0 release candidate checklist never logs, executes, calls an adapter, publishes, or holds crypto", () => {
    const contents = stripPublishAllowedIdentifiers(
      readFileSync(join(srcDir, "v0-release-candidate.ts"), "utf8"),
    );
    for (const forbidden of [
      "console.log",
      "console.error",
      "logger",
      "telemetry",
      "fs.",
      "rmSync",
      "unlink",
      "executeInstall",
      "executeRollback",
      "executeInstallPlan",
      "executeRollbackPlan",
      "FilesystemWriteAdapter",
      "writeFile(",
      "removeFile(",
      "backupFile(",
      "crypto",
      "privateKey",
      "publicKey",
      ...REMOTE_FORBIDDEN,
    ]) {
      expect(
        contents,
        `v0-release-candidate.ts must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });

  it("the adapter contract, dry-run envelope, and release readiness never log, execute, call an adapter, or hold crypto", () => {
    for (const file of ["write-adapter-contract.ts", "write-dry-run-envelope.ts", "release-readiness.ts"]) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of [
        "console.log",
        "console.error",
        "logger",
        "telemetry",
        "fs.",
        "rmSync",
        "unlink",
        "executeInstall",
        "executeRollback",
        "executeInstallPlan",
        "executeRollbackPlan",
        "FilesystemWriteAdapter",
        "writeFile(",
        "removeFile(",
        "backupFile(",
        "crypto",
        "privateKey",
        "publicKey",
        ...REMOTE_FORBIDDEN,
      ]) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the approval token, write plan, and confirmation hold no crypto or key material", () => {
    for (const file of ["write-approval.ts", "write-execution-plan.ts", "write-confirmation.ts"]) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of ["crypto", "privateKey", "publicKey"]) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the write execution plan and confirmation never call a write adapter", () => {
    for (const file of ["write-execution-plan.ts", "write-confirmation.ts"]) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of ["FilesystemWriteAdapter", "removeFile", "backupFile"]) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("read-only node adapter stays read-only and side-effect-free", () => {
    const contents = readFileSync(join(srcDir, NODE_READ_ADAPTER_FILE), "utf8");
    for (const forbidden of READ_ADAPTER_FORBIDDEN) {
      expect(
        contents,
        `${NODE_READ_ADAPTER_FILE} must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });

  it("node write adapter uses only allow-listed write APIs", () => {
    const contents = readFileSync(join(srcDir, NODE_WRITE_ADAPTER_FILE), "utf8");
    for (const forbidden of WRITE_ADAPTER_FORBIDDEN) {
      expect(
        contents,
        `${NODE_WRITE_ADAPTER_FILE} must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });
});
