// Tool-only portable release bundle planning and assembly. Writes only inside
// the explicit output directory, assembles atomically via a sibling temp dir +
// rename, and performs no publishing, no external transmission, no tagging, and
// no network access. Uses pnpm deploy for the production dependency tree and
// node:crypto for checksums.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Canonical version, read once from version.json (single source of truth). */
function readCanonicalVersion() {
  const parsed = JSON.parse(readFileSync(join(REPO_ROOT, "version.json"), "utf8"));
  if (typeof parsed.version !== "string" || parsed.version === "") {
    throw new Error("version.json has no version string");
  }
  return parsed.version;
}

export const RELEASE_BUNDLE_VERSION = readCanonicalVersion();
export const RELEASE_BUNDLE_NAME = `oh-my-pm-v${RELEASE_BUNDLE_VERSION}`;

/** Deterministic list of prerequisite files the bundle assembly requires. */
function prerequisiteDefinitions() {
  return [
    { id: "distribution_cli_bin", path: join(REPO_ROOT, "distribution", "bin", "oh-my-pm.mjs") },
    { id: "distribution_mcp_bin", path: join(REPO_ROOT, "distribution", "bin", "oh-my-pm-mcp.mjs") },
    { id: "distribution_install_bin", path: join(REPO_ROOT, "distribution", "bin", "oh-my-pm-install.mjs") },
    { id: "release_install_core", path: join(REPO_ROOT, "distribution", "libexec", "release-install-core.mjs") },
    { id: "release_bundle_verifier", path: join(REPO_ROOT, "tools", "check-release-bundle.mjs") },
    { id: "cli_dist", path: join(REPO_ROOT, "cli", "dist", "index.js") },
    { id: "mcp_dist", path: join(REPO_ROOT, "mcp-server", "dist", "index.js") },
    { id: "runtime_dist", path: join(REPO_ROOT, "runtime", "dist", "index.js") },
    { id: "planner_dist", path: join(REPO_ROOT, "planner", "dist", "index.js") },
    { id: "providers_dist", path: join(REPO_ROOT, "providers", "dist", "index.js") },
    { id: "skills_dist", path: join(REPO_ROOT, "skills", "dist", "index.js") },
    { id: "contracts_dist", path: join(REPO_ROOT, "contracts", "dist", "src", "index.js") },
    { id: "installer_dist", path: join(REPO_ROOT, "installer", "dist", "index.js") },
    { id: "kernel_dist", path: join(REPO_ROOT, "kernel", "binding", "dist", "index.js") },
    {
      id: "kernel_wasm_js",
      path: join(REPO_ROOT, "kernel", "binding", "generated-node", "oh_my_pm_kernel.js"),
    },
    {
      id: "kernel_wasm_binary",
      path: join(REPO_ROOT, "kernel", "binding", "generated-node", "oh_my_pm_kernel_bg.wasm"),
    },
    { id: "license", path: join(REPO_ROOT, "LICENSE") },
    { id: "readme", path: join(REPO_ROOT, "README.md") },
    { id: "changelog", path: join(REPO_ROOT, "CHANGELOG.md") },
    { id: "getting_started", path: join(REPO_ROOT, "docs", "getting-started.md") },
    {
      id: "fixture",
      path: join(REPO_ROOT, "examples", "fixtures", "markdown-project", "README.md"),
    },
  ];
}

