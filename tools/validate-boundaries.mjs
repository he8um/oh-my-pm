#!/usr/bin/env node
// Boundary validator (scaffold phase).
// Checks tracked public files for private/internal language, forbidden
// paths, cross-package src imports, and generated-output purity.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let fail = false;
const err = (msg) => {
  console.error(`FAIL: ${msg}`);
  fail = true;
};

// Index + untracked-but-not-ignored files: everything `git add .` would commit.
const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

// 1. No forbidden internal/private language in tracked public files.
// Validation tools and .gitignore may contain detection patterns / ignore rules.
const LANGUAGE_SCAN_EXCLUDE = new Set([
  ".gitignore",
  "tools/check-public-surface.sh",
  "tools/validate-boundaries.mjs",
]);
const FORBIDDEN_STRINGS = [
  "oh-my-pm-core",
  "OH MY PM Core",
  "implementation agent",
  "AI-generated",
  "Codex",
  "Claude",
  "ChatGPT",
  "_AGENT_OVERRIDE",
  "specs/INDEX",
  "Required Documentation Pack",
  "execution-grade specification",
  "documentation pack",
];
for (const file of trackedFiles) {
  if (LANGUAGE_SCAN_EXCLUDE.has(file)) continue;
  const contents = readFileSync(file, "utf8");
  for (const forbidden of FORBIDDEN_STRINGS) {
    if (contents.includes(forbidden)) {
      err(`${file} contains forbidden text "${forbidden}"`);
    }
  }
}

// 2. No tracked private/internal path prefixes.
for (const prefix of ["specs/", "_dev/", "scripts/"]) {
  for (const file of trackedFiles) {
    if (file.startsWith(prefix)) {
      err(`forbidden tracked path: ${file}`);
    }
  }
}

// 3 + 4. No cross-package src imports; no imports from kernel/crate.
const PACKAGE_SRC = /^(contracts|kernel\/binding|runtime|planner|providers|skills|cli|installer|examples)\/src\/.*\.ts$/;
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
const CROSS_SRC =
  /(?:@oh-my-pm\/[a-z-]+|(?:\.\.\/)+(?:contracts|kernel|runtime|planner|providers|skills|cli|installer))\/src\//;
for (const file of trackedFiles) {
  if (!PACKAGE_SRC.test(file)) continue;
  const contents = readFileSync(file, "utf8");
  for (const match of contents.matchAll(IMPORT_SPECIFIER)) {
    const spec = match[1];
    if (CROSS_SRC.test(spec)) {
      err(`${file} imports another package's internal src path: "${spec}"`);
    }
    if (spec.includes("kernel/crate")) {
      err(`${file} imports from kernel/crate: "${spec}"`);
    }
    // The decision report, audit event model, audit trail export, and write
    // capability aggregate/render/evaluate local reports only; none may reach
    // for a Node built-in.
    if (
      (file === "installer/src/decision-report.ts" ||
        file === "installer/src/audit-events.ts" ||
        file === "installer/src/audit-export.ts" ||
        file === "installer/src/write-capability.ts" ||
        file === "installer/src/write-approval.ts" ||
        file === "installer/src/write-execution-plan.ts" ||
        file === "installer/src/write-confirmation.ts" ||
        file === "installer/src/write-adapter-contract.ts" ||
        file === "installer/src/write-dry-run-envelope.ts" ||
        file === "installer/src/release-readiness.ts" ||
        file === "installer/src/v0-release-candidate.ts" ||
        file === "installer/src/public-v0-release-notes.ts" ||
        file === "installer/src/release-artifact-plan.ts") &&
      (spec === "node" || spec.startsWith("node:"))
    ) {
      err(`${file} imports a Node built-in: "${spec}"`);
    }
    if (
      file.startsWith("installer/src/") &&
      file !== "installer/src/node-filesystem.ts" &&
      file !== "installer/src/node-write-filesystem.ts" &&
      (spec === "fs" || spec.startsWith("node:fs"))
    ) {
      err(`${file} imports a Node filesystem module: "${spec}"`);
    }
    if (file.startsWith("examples/src/") && (spec === "fs" || spec.startsWith("node:fs"))) {
      err(`${file} imports a Node filesystem module: "${spec}"`);
    }
    if (file.startsWith("cli/src/") && (spec === "fs" || spec.startsWith("node:fs"))) {
      err(`${file} imports a Node filesystem module: "${spec}"`);
    }
    if (
      (file.startsWith("installer/src/") ||
        file.startsWith("cli/src/") ||
        file.startsWith("examples/src/")) &&
      ["zlib", "node:zlib", "archiver", "adm-zip", "jszip", "tar", "stream", "node:stream"].includes(
        spec,
      )
    ) {
      err(`${file} imports an archive/compression module: "${spec}"`);
    }
    if (
      (file.startsWith("installer/src/") ||
        file.startsWith("cli/src/") ||
        file.startsWith("examples/src/")) &&
      file !== "installer/src/node-filesystem.ts" &&
      (spec === "crypto" || spec === "node:crypto")
    ) {
      err(`${file} imports a crypto module: "${spec}"`);
    }
  }
}

