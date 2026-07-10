#!/usr/bin/env node
// Deterministic build for the Node-loadable Kernel WASM binding.
// Compiles the Rust Kernel for wasm32-unknown-unknown, then generates
// CommonJS glue with wasm-bindgen into kernel/binding/generated-node/.
// The generated output is build product only and is never committed.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const fail = (message) => {
  console.error(`build-kernel-wasm: FAIL: ${message}`);
  process.exit(1);
};

// wasm-bindgen must match the wasm-bindgen crate line; prefer PATH, then the
// default cargo install location.
function resolveWasmBindgen() {
  const candidates = ["wasm-bindgen", join(homedir(), ".cargo", "bin", "wasm-bindgen")];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Not usable; try the next candidate.
    }
  }
  return null;
}

const run = (command, args) => {
  try {
    execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  } catch {
    fail(`command failed: ${command} ${args.join(" ")}`);
  }
};

const wasmBindgen = resolveWasmBindgen();
if (wasmBindgen === null) {
  fail(
    "wasm-bindgen is not available. Install it with: cargo install wasm-bindgen-cli --locked",
  );
}

run("cargo", [
  "build",
  "--target",
  "wasm32-unknown-unknown",
  "-p",
  "oh-my-pm-kernel",
  "--release",
]);

const wasmArtifact = join(
  repoRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "oh_my_pm_kernel.wasm",
);
if (!existsSync(wasmArtifact)) {
  fail(
    "expected artifact missing: target/wasm32-unknown-unknown/release/oh_my_pm_kernel.wasm",
  );
}

const outDir = join(repoRoot, "kernel", "binding", "generated-node");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

run(wasmBindgen, [
  "target/wasm32-unknown-unknown/release/oh_my_pm_kernel.wasm",
  "--target",
  "nodejs",
  "--out-dir",
  "kernel/binding/generated-node",
  "--out-name",
  "oh_my_pm_kernel",
]);

// The generated glue is CommonJS; mark the folder so Node loads it correctly
// from inside the ESM binding package.
writeFileSync(
  join(outDir, "package.json"),
  `${JSON.stringify({ type: "commonjs", private: true }, null, 2)}\n`,
);

console.log("build-kernel-wasm: OK");
