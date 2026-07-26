#!/usr/bin/env node
// Repository structure validator (scaffold phase).
// Required paths are checked on disk; allowed/forbidden checks use tracked
// files only, so ignored local folders (e.g. _dev/) never cause failures.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

const REQUIRED_FOLDERS = [
  ".github",
  "docs",
  "contracts",
  "kernel",
  "runtime",
  "planner",
  "providers",
  "skills",
  "cli",
  "installer",
  "tests",
  "tools",
  "examples",
  "mcp-server",
  "distribution",
  "project-memory",
];

const ALLOWED_TOP_FILES = [
  ".editorconfig",
  ".gitignore",
  ".npmrc",
  ".prettierignore",
  ".prettierrc",
  "Cargo.lock",
  "Cargo.toml",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "ROADMAP.md",
  "SECURITY.md",
  "SUPPORT.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "rust-toolchain.toml",
  "tsconfig.base.json",
  "version.json",
];

// Canonical current-development version. version.json is the single source of
// truth; every workspace package and the distribution package pin to it.
const CANONICAL_VERSION = JSON.parse(readFileSync("version.json", "utf8")).version;

const FORBIDDEN_TOP_FOLDERS = ["specs", "_dev", "scripts", "brain", "mcp"];

// 1. Required top-level folders exist on disk.
for (const folder of REQUIRED_FOLDERS) {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    err(`required top-level folder missing: ${folder}/`);
  }
}

// 2 + 4. Tracked top-level folders must be exactly the required set;
// forbidden folders must not be tracked.
const trackedTopFolders = new Set(
  trackedFiles.filter((f) => f.includes("/")).map((f) => f.split("/")[0]),
);
for (const folder of trackedTopFolders) {
  if (FORBIDDEN_TOP_FOLDERS.includes(folder)) {
    err(`forbidden top-level folder is tracked: ${folder}/`);
  } else if (!REQUIRED_FOLDERS.includes(folder)) {
    err(`unexpected top-level folder is tracked: ${folder}/`);
  }
}

// 3. Tracked top-level files must be within the allowed set.
const trackedTopFiles = trackedFiles.filter((f) => !f.includes("/"));
for (const file of trackedTopFiles) {
  if (!ALLOWED_TOP_FILES.includes(file)) {
    err(`unexpected top-level file is tracked: ${file}`);
  }
}

// 5 + 6. Package skeleton files and required package.json fields.
const PACKAGES = [
  "contracts",
  "kernel/binding",
  "runtime",
  "planner",
  "providers",
  "skills",
  "cli",
  "installer",
  "mcp-server",
];
for (const pkg of PACKAGES) {
  for (const file of ["package.json", "tsconfig.json", "src/index.ts", "README.md"]) {
    if (!existsSync(join(pkg, file))) {
      err(`package file missing: ${pkg}/${file}`);
    }
  }
  const pkgJsonPath = join(pkg, "package.json");
  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (pkgJson.private !== true) err(`${pkg}/package.json must set "private": true`);
    if (pkgJson.version !== CANONICAL_VERSION)
      err(`${pkg}/package.json must set "version": "${CANONICAL_VERSION}"`);
    if (pkgJson.type !== "module") err(`${pkg}/package.json must set "type": "module"`);
  }
}

// 7. Kernel crate manifest and source modules exist.
const KERNEL_SOURCES = [
  "kernel/crate/Cargo.toml",
  "kernel/crate/src/lib.rs",
  "kernel/crate/src/errors.rs",
  "kernel/crate/src/state.rs",
  "kernel/crate/src/registry.rs",
  "kernel/crate/src/validation.rs",
  "kernel/crate/src/update_guard.rs",
];
for (const file of KERNEL_SOURCES) {
  if (!existsSync(file)) err(`kernel source file missing: ${file}`);
}

// 7b. Runtime foundation and kernel binding files exist.
const RUNTIME_SOURCES = [
  "runtime/src/index.ts",
  "runtime/src/types.ts",
  "runtime/src/errors.ts",
  "runtime/src/runtime.ts",
  "runtime/src/plan.ts",
  "runtime/src/plan-utils.ts",
  "runtime/test/runtime.test.ts",
  "runtime/test/plan.test.ts",
  "runtime/test/plan-utils.test.ts",
  "runtime/test/purity.test.ts",
  "kernel/binding/src/index.ts",
  "kernel/binding/test/kernel-api.test.ts",
];

// 7b2. Kernel WASM binding files exist.
const WASM_BINDING_SOURCES = [
  "tools/build-kernel-wasm.mjs",
  "kernel/crate/src/wasm.rs",
  "kernel/binding/src/node.ts",
  "kernel/binding/src/status.ts",
  "kernel/binding/test/wasm-kernel-api.test.ts",
];
for (const file of WASM_BINDING_SOURCES) {
  if (!existsSync(file)) err(`kernel wasm binding file missing: ${file}`);
}
for (const file of RUNTIME_SOURCES) {
  if (!existsSync(file)) err(`runtime foundation file missing: ${file}`);
}

