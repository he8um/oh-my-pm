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
const PACKAGE_SRC = /^(contracts|kernel\/binding|runtime|planner|providers|skills|cli|installer)\/src\/.*\.ts$/;
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
  }
}

// 5. contracts/generated/** holds only the scaffold placeholders.
const TS_PLACEHOLDER = `// Generated placeholder for scaffold phase.
// The contracts phase replaces this with deterministic generated output.
export {};
`;
const RUST_PLACEHOLDER = `// Generated placeholder for scaffold phase.
// The contracts phase replaces this with deterministic generated output.
`;
const EXPECTED_GENERATED = new Map([
  ["contracts/generated/ts/index.ts", TS_PLACEHOLDER],
  ["contracts/generated/rust/mod.rs", RUST_PLACEHOLDER],
]);
const generatedTracked = trackedFiles.filter((f) => f.startsWith("contracts/generated/"));
for (const file of generatedTracked) {
  if (!EXPECTED_GENERATED.has(file)) {
    err(`unexpected file under contracts/generated/: ${file}`);
  } else if (readFileSync(file, "utf8") !== EXPECTED_GENERATED.get(file)) {
    err(`${file} does not match the scaffold placeholder content`);
  }
}
for (const file of EXPECTED_GENERATED.keys()) {
  if (!generatedTracked.includes(file)) {
    err(`expected generated placeholder is not tracked: ${file}`);
  }
}

if (fail) {
  console.error("validate-boundaries: FAILED");
  process.exit(1);
}
console.log("validate-boundaries: OK");
