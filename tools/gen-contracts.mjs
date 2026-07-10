#!/usr/bin/env node
// Scaffold-phase contracts generator.
// Ensures the generated placeholder files exist with exact, deterministic
// content (no timestamps). The contracts phase replaces this generator.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const TS_PLACEHOLDER = `// Generated placeholder for scaffold phase.
// The contracts phase replaces this with deterministic generated output.
export {};
`;

const RUST_PLACEHOLDER = `// Generated placeholder for scaffold phase.
// The contracts phase replaces this with deterministic generated output.
`;

const outputs = [
  { path: join(repoRoot, "contracts", "generated", "ts", "index.ts"), content: TS_PLACEHOLDER },
  { path: join(repoRoot, "contracts", "generated", "rust", "mod.rs"), content: RUST_PLACEHOLDER },
];

for (const { path, content } of outputs) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
    writeFileSync(path, content);
  }
}

console.log("gen-contracts: OK");