// 7c. CLI foundation files exist.
const CLI_SOURCES = [
  "cli/src/index.ts",
  "cli/src/types.ts",
  "cli/src/parser.ts",
  "cli/src/request.ts",
  "cli/src/format.ts",
  "cli/src/cli.ts",
  "cli/test/parser.test.ts",
  "cli/test/request.test.ts",
  "cli/test/format.test.ts",
  "cli/test/cli.test.ts",
  "cli/test/purity.test.ts",
  "cli/README.md",
  "cli/bin/oh-my-pm.mjs",
  "cli/test/bin.test.ts",
  "cli/test/local-runtime-smoke.test.ts",
  "cli/src/install-preview.ts",
  "cli/test/install-preview.test.ts",
  "cli/src/node-project-documents.ts",
  "cli/test/node-project-documents.test.ts",
  "cli/src/project-document-rules.ts",
  "cli/test/project-document-rules.test.ts",
  "cli/src/project-config.ts",
  "cli/test/project-config.test.ts",
  // v0.3 Phase 4: the preview-first `memory` CLI surface.
  "cli/src/memory-types.ts",
  "cli/src/memory-parser.ts",
  "cli/src/memory-preview.ts",
  "cli/src/memory-project.ts",
  "cli/src/memory-process.ts",
  "cli/src/memory-format.ts",
  "cli/test/memory-parser.test.ts",
  "cli/test/memory-project-config.test.ts",
  "cli/test/memory-process.test.ts",
  "cli/test/memory-boundary.test.ts",
  "cli/test/memory-e2e.test.ts",
];
for (const file of CLI_SOURCES) {
  if (!existsSync(file)) err(`cli foundation file missing: ${file}`);
}

// 7d. Provider framework files exist.
const PROVIDER_SOURCES = [
  "providers/src/index.ts",
  "providers/src/types.ts",
  "providers/src/errors.ts",
  "providers/src/normalize.ts",
  "providers/src/local.ts",
  "providers/src/registry.ts",
  "providers/test/normalize.test.ts",
  "providers/test/local.test.ts",
  "providers/test/registry.test.ts",
  "providers/test/purity.test.ts",
  "providers/test/errors.test.ts",
  "providers/test/async-migration.test.ts",
];
for (const file of PROVIDER_SOURCES) {
  if (!existsSync(file)) err(`provider framework file missing: ${file}`);
}

// 7d2. GitHub read-only provider modules, fixtures, and tests exist.
const GITHUB_PROVIDER_SOURCES = [
  "providers/src/github/constants.ts",
  "providers/src/github/types.ts",
  "providers/src/github/query.ts",
  "providers/src/github/transport.ts",
  "providers/src/github/normalize.ts",
  "providers/src/github/provider.ts",
  "providers/src/github/index.ts",
  "providers/test/github-query.test.ts",
  "providers/test/github-transport.test.ts",
  "providers/test/github-normalize.test.ts",
  "providers/test/github-provider.test.ts",
  "providers/test/fixtures/github/repository.json",
  "providers/test/fixtures/github/issues.json",
  "providers/test/fixtures/github/issue.json",
  "providers/test/fixtures/github/pull-request.json",
  "providers/test/fixtures/github/search.json",
];
for (const file of GITHUB_PROVIDER_SOURCES) {
  if (!existsSync(file)) err(`github provider file missing: ${file}`);
}

// 7e. Planner foundation files exist.
const PLANNER_SOURCES = [
  "planner/src/index.ts",
  "planner/src/types.ts",
  "planner/src/intent.ts",
  "planner/src/context.ts",
  "planner/src/graph.ts",
  "planner/src/providers.ts",
  "planner/src/planner.ts",
  "planner/src/runtime.ts",
  "planner/test/intent.test.ts",
  "planner/test/context.test.ts",
  "planner/test/graph.test.ts",
  "planner/test/planner.test.ts",
  "planner/test/runtime.test.ts",
  "planner/test/purity.test.ts",
];
for (const file of PLANNER_SOURCES) {
  if (!existsSync(file)) err(`planner foundation file missing: ${file}`);
}

// 7f. Skills foundation files exist.
const SKILLS_SOURCES = [
  "skills/src/index.ts",
  "skills/src/types.ts",
  "skills/src/helpers.ts",
  "skills/src/summarize-status.ts",
  "skills/src/extract-risks.ts",
  "skills/src/derive-next-tasks.ts",
  "skills/src/create-handoff.ts",
  "skills/src/markdown-project.ts",
  "skills/src/project-signals.ts",
  "skills/src/review-changes.ts",
  "skills/src/registry.ts",
  "skills/test/helpers.test.ts",
  "skills/test/summarize-status.test.ts",
  "skills/test/extract-risks.test.ts",
  "skills/test/derive-next-tasks.test.ts",
  "skills/test/create-handoff.test.ts",
  "skills/test/markdown-project.test.ts",
  "skills/test/project-signals.test.ts",
  "skills/test/review-changes.test.ts",
  "skills/test/registry.test.ts",
  "skills/test/purity.test.ts",
];
for (const file of SKILLS_SOURCES) {
  if (!existsSync(file)) err(`skills foundation file missing: ${file}`);
}

// 7g. Examples package files exist.
const EXAMPLES_SOURCES = [
  "examples/README.md",
  "examples/package.json",
  "examples/tsconfig.json",
  "examples/src/index.ts",
  "examples/src/kernel.ts",
  "examples/src/runtime.ts",
  "examples/src/status.ts",
  "examples/src/doctor.ts",
  "examples/src/plan.ts",
  "examples/test/status.test.ts",
  "examples/test/doctor.test.ts",
  "examples/test/plan.test.ts",
  "examples/test/purity.test.ts",
  "examples/src/installer.ts",
  "examples/test/installer.test.ts",
  "examples/test/installer-node-adapter.test.ts",
];
for (const file of EXAMPLES_SOURCES) {
  if (!existsSync(file)) err(`examples file missing: ${file}`);
}

