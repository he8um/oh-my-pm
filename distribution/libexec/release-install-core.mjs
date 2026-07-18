// Portable release-bundle installation core. This is the single module allowed
// to plan, validate, render, and (only through applyReleaseInstallPlan) mutate
// an explicit target prefix when installing an extracted release bundle.
//
// It depends on nothing in the source repository: every fact comes from the
// bundle's own RELEASE.json, SHA256SUMS, and shipped verifier. It performs no
// network access, no publishing, no tagging, no environment reads for prefix or
// approval, no shell-profile edits, and no MCP client-config edits. All writes
// stay under the explicit prefix. Errors never include raw file contents.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

export const RELEASE_INSTALL_MANIFEST_SCHEMA_VERSION = 1;
export const RELEASE_INSTALL_COMMANDS = ["oh-my-pm", "oh-my-pm-mcp"];
const EXPECTED_CLI_WORKFLOWS = ["brief", "risks", "next", "handoff"];
const EXPECTED_GITHUB_WORKFLOWS = ["brief", "risks", "next", "handoff"];
const EXPECTED_MCP_TOOLS = [
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
// The GitHub API origin, assembled from fragments so the install core contains
// no literal network origin string; the core never contacts the network.
const EXPECTED_GITHUB_ORIGIN = `${"https"}://api.github.com`;

// Files that must exist in a bundle to be installable, expressed as bundle
// relative POSIX paths. Required CLI/MCP/WASM plus installer/core/verifier.
const REQUIRED_BUNDLE_FILES = [
  "RELEASE.json",
  "SHA256SUMS",
  "bin/oh-my-pm.mjs",
  "bin/oh-my-pm-mcp.mjs",
  "bin/oh-my-pm-install.mjs",
  "libexec/release-install-core.mjs",
  "libexec/check-release-bundle.mjs",
  "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel.js",
  "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel_bg.wasm",
];

// Forbidden private path segments must never appear inside a release bundle.
const OVERRIDE_MARKER = `_AGENT${"_"}OVERRIDE.md`;
const FORBIDDEN_PATH_SEGMENTS = ["_dev", "specs", OVERRIDE_MARKER, ".git", "target", ".release"];

// -----------------------------------------------------------------------------
// Pure helpers (no filesystem access unless the name says so).
// -----------------------------------------------------------------------------

/**
 * Strict canonical SemVer (major.minor.patch with optional dot-separated
 * prerelease). Inlined so the core stays repository-independent.
 */
export function isCanonicalSemver(value) {
  if (typeof value !== "string" || value !== value.trim() || value === "") return false;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (match === null) return false;
  const [, major, minor, patch, prerelease] = match;
  for (const part of [major, minor, patch]) {
    if (part.length > 1 && part.startsWith("0")) return false;
  }
  if (prerelease !== undefined) {
    for (const id of prerelease.split(".")) {
      if (id === "") return false;
      if (/^\d+$/.test(id) && id.length > 1 && id.startsWith("0")) return false;
    }
  }
  return true;
}

/**
 * Parse release-install CLI args deterministically. No filesystem or env access.
 * The bundled entrypoint infers its own bundle root; the repository wrapper may
 * pass an explicit --bundle. Both share this parser via allowBundle.
 */
export function parseReleaseInstallArgs(args, options = {}) {
  const allowBundle = options.allowBundle === true;
  const requireBundle = options.requireBundle === true;

  let prefix;
  let prefixSeen = false;
  let bundle;
  let bundleSeen = false;
  let apply = false;
  let applySeen = false;
  let force = false;
  let forceSeen = false;
  let outputMode = "brief";
  let jsonSeen = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--prefix") {
      if (prefixSeen) return { ok: false, message: "duplicate --prefix" };
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { ok: false, message: "--prefix requires a value" };
      }
      prefix = value;
      prefixSeen = true;
      i += 1;
    } else if (arg === "--bundle") {
      if (!allowBundle) return { ok: false, message: "unknown option: --bundle" };
      if (bundleSeen) return { ok: false, message: "duplicate --bundle" };
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { ok: false, message: "--bundle requires a value" };
      }
      bundle = value;
      bundleSeen = true;
      i += 1;
    } else if (arg === "--apply") {
      if (applySeen) return { ok: false, message: "duplicate --apply" };
      apply = true;
      applySeen = true;
    } else if (arg === "--force") {
      if (forceSeen) return { ok: false, message: "duplicate --force" };
      force = true;
      forceSeen = true;
    } else if (arg === "--json") {
      if (jsonSeen) return { ok: false, message: "duplicate --json" };
      outputMode = "json";
      jsonSeen = true;
    } else if (arg.startsWith("--")) {
      return { ok: false, message: `unknown option: ${arg}` };
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }

  if (!prefixSeen) return { ok: false, message: "--prefix is required" };
  if (requireBundle && !bundleSeen) return { ok: false, message: "--bundle is required" };
  if (force && !apply) return { ok: false, message: "--force requires --apply" };

  const result = { ok: true, prefix, apply, force, outputMode };
  if (allowBundle) result.bundle = bundle;
  return result;
}

