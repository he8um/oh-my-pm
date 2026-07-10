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
];

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
    if (pkgJson.version !== "2.0.0-alpha.0")
      err(`${pkg}/package.json must set "version": "2.0.0-alpha.0"`);
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
];
for (const file of PROVIDER_SOURCES) {
  if (!existsSync(file)) err(`provider framework file missing: ${file}`);
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
  "skills/src/review-changes.ts",
  "skills/src/registry.ts",
  "skills/test/helpers.test.ts",
  "skills/test/summarize-status.test.ts",
  "skills/test/extract-risks.test.ts",
  "skills/test/derive-next-tasks.test.ts",
  "skills/test/create-handoff.test.ts",
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
];
for (const file of EXAMPLES_SOURCES) {
  if (!existsSync(file)) err(`examples file missing: ${file}`);
}

// 8. Generated contract domain files and barrels exist.
const CONTRACT_DOMAINS = ["core", "kernel", "runtime", "planner", "providers", "skills", "cli", "installer"];
const REQUIRED_GENERATED = [
  ...CONTRACT_DOMAINS.map((d) => `contracts/generated/ts/${d}.ts`),
  "contracts/generated/ts/index.ts",
  ...CONTRACT_DOMAINS.map((d) => `contracts/generated/rust/${d}.rs`),
  "contracts/generated/rust/mod.rs",
];
for (const file of REQUIRED_GENERATED) {
  if (!existsSync(file)) err(`generated contracts file missing: ${file}`);
}

// 9 + 10. CI workflow exists; no release workflow.
const workflowsDir = ".github/workflows";
if (!existsSync(join(workflowsDir, "ci.yml"))) {
  err(".github/workflows/ci.yml missing");
}
const RELEASE_MARKERS = ["npm publish", "gh release", "softprops/action-gh-release", "refs/tags"];
if (existsSync(workflowsDir)) {
  for (const name of readdirSync(workflowsDir)) {
    const path = join(workflowsDir, name);
    if (!statSync(path).isFile()) continue;
    if (name.toLowerCase().includes("release")) {
      err(`release workflow is not allowed in this phase: ${path}`);
      continue;
    }
    const contents = readFileSync(path, "utf8");
    for (const marker of RELEASE_MARKERS) {
      if (contents.includes(marker)) {
        err(`workflow ${path} contains release marker "${marker}"`);
      }
    }
  }
}

if (fail) {
  console.error("validate-structure: FAILED");
  process.exit(1);
}
console.log("validate-structure: OK");