// 7g2. Public Markdown project fixture files exist.
const MARKDOWN_PROJECT_FIXTURES = [
  "examples/fixtures/markdown-project/README.md",
  "examples/fixtures/markdown-project/docs/status.md",
  "examples/fixtures/markdown-project/docs/risks.md",
  "examples/fixtures/markdown-project/docs/decisions.md",
  "examples/fixtures/markdown-project/oh-my-pm.config.json",
  "examples/fixtures/markdown-project/docs/archive/obsolete-plan.md",
  "examples/fixtures/markdown-project/misc/scratch.md",
];
for (const file of MARKDOWN_PROJECT_FIXTURES) {
  if (!existsSync(file)) err(`markdown project fixture missing: ${file}`);
}

// 7g2b. Deterministic project-signal fixtures, extraction E2E, and docs.
const PROJECT_SIGNAL_SOURCES = [
  "examples/fixtures/project-signals/README.md",
  "examples/fixtures/project-signals/planning.md",
  "examples/fixtures/project-signals/fa-signals.md",
  "mcp-server/test/extraction-e2e.test.ts",
  "docs/deterministic-extraction.md",
];
for (const file of PROJECT_SIGNAL_SOURCES) {
  if (!existsSync(file)) err(`project signal file missing: ${file}`);
}

// 7g3. Local read-only MCP server files exist.
const MCP_SERVER_SOURCES = [
  "mcp-server/package.json",
  "mcp-server/tsconfig.json",
  "mcp-server/README.md",
  "mcp-server/src/types.ts",
  "mcp-server/src/project-tool-runner.ts",
  "mcp-server/src/server.ts",
  "mcp-server/src/index.ts",
  "mcp-server/bin/oh-my-pm-mcp.mjs",
  "mcp-server/test/project-tool-runner.test.ts",
  "mcp-server/test/server.test.ts",
  "tools/check-mcp-server.mjs",
];
for (const file of MCP_SERVER_SOURCES) {
  if (!existsSync(file)) err(`mcp server file missing: ${file}`);
}

// 7g4. Local installation and onboarding tooling exists.
const LOCAL_INSTALL_SOURCES = [
  "tools/local-install-utils.mjs",
  "tools/install-local.mjs",
  "tools/check-local-install.mjs",
  "tools/print-mcp-client-config.mjs",
  "tools/test/local-install-utils.test.mjs",
  "tools/test/local-install-cli.test.mjs",
  "tools/test/local-install-check.test.mjs",
  "tools/test/mcp-client-config.test.mjs",
  "docs/getting-started.md",
];
for (const file of LOCAL_INSTALL_SOURCES) {
  if (!existsSync(file)) err(`local install tooling file missing: ${file}`);
}

// 7g5. Portable release bundle tooling, distribution package, and metadata.
const RELEASE_BUNDLE_SOURCES = [
  "version.json",
  "CHANGELOG.md",
  "distribution/package.json",
  "distribution/README.md",
  "distribution/bin/oh-my-pm.mjs",
  "distribution/bin/oh-my-pm-mcp.mjs",
  "cli/src/local-process.ts",
  "tools/check-version-consistency.mjs",
  "tools/release-bundle-utils.mjs",
  "tools/build-release-bundle.mjs",
  "tools/check-release-bundle.mjs",
  "docs/releases/v0.1.0.md",
  "docs/releases/v0.2.0.md",
  "tools/test/check-version-consistency.test.mjs",
  "tools/test/release-bundle-utils.test.mjs",
  "tools/test/release-bundle-e2e.test.mjs",
];
for (const file of RELEASE_BUNDLE_SOURCES) {
  if (!existsSync(file)) err(`release bundle file missing: ${file}`);
}

// 7g6. Deterministic release archive tooling, tests, workflow, and docs.
const RELEASE_ARCHIVE_SOURCES = [
  "tools/release-archive-utils.mjs",
  "tools/build-release-archives.mjs",
  "tools/check-release-archives.mjs",
  "tools/check-release-archive-reproducibility.mjs",
  "tools/release-archive-utils.test.mjs",
  "tools/build-release-archives.test.mjs",
  "tools/check-release-archives.test.mjs",
  "tools/check-release-archive-reproducibility.test.mjs",
  ".github/workflows/release-v0.1.yml",
  "docs/releases/publishing-v0.1.0.md",
];
for (const file of RELEASE_ARCHIVE_SOURCES) {
  if (!existsSync(file)) err(`release archive file missing: ${file}`);
}

// 7g6b. GitHub read-only provider surface across CLI, MCP, docs, and the
// manual live-smoke tool.
const GITHUB_FEATURE_SOURCES = [
  "cli/src/github-token.ts",
  "cli/test/github-parser.test.ts",
  "cli/test/github-request.test.ts",
  "cli/test/github-process.test.ts",
  "cli/test/github-token.test.ts",
  "mcp-server/src/github-tool-runner.ts",
  "mcp-server/src/github-tool-runner.test.ts",
  "mcp-server/test/github-e2e.test.ts",
  "tools/check-github-provider-live.mjs",
  "docs/providers/github.md",
  "docs/providers/github-item-comments.md",
  "docs/providers/github-pr-reviews.md",
  "skills/test/github-review-signals.test.ts",
];
for (const file of GITHUB_FEATURE_SOURCES) {
  if (!existsSync(file)) err(`github feature file missing: ${file}`);
}

