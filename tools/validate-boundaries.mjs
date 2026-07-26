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
  // Phase 6 installed qualification PLANTS the token env var as a privacy
  // sentinel to prove it is never persisted to the store, export, or output.
  "tools/check-v0.3-installed-project-brain.mjs",
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

// 4k1b. Single-source GitHub limit constants (F-DUP-1). The executable
// config/settings/selection/CLI layers must import the canonical list/comment/
// review bounds from their canonical modules (`github/constants.ts` for the list
// limit; `github/query.ts` for the comment/review limits) rather than
// re-declaring the numbers. This forbids a local `const NAME = <n>` declaration
// of a bound and the inline `value >= 1 && value <= 100` list-range literal in
// exactly those layers. Canonical modules, tests, MCP JSON schemas, and release/
// install verifiers are intentionally exempt (their literals are public-schema or
// repository-independent boundary-defense assertions, not domain constants).
const GITHUB_LIMIT_CONSUMER_LAYERS = [
  "providers/src/config.ts",
  "providers/src/settings.ts",
  "providers/src/github/selection.ts",
  "cli/src/parser.ts",
];
// Local re-declaration of a numeric bound: `const <NAME> = <int>;` (optionally
// exported). The canonical sources live elsewhere, so any such local literal in a
// consumer layer is a re-declaration.
const LOCAL_LIMIT_CONST = /(?:export\s+)?const\s+[A-Za-z_][A-Za-z0-9_]*(?:MIN|MAX|DEFAULT)[A-Za-z0-9_]*LIMIT[A-Za-z0-9_]*\s*=\s*\d+\s*;/;
// Inline list-range literal: `>= 1 && ... <= 100` (any spacing).
const INLINE_LIST_RANGE = />=\s*1\s*&&[^\n]*<=\s*100/;
for (const file of GITHUB_LIMIT_CONSUMER_LAYERS) {
  if (!trackedFiles.includes(file)) {
    err(`GitHub limit consumer layer is not tracked: ${file}`);
    continue;
  }
  const contents = readFileSync(file, "utf8");
  if (LOCAL_LIMIT_CONST.test(contents)) {
    err(`${file} re-declares a GitHub limit bound locally; import the canonical constant instead (F-DUP-1)`);
  }
  if (INLINE_LIST_RANGE.test(contents)) {
    err(`${file} inlines the 1..100 list-limit range; use GITHUB_MIN_LIMIT/GITHUB_MAX_LIMIT (F-DUP-1)`);
  }
}