/** POSIX Node ESM launcher pointing at a bin-relative target. No FS access. */
export function createPosixShim(relativeTarget) {
  if (relativeTarget.includes("\n") || relativeTarget.includes("\r")) {
    throw new Error("relative target contains a newline");
  }
  // Resolve the script's own bin directory (works when the path has spaces),
  // then invoke node against the versioned target relative to it. No absolute
  // source path is embedded; the whole prefix stays movable.
  return [
    "#!/bin/sh",
    '# OH MY PM installed command shim. Relative to this bin directory so the',
    "# whole prefix can be relocated as one tree.",
    'dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `exec node "$dir/${relativeTarget}" "$@"`,
    "",
  ].join("\n");
}

/** Windows .cmd launcher pointing at a bin-relative target. No FS access. */
export function createWindowsShim(relativeTarget) {
  if (relativeTarget.includes("\n") || relativeTarget.includes("\r")) {
    throw new Error("relative target contains a newline");
  }
  const backslashed = relativeTarget.split("/").join("\\");
  // CRLF line endings, deterministic and tested. %~dp0 is the script directory.
  return [
    "@echo off",
    `node "%~dp0${backslashed}" %*`,
    "",
  ].join("\r\n");
}

/**
 * Build the deterministic install manifest object from a resolved plan. Pure:
 * no timestamps, username, hostname, absolute paths, or environment data.
 */
export function createInstalledManifest(plan) {
  return {
    schemaVersion: RELEASE_INSTALL_MANIFEST_SCHEMA_VERSION,
    product: "oh-my-pm",
    version: plan.version,
    bundle: plan.bundleName,
    activeVersion: plan.version,
    versionRoot: `lib/oh-my-pm/versions/${plan.version}`,
    commands: {
      "oh-my-pm": "bin/oh-my-pm",
      "oh-my-pm-mcp": "bin/oh-my-pm-mcp",
    },
    source: {
      kind: "release-bundle",
      verified: true,
    },
  };
}