// 7g7. Portable release-bundle installer surfaces, repository wrapper,
// read-only installed-state verifier, and their tests.
const RELEASE_INSTALL_SOURCES = [
  "distribution/bin/oh-my-pm-install.mjs",
  "distribution/libexec/release-install-core.mjs",
  "distribution/libexec/release-install-core.test.mjs",
  "tools/install-release-bundle.mjs",
  "tools/check-release-install.mjs",
  "tools/install-release-bundle.test.mjs",
  "tools/check-release-install.test.mjs",
  "tools/release-install-e2e.test.mjs",
];
for (const file of RELEASE_INSTALL_SOURCES) {
  if (!existsSync(file)) err(`release install file missing: ${file}`);
}

// 7g7b. Safe temporary-workspace helper and its regression tests. All test/tool
// recursive cleanup of temp workspaces routes through this helper's ownership-
// verified guard rather than deleting an inferred parent directory.
const SAFE_TEMP_SOURCES = [
  "tools/test/safe-temp-workspace.mjs",
  "tools/test/safe-temp-workspace.test.mjs",
];
for (const file of SAFE_TEMP_SOURCES) {
  if (!existsSync(file)) err(`safe temporary workspace file missing: ${file}`);
}

// The distribution package must be private and carry no publish config.
if (existsSync("distribution/package.json")) {
  const distJson = JSON.parse(readFileSync("distribution/package.json", "utf8"));
  if (distJson.private !== true) err(`distribution/package.json must set "private": true`);
  if (distJson.version !== CANONICAL_VERSION)
    err(`distribution/package.json must set "version": "${CANONICAL_VERSION}"`);
  if (distJson.publishConfig !== undefined)
    err("distribution/package.json must not set publishConfig");
}

// Every first-party runtime package must declare an explicit files surface.
const FILES_SURFACE_PACKAGES = [
  "contracts",
  "kernel/binding",
  "runtime",
  "planner",
  "providers",
  "skills",
  "cli",
  "installer",
  "mcp-server",
];
for (const pkg of FILES_SURFACE_PACKAGES) {
  const pkgJsonPath = join(pkg, "package.json");
  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (!Array.isArray(pkgJson.files) || pkgJson.files.length === 0) {
      err(`${pkg}/package.json must declare an explicit non-empty "files" array`);
    }
  }
}

// 7g8. Provider configuration and diagnostics surface: pure schema/settings,
// the read-only config loader, diagnostics contracts, formatting, the MCP
// diagnostics runner, and their tests and docs.
const PROVIDER_CONFIG_SOURCES = [
  "providers/src/config.ts",
  "providers/src/settings.ts",
  "providers/test/config.test.ts",
  "providers/test/settings.test.ts",
  "cli/src/provider-config.ts",
  "cli/src/provider-diagnostics.ts",
  "cli/src/provider-format.ts",
  "cli/test/provider-config.test.ts",
  "cli/test/provider-diagnostics.test.ts",
  "cli/test/provider-format.test.ts",
  "cli/test/provider-command.test.ts",
  "cli/test/provider-config-e2e.test.ts",
  "mcp-server/src/provider-diagnostics-runner.ts",
  "mcp-server/src/provider-diagnostics-runner.test.ts",
  "docs/providers/configuration.md",
  "docs/providers/diagnostics.md",
];
for (const file of PROVIDER_CONFIG_SOURCES) {
  if (!existsSync(file)) err(`provider configuration/diagnostics file missing: ${file}`);
}

// 7g9. GitHub source-selection surface: the pure selection model, canonical
// query builders/parsers, provider behavior, CLI parser/process, and docs.
const GITHUB_SOURCE_SELECTION_SOURCES = [
  "providers/src/github/selection.ts",
  "providers/test/github-selection.test.ts",
  "providers/test/github-source-provider.test.ts",
  "cli/test/github-source-parser.test.ts",
  "cli/test/github-source-process.test.ts",
  "cli/test/github-source-e2e.test.ts",
  "docs/providers/github-source-selection.md",
];
for (const file of GITHUB_SOURCE_SELECTION_SOURCES) {
  if (!existsSync(file)) err(`github source-selection file missing: ${file}`);
}

