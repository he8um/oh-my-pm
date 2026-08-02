#!/usr/bin/env node
// Package catalog and dependency-direction validator.
//
// Derives every check from packages.json, so a package added later inherits the
// same guarantees instead of needing hand-written pairwise rules.
//
// What this adds over tools/validate-boundaries.mjs
// ------------------------------------------------
// validate-boundaries enforces specific, high-value pairs by hand ("application
// must not import cli", "mcp must not import cli") plus a large body of
// release/workflow/fixture policy. It has no cycle check, no general
// depend-only-downward rule, and no cross-package internal-import guard. Those
// three are what this validator adds; the pairwise rules stay where they are, so
// nothing is duplicated and each failure keeps its specific message.
//
// This is a LOCK-IN, not a repair. At the time it was written the graph was
// already cycle-free, no cross-package deep `src/` import existed anywhere, and
// @oh-my-pm/contracts already declared no dependencies. Every check below passed
// on its first run except the ones that exposed catalog typos.
//
// Read-only: no writes, no network, no environment reads.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { REPO_ROOT } from "./command-surface.mjs";
import {
  catalogEntry,
  findCycles,
  layerRank,
  loadPackageCatalog,
  workspacePackages,
} from "./package-catalog.mjs";

let fail = false;
const err = (msg) => {
  console.error(`FAIL: ${msg}`);
  fail = true;
};

const { catalog, errors } = loadPackageCatalog(REPO_ROOT);
for (const message of errors) err(message);

if (catalog === null) {
  console.error("validate-packages: FAILED");
  process.exit(1);
}

const workspace = workspacePackages(REPO_ROOT);

// ---------------------------------------------------------------------------
// 1. No production dependency cycles.
// ---------------------------------------------------------------------------
//
// A cycle makes build order undefined and makes "which package owns this?"
// unanswerable. Only production edges count: runtime -> project-memory is a
// dev-only edge for store fixtures and is not a runtime cycle.

