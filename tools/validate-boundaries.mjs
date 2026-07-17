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
const PACKAGE_SRC = /^(contracts|kernel\/binding|runtime|planner|providers|skills|cli|installer|examples|mcp-server)\/src\/.*\.ts$/;
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
        file === "installer/src/release-artifact-plan.ts" ||
        file === "installer/src/local-artifact-assembly-envelope.ts" ||
        file === "installer/src/artifact-creation-permission.ts" ||
        file === "installer/src/local-artifact-creation-plan.ts" ||
        file === "installer/src/local-artifact-adapter-contract.ts" ||
        file === "installer/src/local-artifact-confirmation.ts") &&
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
    // Runtime, Planner, Skills, contracts, and providers are pure packages:
    // no Node built-in may be imported there. Only the explicit Node CLI
    // boundary and the kernel binding loader touch the platform.
    if (
      /^(contracts|runtime|planner|providers|skills)\/src\/.*\.ts$/.test(file) &&
      (spec.startsWith("node:") ||
        ["fs", "path", "os", "http", "https", "net", "tls", "dgram", "crypto", "zlib", "stream", "child_process"].includes(spec))
    ) {
      err(`${file} imports a Node built-in module: "${spec}"`);
    }
    // cli/src/node-project-documents.ts and cli/src/project-config.ts are the
    // explicit read-only Node CLI boundaries; they alone may import node:fs and
    // node:path, and 4c below keeps them free of write, network, child-process,
    // and telemetry APIs. The pure rules module below must import no Node module.
    const CLI_NODE_BOUNDARY_SRC = new Set([
      "cli/src/node-project-documents.ts",
      "cli/src/project-config.ts",
    ]);
    if (
      file.startsWith("cli/src/") &&
      !CLI_NODE_BOUNDARY_SRC.has(file) &&
      (spec === "fs" || spec.startsWith("node:fs"))
    ) {
      err(`${file} imports a Node filesystem module: "${spec}"`);
    }
    if (
      CLI_NODE_BOUNDARY_SRC.has(file) &&
      spec !== "node:fs" &&
      spec !== "node:path" &&
      (spec.startsWith("node:") || ["fs", "path", "os", "http", "https", "net", "tls", "dgram", "child_process"].includes(spec))
    ) {
      err(`${file} imports a Node module outside the read-only boundary allowlist: "${spec}"`);
    }
    // cli/src/project-document-rules.ts is a pure module: no Node built-in.
    if (
      file === "cli/src/project-document-rules.ts" &&
      (spec.startsWith("node:") ||
        ["fs", "path", "os", "http", "https", "net", "tls", "dgram", "crypto", "zlib", "stream", "child_process"].includes(spec))
    ) {
      err(`${file} must not import a Node built-in module: "${spec}"`);
    }
    // MCP server package: no filesystem/network/child-process Node built-ins in
    // package source; document reads flow only through the CLI public loader.
    if (
      file.startsWith("mcp-server/src/") &&
      (spec.startsWith("node:") ||
        ["fs", "path", "os", "http", "https", "net", "tls", "dgram", "crypto", "zlib", "stream", "child_process"].includes(spec))
    ) {
      err(`${file} must not import a Node built-in module: "${spec}"`);
    }
    // The MCP SDK stdio transport may be imported only by the server module.
    if (
      file.startsWith("mcp-server/src/") &&
      file !== "mcp-server/src/server.ts" &&
      spec.includes("@modelcontextprotocol/sdk")
    ) {
      err(`${file} imports the MCP SDK outside mcp-server/src/server.ts: "${spec}"`);
    }
    // Only the official stdio SDK transport is allowed; no HTTP/SSE variants.
    if (
      file.startsWith("mcp-server/src/") &&
      /@modelcontextprotocol\/sdk\/(server|client)\/(streamableHttp|sse)/.test(spec)
    ) {
      err(`${file} imports a non-stdio MCP transport: "${spec}"`);
    }
    // No HTTP server frameworks or dotenv anywhere in the MCP package.
    if (
      file.startsWith("mcp-server/src/") &&
      ["express", "hono", "fastify", "dotenv", "ws", "undici"].includes(spec)
    ) {
      err(`${file} imports a forbidden server/network/env module: "${spec}"`);
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
    file === "installer/src/release-artifact-plan.ts" ||
    file === "installer/src/local-artifact-assembly-envelope.ts" ||
    file === "installer/src/artifact-creation-permission.ts" ||
    file === "installer/src/local-artifact-creation-plan.ts" ||
    file === "installer/src/local-artifact-adapter-contract.ts" ||
    file === "installer/src/local-artifact-confirmation.ts"
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
    file === "installer/src/release-artifact-plan.ts" ||
    file === "installer/src/local-artifact-assembly-envelope.ts" ||
    file === "installer/src/artifact-creation-permission.ts" ||
    file === "installer/src/local-artifact-creation-plan.ts" ||
    file === "installer/src/local-artifact-adapter-contract.ts" ||
    file === "installer/src/local-artifact-confirmation.ts"
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
    file === "installer/src/release-artifact-plan.ts" ||
    file === "installer/src/local-artifact-assembly-envelope.ts" ||
    file === "installer/src/artifact-creation-permission.ts" ||
    file === "installer/src/local-artifact-creation-plan.ts" ||
    file === "installer/src/local-artifact-adapter-contract.ts" ||
    file === "installer/src/local-artifact-confirmation.ts"
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
    file === "installer/src/release-artifact-plan.ts" ||
    file === "installer/src/local-artifact-assembly-envelope.ts" ||
    file === "installer/src/artifact-creation-permission.ts" ||
    file === "installer/src/local-artifact-creation-plan.ts" ||
    file === "installer/src/local-artifact-adapter-contract.ts" ||
    file === "installer/src/local-artifact-confirmation.ts"
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
    file === "installer/src/release-artifact-plan.ts" ||
    file === "installer/src/local-artifact-assembly-envelope.ts" ||
    file === "installer/src/artifact-creation-permission.ts" ||
    file === "installer/src/local-artifact-creation-plan.ts" ||
    file === "installer/src/local-artifact-adapter-contract.ts" ||
    file === "installer/src/local-artifact-confirmation.ts"
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
  // The guarded release artifact plan, local artifact assembly envelope,
  // artifact creation permission model, local artifact creation execution
  // plan, local artifact creation adapter contract, and local artifact
  // creation confirmation checklist intentionally model
  // release/artifact/creation/permission/assembly/execution-plan/adapter-
  // contract/confirmation-checklist readiness, so those words are allowed;
  // actual creation and publish automation terms are not.
  if (
    file === "installer/src/release-artifact-plan.ts" ||
    file === "installer/src/local-artifact-assembly-envelope.ts" ||
    file === "installer/src/artifact-creation-permission.ts" ||
    file === "installer/src/local-artifact-creation-plan.ts" ||
    file === "installer/src/local-artifact-adapter-contract.ts" ||
    file === "installer/src/local-artifact-confirmation.ts"
  ) {
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

// 4c. The Markdown project document loader, the project configuration loader,
// and the CLI bin wrapper form the explicit Node read-only CLI boundary. They
// may read the user-selected root and write final CLI output to stdout/stderr,
// but they must never gain a filesystem write path, network access,
// child-process execution, or telemetry/logging of document content.
const NODE_CLI_BOUNDARY_FILES = [
  "cli/src/node-project-documents.ts",
  "cli/src/project-config.ts",
  "cli/bin/oh-my-pm.mjs",
];
const BOUNDARY_WRITE_APIS = [
  "writeFile",
  "appendFile",
  "createWriteStream",
  "mkdir",
  "rmSync",
  "rmdir",
  "unlink",
  "rename",
  "copyFile",
  "chmod",
  "chown",
];
const BOUNDARY_NETWORK_APIS = [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "node:http",
  "node:https",
  "node:net",
  "node:tls",
  "node:dgram",
];
const BOUNDARY_EXEC_APIS = ["child_process", "execSync", "spawn", "fork("];
const BOUNDARY_TELEMETRY_APIS = ["telemetry", "logger", "console.log", "console.error"];
for (const file of NODE_CLI_BOUNDARY_FILES) {
  if (!trackedFiles.includes(file)) {
    err(`node cli boundary file is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  for (const marker of [
    ...BOUNDARY_WRITE_APIS,
    ...BOUNDARY_NETWORK_APIS,
    ...BOUNDARY_EXEC_APIS,
    ...BOUNDARY_TELEMETRY_APIS,
  ]) {
    if (contents.includes(marker)) {
      err(`${file} contains forbidden read-only boundary API "${marker}"`);
    }
  }
}

// 4d. MCP server package: local, read-only, stdio-only. Package source must
// carry no filesystem-write, network, child-process, telemetry, or logging
// APIs; the bin wrapper may use only process.stderr/process.exitCode; and no
// ordinary stdout writing or startup banner is allowed (the SDK stdio
// transport internally owns protocol stdout).
const MCP_SOURCE_FILES = trackedFiles.filter(
  (f) => f.startsWith("mcp-server/src/") && f.endsWith(".ts"),
);
const MCP_FORBIDDEN = [
  "writeFile",
  "appendFile",
  "createWriteStream",
  "mkdir",
  "rmSync",
  "rmdir",
  "unlink",
  "rename",
  "copyFile",
  "chmod",
  "chown",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "child_process",
  "execSync",
  "spawn",
  "fork(",
  "process.env",
  "dotenv",
  "console.log",
  "console.error",
  "console.info",
  "console.warn",
  "console.debug",
  "logger",
  "telemetry",
  "upload",
  "download",
  "credentials",
  "http://",
  "https://",
  "process.stdout",
  "createServer",
  "listen(",
];
// Public MCP results must never carry these keys/fields.
const MCP_FORBIDDEN_RESULT_KEYS = [
  "runtimeResponse:",
  "providerResponses",
  '"trace"',
  "documentContent",
  "rawContent",
  "absolutePath",
  "resolvedRoot",
  "adapter:",
  "credentials",
  '"token"',
  '"secret"',
];
// Tool descriptions and server instructions state what the server does NOT do
// ("never upload project context", "never modifies files"); these exact
// public-safe phrases are stripped before the API-term scan. Any other
// occurrence of the term still fails.
const MCP_DESCRIPTION_ALLOWED = [
  "never upload project context",
  "never uploads project context",
  "never modifies files or uploads project context",
];
for (const file of MCP_SOURCE_FILES) {
  const raw = readFileSync(file, "utf8");
  let contents = raw;
  for (const phrase of MCP_DESCRIPTION_ALLOWED) {
    contents = contents.split(phrase).join("");
  }
  for (const marker of MCP_FORBIDDEN) {
    // types.ts and the runner legitimately name the internal runtimeResponse
    // field; the projection/leak guards below cover result safety instead.
    if (contents.includes(marker)) {
      err(`${file} contains forbidden MCP package API "${marker}"`);
    }
  }
  // The public projectors (server.ts) must not build results from these keys.
  if (file === "mcp-server/src/server.ts") {
    for (const key of MCP_FORBIDDEN_RESULT_KEYS) {
      if (contents.includes(key)) {
        err(`${file} references a forbidden public-result field "${key}"`);
      }
    }
  }
}
// The MCP bin wrapper: no stdout writing or startup banner; stderr/exitCode ok.
const MCP_BIN = "mcp-server/bin/oh-my-pm-mcp.mjs";
if (!trackedFiles.includes(MCP_BIN)) {
  err(`mcp bin wrapper is not tracked: ${MCP_BIN}`);
} else {
  const contents = readFileSync(MCP_BIN, "utf8");
  for (const marker of ["process.stdout", "console.log", "console.error", "process.env", "fetch(", "child_process"]) {
    if (contents.includes(marker)) {
      err(`${MCP_BIN} contains forbidden wrapper API "${marker}"`);
    }
  }
}

// 4e. Local installation and onboarding tooling. Only local-install-utils.mjs
// may write files (and only under <prefix>/bin); the installer/verifier/config
// tools must not read environment variables, reach the network, run package
// managers, edit shell profiles, or write MCP client config files. Only the
// verifier may spawn child processes (the explicitly installed commands).
const LOCAL_INSTALL_WRITER = "tools/local-install-utils.mjs";
const LOCAL_INSTALL_CHILD_PROC_ALLOWED = new Set(["tools/check-local-install.mjs"]);
const LOCAL_INSTALL_TOOLS = [
  "tools/local-install-utils.mjs",
  "tools/install-local.mjs",
  "tools/check-local-install.mjs",
  "tools/print-mcp-client-config.mjs",
];
const LOCAL_INSTALL_WRITE_APIS = [
  "writeFileSync",
  "writeFile(",
  "appendFile",
  "createWriteStream",
  "mkdirSync",
  "mkdir(",
  "renameSync",
  "rename(",
  "rmSync",
  "rm(",
  "unlink",
  "chmodSync",
  "chmod(",
];
// Shell-profile and MCP-client-config mutation must never appear.
const LOCAL_INSTALL_PROFILE_MARKERS = [
  ".bashrc",
  ".zshrc",
  ".profile",
  "config.fish",
  "Microsoft.PowerShell_profile",
  "claude_desktop_config",
  "mcp.json",
];
const LOCAL_INSTALL_NETWORK_ENV = [
  "process.env",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "node:http",
  "node:https",
  "node:net",
  "http://",
  "https://",
  "curl",
  "wget",
  "npm install",
  "pnpm install",
  "yarn ",
  "registry.npmjs",
  "upload",
  "download",
  "publish",
  "gh release",
  "refs/tags",
];
for (const file of LOCAL_INSTALL_TOOLS) {
  if (!trackedFiles.includes(file)) {
    err(`local install tool is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  // Filesystem writes only in the writer module.
  if (file !== LOCAL_INSTALL_WRITER) {
    for (const api of LOCAL_INSTALL_WRITE_APIS) {
      if (contents.includes(api)) {
        err(`${file} contains a filesystem write API outside the writer module: "${api}"`);
      }
    }
  }
  // child_process only in the verifier.
  if (!LOCAL_INSTALL_CHILD_PROC_ALLOWED.has(file)) {
    for (const api of ["child_process", "execSync", "execFileSync", "spawn", "spawnSync", "fork("]) {
      if (contents.includes(api)) {
        err(`${file} uses a child-process API outside the verifier: "${api}"`);
      }
    }
  }
  // No environment reads, network, package managers, or remote/publish verbs.
  for (const marker of LOCAL_INSTALL_NETWORK_ENV) {
    if (contents.includes(marker)) {
      err(`${file} contains a forbidden network/env/publish marker: "${marker}"`);
    }
  }
  // No shell-profile or MCP client config-file mutation.
  for (const marker of LOCAL_INSTALL_PROFILE_MARKERS) {
    if (contents.includes(marker)) {
      err(`${file} references a shell-profile or client-config file: "${marker}"`);
    }
  }
}

// 4f. Portable release tooling and the distribution package. Release tooling
// may use node:crypto (checksums), spawn pnpm deploy, and write inside the
// explicit output directory, but it must never publish, tag, upload, reach a
// registry/remote, edit shell profiles, or edit MCP client configs. The
// distribution bin entrypoints must be thin and embed no repo path.
const RELEASE_TOOLS = [
  "tools/release-bundle-utils.mjs",
  "tools/build-release-bundle.mjs",
  "tools/check-release-bundle.mjs",
  "tools/check-version-consistency.mjs",
  "tools/release-archive-utils.mjs",
  "tools/build-release-archives.mjs",
  "tools/check-release-archives.mjs",
  "tools/check-release-archive-reproducibility.mjs",
];
// "deploy" is allowed (pnpm deploy); publishing/tagging/remote verbs are not.
const RELEASE_FORBIDDEN = [
  "process.env",
  "npm publish",
  "pnpm publish",
  "registry.npmjs",
  "gh release",
  "gh api",
  "git tag",
  "git push",
  "refs/tags",
  "createRelease",
  "uploadReleaseAsset",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "node:http",
  "node:https",
  "http://",
  "https://",
  "curl ",
  "wget ",
  "upload",
  "download",
  ".bashrc",
  ".zshrc",
  ".profile",
  "config.fish",
  "Microsoft.PowerShell_profile",
  "claude_desktop_config",
  "mcp.json",
];
for (const file of RELEASE_TOOLS) {
  if (!trackedFiles.includes(file)) {
    err(`release tool is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  for (const marker of RELEASE_FORBIDDEN) {
    if (contents.includes(marker)) {
      err(`${file} contains a forbidden release/network/profile marker: "${marker}"`);
    }
  }
}

// The distribution bin entrypoints are thin adapters: no repo path, no build
// logic, no filesystem writes, no network.
const DISTRIBUTION_BINS = [
  "distribution/bin/oh-my-pm.mjs",
  "distribution/bin/oh-my-pm-mcp.mjs",
];
for (const file of DISTRIBUTION_BINS) {
  if (!trackedFiles.includes(file)) {
    err(`distribution bin is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  for (const marker of [
    "writeFileSync",
    "createWriteStream",
    "child_process",
    "fetch(",
    "process.env",
    "../dist",
    "../../",
    "node:fs",
  ]) {
    if (contents.includes(marker)) {
      err(`${file} contains a forbidden distribution-entrypoint marker: "${marker}"`);
    }
  }
  if (/\/Users\/|\/home\/|[A-Z]:\\/.test(contents)) {
    err(`${file} embeds a machine-local absolute path`);
  }
}
// The distribution package must be private with no publishConfig.
if (trackedFiles.includes("distribution/package.json")) {
  const distJson = JSON.parse(readFileSync("distribution/package.json", "utf8"));
  if (distJson.private !== true) err("distribution/package.json must set private: true");
  if (distJson.publishConfig !== undefined) {
    err("distribution/package.json must not set publishConfig");
  }
}

// 4g. The manually gated release workflow. It must be workflow_dispatch only,
// have top-level contents: read, gate publishing behind a publish boolean, an
// exact confirmation string, a contents: write publish job, and the protected
// github-release environment. GitHub-Release/tag-publish verbs may appear ONLY
// in this workflow (plus its docs/tests); package/tool source stays clean.
const RELEASE_WORKFLOW = ".github/workflows/release-v0.1.yml";
if (!trackedFiles.includes(RELEASE_WORKFLOW)) {
  err(`release workflow is not tracked: ${RELEASE_WORKFLOW}`);
} else {
  const wf = readFileSync(RELEASE_WORKFLOW, "utf8");
  // Trigger must be workflow_dispatch only.
  if (!/^on:\s*\n\s+workflow_dispatch:/m.test(wf)) {
    err(`${RELEASE_WORKFLOW} must trigger on workflow_dispatch only`);
  }
  for (const forbiddenTrigger of ["\n  push:", "\n  pull_request:", "\n  schedule:", "\n  release:"]) {
    if (wf.includes(forbiddenTrigger)) {
      err(`${RELEASE_WORKFLOW} must not use trigger "${forbiddenTrigger.trim()}"`);
    }
  }
  // Top-level read permission; publish job write permission and env gate.
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(wf)) {
    err(`${RELEASE_WORKFLOW} must declare top-level permissions: contents: read`);
  }
  if (!wf.includes("contents: write")) {
    err(`${RELEASE_WORKFLOW} publish job must declare contents: write`);
  }
  if (!/if:\s*\$\{\{\s*inputs\.publish\s*==\s*true\s*\}\}/.test(wf)) {
    err(`${RELEASE_WORKFLOW} publish job must be gated on inputs.publish == true`);
  }
  if (!/name:\s*github-release/.test(wf)) {
    err(`${RELEASE_WORKFLOW} publish job must use the github-release environment`);
  }
  if (!wf.includes("RELEASE v0.1.0")) {
    err(`${RELEASE_WORKFLOW} must enforce the exact confirmation string RELEASE v0.1.0`);
  }
}

// GitHub-Release / tag-publish verbs are confined to the release workflow, its
// documentation, and its dedicated test/tool scope. No package or general tool
// source may create tags or GitHub Releases.
const RELEASE_PUBLISH_MARKERS = ["gh release create", "softprops/action-gh-release"];
const RELEASE_PUBLISH_ALLOWED = new Set([
  RELEASE_WORKFLOW,
  "docs/releases/publishing-v0.1.0.md",
  "docs/releases/v0.1.0.md",
  "tools/validate-boundaries.mjs",
  "tools/validate-structure.mjs",
]);
for (const file of trackedFiles) {
  if (RELEASE_PUBLISH_ALLOWED.has(file)) continue;
  // Only scan text source we own (skip binaries/generated/lockfiles).
  if (!/\.(mjs|ts|js|json|md|yml|yaml|sh|rs)$/.test(file)) continue;
  if (file.startsWith("contracts/generated/")) continue;
  const contents = readFileSync(file, "utf8");
  for (const marker of RELEASE_PUBLISH_MARKERS) {
    if (contents.includes(marker)) {
      err(`${file} contains a GitHub-Release publish marker outside the release workflow: "${marker}"`);
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