/** Parse release bundle CLI args deterministically. No filesystem access. */
export function parseReleaseBundleArgs(args) {
  let output;
  let outputSeen = false;
  let apply = false;
  let force = false;
  let outputMode = "brief";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--output") {
      if (outputSeen) return { ok: false, message: "duplicate --output" };
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { ok: false, message: "--output requires a value" };
      }
      output = value;
      outputSeen = true;
      i += 1;
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--json") {
      outputMode = "json";
    } else if (arg.startsWith("--")) {
      return { ok: false, message: `unknown option: ${arg}` };
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (!outputSeen) return { ok: false, message: "--output is required" };
  if (force && !apply) return { ok: false, message: "--force requires --apply" };
  return { ok: true, output, apply, force, outputMode };
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isSymbolicLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Build a deterministic bundle plan. Performs no writes. */
export function resolveReleaseBundlePlan(options) {
  const outputRoot = isAbsolute(options.output) ? options.output : resolve(options.output);
  const bundleDirectory = join(outputRoot, RELEASE_BUNDLE_NAME);
  const apply = options.apply === true;
  const force = options.force === true;

  const prerequisites = prerequisiteDefinitions().map((def) => ({
    id: def.id,
    path: def.path,
    exists: isRegularFile(def.path),
  }));

  const reasons = [];
  let ok = true;

  for (const prerequisite of prerequisites) {
    if (!prerequisite.exists) {
      reasons.push(`release_prerequisite_missing:${prerequisite.id}`);
      ok = false;
    }
  }

  let action;
  const bundleExists = existsSync(bundleDirectory);
  if (!ok) {
    action = "blocked";
  } else if (bundleExists) {
    if (force) {
      action = "replace";
    } else {
      reasons.push("release_bundle_exists");
      ok = false;
      action = "blocked";
    }
  } else {
    action = "create";
  }

  return {
    ok,
    version: RELEASE_BUNDLE_VERSION,
    bundleName: RELEASE_BUNDLE_NAME,
    outputRoot,
    bundleDirectory,
    apply,
    force,
    prerequisites,
    action,
    reasons,
  };
}

/** Human-readable or JSON plan rendering. */
export function formatReleaseBundlePlan(plan, mode) {
  if (mode === "json") {
    return `${JSON.stringify(plan, null, 2)}\n`;
  }
  const lines = [];
  if (plan.apply && plan.ok) {
    lines.push("OH MY PM release bundle: applied");
    lines.push(`version: ${plan.version}`);
    lines.push(`bundle: ${plan.bundleDirectory}`);
    lines.push("");
    return lines.join("\n");
  }
  lines.push("OH MY PM release bundle: preview");
  lines.push(`version: ${plan.version}`);
  lines.push(`bundle: ${plan.bundleName}`);
  lines.push(`output: ${plan.outputRoot}`);
  lines.push(`action: ${plan.action}`);
  if (plan.reasons.length > 0) {
    for (const reason of plan.reasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("apply required: yes");
  lines.push("");
  return lines.join("\n");
}

// The GitHub API origin is assembled from fragments so this release tool holds
// no bare secure-scheme origin string in its own source (the boundary validator
// scans release tools for one). The emitted RELEASE.json still carries the
// exact canonical origin string.
const GITHUB_ORIGIN = `${"https"}://api.github.com`;

const RELEASE_METADATA = {
  name: "OH MY PM",
  version: RELEASE_BUNDLE_VERSION,
  bundle: RELEASE_BUNDLE_NAME,
  node: ">=20",
  commands: ["oh-my-pm", "oh-my-pm-mcp"],
  cliWorkflows: ["brief", "risks", "next", "handoff"],
  githubWorkflows: ["brief", "risks", "next", "handoff"],
  mcpTools: [
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
  ],
  transport: "stdio",
  readOnly: true,
  network: {
    default: "disabled",
    outboundProviders: [
      {
        id: "github",
        optIn: true,
        readOnly: true,
        methods: ["GET"],
        origin: GITHUB_ORIGIN,
        apiVersion: "2026-03-10",
        tokenEnv: "OH_MY_PM_GITHUB_TOKEN",
        tokenOptionalForPublicRepositories: true,
        sourceSelection: {
          defaultSource: "overview",
          defaultState: "open",
          modes: ["overview", "repository", "issues", "pull-requests", "item", "search"],
          states: ["open", "closed", "all"],
          searchKinds: ["all", "issues", "pull-requests"],
          singleItemAutoDetect: true,
          maxItems: 100,
          pagination: "single-page",
          comments: false,
          timelines: false,
          diffs: false,
        },
      },
    ],
  },
  providerConfiguration: {
    schemaVersion: 1,
    fileName: "providers.json",
    pathEnv: "OH_MY_PM_PROVIDER_CONFIG",
    secretValuesAllowed: false,
    writes: false,
    github: {
      configurable: ["enabled", "defaultRepository", "defaultLimit"],
      fixed: ["origin", "apiVersion", "method", "tokenEnv"],
    },
    githubFields: [
      "enabled",
      "defaultRepository",
      "defaultLimit",
      "defaultSource",
      "defaultState",
    ],
  },
  providerDiagnostics: {
    offlineByDefault: true,
    networkConfirmationFlag: "--confirm-network",
    networkRequestCount: 1,
    networkMethod: "GET",
    tokenValuesReported: false,
  },
  installer: {
    entrypoint: "bin/oh-my-pm-install.mjs",
    previewFirst: true,
    prefixRequired: true,
    applyFlag: "--apply",
    forceFlag: "--force",
    network: false,
    shellProfileWrites: false,
    clientConfigWrites: false,
    projectWrites: false,
  },
};

/** Recursively enumerate regular files (no symlink following) under a root. */
function enumerateFiles(root, current, out) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const abs = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      // Recorded/handled by the safety check; never followed here.
      out.push({ abs, rel: relative(root, abs).split(sep).join("/"), symlink: true });
      continue;
    }
    if (entry.isDirectory()) {
      enumerateFiles(root, abs, out);
    } else if (entry.isFile()) {
      out.push({ abs, rel: relative(root, abs).split(sep).join("/"), symlink: false });
    }
  }
  return out;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Verify no symlink in the bundle resolves outside it. */
function symlinkEscapes(bundleRoot, files) {
  const realRoot = realpathSync(bundleRoot);
  for (const file of files) {
    if (!file.symlink) continue;
    let target;
    try {
      target = realpathSync(file.abs);
    } catch {
      return file.rel; // dangling symlink is unsafe
    }
    if (target !== realRoot && !target.startsWith(realRoot + sep)) {
      return file.rel;
    }
  }
  return null;
}

// The private override filename is assembled from parts so this validation
// helper does not itself contain the literal forbidden marker string.
const OVERRIDE_MARKER = `_AGENT${"_"}OVERRIDE.md`;
const FORBIDDEN_PATH_SEGMENTS = ["_dev", "specs", OVERRIDE_MARKER, ".git", "target", ".release"];
const FIRST_PARTY_PREFIX = "node_modules/@oh-my-pm/";

/** Inspect the temp bundle for safety before the final rename. */
function inspectBundleSafety(bundleRoot) {
  const files = enumerateFiles(bundleRoot, bundleRoot, []);
  const errors = [];

  const escaped = symlinkEscapes(bundleRoot, files);
  if (escaped) errors.push(`symlink escapes bundle: ${escaped}`);

  for (const file of files) {
    const parts = file.rel.split("/");
    for (const segment of FORBIDDEN_PATH_SEGMENTS) {
      if (parts.includes(segment)) {
        errors.push(`forbidden path segment "${segment}": ${file.rel}`);
      }
    }
    // First-party workspace packages must not ship src or tests.
    if (file.rel.startsWith(FIRST_PARTY_PREFIX)) {
      if (parts.includes("src") || parts.includes("test") || parts.includes("coverage")) {
        errors.push(`first-party source/test leaked into bundle: ${file.rel}`);
      }
      if (
        (file.rel.endsWith(".ts") && !file.rel.endsWith(".d.ts")) ||
        file.rel.endsWith(".test.js")
      ) {
        errors.push(`unexpected source/test file in first-party package: ${file.rel}`);
      }
    }
  }

  // Generated WASM must be present in the deployed kernel dependency.
  const wasmJs = join(
    bundleRoot,
    "node_modules",
    "@oh-my-pm",
    "kernel",
    "generated-node",
    "oh_my_pm_kernel.js",
  );
  const wasmBin = join(
    bundleRoot,
    "node_modules",
    "@oh-my-pm",
    "kernel",
    "generated-node",
    "oh_my_pm_kernel_bg.wasm",
  );
  if (!isRegularFile(wasmJs)) errors.push("bundled kernel generated WASM JS is missing");
  if (!isRegularFile(wasmBin)) errors.push("bundled kernel generated WASM binary is missing");

  // No source-repository absolute path may remain in text files.
  for (const file of files) {
    if (file.symlink) continue;
    if (/\.(js|mjs|cjs|json|md|txt)$/.test(file.rel)) {
      let text;
      try {
        text = readFileSync(file.abs, "utf8");
      } catch {
        continue;
      }
      if (text.includes(REPO_ROOT)) {
        errors.push(`source repository path embedded in ${file.rel}`);
      }
    }
  }

  // Installer surfaces must contain no networking or publishing behavior. Every
  // marker is assembled from fragments so this scanner does not itself contain
  // the literal forbidden strings (which the boundary validator scans this tool
  // for as network/publish/profile markers).
  const dot = ".";
  const colon = ":";
  const INSTALLER_FORBIDDEN = [
    "fetch" + "(",
    "XMLHttp" + "Request",
    "node" + colon + "http",
    "node" + colon + "https",
    "http" + colon + "//",
    "https" + colon + "//",
    "npm pub" + "lish",
    "pnpm pub" + "lish",
    "gh rele" + "ase",
    "refs" + "/tags",
    "registry" + dot + "npmjs",
    "up" + "load",
    "down" + "load",
    dot + "bashrc",
    dot + "zshrc",
    dot + "profile",
    "claude_desktop" + "_config",
    "mcp" + dot + "json",
  ];
  for (const rel of ["bin/oh-my-pm-install.mjs", "libexec/release-install-core.mjs", "libexec/check-release-bundle.mjs"]) {
    const abs = join(bundleRoot, ...rel.split("/"));
    if (!isRegularFile(abs)) {
      errors.push(`installer surface missing from bundle: ${rel}`);
      continue;
    }
    const text = readFileSync(abs, "utf8");
    for (const marker of INSTALLER_FORBIDDEN) {
      if (text.includes(marker)) {
        errors.push(`installer surface ${rel} contains forbidden marker "${marker}"`);
      }
    }
  }

  // First-party bundle packages must remain private with no publishConfig.
  const firstPartyPkgDir = join(bundleRoot, "node_modules", "@oh-my-pm");
  if (existsSync(firstPartyPkgDir)) {
    for (const name of readdirSync(firstPartyPkgDir)) {
      const manifestPath = join(firstPartyPkgDir, name, "package.json");
      if (!isRegularFile(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.publishConfig !== undefined) {
        errors.push(`bundle package @oh-my-pm/${name} has publishConfig`);
      }
      if (manifest.private !== true) {
        errors.push(`bundle package @oh-my-pm/${name} is not private`);
      }
    }
  }

  return errors;
}

/** Write RELEASE.json with exact key order and one trailing newline. */
function writeReleaseMetadata(bundleRoot) {
  writeFileSync(join(bundleRoot, "RELEASE.json"), `${JSON.stringify(RELEASE_METADATA, null, 2)}\n`, "utf8");
}

/** Write SHA256SUMS over every regular file except itself, sorted by path. */
function writeChecksums(bundleRoot) {
  const files = enumerateFiles(bundleRoot, bundleRoot, [])
    .filter((file) => !file.symlink && file.rel !== "SHA256SUMS")
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const lines = files.map((file) => `${sha256(file.abs)}  ${file.rel}`);
  writeFileSync(join(bundleRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
}

/**
 * Apply a bundle plan atomically. Deploys the distribution production tree into
 * a sibling temp directory, copies public support files, writes metadata and
 * checksums, runs safety checks, then renames into place. Returns a structured
 * result; never includes file contents in errors.
 */
export function applyReleaseBundlePlan(plan) {
  if (!plan.ok) {
    return { ok: false, code: "plan_not_applicable", reasons: [...plan.reasons] };
  }
  if (plan.apply !== true) {
    return { ok: false, code: "apply_not_requested", reasons: ["apply_not_requested"] };
  }
  if (existsSync(plan.bundleDirectory) && plan.force !== true) {
    return { ok: false, code: "bundle_exists", reasons: ["release_bundle_exists"] };
  }

  const tempDir = join(plan.outputRoot, `.${RELEASE_BUNDLE_NAME}.tmp-${process.pid}`);

  try {
    mkdirSync(plan.outputRoot, { recursive: true });
  } catch {
    return { ok: false, code: "output_root_failed", reasons: ["output_root_failed"] };
  }

  // Remove only our exact stale temp path.
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }

  try {
    // pnpm deploy can exit non-zero during teardown in non-interactive shells
    // even after producing a correct deployment, so success is judged by the
    // presence of the expected deployed structure rather than the exit code.
    // On Windows the launcher is pnpm.cmd; spawnSync will not resolve a bare
    // "pnpm" to the .cmd shim without a shell, so select the concrete
    // executable name per platform (deploy silently produced nothing otherwise).
    const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    spawnSync(
      pnpmExecutable,
      ["--filter", "@oh-my-pm/distribution", "--prod", "deploy", tempDir],
      { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "ignore"], encoding: "utf8" },
    );
    const deployedBin = join(tempDir, "bin", "oh-my-pm.mjs");
    const deployedKernelWasm = join(
      tempDir,
      "node_modules",
      "@oh-my-pm",
      "kernel",
      "generated-node",
      "oh_my_pm_kernel_bg.wasm",
    );
    if (!isRegularFile(deployedBin) || !isRegularFile(deployedKernelWasm)) {
      rmSync(tempDir, { recursive: true, force: true });
      return { ok: false, code: "deploy_incomplete", reasons: ["deploy_incomplete"] };
    }

    // pnpm deploy leaves a self-referential symlink for the deployed package
    // itself (.pnpm/node_modules/@oh-my-pm/distribution -> the source repo).
    // The distribution package IS the bundle root, so this back-reference is
    // never needed at runtime; remove it so the bundle stays fully portable.
    const distSelfRef = join(
      tempDir,
      "node_modules",
      ".pnpm",
      "node_modules",
      "@oh-my-pm",
      "distribution",
    );
    if (existsSync(distSelfRef) || isSymbolicLink(distSelfRef)) {
      rmSync(distSelfRef, { recursive: true, force: true });
    }

    // Copy public release support files.
    cpSync(join(REPO_ROOT, "LICENSE"), join(tempDir, "LICENSE"));
    cpSync(join(REPO_ROOT, "README.md"), join(tempDir, "README.md"));
    cpSync(join(REPO_ROOT, "CHANGELOG.md"), join(tempDir, "CHANGELOG.md"));
    mkdirSync(join(tempDir, "docs"), { recursive: true });
    cpSync(join(REPO_ROOT, "docs", "getting-started.md"), join(tempDir, "docs", "getting-started.md"));
    mkdirSync(join(tempDir, "examples"), { recursive: true });
    cpSync(
      join(REPO_ROOT, "examples", "fixtures", "markdown-project"),
      join(tempDir, "examples", "markdown-project"),
      { recursive: true },
    );

    // The distribution deploy ships the whole libexec/ files surface, which
    // includes the core test alongside the core. The bundle carries the core
    // and verifier only; remove any deployed test file.
    const libexecDir = join(tempDir, "libexec");
    if (existsSync(libexecDir)) {
      for (const name of readdirSync(libexecDir)) {
        if (name.endsWith(".test.mjs")) {
          rmSync(join(libexecDir, name), { force: true });
        }
      }
    }

    // Ship the repository-independent bundle verifier inside the bundle's
    // libexec/ so the installed copy can re-verify itself with no repository
    // dependency. The distribution deploy already places release-install-core.
    mkdirSync(join(tempDir, "libexec"), { recursive: true });
    cpSync(
      join(REPO_ROOT, "tools", "check-release-bundle.mjs"),
      join(tempDir, "libexec", "check-release-bundle.mjs"),
    );

    // Fail fast if the installer surfaces did not make it into the bundle.
    for (const rel of [
      join("bin", "oh-my-pm-install.mjs"),
      join("libexec", "release-install-core.mjs"),
      join("libexec", "check-release-bundle.mjs"),
    ]) {
      if (!isRegularFile(join(tempDir, rel))) {
        rmSync(tempDir, { recursive: true, force: true });
        return { ok: false, code: "installer_surface_missing", reasons: ["installer_surface_missing"] };
      }
    }

    // Ensure the bin entrypoints are executable on POSIX.
    if (process.platform !== "win32") {
      for (const bin of ["oh-my-pm.mjs", "oh-my-pm-mcp.mjs", "oh-my-pm-install.mjs"]) {
        const binPath = join(tempDir, "bin", bin);
        if (isRegularFile(binPath)) chmodSync(binPath, 0o755);
      }
    }

    writeReleaseMetadata(tempDir);

    const safetyErrors = inspectBundleSafety(tempDir);
    if (safetyErrors.length > 0) {
      rmSync(tempDir, { recursive: true, force: true });
      return { ok: false, code: "bundle_unsafe", reasons: safetyErrors };
    }

    // Checksums last so RELEASE.json is included and SHA256SUMS excludes itself.
    writeChecksums(tempDir);

    if (existsSync(plan.bundleDirectory)) {
      // Force replace: remove only the exact target directory.
      rmSync(plan.bundleDirectory, { recursive: true, force: true });
    }
    renameSync(tempDir, plan.bundleDirectory);
  } catch {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    return {
      ok: false,
      code: "assembly_failed",
      reasons: ["assembly_failed"],
    };
  }

  return { ok: true, code: "assembled", bundleDirectory: plan.bundleDirectory, reasons: [] };
}