// 7h. Installer foundation files exist.
const INSTALLER_SOURCES = [
  "installer/README.md",
  "installer/src/index.ts",
  "installer/src/types.ts",
  "installer/src/errors.ts",
  "installer/src/validate.ts",
  "installer/src/manifest.ts",
  "installer/src/installer.ts",
  "installer/src/fixtures.ts",
  "installer/src/paths.ts",
  "installer/src/memory-filesystem.ts",
  "installer/src/filesystem-plan.ts",
  "installer/src/node-filesystem.ts",
  "installer/src/execution-validate.ts",
  "installer/src/memory-write-filesystem.ts",
  "installer/src/executor.ts",
  "installer/src/node-write-filesystem.ts",
  "installer/src/package-manifest.ts",
  "installer/test/package-manifest.test.ts",
  "installer/src/package-assembly.ts",
  "installer/test/package-assembly.test.ts",
  "installer/src/archive-plan.ts",
  "installer/test/archive-plan.test.ts",
  "installer/src/release-metadata.ts",
  "installer/test/release-metadata.test.ts",
  "installer/src/release-integrity.ts",
  "installer/test/release-integrity.test.ts",
  "installer/src/release-channel.ts",
  "installer/test/release-channel.test.ts",
  "installer/src/update-policy.ts",
  "installer/test/update-policy.test.ts",
  "installer/src/update-impact.ts",
  "installer/test/update-impact.test.ts",
  "installer/src/rollback-impact.ts",
  "installer/test/rollback-impact.test.ts",
  "installer/src/decision-report.ts",
  "installer/test/decision-report.test.ts",
  "installer/src/audit-events.ts",
  "installer/test/audit-events.test.ts",
  "installer/src/audit-export.ts",
  "installer/test/audit-export.test.ts",
  "installer/src/write-capability.ts",
  "installer/test/write-capability.test.ts",
  "installer/src/write-approval.ts",
  "installer/test/write-approval.test.ts",
  "installer/src/write-execution-plan.ts",
  "installer/test/write-execution-plan.test.ts",
  "installer/src/write-confirmation.ts",
  "installer/test/write-confirmation.test.ts",
  "installer/src/write-adapter-contract.ts",
  "installer/test/write-adapter-contract.test.ts",
  "installer/src/write-dry-run-envelope.ts",
  "installer/test/write-dry-run-envelope.test.ts",
  "installer/src/release-readiness.ts",
  "installer/test/release-readiness.test.ts",
  "installer/src/v0-release-candidate.ts",
  "installer/test/v0-release-candidate.test.ts",
  "installer/src/public-v0-release-notes.ts",
  "installer/test/public-v0-release-notes.test.ts",
  "installer/src/release-artifact-plan.ts",
  "installer/test/release-artifact-plan.test.ts",
  "installer/src/local-artifact-assembly-envelope.ts",
  "installer/test/local-artifact-assembly-envelope.test.ts",
  "installer/src/artifact-creation-permission.ts",
  "installer/test/artifact-creation-permission.test.ts",
  "installer/src/local-artifact-creation-plan.ts",
  "installer/test/local-artifact-creation-plan.test.ts",
  "installer/src/local-artifact-adapter-contract.ts",
  "installer/test/local-artifact-adapter-contract.test.ts",
  "installer/src/local-artifact-confirmation.ts",
  "installer/test/local-artifact-confirmation.test.ts",
  "installer/test/validate.test.ts",
  "installer/test/manifest.test.ts",
  "installer/test/installer.test.ts",
  "installer/test/fixtures.test.ts",
  "installer/test/purity.test.ts",
  "installer/test/paths.test.ts",
  "installer/test/memory-filesystem.test.ts",
  "installer/test/filesystem-plan.test.ts",
  "installer/test/node-filesystem.test.ts",
  "installer/test/execution-validate.test.ts",
  "installer/test/memory-write-filesystem.test.ts",
  "installer/test/executor.test.ts",
  "installer/test/node-write-filesystem.test.ts",
];
for (const file of INSTALLER_SOURCES) {
  if (!existsSync(file)) err(`installer foundation file missing: ${file}`);
}

// 8. Generated contract domain files and barrels exist.
const CONTRACT_DOMAINS = [
  "core",
  "kernel",
  "runtime",
  "planner",
  "projectbrain",
  "providers",
  "skills",
  "cli",
  "installer",
];
const REQUIRED_GENERATED = [
  ...CONTRACT_DOMAINS.map((d) => `contracts/generated/ts/${d}.ts`),
  "contracts/generated/ts/index.ts",
  ...CONTRACT_DOMAINS.map((d) => `contracts/generated/rust/${d}.rs`),
  "contracts/generated/rust/mod.rs",
];
for (const file of REQUIRED_GENERATED) {
  if (!existsSync(file)) err(`generated contracts file missing: ${file}`);
}

// 8b. v0.3 Project Brain (Phase 0) contract surface.
// The six versioned contract families and the schema-version constant exist in
// both generated languages, the schema domain exists, and the barrels expose it.
// Phase 0 is contracts-only: no persistence, no behavior, no field that would
// store an absolute path or a credential.
const PROJECT_BRAIN_SCHEMA = "contracts/schema/projectbrain.schema.json";
if (!existsSync(PROJECT_BRAIN_SCHEMA)) {
  err(`project brain schema domain missing: ${PROJECT_BRAIN_SCHEMA}`);
}
const PROJECT_BRAIN_GENERATED = {
  ts: "contracts/generated/ts/projectbrain.ts",
  rust: "contracts/generated/rust/projectbrain.rs",
};
for (const file of Object.values(PROJECT_BRAIN_GENERATED)) {
  if (!existsSync(file)) err(`project brain generated module missing: ${file}`);
}
const PROJECT_BRAIN_CONTRACTS = [
  "ProjectIdentity",
  "EvidenceRecord",
  "ProjectState",
  "ProjectSnapshot",
  "ChangeSet",
  "Freshness",
];
if (existsSync(PROJECT_BRAIN_GENERATED.ts) && existsSync(PROJECT_BRAIN_GENERATED.rust)) {
  const pbTs = readFileSync(PROJECT_BRAIN_GENERATED.ts, "utf8");
  const pbRust = readFileSync(PROJECT_BRAIN_GENERATED.rust, "utf8");
  for (const name of PROJECT_BRAIN_CONTRACTS) {
    // Every primary contract exists in both languages and carries schemaVersion.
    if (!pbTs.includes(`export interface ${name} {`)) {
      err(`project brain TS contract missing: ${name}`);
    } else if (!/schemaVersion: number;/.test(pbTs.split(`export interface ${name} {`)[1].split("}")[0])) {
      err(`project brain TS contract ${name} must carry schemaVersion`);
    }
    if (!pbRust.includes(`pub struct ${name} {`)) {
      err(`project brain Rust contract missing: ${name}`);
    } else if (!/pub schema_version: i64,/.test(pbRust.split(`pub struct ${name} {`)[1].split("}")[0])) {
      err(`project brain Rust contract ${name} must carry schemaVersion`);
    }
  }
  // The schema version is a generated constant in both languages.
  if (!pbTs.includes("export const PROJECT_BRAIN_SCHEMA_VERSION = 1 as const;")) {
    err("project brain TS schema-version constant missing or not 1");
  }
  if (!pbRust.includes("pub fn project_brain_schema_version() -> i64 {")) {
    err("project brain Rust schema-version function missing");
  }
  // Phase 0 privacy invariants: no absolute-path field on identity, no
  // credential/body field on evidence. Match generated field declarations only,
  // never doc-comment prose (doc lines start with `/**` in TS and `///` in Rust).
  const FORBIDDEN_FIELD_DECLS = [
    { ts: /^\s*absolutePath\??:/m, rust: /^\s*pub absolute_path:/m, why: "absolute-path field" },
    { ts: /^\s*token\??:/m, rust: /^\s*pub token:/m, why: "token field" },
    { ts: /^\s*authorization\??:/m, rust: /^\s*pub authorization:/m, why: "authorization field" },
    { ts: /^\s*bearer\??:/m, rust: /^\s*pub bearer:/m, why: "bearer field" },
    { ts: /^\s*body\??:/m, rust: /^\s*pub body:/m, why: "raw-body field" },
  ];
  for (const { ts, rust, why } of FORBIDDEN_FIELD_DECLS) {
    if (ts.test(pbTs)) err(`project brain TS must not declare a ${why}`);
    if (rust.test(pbRust)) err(`project brain Rust must not declare a ${why}`);
  }
}

