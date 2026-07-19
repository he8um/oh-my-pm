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
      "cli/src/provider-config.ts",
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
      file.startsWith("mcp-server/src/") && !file.endsWith(".test.ts") &&
      (spec.startsWith("node:") ||
        ["fs", "path", "os", "http", "https", "net", "tls", "dgram", "crypto", "zlib", "stream", "child_process"].includes(spec))
    ) {
      err(`${file} must not import a Node built-in module: "${spec}"`);
    }
    // The MCP SDK stdio transport may be imported only by the server module.
    if (
      file.startsWith("mcp-server/src/") && !file.endsWith(".test.ts") &&
      file !== "mcp-server/src/server.ts" &&
      spec.includes("@modelcontextprotocol/sdk")
    ) {
      err(`${file} imports the MCP SDK outside mcp-server/src/server.ts: "${spec}"`);
    }
    // Only the official stdio SDK transport is allowed; no HTTP/SSE variants.
    if (
      file.startsWith("mcp-server/src/") && !file.endsWith(".test.ts") &&
      /@modelcontextprotocol\/sdk\/(server|client)\/(streamableHttp|sse)/.test(spec)
    ) {
      err(`${file} imports a non-stdio MCP transport: "${spec}"`);
    }
    // No HTTP server frameworks or dotenv anywhere in the MCP package.
    if (
      file.startsWith("mcp-server/src/") && !file.endsWith(".test.ts") &&
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
  "cli/src/provider-config.ts",
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
  (f) => f.startsWith("mcp-server/src/") && f.endsWith(".ts") && !f.endsWith(".test.ts"),
);
// The GitHub MCP tool runner is the approved GitHub MCP boundary: it may read
// the OH_MY_PM_GITHUB_TOKEN at the tool-call boundary and construct the GitHub
// transport. It still must not itself fetch, log, or write; those markers are
// enforced below with the token-env allowance carved out.
const MCP_GITHUB_BOUNDARY = "mcp-server/src/github-tool-runner.ts";
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

