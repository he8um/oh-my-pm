// Loader and validator for packages.json, the authoritative package catalog.
//
// Why this exists
// ---------------
// The dependency direction was already correct and already enforced -- but only
// pairwise, by hand-written rules in tools/validate-boundaries.mjs section 10.
// Adding a package meant remembering to hand-write its rules, and three
// properties were unenforced entirely: no cycle detection, no general
// depend-only-downward rule, and no guard against importing another package's
// internals.
//
// This module turns the catalog into those checks, so the guarantees hold for
// every package including ones added later. It does not describe a repair: the
// v0.5.4 audit found the graph already cycle-free, no cross-package deep `src/`
// imports anywhere, and @oh-my-pm/contracts already dependency-free. The catalog
// LOCKS IN that structure.
//
// Deliberately offline and read-only: no network, no writes, no environment
// reads, so it runs identically in CI and on a laptop.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./command-surface.mjs";

export const PACKAGE_CATALOG_PATH = "packages.json";

/** Effects a package may be permitted to perform. */
export const SIDE_EFFECTS = Object.freeze([
  "stdout",
  "stdout-protocol-only",
  "stderr",
  "exit",
  "filesystem-read",
  "filesystem-read-via-node-entrypoint",
  "filesystem-scoped-write",
  "network-explicit-opt-in",
]);

/**
 * Read and structurally validate packages.json against the real workspace.
 *
 * Returns `{ catalog, errors }`, matching loadReleaseState / loadDocsManifest so
 * callers report uniformly: the validator prints and fails the build, the tests
 * assert. `catalog` is null when the file is missing or unparseable.
 */
export function loadPackageCatalog(repoRoot = REPO_ROOT) {
  const errors = [];
  let raw;
  try {
    raw = readFileSync(join(repoRoot, PACKAGE_CATALOG_PATH), "utf8");
  } catch {
    return { catalog: null, errors: [`${PACKAGE_CATALOG_PATH} is missing`] };
  }

  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch (error) {
    return {
      catalog: null,
      errors: [`${PACKAGE_CATALOG_PATH} is not valid JSON: ${error.message}`],
    };
  }

  const err = (msg) => errors.push(`${PACKAGE_CATALOG_PATH}: ${msg}`);

  if (catalog.schemaVersion !== 1) err("schemaVersion must be 1");
  if (!Array.isArray(catalog.layers) || catalog.layers.length === 0) {
    err("layers must be a non-empty array");
    return { catalog: null, errors };
  }
  if (!Array.isArray(catalog.packages)) {
    err("packages must be an array");
    return { catalog: null, errors };
  }

  const layerIndex = new Map(catalog.layers.map((l, i) => [l, i]));
  const byName = new Map();

  for (const [index, pkg] of catalog.packages.entries()) {
    const where = `packages[${index}]`;
    if (typeof pkg.name !== "string" || pkg.name.length === 0) {
      err(`${where}.name must be a non-empty string`);
      continue;
    }
    if (byName.has(pkg.name)) err(`${pkg.name} is listed more than once`);
    byName.set(pkg.name, pkg);

    if (typeof pkg.path !== "string" || pkg.path.length === 0) {
      err(`${pkg.name}: path must be a non-empty string`);
    }
    if (!layerIndex.has(pkg.role)) {
      err(`${pkg.name}: role must be one of ${catalog.layers.join(" | ")}`);
    }
    for (const key of ["responsibilities", "nonResponsibilities", "allowed", "forbidden"]) {
      if (!Array.isArray(pkg[key])) err(`${pkg.name}: ${key} must be an array`);
    }
    if (typeof pkg.inBundle !== "boolean") err(`${pkg.name}: inBundle must be a boolean`);
    if (!Array.isArray(pkg.sideEffects)) {
      err(`${pkg.name}: sideEffects must be an array`);
    } else {
      for (const effect of pkg.sideEffects) {
        if (!SIDE_EFFECTS.includes(effect)) {
          err(`${pkg.name}: unknown sideEffect "${effect}"`);
        }
      }
    }

    // allowed and forbidden must not contradict each other.
    for (const dep of pkg.allowed ?? []) {
      if ((pkg.forbidden ?? []).includes(dep)) {
        err(`${pkg.name}: ${dep} is both allowed and forbidden`);
      }
    }
    // A package cannot depend on itself.
    if ((pkg.allowed ?? []).includes(pkg.name)) {
      err(`${pkg.name}: must not list itself as an allowed dependency`);
    }
  }

  // Every catalogued path must exist and hold that package.
  for (const pkg of byName.values()) {
    if (typeof pkg.path !== "string") continue;
    const manifestPath = join(repoRoot, pkg.path, "package.json");
    if (!existsSync(manifestPath)) {
      err(`${pkg.name}: ${pkg.path}/package.json does not exist`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name !== pkg.name) {
      err(`${pkg.path}/package.json is ${manifest.name}, but the catalog calls it ${pkg.name}`);
    }
  }

  // The catalog and the workspace must describe the same set of packages.
  const workspace = workspacePackages(repoRoot);
  for (const { name } of workspace) {
    if (!byName.has(name)) err(`${name} is a workspace package but is not catalogued`);
  }
  for (const name of byName.keys()) {
    if (!workspace.some((w) => w.name === name)) {
      err(`${name} is catalogued but is not a workspace package`);
    }
  }

  return { catalog, errors };
}

/** The real workspace packages, from pnpm-workspace.yaml. */
export function workspacePackages(repoRoot = REPO_ROOT) {
  const yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const dirs = [...yaml.matchAll(/^\s*-\s*"([^"]+)"/gm)].map((m) => m[1]);
  const out = [];
  for (const dir of dirs) {
    const manifestPath = join(repoRoot, dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    out.push({
      dir,
      name: manifest.name,
      production: Object.keys(manifest.dependencies ?? {}).filter((d) =>
        d.startsWith("@oh-my-pm/"),
      ),
      development: Object.keys(manifest.devDependencies ?? {}).filter((d) =>
        d.startsWith("@oh-my-pm/"),
      ),
      external: Object.keys(manifest.dependencies ?? {}).filter((d) => !d.startsWith("@oh-my-pm/")),
      exports: manifest.exports ?? null,
      bin: manifest.bin ?? null,
    });
  }
  return out;
}

/**
 * Find production dependency cycles.
 *
 * Returns an array of cycles, each a path whose first and last element are the
 * same package. Only PRODUCTION edges are considered: a dev-only edge (runtime
 * -> project-memory, for its store fixtures) is not a runtime cycle and must not
 * be reported as one.
 */
export function findCycles(workspace) {
  const edges = new Map(workspace.map((w) => [w.name, w.production]));
  const cycles = [];
  const state = new Map(); // name -> "visiting" | "done"

  const visit = (name, path) => {
    if (state.get(name) === "visiting") {
      cycles.push([...path.slice(path.indexOf(name)), name]);
      return;
    }
    if (state.get(name) === "done") return;
    state.set(name, "visiting");
    for (const dep of edges.get(name) ?? []) visit(dep, [...path, name]);
    state.set(name, "done");
  };

  for (const { name } of workspace) visit(name, []);
  return cycles;
}

/** Catalog entry for a package name, or null. */
export const catalogEntry = (catalog, name) =>
  catalog.packages.find((p) => p.name === name) ?? null;

/** Layer rank, lower is more foundational. */
export const layerRank = (catalog, role) => catalog.layers.indexOf(role);