// 8c. v0.3 Project Brain (Phase 1) pure Kernel surface. Phase 1 adds the pure,
// deterministic Kernel module, its integration tests, golden fixtures, and the
// Phase 1 report. These files must exist; the version stays 0.2.0 (enforced via
// CANONICAL_VERSION above); the default MCP surface stays exactly ten tools; and the
// binding surface (WASM exports, KernelApi) stays frozen (enforced in
// validate-boundaries.mjs). No persistence, no application-state write.
const PROJECT_BRAIN_KERNEL_SOURCES = [
  "kernel/crate/src/projectbrain/mod.rs",
  "kernel/crate/src/projectbrain/error.rs",
  "kernel/crate/src/projectbrain/limits.rs",
  "kernel/crate/src/projectbrain/normalize.rs",
  "kernel/crate/src/projectbrain/canonical.rs",
  "kernel/crate/src/projectbrain/identifiers.rs",
  "kernel/crate/src/projectbrain/fingerprint.rs",
  "kernel/crate/src/projectbrain/freshness.rs",
  "kernel/crate/src/projectbrain/time.rs",
  "kernel/crate/src/projectbrain/diff.rs",
];
for (const file of PROJECT_BRAIN_KERNEL_SOURCES) {
  if (!existsSync(file)) err(`project brain Phase 1 kernel source missing: ${file}`);
}
// lib.rs must expose the pure module.
if (existsSync("kernel/crate/src/lib.rs")) {
  const lib = readFileSync("kernel/crate/src/lib.rs", "utf8");
  if (!lib.includes("pub mod projectbrain;")) {
    err("kernel/crate/src/lib.rs must declare pub mod projectbrain (Phase 1)");
  }
}
const PROJECT_BRAIN_TEST_SOURCES = [
  "kernel/crate/tests/projectbrain_normalization.rs",
  "kernel/crate/tests/projectbrain_identifiers.rs",
  "kernel/crate/tests/projectbrain_fingerprints.rs",
  "kernel/crate/tests/projectbrain_freshness.rs",
  "kernel/crate/tests/projectbrain_diff.rs",
  "kernel/crate/tests/projectbrain_purity.rs",
];
for (const file of PROJECT_BRAIN_TEST_SOURCES) {
  if (!existsSync(file)) err(`project brain Phase 1 test missing: ${file}`);
}
const PROJECT_BRAIN_FIXTURES = [
  "examples/fixtures/project-brain/state-unordered.json",
  "examples/fixtures/project-brain/state-normalized.json",
  "examples/fixtures/project-brain/state-fingerprint.txt",
  "examples/fixtures/project-brain/snapshot-previous.json",
  "examples/fixtures/project-brain/snapshot-current.json",
  "examples/fixtures/project-brain/evidence-previous.json",
  "examples/fixtures/project-brain/evidence-current.json",
  "examples/fixtures/project-brain/changes-expected.json",
  "examples/fixtures/project-brain/freshness-known.json",
  "examples/fixtures/project-brain/freshness-unknown.json",
];
for (const file of PROJECT_BRAIN_FIXTURES) {
  if (!existsSync(file)) err(`project brain Phase 1 fixture missing: ${file}`);
}
if (!existsSync("docs/v0.3/phase-1-kernel.md")) {
  err("docs/v0.3/phase-1-kernel.md (Phase 1 report) missing");
}
// The Kernel crate manifest must remain pinned to the canonical version.
if (existsSync("kernel/crate/Cargo.toml")) {
  const cargo = readFileSync("kernel/crate/Cargo.toml", "utf8");
  if (!new RegExp(`^version = "${CANONICAL_VERSION.replace(/\./g, "\\.")}"`, "m").test(cargo)) {
    err(`kernel/crate/Cargo.toml version must remain ${CANONICAL_VERSION}`);
  }
}
// The default MCP server keeps the ten approved v0.2 tools. Phase 5 may append
// exactly one conditional read-only source/workspace tool.
const MCP_TEN_TOOLS = [
  "project_brief",
  "project_risks",
  "project_next",
  "project_handoff",
  "github_project_brief",
  "github_project_risks",
  "github_project_next",
  "github_project_handoff",
  "provider_status",
  "github_provider_diagnostics",
];
const SOURCE_V03_PHASE5_MCP_TOOL = "project_changes";
const LEGACY_V02_MCP_TOOL_COUNT = 10;
const SOURCE_V03_PHASE5_MCP_TOOL_COUNT = 11;
const PROJECT_BRAIN_MCP_WRITE_TOOL_COUNT = 0;
const PROJECT_BRAIN_MCP_READ_TOOL_COUNT = 1;
if (
  MCP_TEN_TOOLS.length !== LEGACY_V02_MCP_TOOL_COUNT ||
  SOURCE_V03_PHASE5_MCP_TOOL_COUNT !==
    LEGACY_V02_MCP_TOOL_COUNT + PROJECT_BRAIN_MCP_READ_TOOL_COUNT ||
  PROJECT_BRAIN_MCP_WRITE_TOOL_COUNT !== 0
) {
  err("Phase 5 MCP tool-count constants are inconsistent");
}
if (existsSync("mcp-server/src/server.ts")) {
  const server = readFileSync("mcp-server/src/server.ts", "utf8");
  // Every approved tool name must appear as a quoted string literal (tools are
  // registered with heterogeneous styles: bare-string first-arg for local tools,
  // `name: "..."` for GitHub tools). The authoritative ordering assertion is the
  // runtime mcp:smoke check; here we assert presence and reject any extra
  // project_*/github_* tool literal that is not in the approved set.
  for (const name of MCP_TEN_TOOLS) {
    if (!server.includes(`"${name}"`)) {
      err(`mcp-server/src/server.ts must register the tool "${name}"`);
    }
  }
  const toolLiterals = new Set(
    [...server.matchAll(/"((?:project|github)_[a-z_]+)"/g)].map((m) => m[1]),
  );
  for (const literal of toolLiterals) {
    // Ignore stable error/reason identifiers that share the prefix but are not
    // tool names (they carry a suffix like "_failed"/"_invalid").
    if (MCP_TEN_TOOLS.includes(literal)) continue;
    if (literal === SOURCE_V03_PHASE5_MCP_TOOL) continue;
    if (/_(failed|invalid|error|required|missing|unavailable)/.test(literal)) continue;
    err(`mcp-server/src/server.ts registers an unexpected tool literal "${literal}"`);
  }
  if (!server.includes("if (executeProjectChanges !== undefined)")) {
    err("project_changes registration must require an injected executor");
  }
  if (!server.includes('server.registerTool(\n      "project_changes"')) {
    err("Phase 5 project_changes registration is missing");
  }
}
for (const file of [
  "mcp-server/src/project-changes-projector.ts",
  "mcp-server/src/project-changes-runner.ts",
  "mcp-server/src/project-changes-loader.ts",
  "docs/v0.3/phase-5-mcp.md",
]) {
  if (!existsSync(file)) err(`Phase 5 file missing: ${file}`);
}