// 4i. Portable release-bundle installer surfaces. Only the shared install core
// (distribution/libexec/release-install-core.mjs) may perform release-install
// filesystem writes; the bundled entrypoint and the repository wrapper are thin
// process adapters that must not write. No installer surface may reach the
// network, run a package manager, publish, tag, edit shell profiles, edit MCP
// client configs, or read an environment-derived prefix/approval. The installed
// verifier and e2e test may spawn the installed commands; other surfaces may
// spawn only local verification processes as documented below.
const RELEASE_INSTALL_CORE = "distribution/libexec/release-install-core.mjs";
const RELEASE_INSTALL_WRITER_FILES = new Set([RELEASE_INSTALL_CORE]);
const RELEASE_INSTALL_SURFACES = [
  "distribution/bin/oh-my-pm-install.mjs",
  "distribution/libexec/release-install-core.mjs",
  "tools/install-release-bundle.mjs",
  "tools/check-release-install.mjs",
];
const RELEASE_INSTALL_WRITE_APIS = [
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
  "cpSync",
  "copyFile",
];
// No network, package-manager, publish, tag, profile, or client-config markers
// in any installer surface. "download"/"upload" included so no transfer verb
// appears. Environment-derived prefix/approval is forbidden via process.env.
const RELEASE_INSTALL_FORBIDDEN = [
  "process.env",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "node:http",
  "node:https",
  "node:net",
  "node:tls",
  "node:dgram",
  "http://",
  "https://",
  "curl ",
  "wget ",
  "npm install",
  "pnpm install",
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
for (const file of RELEASE_INSTALL_SURFACES) {
  if (!trackedFiles.includes(file)) {
    err(`release install surface is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  // Writes only in the shared install core.
  if (!RELEASE_INSTALL_WRITER_FILES.has(file)) {
    for (const api of RELEASE_INSTALL_WRITE_APIS) {
      if (contents.includes(api)) {
        err(`${file} contains a filesystem write API outside the install core: "${api}"`);
      }
    }
  }
  for (const marker of RELEASE_INSTALL_FORBIDDEN) {
    if (contents.includes(marker)) {
      err(`${file} contains a forbidden installer marker: "${marker}"`);
    }
  }
}
// The bundled entrypoint and the repository wrapper must not spawn child
// processes; only the install core (staged verification) and the installed
// verifier (installed commands) may. This keeps the thin adapters thin.
const RELEASE_INSTALL_NO_CHILD_PROC = [
  "distribution/bin/oh-my-pm-install.mjs",
  "tools/install-release-bundle.mjs",
];
for (const file of RELEASE_INSTALL_NO_CHILD_PROC) {
  if (!trackedFiles.includes(file)) continue;
  const contents = readFileSync(file, "utf8");
  for (const api of ["child_process", "execSync", "execFileSync", "spawn", "spawnSync", "fork("]) {
    if (contents.includes(api)) {
      err(`${file} uses a child-process API outside the core/verifier: "${api}"`);
    }
  }
}
// The bundled installer entrypoint must embed no machine-local absolute path.
const INSTALL_ENTRYPOINT = "distribution/bin/oh-my-pm-install.mjs";
if (trackedFiles.includes(INSTALL_ENTRYPOINT)) {
  const contents = readFileSync(INSTALL_ENTRYPOINT, "utf8");
  if (/\/Users\/|\/home\/|[A-Z]:\\/.test(contents)) {
    err(`${INSTALL_ENTRYPOINT} embeds a machine-local absolute path`);
  }
}

// 4i-bis. Platform-aware release-install verification invariants. The installer
// deliberately skips POSIX executable-mode bits on Windows, so the exact-state
// and post-install checks must be platform-aware there — but the POSIX
// executable check must never be removed globally, the exact four-shim content
// check must stay mandatory on every platform, and platform detection must use
// the exact literal comparison to "win32" (never inferred from prefix syntax or
// environment). These assertions fail closed if the fix is regressed.
if (trackedFiles.includes(RELEASE_INSTALL_CORE)) {
  const core = readFileSync(RELEASE_INSTALL_CORE, "utf8");
  const requireInCore = [
    // The single platform-mode policy helper and the separated post-install
    // evaluator must both exist and be exported.
    ["export function requiresPosixShimExecutableMode", "the platform executable-mode policy helper"],
    ["export function evaluatePostInstallState", "the separated post-install state evaluator"],
    // Platform detection is the exact literal comparison, not inference.
    ['platform !== "win32"', 'the exact `platform !== "win32"` mode policy'],
    // The POSIX executable check must still exist (not globally removed).
    ["isExecutable", "the POSIX executable-mode check"],
    // The exact four-shim content check must stay mandatory (not gated on OS).
    ["shimsContentMatch", "the mandatory exact shim-content check"],
    // Content and mode are distinct reasons so the blocked/post path is precise.
    ["shim_content_mismatch", "the distinct shim content-mismatch reason"],
    ["posix_shim_not_executable", "the distinct POSIX executable-mode reason"],
  ];
  for (const [needle, label] of requireInCore) {
    if (!core.includes(needle)) {
      err(`${RELEASE_INSTALL_CORE} is missing ${label} ("${needle}")`);
    }
  }
  // The POSIX executable-mode requirement must be gated only through the
  // platform policy helper — never behind a bare process.platform OS check that
  // would silently disable the check on every non-Windows deployment too.
  if (/isExecutable[\s\S]{0,40}process\.platform\s*===\s*["']win32["']/.test(core)) {
    err(`${RELEASE_INSTALL_CORE} gates the executable check on a raw OS test; use requiresPosixShimExecutableMode`);
  }
}

// The standalone installed-state verifier launches the installed CLI and MCP
// server. On Windows the shims are .cmd files that Node cannot spawn without a
// shell (CVE-2024-27980); rather than introduce a shell, the verifier launches
// the installed .mjs entrypoints directly with the Node executable via
// createInstalledCommandInvocation. No shell, no constructed command string.
const RELEASE_INSTALL_VERIFIER = "tools/check-release-install.mjs";
if (trackedFiles.includes(RELEASE_INSTALL_VERIFIER)) {
  const verifier = readFileSync(RELEASE_INSTALL_VERIFIER, "utf8");
  // The launch-policy helper must exist and drive both CLI and MCP launches.
  if (!verifier.includes("export function createInstalledCommandInvocation")) {
    err(`${RELEASE_INSTALL_VERIFIER} must define createInstalledCommandInvocation for platform-safe launching`);
  }
  // No shell-based execution anywhere in the verifier.
  if (/\bshell:\s*(true|isWindows)\b/.test(verifier)) {
    err(`${RELEASE_INSTALL_VERIFIER} must not spawn with a shell; launch the installed .mjs via process.execPath on Windows`);
  }
  for (const marker of ["cmd.exe", "/c ", "powershell", "child_process.exec("]) {
    if (verifier.includes(marker)) {
      err(`${RELEASE_INSTALL_VERIFIER} constructs a shell invocation ("${marker}"); use an argument vector`);
    }
  }
  // The installed .mjs entrypoints (not node_modules/.bin, not source repo)
  // must be the Windows launch target.
  if (!verifier.includes('join(versionDir, "bin", "oh-my-pm.mjs")')) {
    err(`${RELEASE_INSTALL_VERIFIER} must launch the installed CLI .mjs entrypoint from the version directory`);
  }
  if (verifier.includes("node_modules/.bin")) {
    err(`${RELEASE_INSTALL_VERIFIER} must not execute node_modules/.bin`);
  }
}

// 4j. GitHub read-only provider network scoping. Only the GitHub transport and
// its constants (plus the manual live-smoke tool) may reference fetch,
// AbortController, the api.github.com host, or GitHub API headers. Every other
// GitHub production surface stays free of direct network access. Across all
// GitHub production code, non-GET verbs, GraphQL, mutations, package-manager
// networking, and token-CLI-argument patterns are forbidden. The token env var
// may appear only in the narrowly approved process-adapter boundary files.
const GITHUB_NETWORK_BOUNDARY = new Set([
  "providers/src/github/transport.ts",
  "providers/src/github/constants.ts",
  "tools/check-github-provider-live.mjs",
]);
// Files allowed to reference the token environment variable at the process
// boundary (CLI adapter, CLI token helper, MCP runner, manual smoke).
const GITHUB_TOKEN_ENV_ALLOWED = new Set([
  "cli/src/local-process.ts",
  "cli/src/github-token.ts",
  "mcp-server/src/github-tool-runner.ts",
  "tools/check-github-provider-live.mjs",
  "tools/validate-boundaries.mjs",
  // These carry the env var NAME in deterministic release metadata (tokenEnv)
  // or validate it there; they never read the environment.
  "distribution/libexec/release-install-core.mjs",
  "tools/check-release-bundle.mjs",
  "tools/release-bundle-utils.mjs",
  "tools/check-release-install.mjs",
  // The MCP client-config generator names the optional env var in docs prose
  // only; it never reads it and never writes it into the emitted config.
  "tools/print-mcp-client-config.mjs",
]);
// The provider-config path env var may appear only in the read-only loader, the
// process adapters that resolve it, release metadata, the client-config docs
// prose, and this validator. It is never read for local-only commands.
const PROVIDER_CONFIG_ENV_NAME = "OH_MY_PM_PROVIDER_CONFIG";
const PROVIDER_CONFIG_ENV_ALLOWED = new Set([
  "cli/src/provider-config.ts",
  // Barrel re-export of the loader's public constant.
  "cli/src/index.ts",
  "tools/validate-boundaries.mjs",
  "tools/release-bundle-utils.mjs",
  "tools/check-release-bundle.mjs",
  "tools/print-mcp-client-config.mjs",
]);
// Every tracked GitHub production source (provider modules, the CLI adapter and
// helpers, the MCP runner, and the manual smoke tool), excluding tests/docs.
const GITHUB_PRODUCTION_FILES = trackedFiles.filter((f) => {
  if (f.endsWith(".test.ts") || f.endsWith(".test.mjs")) return false;
  if (f.startsWith("providers/src/github/")) return true;
  return (
    f === "cli/src/github-token.ts" ||
    f === "mcp-server/src/github-tool-runner.ts" ||
    f === "tools/check-github-provider-live.mjs"
  );
});
// Non-GET / mutation / GraphQL / workaround markers forbidden everywhere in
// GitHub production code. "method: \"POST\"" and friends never appear; the
// transport is GET-only.
const GITHUB_FORBIDDEN_EVERYWHERE = [
  '"POST"',
  '"PUT"',
  '"PATCH"',
  '"DELETE"',
  "graphql",
  "GraphQL",
  "createIssue",
  "updateIssue",
  "createComment",
  "mergePull",
  "workflow_dispatch",
  "gh api",
  "curl ",
  "wget ",
  "child_process",
  "execSync",
  "spawnSync",
  "--token",
  "persistToken",
];
for (const file of GITHUB_PRODUCTION_FILES) {
  const contents = readFileSync(file, "utf8");
  // Direct network access only inside the approved boundary files.
  if (!GITHUB_NETWORK_BOUNDARY.has(file)) {
    for (const marker of ["fetch(", "AbortController", "api.github.com"]) {
      if (contents.includes(marker)) {
        err(`${file} references a network marker outside the GitHub transport boundary: "${marker}"`);
      }
    }
  }
  // Mutation / GraphQL / workaround markers forbidden everywhere.
  for (const marker of GITHUB_FORBIDDEN_EVERYWHERE) {
    if (contents.includes(marker)) {
      err(`${file} contains a forbidden GitHub write/mutation/workaround marker: "${marker}"`);
    }
  }
  // The provider core proper must not read environment variables at all.
  if (file.startsWith("providers/src/github/") && contents.includes("process.env")) {
    err(`${file} reads process.env; the GitHub provider core must stay environment-free`);
  }
}
// The GitHub token environment variable name may appear only in approved files.
const GITHUB_TOKEN_ENV_NAME = "OH_MY_PM_GITHUB_TOKEN";
for (const file of trackedFiles) {
  if (GITHUB_TOKEN_ENV_ALLOWED.has(file)) continue;
  if (!/\.(mjs|ts|js)$/.test(file)) continue;
  if (file.endsWith(".test.ts") || file.endsWith(".test.mjs")) continue;
  if (file.startsWith("contracts/generated/")) continue;
  const contents = readFileSync(file, "utf8");
  if (contents.includes(GITHUB_TOKEN_ENV_NAME)) {
    err(`${file} references the GitHub token env var outside an approved boundary file`);
  }
}
// The provider-config path env var name may appear only in approved files.
for (const file of trackedFiles) {
  if (PROVIDER_CONFIG_ENV_ALLOWED.has(file)) continue;
  if (!/\.(mjs|ts|js)$/.test(file)) continue;
  if (file.endsWith(".test.ts") || file.endsWith(".test.mjs")) continue;
  if (file.startsWith("contracts/generated/")) continue;
  const contents = readFileSync(file, "utf8");
  if (contents.includes(PROVIDER_CONFIG_ENV_NAME)) {
    err(`${file} references the provider-config env var outside an approved boundary file`);
  }
}

// 4l. Provider configuration is strictly read-only. The pure schema/settings
// modules must reach no Node built-in (covered by the pure-package rule above)
// and must carry no secret-bearing field name; the CLI provider-config loader
// is the ONLY approved provider-config filesystem reader and must never write;
// and no config-initialization command may exist.
const PROVIDER_CONFIG_LOADER = "cli/src/provider-config.ts";
const PROVIDER_CONFIG_WRITE_APIS = [
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
if (trackedFiles.includes(PROVIDER_CONFIG_LOADER)) {
  const contents = readFileSync(PROVIDER_CONFIG_LOADER, "utf8");
  for (const api of [...PROVIDER_CONFIG_WRITE_APIS, "fetch(", "child_process", "execSync"]) {
    if (contents.includes(api)) {
      err(`${PROVIDER_CONFIG_LOADER} contains a forbidden write/network/exec API "${api}"`);
    }
  }
}
// The pure provider schema and settings modules carry no secret-bearing field
// name (the SECRET markers themselves are the detection list, so this scans for
// declared object keys, not the detector). No other provider source may read a
// provider-config file from disk.
const PROVIDER_PURE_CONFIG = [
  "providers/src/config.ts",
  "providers/src/settings.ts",
  // The source-selection model is pure: it validates selections and builds
  // provider requests with no I/O, environment, clock, or arbitrary URL.
  "providers/src/github/selection.ts",
];
for (const file of PROVIDER_PURE_CONFIG) {
  if (!trackedFiles.includes(file)) {
    err(`pure provider config/settings file is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  for (const marker of [
    "readFileSync",
    "writeFile",
    "node:fs",
    'from "fs"',
    "fetch(",
    "process.env",
    "Date.now",
    "new Date",
    "Math.random",
    "api.github.com",
  ]) {
    if (contents.includes(marker)) {
      err(`${file} must stay pure; it contains "${marker}"`);
    }
  }
}
// No config-initialization / config-writing command may be introduced. This
// validator itself names the forbidden markers as its detection list, so it is
// excluded from the scan.
const CONFIG_INIT_MARKERS = ['"config init"', '"config set"', "writeProviderConfig", "initProviderConfig"];
for (const file of trackedFiles) {
  if (!/\.(mjs|ts)$/.test(file)) continue;
  if (file.endsWith(".test.ts") || file.endsWith(".test.mjs")) continue;
  if (file === "tools/validate-boundaries.mjs") continue;
  const contents = readFileSync(file, "utf8");
  for (const marker of CONFIG_INIT_MARKERS) {
    if (contents.includes(marker)) {
      err(`${file} introduces a forbidden provider-config write/init command "${marker}"`);
    }
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

// 4h. Reusable version/bundle/archive checkers must be self-describing: they
// derive the current version from version.json, a bundle's RELEASE.json, or
// asset filenames, and must never hard-code a specific release version. Exact
// "0.1.0" gates belong only in the release-specific v0.1 workflow; historical
// release docs and CHANGELOG history may mention it.
const REUSABLE_VERSION_CHECKERS = [
  "tools/check-version-consistency.mjs",
  "tools/release-bundle-utils.mjs",
  "tools/build-release-bundle.mjs",
  "tools/check-release-bundle.mjs",
  "tools/release-archive-utils.mjs",
  "tools/build-release-archives.mjs",
  "tools/check-release-archives.mjs",
  "tools/check-release-archive-reproducibility.mjs",
];
for (const file of REUSABLE_VERSION_CHECKERS) {
  if (!trackedFiles.includes(file)) {
    err(`reusable version checker is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  if (/\b0\.1\.0\b/.test(contents)) {
    err(`${file} hard-codes the release version 0.1.0; derive it from version.json/RELEASE.json/filenames instead`);
  }
}

// 4k. Deterministic project-signal extraction. The Skill signal modules must be
// pure and rule-based: no LLM/model/embedding/fuzzy scoring, no network, no
// environment, no real clock or randomness, and no raw provider-response
// passthrough. The Runtime item mapper may reference only the approved
// provenance fields. No Skill source may carry a token-related field name.
const SIGNAL_SKILL_FILES = [
  "skills/src/project-signals.ts",
  "skills/src/markdown-project.ts",
  "skills/src/extract-risks.ts",
  "skills/src/derive-next-tasks.ts",
];
const SIGNAL_FORBIDDEN = [
  // No model / semantic inference.
  "OpenAI",
  "Anthropic",
  "openai",
  "anthropic",
  "embedding",
  "cosineSimilarity",
  "levenshtein",
  "fuzzy",
  "tokenizer",
  "model.",
  // No I/O or nondeterminism (the purity test also covers these; this is a
  // second, path-scoped guard).
  "fetch(",
  "XMLHttpRequest",
  "api.github.com",
  "process.env",
  "Date.now",
  "new Date",
  "Math.random",
  "child_process",
  // No raw provider-response passthrough or transport/token leakage.
  "providerResponses",
  "runtimeResponse",
  "Authorization",
  "Bearer ",
  "OH_MY_PM_GITHUB_TOKEN",
];
for (const file of SIGNAL_SKILL_FILES) {
  if (!trackedFiles.includes(file)) {
    err(`deterministic-extraction skill file is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  for (const marker of SIGNAL_FORBIDDEN) {
    if (contents.includes(marker)) {
      err(`${file} contains a forbidden extraction marker: "${marker}"`);
    }
  }
}

// The Runtime item mapper preserves only the approved provenance fields. It may
// name these (and no other provider-data field) when building a text item.
const RUNTIME_MAPPER = "runtime/src/plan-utils.ts";
if (trackedFiles.includes(RUNTIME_MAPPER)) {
  const contents = readFileSync(RUNTIME_MAPPER, "utf8");
  // Must not pass a raw data object straight through, and must not read env.
  for (const marker of ["process.env", "fetch(", "Bearer ", "Authorization"]) {
    if (contents.includes(marker)) {
      err(`${RUNTIME_MAPPER} contains a forbidden mapper marker: "${marker}"`);
    }
  }
}

// No Skill source (production) may reference a GitHub token env var.
for (const file of trackedFiles) {
  if (!file.startsWith("skills/src/") || !file.endsWith(".ts")) continue;
  const contents = readFileSync(file, "utf8");
  if (contents.includes("OH_MY_PM_GITHUB_TOKEN")) {
    err(`${file} references the GitHub token env var; the Skill layer is token-free`);
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

// 6. Destructive temporary-workspace cleanup safety. No tracked text file may
// teach or perform recursive deletion of an inferred parent directory, the
// shared temp root, the CI runner temp root, the current working directory, or
// the filesystem root. Test/tool temp cleanup deletes exact owned roots only
// (directly, or through the safe-temp-workspace helper). The safe helper itself
// and its regression test legitimately name these patterns to reject them.
const CLEANUP_SAFETY_ALLOWED = new Set([
  "tools/test/safe-temp-workspace.mjs",
  "tools/test/safe-temp-workspace.test.mjs",
  "tools/validate-boundaries.mjs",
]);
// Shell and JS idioms that delete an inferred parent or a shared root.
const UNSAFE_CLEANUP_PATTERNS = [
  'rm -rf "$(dirname',
  "rm -rf $(dirname",
  'rm -rf "$TMPDIR"',
  'rm -rf "${TMPDIR',
  "rm -rf /tmp",
  'rm -rf "$RUNNER_TEMP"',
  'rm -rf "$(pwd)"',
  "Remove-Item $env:RUNNER_TEMP -Recurse",
  "Remove-Item (Split-Path",
  // JS: deleting the parent of a generated path is forbidden; delete the exact
  // owned root instead (captured directly or via the safe helper).
  "rmSync(dirname(",
  "rmSync(join(tmpdir()),",
];
for (const file of trackedFiles) {
  if (CLEANUP_SAFETY_ALLOWED.has(file)) continue;
  if (!/\.(mjs|ts|js|md|sh|yml|yaml|ps1)$/.test(file)) continue;
  if (file.startsWith("contracts/generated/")) continue;
  const contents = readFileSync(file, "utf8");
  for (const pattern of UNSAFE_CLEANUP_PATTERNS) {
    if (contents.includes(pattern)) {
      err(`${file} contains an unsafe temporary-cleanup pattern: "${pattern}"`);
    }
  }
}

// 7. Kernel WASM binding packaging safety. The generated binding is build
// output and must never be committed. The release builder stages only the three
// approved generated assets (never a recursive copy of the whole Kernel source
// package) and must not introduce a network/download/postinstall fallback.
for (const file of trackedFiles) {
  if (file.startsWith("kernel/binding/generated-node/")) {
    err(`generated Kernel binding must not be committed: ${file}`);
  }
}
const KERNEL_PACKAGING_FILE = "tools/release-bundle-utils.mjs";
if (trackedFiles.includes(KERNEL_PACKAGING_FILE)) {
  const contents = readFileSync(KERNEL_PACKAGING_FILE, "utf8");
  // No recursive copy of the whole deployed/source Kernel package.
  if (/cpSync\([^)]*kernel[^)]*\{[^}]*recursive:\s*true/s.test(contents)) {
    err(`${KERNEL_PACKAGING_FILE} must not recursively copy the whole Kernel package`);
  }
  // No network/download/postinstall fallback for the binding.
  for (const marker of ["postinstall", "download", "https://", "http://", "fetch("]) {
    if (contents.includes(marker)) {
      err(`${KERNEL_PACKAGING_FILE} contains a forbidden network/postinstall marker: "${marker}"`);
    }
  }
}
// No workspace package may add a postinstall lifecycle script that builds or
// downloads the WASM binding for end users.
for (const file of trackedFiles) {
  if (!/(^|\/)package\.json$/.test(file)) continue;
  if (file.startsWith("node_modules/")) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  const scripts = pkg && typeof pkg === "object" ? pkg.scripts : undefined;
  if (scripts && typeof scripts === "object" && typeof scripts.postinstall === "string") {
    err(`${file} must not declare a postinstall script`);
  }
}

if (fail) {
  console.error("validate-boundaries: FAILED");
  process.exit(1);
}
console.log("validate-boundaries: OK");