// 4k2. Bounded pull-request reviews and inline review comments. Reviews and
// review comments are an explicit, item-source-only, pull-request-only,
// default-disabled, single-page opt-in. The provider may fetch ONLY the reviews
// and inline review-comments endpoints for a PR; timeline, review-thread
// resolution, reactions, commits, files, and diffs endpoints must never appear.
// The provider request layer must enforce the review bound (max 20) and the
// PR-only failure. The MCP projection must never expose a review/review-comment
// body, diff hunk, or commit id.
const GITHUB_PROVIDER = "providers/src/github/provider.ts";
if (trackedFiles.includes(GITHUB_PROVIDER)) {
  const contents = readFileSync(GITHUB_PROVIDER, "utf8");
  // Forbidden discussion/diff endpoints must never be requested.
  for (const fragment of [
    "/timeline",
    "/reactions",
    "/commits",
    "/files",
    "/threads",
    ".diff",
    ".patch",
  ]) {
    if (contents.includes(fragment)) {
      err(`${GITHUB_PROVIDER} references a forbidden GitHub endpoint fragment: "${fragment}"`);
    }
  }
  // The approved review endpoints must be present and single-page (page=1).
  for (const fragment of ["/pulls/${parent.number}/reviews", "/pulls/${parent.number}/comments"]) {
    if (!contents.includes(fragment)) {
      err(`${GITHUB_PROVIDER} is missing the approved review endpoint: "${fragment}"`);
    }
  }
  if (!contents.includes('url.searchParams.set("page", "1")')) {
    err(`${GITHUB_PROVIDER} must request page=1 only (single page per endpoint)`);
  }
  // PR-only enforcement must be present with the stable reason identifier.
  if (!contents.includes("github_pull_request_required")) {
    err(`${GITHUB_PROVIDER} must enforce the pull-request-required failure for review options`);
  }
}
// Review bounds live in the query and constants modules and are item-only in
// selection. Assert the exact maxima so a future edit cannot silently widen them.
const GITHUB_QUERY = "providers/src/github/query.ts";
if (trackedFiles.includes(GITHUB_QUERY)) {
  const contents = readFileSync(GITHUB_QUERY, "utf8");
  if (!contents.includes("MAX_GITHUB_REVIEW_LIMIT = 20")) {
    err(`${GITHUB_QUERY} must cap the review limit at 20`);
  }
  if (!contents.includes("MAX_GITHUB_REVIEW_COMMENT_LIMIT = 20")) {
    err(`${GITHUB_QUERY} must cap the review-comment limit at 20`);
  }
  if (!contents.includes("DEFAULT_GITHUB_REVIEW_LIMIT = 10")) {
    err(`${GITHUB_QUERY} must default the review limit to 10`);
  }
}
// The MCP projection surfaces (runner + server) must never expose a raw review
// body, diff hunk, or commit id.
const GITHUB_MCP_PROJECTION = ["mcp-server/src/github-tool-runner.ts", "mcp-server/src/server.ts"];
for (const file of GITHUB_MCP_PROJECTION) {
  if (!trackedFiles.includes(file)) continue;
  const contents = readFileSync(file, "utf8");
  for (const marker of ["diff_hunk", "diffHunk", "commit_id", "commitId", "original_commit_id"]) {
    if (contents.includes(marker)) {
      err(`${file} references a forbidden raw review field in the MCP projection: "${marker}"`);
    }
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

// 4g. The manually gated release workflows. Each must be workflow_dispatch only,
// have top-level contents: read, gate publishing behind a publish boolean, an
// exact confirmation string, a contents: write publish job, and the protected
// github-release environment. GitHub-Release/tag-publish verbs may appear ONLY
// in these workflows (plus their docs/tests); package/tool source stays clean.
// The historical v0.1 workflow publishes a stable release (--latest); the v0.2
// RC workflow publishes a prerelease (--prerelease, never --latest) with an
// additional version-consistency gate, existence refusal, and no registry verb.
const RELEASE_WORKFLOW = ".github/workflows/release-v0.1.yml";
const RC_RELEASE_WORKFLOW = ".github/workflows/release-v0.2-rc.yml";
const STABLE_RELEASE_WORKFLOW = ".github/workflows/release-v0.2.yml";
const V03_RC_RELEASE_WORKFLOW = ".github/workflows/release-v0.3-rc.yml";
const V03_STABLE_RELEASE_WORKFLOW = ".github/workflows/release-v0.3.yml";

/** Shared manual-gate policy applied to every dedicated release workflow. */
function checkReleaseWorkflowCommon(path, confirmation) {
  if (!trackedFiles.includes(path)) {
    err(`release workflow is not tracked: ${path}`);
    return null;
  }
  const wf = readFileSync(path, "utf8");
  if (!/^on:\s*\n\s+workflow_dispatch:/m.test(wf)) {
    err(`${path} must trigger on workflow_dispatch only`);
  }
  for (const forbiddenTrigger of ["\n  push:", "\n  pull_request:", "\n  schedule:", "\n  release:"]) {
    if (wf.includes(forbiddenTrigger)) {
      err(`${path} must not use trigger "${forbiddenTrigger.trim()}"`);
    }
  }
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(wf)) {
    err(`${path} must declare top-level permissions: contents: read`);
  }
  if (!wf.includes("contents: write")) {
    err(`${path} publish job must declare contents: write`);
  }
  if (!/if:\s*\$\{\{\s*inputs\.publish\s*==\s*true\s*\}\}/.test(wf)) {
    err(`${path} publish job must be gated on inputs.publish == true`);
  }
  if (!/name:\s*github-release/.test(wf)) {
    err(`${path} publish job must use the github-release environment`);
  }
  if (!wf.includes(confirmation)) {
    err(`${path} must enforce the exact confirmation string ${confirmation}`);
  }
  // No registry publishing verb may appear in any release workflow.
  for (const registryVerb of ["npm publish", "pnpm publish", "cargo publish", "yarn publish"]) {
    if (wf.includes(registryVerb)) {
      err(`${path} must not contain a registry publish verb: "${registryVerb}"`);
    }
  }
  return wf;
}

checkReleaseWorkflowCommon(RELEASE_WORKFLOW, "RELEASE v0.1.0");

// The v0.2 RC workflow adds RC-specific invariants.
const rcWf = checkReleaseWorkflowCommon(RC_RELEASE_WORKFLOW, "RELEASE v0.2.0-rc.1");
if (rcWf !== null) {
  // Exact version gate on the input.
  if (!rcWf.includes('!= "0.2.0-rc.1"')) {
    err(`${RC_RELEASE_WORKFLOW} must gate on the exact version 0.2.0-rc.1`);
  }
  // version.json must be checked against the input version.
  if (!rcWf.includes("require('./version.json').version") && !rcWf.includes('require("./version.json").version')) {
    err(`${RC_RELEASE_WORKFLOW} must verify version.json equals the input version`);
  }
  // Prerelease, never latest.
  if (!rcWf.includes("--prerelease")) {
    err(`${RC_RELEASE_WORKFLOW} must create the release with --prerelease`);
  }
  if (rcWf.includes("--latest")) {
    err(`${RC_RELEASE_WORKFLOW} must never use --latest`);
  }
  if (!/isPrerelease\s*!==\s*true/.test(rcWf)) {
    err(`${RC_RELEASE_WORKFLOW} must verify the published release isPrerelease === true`);
  }
  // Existence refusal before creating tag/release.
  if (!rcWf.includes("refusing to overwrite")) {
    err(`${RC_RELEASE_WORKFLOW} must refuse when the tag or release already exists`);
  }
  // Exactly the three RC assets are created.
  for (const asset of [
    "oh-my-pm-v0.2.0-rc.1.tar.gz",
    "oh-my-pm-v0.2.0-rc.1.zip",
    "oh-my-pm-v0.2.0-rc.1-SHA256SUMS.txt",
  ]) {
    if (!rcWf.includes(asset)) {
      err(`${RC_RELEASE_WORKFLOW} must reference the RC asset: ${asset}`);
    }
  }
}

// The v0.2 STABLE workflow adds stable-specific invariants. It is the mirror of
// the RC workflow with three inversions: it gates on the exact stable version
// 0.2.0 (never a prerelease suffix), publishes a non-prerelease "latest" release
// (never --prerelease), and verifies the published release is stable and resolves
// to releases/latest. It must also gate on the validated RC lineage and keep the
// RC/v0.1 contracts intact. This static check must reject a stable workflow that
// weakens any of these.
const stableWf = checkReleaseWorkflowCommon(STABLE_RELEASE_WORKFLOW, "RELEASE v0.2.0");
if (stableWf !== null) {
  // Exact stable version gate on the input (0.2.0, not a prerelease suffix).
  if (!stableWf.includes('!= "0.2.0"')) {
    err(`${STABLE_RELEASE_WORKFLOW} must gate on the exact version 0.2.0`);
  }
  // It must never accept a different version confirmation string.
  if (stableWf.includes("RELEASE v0.2.0-rc.1") || stableWf.includes("RELEASE v0.1.0")) {
    err(`${STABLE_RELEASE_WORKFLOW} must use only the stable confirmation string RELEASE v0.2.0`);
  }
  // version.json must be checked against the input version.
  if (
    !stableWf.includes("require('./version.json').version") &&
    !stableWf.includes('require("./version.json").version')
  ) {
    err(`${STABLE_RELEASE_WORKFLOW} must verify version.json equals the input version`);
  }
  // Stable, never prerelease: it must create the release with --latest and must
  // never use --prerelease anywhere.
  if (stableWf.includes("--prerelease")) {
    err(`${STABLE_RELEASE_WORKFLOW} must never use --prerelease (it is a stable release)`);
  }
  if (!stableWf.includes("--latest")) {
    err(`${STABLE_RELEASE_WORKFLOW} must create the stable release with --latest`);
  }
  // The published release must be verified stable (isPrerelease === false).
  if (!/isPrerelease\s*!==\s*false/.test(stableWf)) {
    err(`${STABLE_RELEASE_WORKFLOW} must verify the published release isPrerelease === false`);
  }
  // Latest-stable verification against releases/latest.
  if (!stableWf.includes("releases/latest")) {
    err(`${STABLE_RELEASE_WORKFLOW} must verify releases/latest resolves to the stable tag`);
  }
  // Existence refusal before creating tag/release.
  if (!stableWf.includes("refusing to overwrite")) {
    err(`${STABLE_RELEASE_WORKFLOW} must refuse when the tag or release already exists`);
  }
  // It must gate on the validated RC lineage (the GO decision evidence).
  if (!stableWf.includes("GO FOR v0.2.0 STABLE PREPARATION")) {
    err(`${STABLE_RELEASE_WORKFLOW} must gate on the recorded stable GO decision`);
  }
  // Exactly the three stable assets are created — and never an RC-named asset.
  for (const asset of [
    "oh-my-pm-v0.2.0.tar.gz",
    "oh-my-pm-v0.2.0.zip",
    "oh-my-pm-v0.2.0-SHA256SUMS.txt",
  ]) {
    if (!stableWf.includes(asset)) {
      err(`${STABLE_RELEASE_WORKFLOW} must reference the stable asset: ${asset}`);
    }
  }
  for (const rcAsset of [
    "oh-my-pm-v0.2.0-rc.1.tar.gz",
    "oh-my-pm-v0.2.0-rc.1.zip",
    "oh-my-pm-v0.2.0-rc.1-SHA256SUMS.txt",
  ]) {
    if (stableWf.includes(rcAsset)) {
      err(`${STABLE_RELEASE_WORKFLOW} must not publish an RC-named asset: ${rcAsset}`);
    }
  }
  // contents: write must not be granted at the top level or in the prepare job;
  // only the gated publish job may hold it. The top-level permissions gate is
  // covered by the common check; here we assert the prepare job stays read-only
  // by requiring the publish job to declare the sole contents: write permission
  // key exactly once. Only indented YAML permission keys count — prose mentions
  // in comments are ignored.
  const writeKeyCount = (stableWf.match(/^\s+contents: write\s*$/gm) || []).length;
  if (writeKeyCount !== 1) {
    err(`${STABLE_RELEASE_WORKFLOW} must grant contents: write exactly once (publish job only)`);
  }
  // No registry publication verb of any kind.
  for (const registryVerb of ["npm publish", "pnpm publish", "cargo publish", "yarn publish"]) {
    if (stableWf.includes(registryVerb)) {
      err(`${STABLE_RELEASE_WORKFLOW} must not contain a registry publish verb: "${registryVerb}"`);
    }
  }
}

// The v0.3 RC workflow mirrors the v0.2 RC invariants for the 0.3.0-rc.1 line: a
// manually gated PRERELEASE (never --latest), gating on the exact version and
// confirmation, an existence refusal, exactly the three RC-named assets, a
// cross-platform installed-qualification dependency before publish, and no
// registry verb. It must not weaken any of these.
const v03Wf = checkReleaseWorkflowCommon(V03_RC_RELEASE_WORKFLOW, "RELEASE v0.3.0-rc.1");
if (v03Wf !== null) {
  // Exact version gate on the input.
  if (!v03Wf.includes('!= "0.3.0-rc.1"')) {
    err(`${V03_RC_RELEASE_WORKFLOW} must gate on the exact version 0.3.0-rc.1`);
  }
  // version.json must be checked against the input version.
  if (
    !v03Wf.includes("require('./version.json').version") &&
    !v03Wf.includes('require("./version.json").version')
  ) {
    err(`${V03_RC_RELEASE_WORKFLOW} must verify version.json equals the input version`);
  }
  // Prerelease, never latest.
  if (!v03Wf.includes("--prerelease")) {
    err(`${V03_RC_RELEASE_WORKFLOW} must create the release with --prerelease`);
  }
  if (v03Wf.includes("--latest")) {
    err(`${V03_RC_RELEASE_WORKFLOW} must never use --latest`);
  }
  if (!/isPrerelease\s*!==\s*true/.test(v03Wf)) {
    err(`${V03_RC_RELEASE_WORKFLOW} must verify the published release isPrerelease === true`);
  }
  // Existence refusal before creating tag/release.
  if (!v03Wf.includes("refusing to overwrite")) {
    err(`${V03_RC_RELEASE_WORKFLOW} must refuse when the tag or release already exists`);
  }
  // The publish job must depend on the cross-platform installed qualification.
  if (!/needs:\s*\[\s*prepare\s*,\s*installed-qualification\s*\]/.test(v03Wf)) {
    err(`${V03_RC_RELEASE_WORKFLOW} publish must depend on the installed-qualification matrix`);
  }
  // The release must target the exact workflow commit SHA, not floating main.
  if (!v03Wf.includes('--target "$GITHUB_SHA"')) {
    err(`${V03_RC_RELEASE_WORKFLOW} must target the exact workflow commit SHA`);
  }
  // Exactly the three RC assets are created.
  for (const asset of [
    "oh-my-pm-v0.3.0-rc.1.tar.gz",
    "oh-my-pm-v0.3.0-rc.1.zip",
    "oh-my-pm-v0.3.0-rc.1-SHA256SUMS.txt",
  ]) {
    if (!v03Wf.includes(asset)) {
      err(`${V03_RC_RELEASE_WORKFLOW} must reference the RC asset: ${asset}`);
    }
  }
  // contents: write is granted exactly once (the publish job only).
  const writeKeyCount = (v03Wf.match(/^\s+contents: write\s*$/gm) || []).length;
  if (writeKeyCount !== 1) {
    err(`${V03_RC_RELEASE_WORKFLOW} must grant contents: write exactly once (publish job only)`);
  }
}

// The v0.3 STABLE workflow mirrors the v0.2 stable invariants for the 0.3.0 line:
// a manually gated stable release that gates on the exact stable version 0.3.0
// (never a prerelease suffix), publishes a non-prerelease "latest" release (never
// --prerelease), verifies releases/latest, gates on the validated RC lineage and
// the recorded GO decision, depends on the cross-platform installed-qualification
// matrix, targets the exact workflow SHA, grants contents: write exactly once,
// and uses no registry verb. It must not weaken any of these.
const v03StableWf = checkReleaseWorkflowCommon(V03_STABLE_RELEASE_WORKFLOW, "RELEASE v0.3.0");
if (v03StableWf !== null) {
  // Exact stable version gate on the input (0.3.0, not a prerelease suffix).
  if (!v03StableWf.includes('!= "0.3.0"')) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must gate on the exact version 0.3.0`);
  }
  // It must never accept a prerelease confirmation string.
  if (v03StableWf.includes("RELEASE v0.3.0-rc.1")) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must use only the stable confirmation string RELEASE v0.3.0`);
  }
  // version.json must be checked against the input version.
  if (
    !v03StableWf.includes("require('./version.json').version") &&
    !v03StableWf.includes('require("./version.json").version')
  ) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must verify version.json equals the input version`);
  }
  // Stable, never prerelease: --latest and never --prerelease.
  if (v03StableWf.includes("--prerelease")) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must never use --prerelease (it is a stable release)`);
  }
  if (!v03StableWf.includes("--latest")) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must create the stable release with --latest`);
  }
  if (!/isPrerelease\s*!==\s*false/.test(v03StableWf)) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must verify the published release isPrerelease === false`);
  }
  // Latest-stable verification against releases/latest.
  if (!v03StableWf.includes("releases/latest")) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must verify releases/latest resolves to the stable tag`);
  }
  // Existence refusal before creating tag/release.
  if (!v03StableWf.includes("refusing to overwrite")) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must refuse when the tag or release already exists`);
  }
  // It must gate on the validated RC lineage (the GO decision evidence).
  if (!v03StableWf.includes("GO FOR v0.3.0 STABLE PREPARATION")) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must gate on the recorded stable GO decision`);
  }
  // The publish job must depend on the cross-platform installed qualification.
  if (!/needs:\s*\[\s*prepare\s*,\s*installed-qualification\s*\]/.test(v03StableWf)) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} publish must depend on the installed-qualification matrix`);
  }
  // The release must target the exact workflow commit SHA, not floating main.
  if (!v03StableWf.includes('--target "$GITHUB_SHA"')) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must target the exact workflow commit SHA`);
  }
  // Exactly the three stable assets are created — and never an RC-named asset.
  for (const asset of [
    "oh-my-pm-v0.3.0.tar.gz",
    "oh-my-pm-v0.3.0.zip",
    "oh-my-pm-v0.3.0-SHA256SUMS.txt",
  ]) {
    if (!v03StableWf.includes(asset)) {
      err(`${V03_STABLE_RELEASE_WORKFLOW} must reference the stable asset: ${asset}`);
    }
  }
  for (const rcAsset of [
    "oh-my-pm-v0.3.0-rc.1.tar.gz",
    "oh-my-pm-v0.3.0-rc.1.zip",
    "oh-my-pm-v0.3.0-rc.1-SHA256SUMS.txt",
  ]) {
    if (v03StableWf.includes(rcAsset)) {
      err(`${V03_STABLE_RELEASE_WORKFLOW} must not publish an RC-named asset: ${rcAsset}`);
    }
  }
  // contents: write granted exactly once (publish job only).
  const v03WriteKeyCount = (v03StableWf.match(/^\s+contents: write\s*$/gm) || []).length;
  if (v03WriteKeyCount !== 1) {
    err(`${V03_STABLE_RELEASE_WORKFLOW} must grant contents: write exactly once (publish job only)`);
  }
}

// The v0.1 and RC workflow contracts must remain byte-stable against the audited
// baseline: the stable workflow addition must not silently rewrite them. Their
// confirmation strings and prerelease/latest posture are asserted above; here we
// re-affirm the RC stays prerelease-only and v0.1 stays latest so the stable
// workflow cannot be introduced by mutating them.
if (rcWf !== null && !rcWf.includes("--prerelease")) {
  err(`${RC_RELEASE_WORKFLOW} must remain a prerelease workflow (--prerelease)`);
}

// GitHub-Release / tag-publish verbs are confined to the release workflows, their
// documentation, and their dedicated test/tool scope. No package or general tool
// source may create tags or GitHub Releases.
const RELEASE_PUBLISH_MARKERS = ["gh release create", "softprops/action-gh-release"];
const RELEASE_PUBLISH_ALLOWED = new Set([
  RELEASE_WORKFLOW,
  RC_RELEASE_WORKFLOW,
  STABLE_RELEASE_WORKFLOW,
  V03_RC_RELEASE_WORKFLOW,
  V03_STABLE_RELEASE_WORKFLOW,
  "docs/releases/publishing-v0.1.0.md",
  "docs/releases/publishing-v0.2.0-rc.1.md",
  "docs/releases/publishing-v0.2.0.md",
  "docs/releases/publishing-v0.3.0-rc.1.md",
  "docs/releases/publishing-v0.3.0.md",
  "docs/releases/v0.1.0.md",
  "docs/releases/v0.2.0.md",
  "docs/releases/v0.3.0-rc.1.md",
  "docs/releases/v0.3.0.md",
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

// 5b. v0.3 Project Brain boundary guards (Phase 1 pure Kernel + Phase 3 Runtime
// orchestration). Phase 1 added the PURE, deterministic Kernel module. Phase 3
// adds: the minimal Kernel WASM/TypeScript binding for the seven approved pure
// functions; a pure Skills state-derivation module; and the provider-independent
// Runtime capture/compare orchestration under runtime/src/projectbrain/**. It
// still adds NO CLI memory command, MCP Project Brain tool, new provider,
// provider->memory dependency, project write, or Runtime/Skills direct
// fs/network/clock/random access, and no contract or Phase 1 semantic change.
// The projectbrain surface may live only under the narrowly allowed locations
// below. (This validator is the detector, so its own marker strings never trip
// these scans: it carries no "projectbrain" filename.)
if (!trackedFiles.includes("contracts/schema/projectbrain.schema.json")) {
  err("contracts/schema/projectbrain.schema.json is missing (Phase 0 contract domain)");
}
for (const gen of [
  "contracts/generated/ts/projectbrain.ts",
  "contracts/generated/rust/projectbrain.rs",
]) {
  if (!trackedFiles.includes(gen)) err(`generated projectbrain module is missing: ${gen}`);
}
if (trackedFiles.includes("contracts/generated/ts/index.ts")) {
  const tsBarrel = readFileSync("contracts/generated/ts/index.ts", "utf8");
  if (!tsBarrel.includes('export * from "./projectbrain.js";')) {
    err("contracts/generated/ts/index.ts must export the projectbrain barrel");
  }
}
if (trackedFiles.includes("contracts/generated/rust/mod.rs")) {
  const rustBarrel = readFileSync("contracts/generated/rust/mod.rs", "utf8");
  if (!rustBarrel.includes("pub mod projectbrain;")) {
    err("contracts/generated/rust/mod.rs must declare pub mod projectbrain");
  }
}
// Allowlist. A projectbrain-named source, test, fixture, or doc file must live
// under one of these locations. Anything else signals a premature Phase 4+ leak
// (CLI memory command, MCP exposure, new provider).
const PROJECT_BRAIN_ALLOWED_PREFIXES = [
  "contracts/", // Phase 0 contract surface
  "kernel/crate/src/projectbrain/", // Phase 1 pure Kernel module
  "kernel/binding/src/", // Phase 3 minimal binding (projectbrain.ts, node.ts)
  "kernel/binding/test/", // Phase 3 binding tests
  "runtime/src/projectbrain/", // Phase 3 Runtime orchestration
  "runtime/test/", // Phase 3 Runtime tests
  "skills/src/", // Phase 3 pure derivation module
  "skills/test/", // Phase 3 derivation tests
  "examples/fixtures/project-brain/", // golden fixtures
  "docs/", // documentation may name any phase
];
const PROJECT_BRAIN_ALLOWED_FILES = new Set([
  "kernel/crate/tests/projectbrain_contracts.rs", // Phase 0 serde round-trip
  // Phase 6 release qualification: the installed-artifact Project Brain
  // qualification script drives the installed CLI/MCP end to end. It is release
  // tooling (spawns installed shims, plants an isolated v1 fixture), not a
  // product surface, so it names project-brain by design.
  "tools/check-v0.3-installed-project-brain.mjs",
]);
// Kernel integration tests: kernel/crate/tests/projectbrain_*.rs.
const PROJECT_BRAIN_TEST_RE = /^kernel\/crate\/tests\/projectbrain_[a-z_]+\.rs$/;
const projectBrainFiles = trackedFiles.filter(
  (f) => /project[-_]?brain/i.test(f) && /\.(ts|mjs|js|rs|json)$/.test(f),
);
for (const file of projectBrainFiles) {
  if (PROJECT_BRAIN_ALLOWED_PREFIXES.some((p) => file.startsWith(p))) continue;
  if (PROJECT_BRAIN_ALLOWED_FILES.has(file)) continue;
  if (PROJECT_BRAIN_TEST_RE.test(file)) continue;
  err(`projectbrain surface is not in an allowed location: ${file}`);
}
// Rust impurity markers: the pure Kernel module and its integration tests must
// introduce no filesystem, network, environment, clock, process, or randomness
// capability. (TypeScript purity for the Runtime/Skills layers is enforced by
// the dedicated per-layer scans below and by the packages' own purity tests.)
const PROJECT_BRAIN_RUST_FORBIDDEN = [
  "std::fs",
  "std::net",
  "std::env",
  "std::process",
  "SystemTime",
  "now_utc",
  "Instant::now",
  "thread::sleep",
  "Command::new",
  "rand::",
  "thread_rng",
  "getrandom",
  "reqwest",
];
// The purity test itself enumerates the impurity markers as detection strings,
// exactly as this validator does; it is exempted from the capability scan (its
// own assertions enforce purity).
const PROJECT_BRAIN_MARKER_DETECTORS = new Set([
  "kernel/crate/tests/projectbrain_purity.rs",
]);
for (const file of projectBrainFiles) {
  if (!file.endsWith(".rs")) continue; // TypeScript layers scanned separately
  if (PROJECT_BRAIN_MARKER_DETECTORS.has(file)) continue;
  const raw = readFileSync(file, "utf8");
  const contents = raw
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
  const isTest = PROJECT_BRAIN_TEST_RE.test(file) || file === "kernel/crate/tests/common/mod.rs";
  for (const marker of PROJECT_BRAIN_RUST_FORBIDDEN) {
    // Integration tests may read fixtures from disk via std::fs; the Kernel
    // module proper may not. All other markers still apply everywhere.
    if (isTest && marker === "std::fs") continue;
    if (contents.includes(marker)) {
      err(`${file} introduces a forbidden projectbrain Rust capability: "${marker}"`);
    }
  }
}
// Phase 3 TypeScript purity: the Runtime orchestration and the Skills derivation
// PRODUCTION sources must never reach a Node built-in, the network, a clock, or
// randomness — every effect flows through an injected port. Tests are exempt
// (the e2e test legitimately uses node:fs + the real adapter against a temp dir).
const PROJECT_BRAIN_TS_PURE_FILES = trackedFiles.filter(
  (f) =>
    (f.startsWith("runtime/src/projectbrain/") || f === "skills/src/project-brain-state.ts") &&
    f.endsWith(".ts"),
);
const PROJECT_BRAIN_TS_FORBIDDEN = [
  'from "fs"',
  'from "node:fs"',
  'from "node:path"',
  'from "node:os"',
  'from "node:crypto"',
  'from "node:child_process"',
  'from "node:http"',
  'from "node:https"',
  'from "node:net"',
  "process.env",
  "child_process",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "Date.now",
  "new Date",
  "Math.random",
  "crypto.randomUUID",
  "better-sqlite3",
  // Runtime/Skills must never import or construct the Node persistence adapter.
  "createNodeProjectMemoryStore",
];
for (const file of PROJECT_BRAIN_TS_PURE_FILES) {
  const raw = readFileSync(file, "utf8");
  const contents = raw
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
  for (const marker of PROJECT_BRAIN_TS_FORBIDDEN) {
    if (contents.includes(marker)) {
      err(`${file} introduces a forbidden projectbrain TypeScript capability: "${marker}"`);
    }
  }
}
// The Runtime production source (all of runtime/src/**, not only the projectbrain
// module) must never import the project-memory package: the persistence adapter
// is reached only through the structural port, and only tests may import it.
for (const file of trackedFiles) {
  if (!file.startsWith("runtime/src/") || !file.endsWith(".ts")) continue;
  const contents = readFileSync(file, "utf8");
  for (const match of contents.matchAll(IMPORT_SPECIFIER)) {
    if (match[1] === "@oh-my-pm/project-memory") {
      err(`${file} imports @oh-my-pm/project-memory; Runtime source must use the structural port`);
    }
  }
}
// The pure Kernel module itself (kernel/crate/src/projectbrain/**) may NEVER read
// the filesystem, not even in a test-exempt way: assert std::fs is absent there.
const projectBrainModuleFiles = trackedFiles.filter((f) =>
  f.startsWith("kernel/crate/src/projectbrain/"),
);
if (projectBrainModuleFiles.length === 0) {
  err("Phase 1 kernel projectbrain module is missing under kernel/crate/src/projectbrain/");
}
for (const file of projectBrainModuleFiles) {
  const contents = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
  for (const marker of ["std::fs", "std::net", "std::env", "SystemTime", "now_utc"]) {
    if (contents.includes(marker)) {
      err(`${file} (pure Kernel module) must never contain "${marker}"`);
    }
  }
}
// No unapproved store/persistence source may appear under the pure layers. The
// persistence adapter lives only in project-memory/**; these hyphenated file
// markers must never appear in the Kernel, Runtime, Skills, Providers, CLI, or
// MCP source trees.
const PHASE2_PLUS_FILE_MARKERS = [
  "memory-store",
  "snapshot-store",
  "persistence-adapter",
];
for (const file of trackedFiles) {
  if (file.startsWith("docs/")) continue; // documentation may name deferred phases
  if (file.startsWith("project-memory/")) continue; // the approved persistence package
  for (const marker of PHASE2_PLUS_FILE_MARKERS) {
    if (file.toLowerCase().includes(marker)) {
      err(`forbidden premature persistence source outside project-memory: ${file}`);
    }
  }
}
// v0.3 Phase 5: the MCP server may register EXACTLY ONE new read-only Project
// Brain tool, `project_changes`, and no other. Every forbidden Project Brain MCP
// tool (capture/compare/delete/export/migrate/status/history) and any second
// Project Brain tool remains rejected. `project_changes` must be registered only
// through a conditional guarded by an injected executor (so the legacy v0.2
// bundle without Project Memory keeps the exact ten tools). The eleventh-tool
// count/order is asserted in validate-structure.mjs.
if (trackedFiles.includes("mcp-server/src/server.ts")) {
  const server = readFileSync("mcp-server/src/server.ts", "utf8");
  // Any registered tool literal (bare-string first arg to registerTool).
  const registeredTools = new Set(
    [...server.matchAll(/registerTool\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]),
  );
  // Forbidden Project Brain MCP tools must never be registered.
  const FORBIDDEN_PB_MCP_TOOLS = [
    "project_capture",
    "project_compare",
    "project_delete",
    "project_export",
    "project_migrate",
    "project_status",
    "project_history",
  ];
  for (const forbidden of FORBIDDEN_PB_MCP_TOOLS) {
    if (registeredTools.has(forbidden)) {
      err(`mcp-server/src/server.ts must not register the forbidden MCP tool "${forbidden}"`);
    }
  }
  // Exactly one Project Brain read-only tool is allowed: project_changes.
  const projectBrainTools = [...registeredTools].filter(
    (name) => name === "project_changes",
  );
  if (projectBrainTools.length > 1) {
    err("mcp-server/src/server.ts must register at most one Project Brain MCP tool");
  }
  // project_changes must be registered behind the injected executor guard, never
  // unconditionally (so the legacy ten-tool bundle is preserved).
  if (registeredTools.has("project_changes")) {
    if (!/if\s*\(\s*executeProjectChanges\s*!==\s*undefined\s*\)/.test(server)) {
      err(
        "mcp-server/src/server.ts must register project_changes only when an executor is injected",
      );
    }
    // No write/destructive annotation on the read-only tool.
    if (/destructiveHint:\s*true/.test(server) || /readOnlyHint:\s*false/.test(server)) {
      err("mcp-server/src/server.ts project_changes must be read-only and non-destructive");
    }
  }
  // The server must NOT statically import the project-memory package (the lazy
  // loader is the only capability composition path).
  if (/from\s+["']@oh-my-pm\/project-memory["']/.test(server)) {
    err("mcp-server/src/server.ts must not statically import @oh-my-pm/project-memory");
  }
}
// The MCP bin must not statically import the project-memory package either.
if (trackedFiles.includes("mcp-server/bin/oh-my-pm-mcp.mjs")) {
  const bin = readFileSync("mcp-server/bin/oh-my-pm-mcp.mjs", "utf8");
  if (bin.includes("@oh-my-pm/project-memory")) {
    err("mcp-server/bin/oh-my-pm-mcp.mjs must not reference @oh-my-pm/project-memory");
  }
}
// The project_changes runner must not import a provider, call capture/commit/
// export/delete/migrate, or reach the network. It reaches persistence only via
// the lazy adapter import and the structural read port.
if (trackedFiles.includes("mcp-server/src/project-changes-runner.ts")) {
  const runner = readFileSync("mcp-server/src/project-changes-runner.ts", "utf8");
  for (const marker of ["@oh-my-pm/providers", "createProviderRegistry", "createLocalProvider"]) {
    if (runner.includes(marker)) {
      err(`mcp-server/src/project-changes-runner.ts must not reference a provider ("${marker}")`);
    }
  }
  for (const marker of [
    "commitSnapshotBundle(",
    "exportProject(",
    "deleteProject(",
    "migrateProject(",
    "previewMigration(",
    ".capture(",
  ]) {
    if (runner.includes(marker)) {
      err(`mcp-server/src/project-changes-runner.ts must not invoke a mutating/capture call ("${marker}")`);
    }
  }
}
// Phase 3 Kernel binding surface. The Kernel WASM binding gains the seven
// approved Project Brain exports (11 total: the original 4 plus these 7) and no
// others. The original four exports must remain, and no export outside the
// approved allowlist may appear.
const APPROVED_PB_WASM_EXPORTS = [
  "deriveProjectIdentity",
  "fingerprintMinimizedContent",
  "deriveEvidenceId",
  "deriveFreshness",
  "finalizeProjectState",
  "finalizeProjectSnapshot",
  "diffProjectSnapshots",
];
const ORIGINAL_WASM_EXPORTS = [
  "kernelVersion",
  "validateJson",
  "checkUpdatePlan",
  "decideTransition",
];
if (trackedFiles.includes("kernel/crate/src/wasm.rs")) {
  const wasm = readFileSync("kernel/crate/src/wasm.rs", "utf8");
  const exportNames = [...wasm.matchAll(/js_name\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const allowed = new Set([...ORIGINAL_WASM_EXPORTS, ...APPROVED_PB_WASM_EXPORTS]);
  if (exportNames.length !== allowed.size) {
    err(
      `kernel/crate/src/wasm.rs must expose exactly ${allowed.size} WASM exports in Phase 3 (found ${exportNames.length})`,
    );
  }
  for (const name of ORIGINAL_WASM_EXPORTS) {
    if (!exportNames.includes(name)) {
      err(`kernel/crate/src/wasm.rs must keep the original WASM export "${name}"`);
    }
  }
  for (const name of exportNames) {
    if (!allowed.has(name)) {
      err(`kernel/crate/src/wasm.rs exposes an unapproved WASM export "${name}"`);
    }
  }
}
// The KernelApi type (version/validateJson/checkUpdatePlan/decideTransition) must
// stay byte-stable: the Project Brain methods live on a SEPARATE
// ProjectBrainKernelApi and must NOT be added to KernelApi. Assert the KernelApi
// type block still lists exactly its four original methods.
if (trackedFiles.includes("kernel/binding/src/index.ts")) {
  const binding = readFileSync("kernel/binding/src/index.ts", "utf8");
  const kernelApiBlock = binding.match(/export type KernelApi = \{([\s\S]*?)\};/);
  if (kernelApiBlock === null) {
    err("kernel/binding/src/index.ts must keep the KernelApi type declaration");
  } else {
    const body = kernelApiBlock[1];
    for (const method of ["version(", "validateJson(", "checkUpdatePlan(", "decideTransition("]) {
      if (!body.includes(method)) {
        err(`kernel/binding/src/index.ts KernelApi must keep the "${method}" method`);
      }
    }
    for (const pbMethod of APPROVED_PB_WASM_EXPORTS) {
      if (body.includes(`${pbMethod}(`)) {
        err(`kernel/binding/src/index.ts must not add "${pbMethod}" to KernelApi (use ProjectBrainKernelApi)`);
      }
    }
  }
  // The seven approved binding methods must appear on the ProjectBrainKernelApi
  // surface and nowhere else may a new binding method be introduced.
  if (trackedFiles.includes("kernel/binding/src/projectbrain.ts")) {
    const pb = readFileSync("kernel/binding/src/projectbrain.ts", "utf8");
    for (const method of APPROVED_PB_WASM_EXPORTS) {
      if (!pb.includes(`${method}(`)) {
        err(`kernel/binding/src/projectbrain.ts must declare the approved binding method "${method}"`);
      }
    }
  }
}
// Phase 1 dependency guard: only sha2 and time may be newly added to the Kernel
// crate manifest, and no other package manifest may change its dependency set for
// Project Brain. Assert the Kernel manifest declares exactly the approved
// dependency set (serde, serde_json, wasm-bindgen, sha2, time) and nothing else.
if (trackedFiles.includes("kernel/crate/Cargo.toml")) {
  const cargo = readFileSync("kernel/crate/Cargo.toml", "utf8");
  const depSection = cargo.split(/^\[dependencies\]/m)[1] || "";
  const depBlock = depSection.split(/^\[/m)[0];
  const declared = [...depBlock.matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm)].map((m) => m[1]).sort();
  const approved = ["serde", "serde_json", "sha2", "time", "wasm-bindgen"];
  if (JSON.stringify(declared) !== JSON.stringify(approved)) {
    err(
      `kernel/crate/Cargo.toml dependencies must be exactly ${approved.join(", ")} in Phase 1 (found ${declared.join(", ")})`,
    );
  }
  // Forbidden heavy/impure dependencies must never appear.
  for (const forbidden of ["chrono", "rand", "uuid", "reqwest", "rusqlite", "tokio", "getrandom"]) {
    if (new RegExp(`^${forbidden}\\s*=`, "m").test(depBlock)) {
      err(`kernel/crate/Cargo.toml must not add the forbidden dependency "${forbidden}"`);
    }
  }
}
// Version guard: version.json carries the prepared source version. Phases 0–5
// stayed at 0.2.0; Phase 6 prepared the v0.3 release candidate 0.3.0-rc.1; Phase
// 7 promotes the validated candidate to the stable 0.3.0. The value must be
// exactly this prepared version (all package manifests and the runtime version
// constants are checked against it by check-version-consistency).
const EXPECTED_SOURCE_VERSION = "0.3.0";
if (trackedFiles.includes("version.json")) {
  const version = JSON.parse(readFileSync("version.json", "utf8")).version;
  if (version !== EXPECTED_SOURCE_VERSION) {
    err(`version.json must be ${EXPECTED_SOURCE_VERSION} (found ${version})`);
  }
}
// Golden fixtures must carry no absolute path, credential, or raw body.
const PROJECT_BRAIN_FIXTURE_FILES = trackedFiles.filter((f) =>
  f.startsWith("examples/fixtures/project-brain/"),
);
const FIXTURE_FORBIDDEN = [
  "/Users/",
  "/home/",
  "BEGIN PRIVATE KEY",
  "BEGIN CERTIFICATE",
  "Authorization:",
  "Bearer ",
];
for (const file of PROJECT_BRAIN_FIXTURE_FILES) {
  const contents = readFileSync(file, "utf8");
  for (const marker of FIXTURE_FORBIDDEN) {
    if (contents.includes(marker)) {
      err(`${file} fixture contains a forbidden value: "${marker}"`);
    }
  }
  if (/[A-Z]:\\\\/.test(contents)) {
    err(`${file} fixture embeds a Windows absolute path`);
  }
}
// Phase 0/1 privacy invariants on the generated projectbrain contracts: identity
// stores no absolute path; evidence stores no credential or raw body. Match field
// declarations only (doc-comment prose legitimately mentions bodies/tokens).
for (const gen of Object.keys({
  "contracts/generated/ts/projectbrain.ts": 0,
  "contracts/generated/rust/projectbrain.rs": 0,
})) {
  if (!trackedFiles.includes(gen)) continue;
  const contents = readFileSync(gen, "utf8");
  const forbiddenDecls = gen.endsWith(".ts")
    ? [
        [/^\s*absolutePath\??:/m, "absolute-path field"],
        [/^\s*token\??:/m, "token field"],
        [/^\s*authorization\??:/m, "authorization field"],
        [/^\s*bearer\??:/m, "bearer field"],
        [/^\s*body\??:/m, "raw-body field"],
      ]
    : [
        [/^\s*pub absolute_path:/m, "absolute-path field"],
        [/^\s*pub token:/m, "token field"],
        [/^\s*pub authorization:/m, "authorization field"],
        [/^\s*pub bearer:/m, "bearer field"],
        [/^\s*pub body:/m, "raw-body field"],
      ];
  for (const [re, why] of forbiddenDecls) {
    if (re.test(contents)) err(`${gen} must not declare a ${why} (privacy invariant)`);
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

// 8. v0.3 Phase 2 local project memory adapter boundaries. The private
// @oh-my-pm/project-memory package is the explicit application-state persistence
// boundary. Its ONLY module allowed to perform real filesystem I/O is
// node-adapter.ts; every other source file (including the store) must reach no
// node:fs. No source may reach the network, a database/native driver, a child
// process, telemetry/logging, or the environment (except the resolver wrapper,
// which reads process.platform/process.env/os.homedir for PATH RESOLUTION only
// and never a provider token). The package must have no dependency yet from
// Providers, Skills, CLI, MCP, Installer, or Runtime.
const PROJECT_MEMORY_SRC = trackedFiles.filter(
  (f) => f.startsWith("project-memory/src/") && f.endsWith(".ts"),
);
const PROJECT_MEMORY_FS_BOUNDARY = "project-memory/src/node-adapter.ts";
// The single approved environment/platform reader (path resolution only).
const PROJECT_MEMORY_ENV_BOUNDARY = "project-memory/src/node-adapter.ts";
// Database, native-driver, daemon, watcher, and queue markers forbidden anywhere.
const PROJECT_MEMORY_FORBIDDEN_EVERYWHERE = [
  // Network.
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
  // Database / native / ORM.
  "better-sqlite3",
  "sqlite3",
  "leveldown",
  "levelup",
  "PRAGMA",
  "CREATE TABLE",
  "typeorm",
  "prisma",
  "sequelize",
  "mongodb",
  // Process execution.
  "child_process",
  "execSync",
  "spawn(",
  "spawnSync",
  // Telemetry / logging / remote.
  "telemetry",
  "console.log",
  "console.error",
  "upload",
  "download",
  "registry.npmjs",
  // Secrets.
  "OH_MY_PM_GITHUB_TOKEN",
];
for (const file of PROJECT_MEMORY_SRC) {
  const raw = readFileSync(file, "utf8");
  // Strip line/block-comment lines so prose that documents what the code does
  // NOT do (e.g. "no network, telemetry"; "reads process.env for path
  // resolution") is not mistaken for a real call. Import specifiers still parse
  // from the raw text below; the marker scans use the stripped code.
  const contents = raw
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
  // Only node-adapter.ts may import a Node filesystem module.
  if (file !== PROJECT_MEMORY_FS_BOUNDARY) {
    for (const match of raw.matchAll(IMPORT_SPECIFIER)) {
      const spec = match[1];
      if (spec === "fs" || spec.startsWith("node:fs")) {
        err(`${file} imports a Node filesystem module outside the adapter boundary: "${spec}"`);
      }
    }
  }
  // process.env / process.platform / os.homedir only in the resolver wrapper.
  if (file !== PROJECT_MEMORY_ENV_BOUNDARY) {
    for (const marker of ["process.env", "process.platform", "os.homedir", "node:os"]) {
      if (contents.includes(marker)) {
        err(`${file} reads the environment/platform outside the resolver boundary: "${marker}"`);
      }
    }
  }
  // Forbidden capability markers everywhere in package source.
  for (const marker of PROJECT_MEMORY_FORBIDDEN_EVERYWHERE) {
    if (contents.includes(marker)) {
      err(`${file} contains a forbidden project-memory capability marker: "${marker}"`);
    }
  }
}
// The package manifest is private, pinned, dependency-free, and adds no
// postinstall. (validate-structure asserts fields too; this is the boundary-side
// dependency guard so a dependency addition trips both validators.)
if (trackedFiles.includes("project-memory/package.json")) {
  const pkg = JSON.parse(readFileSync("project-memory/package.json", "utf8"));
  if (pkg.private !== true) err("project-memory/package.json must set private: true");
  if (pkg.version !== EXPECTED_SOURCE_VERSION) {
    err(`project-memory/package.json must be version ${EXPECTED_SOURCE_VERSION}`);
  }
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
    if (pkg[field] && Object.keys(pkg[field]).length > 0) {
      err(`project-memory/package.json must declare no ${field} (Node built-ins only)`);
    }
  }
}
// Project-memory dependency policy. No package may take a PRODUCTION dependency
// on @oh-my-pm/project-memory: the Phase 3 Runtime reaches persistence only
// through its structural port. The Runtime's e2e integration test devDepends on
// it (test/build-time only). As of the v0.3 "project-brain" release profile, the
// CLI and the MCP server take it as a RUNTIME dependency: both reach it through a
// lazy dynamic import (never a static startup import), and it must be present in
// the self-contained v0.3 bundle so the installed memory commands and the
// project_changes tool resolve without a workspace checkout. When the package is
// genuinely absent (the historical v0.2 bundle), the lazy load falls back to the
// exact ten-tool surface.
const PROJECT_MEMORY_RUNTIME_DEP_ALLOWED = new Set([
  "cli/package.json",
  "mcp-server/package.json",
]);
const PROJECT_MEMORY_DEV_DEP_ALLOWED = new Set([
  // The Runtime keeps a test-only devDependency for its e2e integration suite.
  "runtime/package.json",
]);
for (const file of trackedFiles) {
  if (!/(^|\/)package\.json$/.test(file)) continue;
  if (file === "project-memory/package.json") continue;
  if (file.startsWith("node_modules/")) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = pkg && typeof pkg === "object" ? pkg[field] : undefined;
    if (deps && typeof deps === "object" && "@oh-my-pm/project-memory" in deps) {
      if (field !== "dependencies" || !PROJECT_MEMORY_RUNTIME_DEP_ALLOWED.has(file)) {
        err(`${file} must not take a ${field} on @oh-my-pm/project-memory`);
      }
    }
  }
  const devDeps = pkg && typeof pkg === "object" ? pkg.devDependencies : undefined;
  if (
    devDeps &&
    typeof devDeps === "object" &&
    "@oh-my-pm/project-memory" in devDeps &&
    !PROJECT_MEMORY_DEV_DEP_ALLOWED.has(file)
  ) {
    err(`${file} must not devDepend on @oh-my-pm/project-memory (only the runtime e2e may)`);
  }
}
// Only test files (and the two validators) may reference the adapter package by
// name in a STATIC import: the persistence boundary is reached in production
// source only through the structural port. The lazy-load exceptions may
// reference the package name ONLY inside a dynamic `import("@oh-my-pm/project-
// memory")` and must never statically import it: the Phase 4 CLI memory process
// boundary, and the Phase 5 MCP capability loader + read-only runner (which lazy-
// load the adapter only on the project_changes path so the legacy v0.2 bundle,
// which excludes the package, still starts with the exact ten tools). Any other
// production reference, or a static import in a lazy boundary, is a leak.
const PROJECT_MEMORY_LAZY_BOUNDARIES = new Set([
  "cli/src/memory-process.ts",
  "mcp-server/src/project-changes-loader.ts",
  "mcp-server/src/project-changes-runner.ts",
]);
// Release/qualification tools that legitimately reference the package by name as
// a STRING — to assert its presence in the self-contained v0.3 bundle, to stage
// it, or to load the installed dist for planting a v1 fixture. These are tools,
// not product runtime source; they perform no static production import of it.
const PROJECT_MEMORY_TOOL_REFERENCE_ALLOWED = new Set([
  "tools/release-bundle-utils.mjs",
  "tools/check-release-bundle.mjs",
  "tools/check-release-install.mjs",
  "tools/check-v0.3-installed-project-brain.mjs",
  "distribution/libexec/release-install-core.mjs",
]);
for (const file of trackedFiles) {
  if (file.startsWith("project-memory/")) continue;
  if (!/\.(ts|mjs|js)$/.test(file)) continue;
  if (file.startsWith("contracts/generated/")) continue;
  if (file === "tools/validate-boundaries.mjs" || file === "tools/validate-structure.mjs") continue;
  if (file.startsWith("docs/")) continue;
  // Test files may import the real adapter for integration composition.
  if (/\.test\.(ts|mjs|js)$/.test(file)) continue;
  if (file.startsWith("runtime/test/") || file.includes("/test/")) continue;
  const contents = readFileSync(file, "utf8");
  if (!contents.includes("@oh-my-pm/project-memory")) continue;
  if (PROJECT_MEMORY_TOOL_REFERENCE_ALLOWED.has(file)) {
    // A release/qualification tool may name the package but must never STATICALLY
    // import it as a module dependency (it either references it as a string or
    // loads the installed dist by file URL).
    if (/from\s+["']@oh-my-pm\/project-memory["']/.test(contents)) {
      err(`${file} must not statically import @oh-my-pm/project-memory`);
    }
    continue;
  }
  if (PROJECT_MEMORY_LAZY_BOUNDARIES.has(file)) {
    // A lazy boundary must reach the adapter ONLY via a dynamic import and must
    // never statically import it (which would defeat the lazy-load rule).
    if (!contents.includes('import("@oh-my-pm/project-memory")')) {
      err(`${file} must load @oh-my-pm/project-memory via a dynamic import`);
    }
    if (/from\s+["']@oh-my-pm\/project-memory["']/.test(contents)) {
      err(`${file} must not statically import @oh-my-pm/project-memory (lazy import only)`);
    }
    continue;
  }
  err(`${file} references @oh-my-pm/project-memory in production source (use the structural port)`);
}

// 9. v0.3 Phase 3 exact guards. Phase 3 wires capture/compare below the CLI
// without changing any public surface. These assertions fail closed if a Phase 4+
// change (a public capture/compare RuntimeRequest kind, a CLI memory command, a
// new SkillId, a provider->memory dependency) is introduced.
//
// 9a. Runtime.handle() request kinds are unchanged: exactly status/doctor/plan
// plus the unsupported-kind fall-through. No capture/compare kind is dispatched
// there.
if (trackedFiles.includes("runtime/src/runtime.ts")) {
  const runtime = readFileSync("runtime/src/runtime.ts", "utf8");
  for (const kind of ['request.kind === "status"', 'request.kind === "doctor"', 'request.kind === "plan"']) {
    if (!runtime.includes(kind)) {
      err(`runtime/src/runtime.ts must keep the "${kind}" dispatch`);
    }
  }
  // Runtime.handle must not learn a capture/compare kind.
  if (/request\.kind\s*===\s*"(capture|compare|projectBrainCapture|projectBrainCompare)"/.test(runtime)) {
    err("runtime/src/runtime.ts must not dispatch a Project Brain capture/compare request kind");
  }
}
// 9b. No new RuntimeRequest kind for capture/compare in the generated contract.
if (trackedFiles.includes("contracts/generated/ts/runtime.ts")) {
  const runtimeContract = readFileSync("contracts/generated/ts/runtime.ts", "utf8");
  if (/"capture"|"compare"|projectBrainCapture|projectBrainCompare/.test(runtimeContract)) {
    err("contracts/generated/ts/runtime.ts must not add a capture/compare RuntimeRequest kind");
  }
}
// 9c. The Skill registry keeps exactly the five original SkillIds; no new Skill
// is registered for Project Brain state derivation.
if (trackedFiles.includes("contracts/generated/ts/skills.ts")) {
  const skills = readFileSync("contracts/generated/ts/skills.ts", "utf8");
  const match = skills.match(/SKILL_ID_VALUES\s*=\s*\[([^\]]*)\]/);
  if (match === null) {
    err("contracts/generated/ts/skills.ts must declare SKILL_ID_VALUES");
  } else {
    const ids = [...match[1].matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]).sort();
    const expected = ["createHandoff", "deriveNextTasks", "extractRisks", "reviewChanges", "summarizeStatus"].sort();
    if (JSON.stringify(ids) !== JSON.stringify(expected)) {
      err(`SKILL_ID_VALUES must remain the five original ids (found ${ids.join(", ")})`);
    }
  }
}
// The Skills registry must not register a project-brain-state skill.
if (trackedFiles.includes("skills/src/registry.ts")) {
  const registry = readFileSync("skills/src/registry.ts", "utf8");
  if (/projectBrainState|project-brain-state|deriveProjectBrainState/.test(registry)) {
    err("skills/src/registry.ts must not register a Project Brain state skill");
  }
}
// 9d. The Skills derivation module is a pure add: it must not import a Node
// built-in, network, clock, or randomness (covered by the pure-package rule and
// the TS purity scan above) and must not register a SkillId.
if (trackedFiles.includes("skills/src/project-brain-state.ts")) {
  const module = readFileSync("skills/src/project-brain-state.ts", "utf8");
  if (/SkillDescriptor|descriptor:\s*\{|registerSkill|createSkillRegistry/.test(module)) {
    err("skills/src/project-brain-state.ts must not declare or register a Skill");
  }
}
// 9e. v0.3 Phase 4 CLI memory surface guards. Phase 4 adds exactly one new
// top-level command namespace (`memory`) with exactly six subcommands, handled
// at the Node process boundary and never through the legacy Runtime request
// contract. The legacy Runtime request builder must stay memory-free (memory
// never routes through Runtime.handle), and runCli must fail closed on a memory
// command. These assertions fail closed if a seventh subcommand, a Runtime-
// routed memory request, a mutation without preview/apply, or an interactive
// confirmation is introduced.
//
// The legacy Runtime request builder must never learn a Project Brain / memory
// request kind (memory is handled at the process boundary, not via Runtime).
if (trackedFiles.includes("cli/src/request.ts")) {
  const request = readFileSync("cli/src/request.ts", "utf8");
  if (/"memory"|"capture"|"compare"|projectBrain|project_brain/i.test(request)) {
    err("cli/src/request.ts must stay memory-free (memory never routes through the Runtime)");
  }
}
// The nested memory parser must accept EXACTLY the six approved subcommands and
// no seventh. The canonical list is the MEMORY_SUBCOMMANDS constant in
// memory-types.ts; assert it is exactly these six in order.
if (trackedFiles.includes("cli/src/memory-types.ts")) {
  const memoryTypes = readFileSync("cli/src/memory-types.ts", "utf8");
  const listMatch = memoryTypes.match(/MEMORY_SUBCOMMANDS[^=]*=\s*\[([^\]]*)\]/);
  if (listMatch === null) {
    err("cli/src/memory-types.ts must declare the MEMORY_SUBCOMMANDS allowlist");
  } else {
    const subs = [...listMatch[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    const expected = ["capture", "changes", "status", "history", "export", "delete"];
    if (JSON.stringify(subs) !== JSON.stringify(expected)) {
      err(`MEMORY_SUBCOMMANDS must be exactly ${expected.join(", ")} in order (found ${subs.join(", ")})`);
    }
    // No forbidden seventh subcommand may be smuggled in.
    for (const forbidden of ["init", "import", "repair", "migrate", "prune", "config", "sync", "watch", "serve"]) {
      if (subs.includes(forbidden)) {
        err(`MEMORY_SUBCOMMANDS must not include the forbidden subcommand "${forbidden}"`);
      }
    }
  }
}
// The memory parser must gate --apply to capture/export/delete only, require an
// exact confirmation for delete --apply, and use no interactive prompt.
if (trackedFiles.includes("cli/src/memory-parser.ts")) {
  const memoryParser = readFileSync("cli/src/memory-parser.ts", "utf8");
  if (!memoryParser.includes("APPLY_SUBCOMMANDS")) {
    err("cli/src/memory-parser.ts must restrict --apply to an explicit subcommand allowlist");
  }
  if (!/delete\s+--apply\s+requires\s+--confirm/.test(memoryParser)) {
    err("cli/src/memory-parser.ts must require --confirm for delete --apply");
  }
  for (const marker of ["prompt(", "readline", "createInterface", "question("]) {
    if (memoryParser.includes(marker)) {
      err(`cli/src/memory-parser.ts must not add an interactive prompt ("${marker}")`);
    }
  }
}
// runCli must fail closed on a memory command (handled at the process boundary).
if (trackedFiles.includes("cli/src/cli.ts")) {
  const cli = readFileSync("cli/src/cli.ts", "utf8");
  if (!/parsed\.command\s*===\s*"memory"/.test(cli)) {
    err("cli/src/cli.ts must fail closed on the memory command");
  }
  if (!cli.includes("memory command must be handled at the process boundary")) {
    err("cli/src/cli.ts must reject a memory command reaching runCli directly");
  }
}
// The memory process boundary and its collaborators must add no interactive
// prompt anywhere in the memory command path.
for (const file of trackedFiles) {
  if (!file.startsWith("cli/src/memory-") || !file.endsWith(".ts")) continue;
  const contents = readFileSync(file, "utf8");
  for (const marker of ["readline", "createInterface", "prompt("]) {
    if (contents.includes(marker)) {
      err(`${file} must not add an interactive prompt ("${marker}") to the memory path`);
    }
  }
}
// 9f. The Runtime observation adapter is the only bridge from providers to
// capture: no provider source may reference memory, snapshots, capture, or the
// project-memory package (providers stay unaware of persistence).
for (const file of trackedFiles) {
  if (!file.startsWith("providers/src/") || !file.endsWith(".ts")) continue;
  const contents = readFileSync(file, "utf8");
  for (const marker of ["@oh-my-pm/project-memory", "@oh-my-pm/runtime", "commitSnapshotBundle", "ProjectSnapshot", "captureProject"]) {
    if (contents.includes(marker)) {
      err(`${file} references a forbidden capture/memory marker "${marker}"; providers stay persistence-unaware`);
    }
  }
}
// 9g. v0.3 release profile: the self-contained "project-brain" bundle MUST ship
// @oh-my-pm/project-memory so the installed memory commands and the read-only
// project_changes tool resolve without a workspace checkout. The bundle builder
// declares the profile and fails closed if the package is absent. The historical
// v0.2 bundle (built from the immutable tag) is unaffected — it declares no
// profile and ships the ten-tool surface.
if (trackedFiles.includes("tools/release-bundle-utils.mjs")) {
  const bundle = readFileSync("tools/release-bundle-utils.mjs", "utf8");
  if (!bundle.includes('bundleProfile: BUNDLE_PROFILE') && !bundle.includes('"project-brain"')) {
    err("tools/release-bundle-utils.mjs must declare the project-brain release profile");
  }
  if (!bundle.includes("project-memory")) {
    err("tools/release-bundle-utils.mjs must require @oh-my-pm/project-memory in the v0.3 bundle");
  }
}

// 9h. v0.3 Phase 4.1 snapshot-capture chronology guards. The correction adds an
// authoritative capture chronology to the Project Memory manifest (store format
// v2) and makes the default comparison use real capture order. These assertions
// fail closed if the chronology invariants, the production migration, the
// read-safety of migration, the capture-only --migrate-store scope, or the
// removal of the Runtime lexical fallback are regressed.
//
// The internal store format version is exactly 2; the Project Brain schema stays 1.
if (trackedFiles.includes("project-memory/src/types.ts")) {
  const types = readFileSync("project-memory/src/types.ts", "utf8");
  if (!/CURRENT_STORE_FORMAT_VERSION\s*=\s*2\s+as const;/.test(types)) {
    err("project-memory/src/types.ts must set CURRENT_STORE_FORMAT_VERSION = 2 (Phase 4.1)");
  }
  if (!/SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION\s*=\s*1\s+as const;/.test(types)) {
    err("project-memory/src/types.ts must keep SUPPORTED_PROJECT_BRAIN_SCHEMA_VERSION = 1");
  }
  // The manifest carries the chronology fields; snapshotIds stays inventory.
  for (const needle of ["snapshotHistory", "snapshotChronologyOrigin", "SnapshotHistoryEntry"]) {
    if (!types.includes(needle)) {
      err(`project-memory/src/types.ts must declare the chronology surface "${needle}"`);
    }
  }
}
// The manifest integrity body must cover the chronology fields, and the store
// commit must derive the chronology from the snapshot's own capturedAt (never a
// system clock). The store's listSnapshots must derive from snapshotHistory, not
// from the snapshotIds lexical order.
if (trackedFiles.includes("project-memory/src/manifest.ts")) {
  const manifest = readFileSync("project-memory/src/manifest.ts", "utf8");
  if (!manifest.includes("snapshotHistory") || !manifest.includes("snapshotChronologyOrigin")) {
    err("project-memory/src/manifest.ts integrity body must cover the chronology fields");
  }
  if (!manifest.includes("assertManifestChronology")) {
    err("project-memory/src/manifest.ts must enforce the chronology invariants");
  }
}
if (trackedFiles.includes("project-memory/src/store.ts")) {
  const store = readFileSync("project-memory/src/store.ts", "utf8");
  if (!/manifest\.snapshotHistory/.test(store)) {
    err("project-memory/src/store.ts listSnapshots must derive order from snapshotHistory");
  }
  // The chronology capturedAt is the snapshot payload's own, never a clock read.
  if (!store.includes("requireSnapshotCapturedAt")) {
    err("project-memory/src/store.ts must take the chronology capturedAt from the snapshot payload");
  }
  for (const marker of ["Date.now", "new Date(", "referenceNow(", "this.fs.referenceNow"]) {
    if (store.includes(marker)) {
      err(`project-memory/src/store.ts must not read a system clock for chronology ("${marker}")`);
    }
  }
}
// A real production migration 1 -> 2 exists and is registered in the default
// production registry; the migration transform re-derives the recovered
// chronology deterministically.
if (trackedFiles.includes("project-memory/src/migrations.ts")) {
  const migrations = readFileSync("project-memory/src/migrations.ts", "utf8");
  if (!migrations.includes("migration1to2") || !migrations.includes("defaultMigrationRegistry")) {
    err("project-memory/src/migrations.ts must export migration1to2 and defaultMigrationRegistry");
  }
  if (!/fromStoreFormatVersion:\s*1[\s\S]{0,60}toStoreFormatVersion:\s*2/.test(migrations)) {
    err("project-memory/src/migrations.ts must register a 1 -> 2 production migration");
  }
  if (!migrations.includes("recoveredV1")) {
    err("project-memory/src/migrations.ts 1 -> 2 migration must mark the origin recoveredV1");
  }
}
// The default production registry is wired into the Node adapter (so a real v1
// store can be migrated), but migration is NEVER triggered by a read path.
if (trackedFiles.includes("project-memory/src/node-adapter.ts")) {
  const adapter = readFileSync("project-memory/src/node-adapter.ts", "utf8");
  if (!adapter.includes("defaultMigrationRegistry")) {
    err("project-memory/src/node-adapter.ts must wire the default production migration registry");
  }
}
// Read paths must not call migrateProject: migration is explicit only. readManifest,
// listSnapshots, readSnapshot, readEvidence, inspect, and verify never migrate.
if (trackedFiles.includes("project-memory/src/store.ts")) {
  const store = readFileSync("project-memory/src/store.ts", "utf8");
  const readBodies = [
    "async readManifest(",
    "async listSnapshots(",
    "async readSnapshot(",
    "async readEvidence(",
    "async inspect(",
    "async verify(",
  ];
  for (const head of readBodies) {
    const start = store.indexOf(head);
    if (start === -1) continue;
    // Scan a bounded slice of each read method body for a migration trigger.
    const slice = store.slice(start, start + 2400);
    if (/\bawait this\.(migrateProject|applyMigrationPlan)\(/.test(slice)) {
      err(`project-memory/src/store.ts read method "${head.trim()}" must not trigger a migration`);
    }
  }
}
// --migrate-store exists ONLY on memory capture. The parser gates it to capture;
// no other subcommand accepts it.
if (trackedFiles.includes("cli/src/memory-parser.ts")) {
  const parser = readFileSync("cli/src/memory-parser.ts", "utf8");
  if (!parser.includes("--migrate-store")) {
    err("cli/src/memory-parser.ts must define the --migrate-store option");
  }
  if (!/--migrate-store is only valid for capture/.test(parser)) {
    err("cli/src/memory-parser.ts must gate --migrate-store to capture only");
  }
}
if (trackedFiles.includes("cli/src/memory-types.ts")) {
  const memTypes = readFileSync("cli/src/memory-types.ts", "utf8");
  // migrateStore lives on the capture command shape only.
  if (!/MemoryCaptureCommand\s*=\s*[\s\S]{0,900}migrateStore/.test(memTypes)) {
    err("cli/src/memory-types.ts must carry migrateStore on the capture command only");
  }
}
// The Runtime default compare must NOT contain a lexical-order fallback and must
// use the memory chronology (listSnapshots), selecting the immediate predecessor.
if (trackedFiles.includes("runtime/src/projectbrain/compare.ts")) {
  const compare = readFileSync("runtime/src/projectbrain/compare.ts", "utf8");
  if (/lexical/i.test(compare) && !/NOT a lexical|not a lexical|no lexical-order fallback/i.test(compare)) {
    err("runtime/src/projectbrain/compare.ts must not reintroduce a lexical-order selection");
  }
  if (/Fall back to the last two ids in stored order/.test(compare)) {
    err("runtime/src/projectbrain/compare.ts must not keep the lexical-order fallback heuristic");
  }
  if (!compare.includes("listSnapshots")) {
    err("runtime/src/projectbrain/compare.ts default selection must use the capture chronology");
  }
}

if (fail) {
  console.error("validate-boundaries: FAILED");
  process.exit(1);
}
console.log("validate-boundaries: OK");