// 9 + 10. CI workflow exists. The only release-publishing workflows allowed are
// the dedicated, manually gated release-v0.1.yml (historical, immutable v0.1.0),
// release-v0.2-rc.yml (manually gated v0.2 release candidate), and
// release-v0.2.yml (manually gated v0.2 stable). No other workflow may contain
// npm-publish or GitHub-Release markers, and no other workflow may be
// release-named.
const workflowsDir = ".github/workflows";
if (!existsSync(join(workflowsDir, "ci.yml"))) {
  err(".github/workflows/ci.yml missing");
}
const RELEASE_MARKERS = ["npm publish", "softprops/action-gh-release"];
const ALLOWED_RELEASE_WORKFLOWS = new Set([
  "release-v0.1.yml",
  "release-v0.2-rc.yml",
  "release-v0.2.yml",
]);
// The v0.2 RC release workflow must exist.
if (!existsSync(join(workflowsDir, "release-v0.2-rc.yml"))) {
  err(".github/workflows/release-v0.2-rc.yml missing");
}
// The v0.2 stable release workflow must exist.
if (!existsSync(join(workflowsDir, "release-v0.2.yml"))) {
  err(".github/workflows/release-v0.2.yml missing");
}
if (existsSync(workflowsDir)) {
  for (const name of readdirSync(workflowsDir)) {
    const path = join(workflowsDir, name);
    if (!statSync(path).isFile()) continue;
    if (ALLOWED_RELEASE_WORKFLOWS.has(name)) {
      // The dedicated release workflows are validated in detail by
      // validate-boundaries.mjs; they legitimately use gh release / tags.
      continue;
    }
    if (name.toLowerCase().includes("release")) {
      err(
        `unexpected release workflow (only ${[...ALLOWED_RELEASE_WORKFLOWS].join(", ")} are allowed): ${path}`,
      );
      continue;
    }
    const contents = readFileSync(path, "utf8");
    for (const marker of [...RELEASE_MARKERS, "gh release", "refs/tags"]) {
      if (contents.includes(marker)) {
        err(`workflow ${path} contains release marker "${marker}"`);
      }
    }
  }
}