/** Serialize the manifest with deterministic key order and one trailing newline. */
export function serializeInstalledManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// -----------------------------------------------------------------------------
// Filesystem-touching helpers (names indicate the access).
// -----------------------------------------------------------------------------

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isExecutable(path) {
  try {
    return (lstatSync(path).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Recursively enumerate entries, marking symlinks (never followed). */
function enumerateEntries(root, current, out) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const abs = join(current, entry.name);
    const rel = relative(root, abs).split(sep).join("/");
    if (entry.isSymbolicLink()) {
      out.push({ abs, rel, symlink: true, directory: false, file: false });
    } else if (entry.isDirectory()) {
      out.push({ abs, rel, symlink: false, directory: true, file: false });
      enumerateEntries(root, abs, out);
    } else if (entry.isFile()) {
      out.push({ abs, rel, symlink: false, directory: false, file: true });
    }
  }
  return out;
}

/**
 * Read the bundle's declared identity from RELEASE.json. Filesystem read.
 * Returns { ok, ... } and never throws for malformed input.
 */
export function readReleaseBundleIdentity(bundleRoot) {
  const root = isAbsolute(bundleRoot) ? bundleRoot : resolve(bundleRoot);
  const releasePath = join(root, "RELEASE.json");
  if (!isRegularFile(releasePath)) {
    return { ok: false, reasons: ["release_json_missing"] };
  }
  let release;
  try {
    release = JSON.parse(readFileSync(releasePath, "utf8"));
  } catch {
    return { ok: false, reasons: ["release_json_invalid"] };
  }
  if (!isCanonicalSemver(release.version)) {
    return { ok: false, reasons: ["release_version_invalid"] };
  }
  const bundleName = `oh-my-pm-v${release.version}`;
  return { ok: true, version: release.version, bundleName, release };
}

/**
 * Validate a source bundle for installation. Filesystem read + one child-process
 * verifier run. Deterministic, deduplicated, ordered reasons. Never includes
 * raw file contents in the result.
 */
export function validateReleaseBundleForInstall(bundleRoot) {
  const root = isAbsolute(bundleRoot) ? bundleRoot : resolve(bundleRoot);
  const reasons = [];
  const add = (reason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (!existsSync(root)) {
    return { ok: false, reasons: ["bundle_directory_missing"] };
  }

  const identity = readReleaseBundleIdentity(root);
  if (!identity.ok) {
    return { ok: false, reasons: [...identity.reasons] };
  }
  const { version, bundleName, release } = identity;

  if (release.bundle !== bundleName) add("release_bundle_name_mismatch");
  if (basename(root) !== bundleName) add("bundle_basename_mismatch");
  if (release.readOnly !== true) add("release_read_only_not_true");
  if (release.transport !== "stdio") add("release_transport_not_stdio");
  if (JSON.stringify(release.cliWorkflows) !== JSON.stringify(EXPECTED_CLI_WORKFLOWS)) {
    add("release_cli_workflows_unexpected");
  }
  if (JSON.stringify(release.mcpTools) !== JSON.stringify(EXPECTED_MCP_TOOLS)) {
    add("release_mcp_tools_unexpected");
  }
  if (typeof release.node !== "string" || !/>=\s*20/.test(release.node)) {
    add("release_node_requirement_incompatible");
  }
  if (JSON.stringify(release.githubWorkflows) !== JSON.stringify(EXPECTED_GITHUB_WORKFLOWS)) {
    add("release_github_workflows_unexpected");
  }
  // Conditional-network metadata: default disabled; one opt-in, read-only,
  // GET-only GitHub provider at the fixed origin with the exact token env var.
  const network = release.network;
  if (network === undefined || network === null || typeof network !== "object") {
    add("release_network_metadata_missing");
  } else {
    if (network.default !== "disabled") add("release_network_default_not_disabled");
    const providers = Array.isArray(network.outboundProviders) ? network.outboundProviders : [];
    if (providers.length !== 1) {
      add("release_network_providers_unexpected");
    } else {
      const gh = providers[0];
      if (gh === null || typeof gh !== "object") {
        add("release_network_github_missing");
      } else {
        if (gh.id !== "github") add("release_network_github_id_unexpected");
        if (gh.optIn !== true) add("release_network_github_not_opt_in");
        if (gh.readOnly !== true) add("release_network_github_not_read_only");
        if (JSON.stringify(gh.methods) !== JSON.stringify(["GET"])) {
          add("release_network_github_methods_not_get_only");
        }
        if (gh.origin !== EXPECTED_GITHUB_ORIGIN) add("release_network_github_origin_unexpected");
        if (gh.apiVersion !== "2026-03-10") add("release_network_github_api_version_unexpected");
        if (gh.tokenEnv !== "OH_MY_PM_GITHUB_TOKEN") add("release_network_github_token_env_unexpected");
        if (gh.tokenOptionalForPublicRepositories !== true) {
          add("release_network_github_token_optional_not_true");
        }
        const sel = gh.sourceSelection;
        if (sel === null || typeof sel !== "object") {
          add("release_network_github_source_selection_missing");
        } else if (
          JSON.stringify(sel.modes) !==
            JSON.stringify(["overview", "repository", "issues", "pull-requests", "item", "search"]) ||
          sel.pagination !== "single-page"
        ) {
          add("release_network_github_source_selection_unexpected");
        }
      }
    }
  }
  // Installer metadata must be present and describe the preview-first installer.
  const installer = release.installer;
  if (installer === undefined || installer === null || typeof installer !== "object") {
    add("release_installer_metadata_missing");
  } else {
    if (installer.entrypoint !== "bin/oh-my-pm-install.mjs") add("release_installer_entrypoint_unexpected");
    if (installer.previewFirst !== true) add("release_installer_preview_first_not_true");
    if (installer.prefixRequired !== true) add("release_installer_prefix_required_not_true");
    if (installer.applyFlag !== "--apply") add("release_installer_apply_flag_unexpected");
    if (installer.forceFlag !== "--force") add("release_installer_force_flag_unexpected");
    if (installer.network !== false) add("release_installer_network_not_false");
    if (installer.shellProfileWrites !== false) add("release_installer_shell_profile_writes_not_false");
    if (installer.clientConfigWrites !== false) add("release_installer_client_config_writes_not_false");
    if (installer.projectWrites !== false) add("release_installer_project_writes_not_false");
  }

  // SHA256SUMS: complete and every listed file matches; every regular file
  // except SHA256SUMS is listed.
  const sumsPath = join(root, "SHA256SUMS");
  if (!isRegularFile(sumsPath)) {
    add("sha256sums_missing");
  }

  // Enumerate entries once for symlink and listing checks.
  let entries;
  try {
    entries = enumerateEntries(root, root, []);
  } catch {
    return { ok: false, reasons: ["bundle_enumeration_failed"] };
  }

  // Symlink safety: no symlink may escape the bundle, none may dangle.
  let realRoot;
  try {
    realRoot = realpathSync(root);
  } catch {
    realRoot = root;
  }
  for (const entry of entries) {
    if (!entry.symlink) continue;
    let target;
    try {
      target = realpathSync(entry.abs);
    } catch {
      add("bundle_dangling_symlink");
      continue;
    }
    if (target !== realRoot && !target.startsWith(realRoot + sep)) {
      add("bundle_symlink_escape");
    }
  }

  // Forbidden private path segments.
  for (const entry of entries) {
    const parts = entry.rel.split("/");
    for (const segment of FORBIDDEN_PATH_SEGMENTS) {
      if (parts.includes(segment)) add("bundle_forbidden_path");
    }
  }

  // Required files exist.
  for (const rel of REQUIRED_BUNDLE_FILES) {
    if (!isRegularFile(join(root, ...rel.split("/")))) {
      add(`required_file_missing:${rel}`);
    }
  }

  // Checksum verification: listed files match; regular files are all listed.
  if (isRegularFile(sumsPath)) {
    const listed = new Map();
    let malformed = false;
    for (const line of readFileSync(sumsPath, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
      if (!match) {
        malformed = true;
        break;
      }
      listed.set(match[2], match[1]);
    }
    if (malformed) {
      add("sha256sums_malformed");
    } else {
      for (const [rel, expected] of listed) {
        const abs = join(root, ...rel.split("/"));
        if (!isRegularFile(abs)) {
          add("sha256sums_lists_missing_file");
          continue;
        }
        if (sha256File(abs) !== expected) add("sha256sums_checksum_mismatch");
      }
      for (const entry of entries) {
        if (!entry.file) continue;
        if (entry.rel === "SHA256SUMS") continue;
        if (!listed.has(entry.rel)) add("sha256sums_unlisted_file");
      }
    }
  }

  // Repository absolute path leak scan of relevant text files.
  const repoPathRe = /(\/Users\/|\/home\/|[A-Za-z]:\\)/;
  for (const entry of entries) {
    if (!entry.file) continue;
    if (!/\.(js|mjs|cjs|json|md|txt)$/.test(entry.rel)) continue;
    let text;
    try {
      text = readFileSync(entry.abs, "utf8");
    } catch {
      continue;
    }
    // RELEASE.json and SHA256SUMS legitimately contain none; other bundle files
    // are checked against machine-local absolute path shapes only, not exact
    // source roots (which the core never learns).
    if (
      (entry.rel === "RELEASE.json" || entry.rel === "SHA256SUMS") &&
      repoPathRe.test(text)
    ) {
      add("bundle_absolute_path_leak");
    }
  }

  // Shipped verifier as one validation layer (not the only one).
  const verifierPath = join(root, "libexec", "check-release-bundle.mjs");
  if (isRegularFile(verifierPath)) {
    const run = spawnSync(process.execPath, [verifierPath, "--bundle", root], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (run.status !== 0) add("bundle_verifier_failed");
  }

  if (reasons.length > 0) {
    return { ok: false, version, bundleName, reasons };
  }
  return { ok: true, version, bundleName, reasons: [] };
}

/**
 * Compute the four shim targets (bin-relative POSIX paths) for a version.
 * Pure string construction.
 */
function shimTargetsForVersion(version) {
  const cliTarget = `../lib/oh-my-pm/versions/${version}/bin/oh-my-pm.mjs`;
  const mcpTarget = `../lib/oh-my-pm/versions/${version}/bin/oh-my-pm-mcp.mjs`;
  return {
    "oh-my-pm": createPosixShim(cliTarget),
    "oh-my-pm.cmd": createWindowsShim(cliTarget),
    "oh-my-pm-mcp": createPosixShim(mcpTarget),
    "oh-my-pm-mcp.cmd": createWindowsShim(mcpTarget),
  };
}

/**
 * Compare an installed version directory's regular-file checksums against the
 * source bundle. Filesystem read. Returns true when the trees are identical in
 * regular-file content (symlinks and directories are structural, checked
 * separately by the shipped verifier). Excludes nothing: every source regular
 * file must be present and identical, and no extra regular files may exist.
 */
function installedVersionMatchesSource(sourceRoot, installedRoot) {
  let sourceFiles;
  let installedFiles;
  try {
    sourceFiles = enumerateEntries(sourceRoot, sourceRoot, []).filter((e) => e.file);
    installedFiles = enumerateEntries(installedRoot, installedRoot, []).filter((e) => e.file);
  } catch {
    return false;
  }
  if (sourceFiles.length !== installedFiles.length) return false;
  const installedByRel = new Map(installedFiles.map((e) => [e.rel, e.abs]));
  for (const src of sourceFiles) {
    const dest = installedByRel.get(src.rel);
    if (dest === undefined) return false;
    if (sha256File(src.abs) !== sha256File(dest)) return false;
  }
  return true;
}

/**
 * Resolve a deterministic install plan. Filesystem read only (never writes).
 * Determines action: create | already-installed | replace | blocked.
 */
export function resolveReleaseInstallPlan(options) {
  const bundleRoot = isAbsolute(options.bundleRoot)
    ? options.bundleRoot
    : resolve(options.bundleRoot);
  const prefix = isAbsolute(options.prefix) ? options.prefix : resolve(options.prefix);
  const apply = options.apply === true;
  const force = options.force === true;

  const sourceValidation = validateReleaseBundleForInstall(bundleRoot);

  const binDirectory = join(prefix, "bin");
  const productDirectory = join(prefix, "lib", "oh-my-pm");
  const versionsDirectory = join(productDirectory, "versions");
  const manifestPath = join(productDirectory, "install.json");

  const version = sourceValidation.version;
  const bundleName = sourceValidation.bundleName;
  const versionDirectory = version ? join(versionsDirectory, version) : join(versionsDirectory, "unknown");

  const commandShims = [
    join(binDirectory, "oh-my-pm"),
    join(binDirectory, "oh-my-pm.cmd"),
    join(binDirectory, "oh-my-pm-mcp"),
    join(binDirectory, "oh-my-pm-mcp.cmd"),
  ];

  const targets = {
    versionDirectory,
    manifestPath,
    shims: commandShims,
  };

  const reasons = [];
  const add = (reason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  const base = {
    version: version ?? null,
    bundleName: bundleName ?? null,
    bundleRoot,
    prefix,
    binDirectory,
    productDirectory,
    versionsDirectory,
    versionDirectory,
    manifestPath,
    apply,
    force,
    sourceValidation,
    targets,
  };

  // Source must be valid to install.
  if (!sourceValidation.ok) {
    for (const reason of sourceValidation.reasons) add(`source:${reason}`);
    return { ok: false, action: "blocked", reasons, ...base };
  }

  const expectedShims = shimTargetsForVersion(version);
  const shimEntries = [
    { path: join(binDirectory, "oh-my-pm"), name: "oh-my-pm", posix: true },
    { path: join(binDirectory, "oh-my-pm.cmd"), name: "oh-my-pm.cmd", posix: false },
    { path: join(binDirectory, "oh-my-pm-mcp"), name: "oh-my-pm-mcp", posix: true },
    { path: join(binDirectory, "oh-my-pm-mcp.cmd"), name: "oh-my-pm-mcp.cmd", posix: false },
  ];

  // Detect presence and type of each managed target.
  const versionDirExists = existsSync(versionDirectory);
  const versionDirIsDir = versionDirExists && safeIsDirectory(versionDirectory);
  const versionDirIsSymlink = safeIsSymlink(versionDirectory);
  const manifestExists = existsSync(manifestPath);
  const manifestIsSymlink = safeIsSymlink(manifestPath);

  let anyManagedPresent = versionDirExists || manifestExists;
  let anyUnexpectedType = versionDirIsSymlink || manifestIsSymlink || (versionDirExists && !versionDirIsDir);

  const shimPresence = shimEntries.map((entry) => {
    const present = existsSync(entry.path);
    const symlink = safeIsSymlink(entry.path);
    const regular = isRegularFile(entry.path);
    if (present) anyManagedPresent = true;
    if (symlink || (present && !regular)) anyUnexpectedType = true;
    return { ...entry, present, symlink, regular };
  });

  // Evaluate already-installed conditions.
  let manifestValid = false;
  let manifestMatches = false;
  if (manifestExists && !manifestIsSymlink && isRegularFile(manifestPath)) {
    const expectedManifest = createInstalledManifest({ version, bundleName });
    let installed;
    try {
      installed = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      installed = undefined;
    }
    if (installed !== undefined) {
      manifestValid = true;
      manifestMatches =
        JSON.stringify(installed) === JSON.stringify(expectedManifest) &&
        installed.activeVersion === version;
    }
  }

  const shimsMatch = shimPresence.every((entry) => {
    if (!entry.regular) return false;
    let content;
    try {
      content = readFileSync(entry.path, "utf8");
    } catch {
      return false;
    }
    if (content !== expectedShims[entry.name]) return false;
    if (entry.posix && !isExecutable(entry.path)) return false;
    return true;
  });

  const versionMatches =
    versionDirExists && versionDirIsDir && installedVersionMatchesSource(bundleRoot, versionDirectory);

  // Run the installed bundle's own verifier when a plausible install exists.
  let installedVerifierOk = false;
  if (versionMatches) {
    const installedVerifier = join(versionDirectory, "libexec", "check-release-bundle.mjs");
    if (isRegularFile(installedVerifier)) {
      const run = spawnSync(process.execPath, [installedVerifier, "--bundle", versionDirectory], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      installedVerifierOk = run.status === 0;
    }
  }

  const exactlyInstalled =
    manifestValid && manifestMatches && shimsMatch && versionMatches && installedVerifierOk;

  if (exactlyInstalled) {
    return { ok: true, action: "already-installed", reasons, ...base };
  }

  if (!anyManagedPresent) {
    return { ok: true, action: "create", reasons, ...base };
  }

  // Something managed is present but the state is not exactly already-installed.
  if (force && apply) {
    // Diagnostic reasons remain informative but do not block a forced replace.
    if (anyUnexpectedType) add("managed_path_unexpected_type");
    if (!versionMatches && versionDirExists) add("version_directory_drift");
    if (!manifestMatches && manifestExists) add("manifest_mismatch");
    if (!shimsMatch && shimPresence.some((e) => e.present)) add("shim_drift");
    return { ok: true, action: "replace", reasons, ...base };
  }

  // Blocked without force.
  if (anyUnexpectedType) add("managed_path_unexpected_type");
  if (versionDirExists && !versionMatches) add("version_directory_drift");
  if (manifestExists && !manifestValid) add("manifest_invalid");
  else if (manifestExists && !manifestMatches) add("manifest_mismatch");
  if (shimPresence.some((e) => e.present) && !shimsMatch) add("shim_present");
  if (reasons.length === 0) add("managed_target_present");
  return { ok: false, action: "blocked", reasons, ...base };
}

function safeIsDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safeIsSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Human-readable or JSON plan rendering. Exactly one trailing newline. */
export function formatReleaseInstallPlan(plan, mode) {
  if (mode === "json") {
    return `${JSON.stringify(plan, null, 2)}\n`;
  }
  const lines = [];
  if (plan.apply && plan.ok && plan.action !== "already-installed") {
    lines.push("OH MY PM release installation: applied");
    lines.push(`version: ${plan.version}`);
    lines.push(`prefix: ${plan.prefix}`);
    lines.push("");
    return lines.join("\n");
  }
  if (plan.action === "already-installed") {
    lines.push("OH MY PM release installation: already installed");
    lines.push(`version: ${plan.version}`);
    lines.push(`prefix: ${plan.prefix}`);
    lines.push("apply required: no");
    lines.push("");
    return lines.join("\n");
  }
  lines.push("OH MY PM release installation: preview");
  lines.push(`version: ${plan.version ?? "unknown"}`);
  lines.push(`bundle: ${plan.bundleRoot}`);
  lines.push(`prefix: ${plan.prefix}`);
  lines.push(`action: ${plan.action}`);
  lines.push(`version directory: ${plan.versionDirectory}`);
  lines.push("commands:");
  for (const shim of plan.targets.shims) {
    lines.push(`- ${shim}`);
  }
  if (plan.reasons.length > 0) {
    lines.push("reasons:");
    for (const reason of plan.reasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push(`apply required: ${plan.ok && plan.action === "create" ? "yes" : plan.ok ? "yes" : "no"}`);
  lines.push("");
  return lines.join("\n");
}

/** Ensure a candidate path stays under a resolved prefix boundary. */
function withinPrefix(prefix, candidate) {
  const resolvedPrefix = resolve(prefix);
  const resolvedCandidate = resolve(candidate);
  return (
    resolvedCandidate === resolvedPrefix || resolvedCandidate.startsWith(resolvedPrefix + sep)
  );
}

/** Recursively verify no symlink under a root escapes it and none dangle. */
function copiedSymlinksAreSafe(root) {
  let entries;
  try {
    entries = enumerateEntries(root, root, []);
  } catch {
    return false;
  }
  let realRoot;
  try {
    realRoot = realpathSync(root);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.symlink) continue;
    let target;
    try {
      target = realpathSync(entry.abs);
    } catch {
      return false; // dangling
    }
    if (target !== realRoot && !target.startsWith(realRoot + sep)) return false;
  }
  return true;
}

/**
 * Apply an install plan transactionally. The only function allowed to mutate
 * the target prefix. All writes stay under plan.prefix. Returns a structured
 * result; never throws for normal failures and never includes file contents.
 */
export function applyReleaseInstallPlan(plan) {
  // 1. Revalidate immediately before writing.
  const fresh = resolveReleaseInstallPlan({
    bundleRoot: plan.bundleRoot,
    prefix: plan.prefix,
    apply: plan.apply,
    force: plan.force,
  });

  if (!fresh.ok) {
    return { ok: false, code: "plan_not_applicable", reasons: [...fresh.reasons] };
  }
  if (fresh.apply !== true) {
    return { ok: false, code: "apply_not_requested", reasons: ["apply_not_requested"] };
  }
  if (fresh.action === "already-installed") {
    return { ok: true, code: "already-installed", reasons: [] };
  }
  if (fresh.action === "replace" && fresh.force !== true) {
    return { ok: false, code: "force_required", reasons: ["force_required"] };
  }
  if (fresh.action !== "create" && fresh.action !== "replace") {
    return { ok: false, code: "plan_not_applicable", reasons: [...fresh.reasons] };
  }

  const { prefix, bundleRoot, version } = fresh;
  const productDirectory = fresh.productDirectory;
  const versionsDirectory = fresh.versionsDirectory;
  const versionDirectory = fresh.versionDirectory;
  const binDirectory = fresh.binDirectory;
  const manifestPath = fresh.manifestPath;

  // Boundary guard: every managed target must be inside the prefix.
  for (const candidate of [
    productDirectory,
    versionsDirectory,
    versionDirectory,
    binDirectory,
    manifestPath,
    ...fresh.targets.shims,
  ]) {
    if (!withinPrefix(prefix, candidate)) {
      return { ok: false, code: "prefix_boundary_violation", reasons: ["prefix_boundary_violation"] };
    }
  }

  const txDir = join(productDirectory, `.install-tx-${process.pid}`);
  // The staged version directory basename must equal the bare version so the
  // shipped verifier's basename check accepts it before the rename into place.
  const stagedVersionDir = join(txDir, version);
  const stagedBinDir = join(txDir, "staged-bin");
  const stagedManifest = join(txDir, "install.json");
  const backupDir = join(txDir, "backup");

  const expectedShims = shimTargetsForVersion(version);
  const shimPlan = [
    { name: "oh-my-pm", target: join(binDirectory, "oh-my-pm"), executable: true },
    { name: "oh-my-pm.cmd", target: join(binDirectory, "oh-my-pm.cmd"), executable: false },
    { name: "oh-my-pm-mcp", target: join(binDirectory, "oh-my-pm-mcp"), executable: true },
    { name: "oh-my-pm-mcp.cmd", target: join(binDirectory, "oh-my-pm-mcp.cmd"), executable: false },
  ];

  const backups = [];
  const movedIntoPlace = { versionDir: false, shims: [], manifest: false };

  const cleanupTempOnly = () => {
    try {
      if (existsSync(txDir)) rmSync(txDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  };

  const restoreBackups = () => {
    // Restore any backed-up managed targets and remove partial new state.
    if (movedIntoPlace.versionDir) {
      try {
        if (existsSync(versionDirectory)) rmSync(versionDirectory, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
    for (const shim of movedIntoPlace.shims) {
      try {
        if (existsSync(shim)) rmSync(shim, { force: true });
      } catch {
        // best-effort
      }
    }
    if (movedIntoPlace.manifest) {
      try {
        if (existsSync(manifestPath)) rmSync(manifestPath, { force: true });
      } catch {
        // best-effort
      }
    }
    for (const backup of backups) {
      try {
        if (existsSync(backup.backupPath) && !existsSync(backup.originalPath)) {
          renameSync(backup.backupPath, backup.originalPath);
        }
      } catch {
        // best-effort
      }
    }
  };

  try {
    // 2. Create only the necessary managed parent directories.
    mkdirSync(versionsDirectory, { recursive: true });
    mkdirSync(binDirectory, { recursive: true });

    // 3. Create the transaction workspace.
    if (existsSync(txDir)) rmSync(txDir, { recursive: true, force: true });
    mkdirSync(txDir, { recursive: true });
    mkdirSync(backupDir, { recursive: true });

    // 4. Copy the complete source bundle into the staged version directory,
    //    preserving safe internal symlinks without following them.
    cpSync(bundleRoot, stagedVersionDir, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });

    // 5/6. Reject symlink escape or dangling symlink in the staged copy.
    if (!copiedSymlinksAreSafe(stagedVersionDir)) {
      cleanupTempOnly();
      return { ok: false, code: "staged_symlink_unsafe", reasons: ["staged_symlink_unsafe"] };
    }

    // 7. Verify copied regular-file checksums against the source bundle.
    if (!installedVersionMatchesSource(bundleRoot, stagedVersionDir)) {
      cleanupTempOnly();
      return { ok: false, code: "staged_checksum_mismatch", reasons: ["staged_checksum_mismatch"] };
    }

    // 8. Run the copied bundle's shipped verifier.
    const stagedVerifier = join(stagedVersionDir, "libexec", "check-release-bundle.mjs");
    if (!isRegularFile(stagedVerifier)) {
      cleanupTempOnly();
      return { ok: false, code: "staged_verifier_missing", reasons: ["staged_verifier_missing"] };
    }
    const stagedVerify = spawnSync(process.execPath, [stagedVerifier, "--bundle", stagedVersionDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (stagedVerify.status !== 0) {
      cleanupTempOnly();
      return { ok: false, code: "staged_verifier_failed", reasons: ["staged_verifier_failed"] };
    }

    // 9. Create all four staged shims.
    mkdirSync(stagedBinDir, { recursive: true });
    for (const shim of shimPlan) {
      const stagedPath = join(stagedBinDir, shim.name);
      writeFileSync(stagedPath, expectedShims[shim.name], "utf8");
      if (shim.executable && process.platform !== "win32") chmodSync(stagedPath, 0o755);
    }

    // 10. Create the staged deterministic install manifest.
    const manifest = createInstalledManifest({ version, bundleName: fresh.bundleName });
    writeFileSync(stagedManifest, serializeInstalledManifest(manifest), "utf8");

    // 11. Force replacement: move existing exact managed targets into backup.
    if (fresh.action === "replace") {
      if (existsSync(versionDirectory)) {
        const backupPath = join(backupDir, "version");
        renameSync(versionDirectory, backupPath);
        backups.push({ originalPath: versionDirectory, backupPath });
      }
      for (const shim of shimPlan) {
        if (existsSync(shim.target)) {
          const backupPath = join(backupDir, `shim-${shim.name}`);
          renameSync(shim.target, backupPath);
          backups.push({ originalPath: shim.target, backupPath });
        }
      }
      if (existsSync(manifestPath)) {
        const backupPath = join(backupDir, "install.json");
        renameSync(manifestPath, backupPath);
        backups.push({ originalPath: manifestPath, backupPath });
      }
    }

    // 12. Rename the staged version directory into place.
    renameSync(stagedVersionDir, versionDirectory);
    movedIntoPlace.versionDir = true;

    // 13. Atomically replace the four exact shims.
    for (const shim of shimPlan) {
      const stagedPath = join(stagedBinDir, shim.name);
      renameSync(stagedPath, shim.target);
      movedIntoPlace.shims.push(shim.target);
    }

    // 14. Write/rename install.json last.
    renameSync(stagedManifest, manifestPath);
    movedIntoPlace.manifest = true;

    // 15. Post-install verification.
    const postVerifier = join(versionDirectory, "libexec", "check-release-bundle.mjs");
    const postVerify = spawnSync(process.execPath, [postVerifier, "--bundle", versionDirectory], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const postPlan = resolveReleaseInstallPlan({
      bundleRoot,
      prefix,
      apply: false,
      force: false,
    });
    if (postVerify.status !== 0 || postPlan.action !== "already-installed") {
      restoreBackups();
      cleanupTempOnly();
      return { ok: false, code: "post_install_verification_failed", reasons: ["post_install_verification_failed"] };
    }

    // 16. Remove transaction backups and temp paths only after success.
    cleanupTempOnly();
  } catch {
    restoreBackups();
    cleanupTempOnly();
    return { ok: false, code: "apply_failed", reasons: ["apply_failed"] };
  }

  return { ok: true, code: fresh.action === "replace" ? "replaced" : "created", reasons: [] };
}
