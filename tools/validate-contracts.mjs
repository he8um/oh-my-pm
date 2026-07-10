#!/usr/bin/env node
// Contracts drift validator.
// Regenerates contracts and fails if any committed generated file changes.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirs = [
  join(repoRoot, "contracts", "generated", "ts"),
  join(repoRoot, "contracts", "generated", "rust"),
];

const snapshot = () => {
  const files = new Map();
  for (const dir of generatedDirs) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      files.set(path, readFileSync(path, "utf8"));
    }
  }
  return files;
};

const before = snapshot();
execFileSync(process.execPath, [join(repoRoot, "tools", "gen-contracts.mjs")], {
  cwd: repoRoot,
  stdio: "pipe",
});
const after = snapshot();

const changed = [];
for (const [path, content] of after) {
  if (!before.has(path)) changed.push(path);
  else if (before.get(path) !== content) changed.push(path);
}
for (const path of before.keys()) {
  if (!after.has(path)) changed.push(path);
}

if (changed.length > 0) {
  console.error("FAIL: generated contracts are out of date");
  for (const path of changed.sort()) {
    console.error(`  ${path.slice(repoRoot.length + 1)}`);
  }
  process.exit(1);
}

console.log("validate-contracts: OK");