// 8. v0.3 Phase 2 local project memory adapter. The private @oh-my-pm/project-
// memory package is the explicit application-state persistence boundary. It must
// be private, pinned to the canonical version, type: module, declare an explicit
// files surface, carry NO dependencies or devDependencies of any kind, and ship
// the expected source and test modules. It is intentionally NOT part of the v0.2
// release bundle (the bundle references an explicit package list that excludes
// it), so no release-inventory check needs to change.
const PROJECT_MEMORY_DIR = "project-memory";
if (existsSync(PROJECT_MEMORY_DIR)) {
  const pkgJsonPath = join(PROJECT_MEMORY_DIR, "package.json");
  if (!existsSync(pkgJsonPath)) {
    err("project-memory/package.json missing");
  } else {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (pkgJson.name !== "@oh-my-pm/project-memory") {
      err('project-memory/package.json must be named "@oh-my-pm/project-memory"');
    }
    if (pkgJson.private !== true) err('project-memory/package.json must set "private": true');
    if (pkgJson.version !== CANONICAL_VERSION) {
      err(`project-memory/package.json must set "version": "${CANONICAL_VERSION}"`);
    }
    if (pkgJson.type !== "module") err('project-memory/package.json must set "type": "module"');
    if (!Array.isArray(pkgJson.files) || pkgJson.files.length === 0) {
      err('project-memory/package.json must declare a non-empty "files" array');
    }
    // The adapter must introduce no dependency of any kind — it is Node built-ins
    // only. An empty object is allowed; any key is not.
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
      const deps = pkgJson[field];
      if (deps && typeof deps === "object" && Object.keys(deps).length > 0) {
        err(`project-memory/package.json must declare no ${field}`);
      }
    }
    if (pkgJson.scripts && typeof pkgJson.scripts.postinstall === "string") {
      err("project-memory/package.json must not declare a postinstall script");
    }
  }
  for (const file of [
    "project-memory/tsconfig.json",
    "project-memory/README.md",
    "project-memory/src/index.ts",
    "project-memory/src/types.ts",
    "project-memory/src/errors.ts",
    "project-memory/src/limits.ts",
    "project-memory/src/canonical-json.ts",
    "project-memory/src/integrity.ts",
    "project-memory/src/data-location.ts",
    "project-memory/src/path-safety.ts",
    "project-memory/src/privacy.ts",
    "project-memory/src/filesystem.ts",
    "project-memory/src/manifest.ts",
    "project-memory/src/migrations.ts",
    "project-memory/src/lock.ts",
    "project-memory/src/store.ts",
    "project-memory/src/node-adapter.ts",
  ]) {
    if (!existsSync(file)) err(`project-memory source file missing: ${file}`);
  }
  // The store must remain free of a direct node:fs import: filesystem writes live
  // only in the explicit node-adapter boundary.
  const storePath = join(PROJECT_MEMORY_DIR, "src", "store.ts");
  if (existsSync(storePath)) {
    const store = readFileSync(storePath, "utf8");
    if (/from\s+["']node:fs/.test(store) || /require\(\s*["']node:fs/.test(store)) {
      err("project-memory/src/store.ts must not import node:fs (writes live in node-adapter.ts)");
    }
  }
}

// 9. v0.3 Phase 3 Runtime orchestration. The Project Brain Runtime capture/
// compare surface, the pure Skills derivation module, the minimal Kernel binding,
// and their tests must exist. No CLI or MCP surface invokes them.
const PHASE3_SOURCES = [
  // Minimal Kernel binding exposure.
  "kernel/binding/src/projectbrain.ts",
  "kernel/binding/test/wasm-projectbrain-api.test.ts",
  "kernel/crate/tests/projectbrain_binding_parity.rs",
  // Pure Skills derivation.
  "skills/src/project-brain-state.ts",
  "skills/test/project-brain-state.test.ts",
  // Runtime orchestration.
  "runtime/src/projectbrain/index.ts",
  "runtime/src/projectbrain/types.ts",
  "runtime/src/projectbrain/errors.ts",
  "runtime/src/projectbrain/observation.ts",
  "runtime/src/projectbrain/evidence.ts",
  "runtime/src/projectbrain/privacy.ts",
  "runtime/src/projectbrain/capture.ts",
  "runtime/src/projectbrain/compare.ts",
  "runtime/src/projectbrain/runtime.ts",
  // Runtime tests + e2e below CLI.
  "runtime/test/projectbrain-fixtures.ts",
  "runtime/test/projectbrain-capture.test.ts",
  "runtime/test/projectbrain-compare.test.ts",
  "runtime/test/projectbrain-e2e.test.ts",
  "runtime/test/projectbrain-purity.test.ts",
  "runtime/test/projectbrain-privacy.test.ts",
  // Phase 3 documentation.
  "docs/v0.3/phase-3-runtime.md",
];
for (const file of PHASE3_SOURCES) {
  if (!existsSync(file)) err(`Phase 3 file missing: ${file}`);
}

// 10. v0.3 Phase 4.1 snapshot-capture chronology correction. The correction
// adds the store-format v2 capture chronology, its production migration, the
// CLI --migrate-store preview/apply flow, the Runtime chronology-based default
// compare, focused tests across those layers, and the Phase 4.1 report. These
// files must exist; the source version stays 0.2.0 (enforced above) and the MCP
// surface stays exactly ten tools (enforced above).
const PHASE_4_1_SOURCES = [
  "project-memory/test/chronology.test.ts",
  "project-memory/test/migration-chronology.test.ts",
  "runtime/test/projectbrain-compare-chronology.test.ts",
  "cli/test/memory-chronology.test.ts",
  "docs/v0.3/phase-4-1-snapshot-chronology.md",
];
for (const file of PHASE_4_1_SOURCES) {
  if (!existsSync(file)) err(`Phase 4.1 file missing: ${file}`);
}

if (fail) {
  console.error("validate-structure: FAILED");
  process.exit(1);
}
console.log("validate-structure: OK");