// 4b. The read-only Node adapter must never gain write APIs; the write
// adapter is the only installer source file allowed to mutate real files,
// and no installer source may reach process/env/network/time/random/console.
const NODE_READ_ADAPTER = "installer/src/node-filesystem.ts";
const NODE_WRITE_APIS = [
  "writeFile",
  "rmSync",
  "unlink",
  "mkdir",
  "rmdir",
  "rename",
  "appendFile",
  "copyFile",
];
const INSTALLER_NONDETERMINISM = [
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
// No source may hold key/certificate material or real signing calls; the
// release metadata signature is a deterministic placeholder only.
const SIGNING_MATERIAL = [
  "BEGIN PRIVATE KEY",
  "BEGIN PUBLIC KEY",
  "BEGIN CERTIFICATE",
  "generateKey",
  "subtle.",
];
// Channel metadata is local-only; no remote locations or transfer verbs may
// appear in installer, CLI, or examples source.
const REMOTE_MARKERS = ["http://", "https://", "publish", "upload", "download", "cdn", "bucket"];
// The v0 release candidate checklist models a "no publishing metadata" hygiene
// gate; these exact contract identifiers legitimately contain "publish" and are
// stripped before the remote-marker scan. Any other "publish" occurrence still
// fails. This does not permit real publishing.
const PUBLISH_ALLOWED_IDENTIFIERS = [
  "no-publishing-metadata",
  "noPublishingMetadata",
  "v0_rc_publishing_metadata_present",
  "No publishing metadata is present",
  // Public-safe v0 release notes draft phrases that intentionally name what is
  // NOT done (no publishing) — stripped before the remote-marker scan.
  "No publishing workflow in this draft",
  "Package publishing",
  "publishing and tagging manual",
];
const stripPublishAllowedIdentifiers = (text) => {
  let stripped = text;
  for (const identifier of PUBLISH_ALLOWED_IDENTIFIERS) {
    stripped = stripped.split(identifier).join("");
  }
  return stripped;
};
for (const file of trackedFiles) {
  const scanned =
    (file.startsWith("installer/src/") ||
      file.startsWith("cli/src/") ||
      file.startsWith("examples/src/")) &&
    file.endsWith(".ts");
  if (!scanned) continue;
  const contents = readFileSync(file, "utf8");
  if (
    file === NODE_READ_ADAPTER ||
    file === "installer/src/update-impact.ts" ||
    file === "installer/src/rollback-impact.ts" ||
    file === "installer/src/decision-report.ts" ||
    file === "installer/src/audit-events.ts" ||
    file === "installer/src/audit-export.ts" ||
    file === "installer/src/write-capability.ts" ||
    file === "installer/src/write-approval.ts" ||
    file === "installer/src/write-execution-plan.ts" ||
    file === "installer/src/write-confirmation.ts" ||
    file === "installer/src/write-adapter-contract.ts" ||
    file === "installer/src/write-dry-run-envelope.ts" ||
    file === "installer/src/release-readiness.ts" ||
    file === "installer/src/v0-release-candidate.ts" ||
    file === "installer/src/public-v0-release-notes.ts" ||
    file === "installer/src/release-artifact-plan.ts"
  ) {
    for (const api of NODE_WRITE_APIS) {
      if (contents.includes(api)) {
        err(`${file} contains forbidden write API "${api}"`);
      }
    }
  }
  // The audit event model, export, capability, approval token, write execution
  // plan, confirmation checklist, adapter contract, dry-run envelope, and
  // release readiness render/return/evaluate in memory only; none may log,
  // persist, or send.
  if (
    file === "installer/src/audit-events.ts" ||
    file === "installer/src/audit-export.ts" ||
    file === "installer/src/write-capability.ts" ||
    file === "installer/src/write-approval.ts" ||
    file === "installer/src/write-execution-plan.ts" ||
    file === "installer/src/write-confirmation.ts" ||
    file === "installer/src/write-adapter-contract.ts" ||
    file === "installer/src/write-dry-run-envelope.ts" ||
    file === "installer/src/release-readiness.ts" ||
    file === "installer/src/v0-release-candidate.ts" ||
    file === "installer/src/public-v0-release-notes.ts" ||
    file === "installer/src/release-artifact-plan.ts"
  ) {
    // The public release notes draft names "No telemetry ..." as a thing NOT
    // done; that exact public-safe phrase is stripped before the scan.
    const logScanContents = contents
      .split("No telemetry, remote retrieval, or write adapter execution in this draft")
      .join("");
    for (const marker of ["console.log", "console.error", "logger", "telemetry"]) {
      if (logScanContents.includes(marker)) {
        err(`${file} contains forbidden logging/telemetry API "${marker}"`);
      }
    }
  }
  // The audit trail export, write capability, approval token, write execution
  // plan, confirmation checklist, adapter contract, dry-run envelope, and
  // release readiness model only; none may execute.
  if (
    file === "installer/src/audit-export.ts" ||
    file === "installer/src/write-capability.ts" ||
    file === "installer/src/write-approval.ts" ||
    file === "installer/src/write-execution-plan.ts" ||
    file === "installer/src/write-confirmation.ts" ||
    file === "installer/src/write-adapter-contract.ts" ||
    file === "installer/src/write-dry-run-envelope.ts" ||
    file === "installer/src/release-readiness.ts" ||
    file === "installer/src/v0-release-candidate.ts" ||
    file === "installer/src/public-v0-release-notes.ts" ||
    file === "installer/src/release-artifact-plan.ts"
  ) {
    for (const marker of [
      "executeInstall",
      "executeRollback",
      "executeInstallPlan",
      "executeRollbackPlan",
    ]) {
      if (contents.includes(marker)) {
        err(`${file} contains forbidden install-execution call "${marker}"`);
      }
    }
  }
  // The write execution plan, confirmation checklist, adapter contract,
  // dry-run envelope, and release readiness are planning/reporting only; none
  // may reference a write adapter type or call its mutating methods.
  if (
    file === "installer/src/write-execution-plan.ts" ||
    file === "installer/src/write-confirmation.ts" ||
    file === "installer/src/write-adapter-contract.ts" ||
    file === "installer/src/write-dry-run-envelope.ts" ||
    file === "installer/src/release-readiness.ts" ||
    file === "installer/src/v0-release-candidate.ts" ||
    file === "installer/src/public-v0-release-notes.ts" ||
    file === "installer/src/release-artifact-plan.ts"
  ) {
    for (const marker of ["FilesystemWriteAdapter", "writeFile(", "removeFile(", "backupFile("]) {
      if (contents.includes(marker)) {
        err(`${file} contains forbidden write adapter usage "${marker}"`);
      }
    }
  }
  // The approval token, write execution plan, confirmation checklist, adapter
  // contract, dry-run envelope, and release readiness are deterministic,
  // local, and non-secret; none may reach for crypto or keys.
  if (
    file === "installer/src/write-approval.ts" ||
    file === "installer/src/write-execution-plan.ts" ||
    file === "installer/src/write-confirmation.ts" ||
    file === "installer/src/write-adapter-contract.ts" ||
    file === "installer/src/write-dry-run-envelope.ts" ||
    file === "installer/src/release-readiness.ts" ||
    file === "installer/src/v0-release-candidate.ts" ||
    file === "installer/src/public-v0-release-notes.ts" ||
    file === "installer/src/release-artifact-plan.ts"
  ) {
    for (const marker of ["crypto", "privateKey", "publicKey"]) {
      if (contents.includes(marker)) {
        err(`${file} contains forbidden crypto/key material "${marker}"`);
      }
    }
  }
  // The release readiness summary, v0 release candidate checklist, and public
  // v0 release notes draft aggregate/describe readiness only; none may create
  // release outputs or publish anything. Their public-safe hygiene identifiers
  // and draft phrases legitimately contain "artifact"/"publish", so those exact
  // strings are stripped before the term scan; any other occurrence still fails.
  if (
    file === "installer/src/release-readiness.ts" ||
    file === "installer/src/v0-release-candidate.ts" ||
    file === "installer/src/public-v0-release-notes.ts"
  ) {
    const hygieneAllowed = [
      "no-release-artifacts",
      "noReleaseArtifacts",
      "v0_rc_release_artifacts_present",
      "No release artifacts are committed",
      // Public-safe v0 release notes draft phrases that name what is NOT done.
      "Release artifact creation",
      "No release artifact creation in this draft",
      "Signed public release artifacts",
      "Prepare guarded release artifact planning",
    ];
    let termScanContents = stripPublishAllowedIdentifiers(contents);
    for (const identifier of hygieneAllowed) {
      termScanContents = termScanContents.split(identifier).join("");
    }
    for (const marker of ["artifact", "publish", "createWriteStream", "archiver"]) {
      if (termScanContents.includes(marker)) {
        err(`${file} contains forbidden artifact-creation/publish term "${marker}"`);
      }
    }
  }
  // The guarded release artifact plan intentionally plans release artifacts, so
  // the words release/artifact/archive are allowed; actual creation and publish
  // automation terms are not.
  if (file === "installer/src/release-artifact-plan.ts") {
    for (const marker of ["publish", "createWriteStream", "archiver"]) {
      if (contents.includes(marker)) {
        err(`${file} contains forbidden artifact-creation/publish term "${marker}"`);
      }
    }
  }
  for (const marker of INSTALLER_NONDETERMINISM) {
    if (contents.includes(marker)) {
      err(`${file} contains forbidden pattern "${marker}"`);
    }
  }
  for (const marker of SIGNING_MATERIAL) {
    if (contents.includes(marker)) {
      err(`${file} contains forbidden signing/key material pattern "${marker}"`);
    }
  }
  const remoteScanContents = stripPublishAllowedIdentifiers(contents);
  for (const marker of REMOTE_MARKERS) {
    if (remoteScanContents.includes(marker)) {
      err(`${file} contains forbidden remote/distribution pattern "${marker}"`);
    }
  }
  // CLI source must never trigger real install execution; it previews only.
  if (file.startsWith("cli/src/")) {
    for (const marker of ["executeInstall", "executeRollback"]) {
      if (contents.includes(marker)) {
        err(`${file} contains forbidden install-execution call "${marker}"`);
      }
    }
  }
}

// 5. contracts/generated/** must be generator output: header present, no
// timestamps, no machine-local absolute paths.
const GENERATED_HEADER = "// This file is generated by tools/gen-contracts.mjs.\n// Do not edit by hand.\n";
const TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ABSOLUTE_PATH_RE = /\/Users\/|\/home\/|[A-Z]:\\/;
const generatedTracked = trackedFiles.filter((f) => f.startsWith("contracts/generated/"));
if (generatedTracked.length === 0) {
  err("no generated contract files are tracked under contracts/generated/");
}
for (const file of generatedTracked) {
  const contents = readFileSync(file, "utf8");
  if (!contents.startsWith(GENERATED_HEADER)) {
    err(`${file} does not start with the generated-file header`);
  }
  if (TIMESTAMP_RE.test(contents)) {
    err(`${file} contains timestamp-like content`);
  }
  if (ABSOLUTE_PATH_RE.test(contents)) {
    err(`${file} contains a machine-local absolute path`);
  }
}

if (fail) {
  console.error("validate-boundaries: FAILED");
  process.exit(1);
}
console.log("validate-boundaries: OK");