{
  const cycles = findCycles(workspace);
  for (const cycle of cycles) {
    err(`production dependency cycle: ${cycle.join(" -> ")}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Declared dependencies stay inside the catalogued allowance.
// ---------------------------------------------------------------------------

for (const pkg of workspace) {
  const entry = catalogEntry(catalog, pkg.name);
  if (entry === null) continue; // already reported by the loader

  for (const dep of pkg.production) {
    if ((entry.forbidden ?? []).includes(dep)) {
      err(`${pkg.dir}/package.json declares the forbidden dependency ${dep}`);
    } else if (!(entry.allowed ?? []).includes(dep)) {
      err(
        `${pkg.dir}/package.json declares ${dep}, which is not in ${pkg.name}'s ` +
          `allowed set; widen the catalog deliberately or drop the dependency`,
      );
    }
  }

  // 2b. Layer direction: a package may depend only on its own layer or lower.
  const ownRank = layerRank(catalog, entry.role);
  for (const dep of pkg.production) {
    const depEntry = catalogEntry(catalog, dep);
    if (depEntry === null) continue;
    const depRank = layerRank(catalog, depEntry.role);
    if (depRank > ownRank) {
      err(
        `${pkg.name} (${entry.role}) depends on ${dep} (${depEntry.role}), which is a ` +
          `HIGHER layer; dependencies must point down the layer order ` +
          `[${catalog.layers.join(" < ")}]`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Every import resolves to a declared dependency, and none reaches inside
//    another package.
// ---------------------------------------------------------------------------
//
// Two distinct defects:
//
//   an undeclared import  -- works locally by workspace hoisting, then breaks in
//                            the release bundle where only declared deps deploy;
//   a deep `src/` import  -- bypasses the package's public entry point, so its
//                            internals become everyone's API.

{
  const tracked = execFileSync("git", ["ls-files", "*.ts", "*.mts", "*.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.length > 0);

  /** Source with comments removed, so prose never trips a check. */
  const codeOf = (rel) =>
    readFileSync(join(REPO_ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  const byDir = [...workspace].sort((a, b) => b.dir.length - a.dir.length);
  const ownerOf = (rel) => byDir.find((w) => rel.startsWith(`${w.dir}/`)) ?? null;

  for (const rel of tracked) {
    const owner = ownerOf(rel);
    if (owner === null) continue; // tools/, tests/, .github/ are not packages

    // Test files may import a dev dependency, and the release/test tooling
    // legitimately reaches for fixtures. Production code may not.
    const isTest = /(^|\/)test\//.test(rel) || /\.test\.(ts|mts|mjs)$/.test(rel);
    const code = codeOf(rel);

    // Only real module positions count. A boundary test proves a package is
    // ABSENT by listing its name in an assertion array -- matching every quoted
    // string would report those as imports, which is exactly backwards.
    const specifiers = [
      ...code.matchAll(/(?:^|[\s;{(])(?:import|export)\b[^;]*?from\s*["']([^"']+)["']/gm),
      ...code.matchAll(/(?:^|[\s;{(=])import\s*\(\s*["']([^"']+)["']\s*\)/g),
      ...code.matchAll(/(?:^|[\s;{(=])require\s*\(\s*["']([^"']+)["']\s*\)/g),
      // Bare side-effect import: `import "x";`
      ...code.matchAll(/(?:^|[\s;{(])import\s*["']([^"']+)["']/gm),
    ].map((m) => m[1]);

    // 3a. Deep import into another package's internals.
    for (const spec of specifiers) {
      const match = spec.match(/^(@oh-my-pm\/[a-z0-9-]+)\/((?:src|dist|test)\/.*)$/);
      if (match === null) continue;
      if (match[1] === owner.name) continue; // its own files, via a package path
      err(
        `${rel} imports ${match[1]}/${match[2]}, reaching inside another package; ` +
          `import from its public entry point instead`,
      );
    }

    // 3b. Relative import that escapes the package directory into another one.
    //
    // Resolved against the IMPORTING FILE's directory, not the package root: a
    // specifier in runtime/src/x.ts is relative to runtime/src, so resolving it
    // against `runtime` lands one level too high and silently matches nothing.
    for (const spec of specifiers) {
      if (!spec.startsWith("../")) continue;
      const target = join(dirname(rel), spec);
      const targetOwner = ownerOf(target);
      if (targetOwner !== null && targetOwner.name !== owner.name) {
        err(
          `${rel} reaches ${targetOwner.name} through the relative path ${spec}; ` +
            `use the package's public entry point`,
        );
      }
    }

    // 3c. Undeclared workspace import.
    const declared = new Set([
      owner.name,
      ...owner.production,
      ...(isTest ? owner.development : []),
    ]);
    for (const spec of specifiers) {
      const match = spec.match(/^(@oh-my-pm\/[a-z0-9-]+)/);
      if (match === null) continue;
      if (!declared.has(match[1])) {
        err(
          `${rel} imports ${match[1]} but ${owner.dir}/package.json does not declare it ` +
            `${isTest ? "as a dependency or devDependency" : "as a dependency"}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Core packages own no process output.
// ---------------------------------------------------------------------------
//
// A domain or application package that writes to a stream or exits the process
// cannot be consumed by a second surface. The permission is declared per package
// in the catalog, so a presentation or executable boundary keeps its stream
// access and everything else loses it.

{
  const EFFECT_PATTERNS = [
    { effect: "stdout", pattern: /\bconsole\.log\s*\(|\bprocess\.stdout\b/, label: "stdout" },
    {
      effect: "stderr",
      pattern: /\bconsole\.(error|warn)\s*\(|\bprocess\.stderr\b/,
      label: "stderr",
    },
    { effect: "exit", pattern: /\bprocess\.exit\s*\(/, label: "process.exit" },
  ];

  const tracked = execFileSync("git", ["ls-files", "*.ts"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter((line) => line.length > 0);

  for (const pkg of workspace) {
    const entry = catalogEntry(catalog, pkg.name);
    if (entry === null) continue;
    const allowed = new Set(entry.sideEffects ?? []);
    // stdout-protocol-only is stdout access restricted to protocol frames; the
    // MCP server's own tests assert that restriction, so treat it as stdout here.
    if (allowed.has("stdout-protocol-only")) allowed.add("stdout");

    const sources = tracked.filter(
      (f) => f.startsWith(`${pkg.dir}/src/`) && !/\.test\.ts$/.test(f),
    );
    for (const rel of sources) {
      const code = readFileSync(join(REPO_ROOT, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      for (const { effect, pattern, label } of EFFECT_PATTERNS) {
        if (pattern.test(code) && !allowed.has(effect)) {
          err(
            `${rel} uses ${label}, but ${pkg.name} (${entry.role}) does not declare the ` +
              `"${effect}" side effect; core packages must not write to a process stream`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Public entry points resolve, and a README exists.
// ---------------------------------------------------------------------------

for (const pkg of workspace) {
  const entry = catalogEntry(catalog, pkg.name);
  if (entry === null) continue;

  const declaredExports = pkg.exports === null ? [] : Object.keys(pkg.exports);
  const catalogued = entry.entryPoints ?? [];
  if (JSON.stringify([...declaredExports].sort()) !== JSON.stringify([...catalogued].sort())) {
    err(
      `${pkg.dir}/package.json exports ${JSON.stringify(declaredExports)} but the catalog ` +
        `declares ${JSON.stringify(catalogued)}`,
    );
  }

  if (
    !execFileSync("git", ["ls-files", `${pkg.dir}/README.md`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim()
  ) {
    err(`${pkg.dir}/README.md is missing; every package must document its role`);
  }
}

// ---------------------------------------------------------------------------
// 6. The catalog's release-bundle claims match reality.
// ---------------------------------------------------------------------------
//
// The bundler deploys @oh-my-pm/distribution's production dependency closure.
// Deriving the expected set the same way keeps the catalog's inBundle flags
// honest without building a bundle here (the release tooling does that).

{
  const byName = new Map(workspace.map((w) => [w.name, w]));
  const closure = new Set();
  const walk = (name) => {
    for (const dep of byName.get(name)?.production ?? []) {
      if (closure.has(dep)) continue;
      closure.add(dep);
      walk(dep);
    }
  };
  walk("@oh-my-pm/distribution");

  for (const pkg of workspace) {
    const entry = catalogEntry(catalog, pkg.name);
    if (entry === null) continue;
    // distribution itself is the bundle's entrypoint layer, not a nested
    // dependency, so it is deliberately inBundle: false.
    const expected = pkg.name === "@oh-my-pm/distribution" ? false : closure.has(pkg.name);
    if (entry.inBundle !== expected) {
      err(
        `${pkg.name}: catalog says inBundle ${entry.inBundle}, but the ` +
          `@oh-my-pm/distribution production closure says ${expected}`,
      );
    }
  }
}

if (fail) {
  console.error("validate-packages: FAILED");
  process.exit(1);
}
console.log(
  `validate-packages: OK (${workspace.length} packages, ` +
    `${catalog.layers.length} layers, no cycles)`,
);
