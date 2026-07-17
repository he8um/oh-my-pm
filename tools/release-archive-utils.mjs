// Tool-only deterministic release archive planning and creation. Turns a
// verified portable bundle into byte-reproducible .tar.gz and .zip assets plus
// a checksum file. Writes only inside the explicit output root and sibling temp
// paths, never mutates the source bundle, and performs no network access, no
// tagging, no GitHub API calls, and no publishing.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  lutimesSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

export const RELEASE_ARCHIVE_VERSION = readCanonicalVersion();
export const RELEASE_ARCHIVE_BUNDLE_NAME = `oh-my-pm-v${RELEASE_ARCHIVE_VERSION}`;
export const RELEASE_ARCHIVE_TAR_NAME = `${RELEASE_ARCHIVE_BUNDLE_NAME}.tar.gz`;
export const RELEASE_ARCHIVE_ZIP_NAME = `${RELEASE_ARCHIVE_BUNDLE_NAME}.zip`;
export const RELEASE_ARCHIVE_SUMS_NAME = `${RELEASE_ARCHIVE_BUNDLE_NAME}-SHA256SUMS.txt`;

// Canonical normalized timestamp: 1980-01-01T00:00:00Z (ZIP epoch floor).
const NORMALIZED_EPOCH_SECONDS = Date.UTC(1980, 0, 1, 0, 0, 0) / 1000;
const TAR_MTIME_ARG = "1980-01-01 00:00:00 UTC";

/** SHA-256 hex digest of a file. */
export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Format `<digest>  <filename>` checksum lines sorted by filename only (never by
 * digest), so the output order is independent of the digest values. Preserves
 * exactly two spaces between digest and filename.
 */
export function formatReleaseArchiveChecksumLines(entries) {
  return [...entries]
    .sort((left, right) =>
      left.filename < right.filename ? -1 : left.filename > right.filename ? 1 : 0,
    )
    .map(({ filename, digest }) => `${digest}  ${filename}`);
}

/** Locate a GNU tar binary ("tar" then "gtar"); null when none is GNU tar. */
function findGnuTar() {
  for (const candidate of ["tar", "gtar"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0 && typeof probe.stdout === "string" && probe.stdout.includes("GNU tar")) {
      return candidate;
    }
  }
  return null;
}

/** True when a utility is present and runnable (probe returns without spawn error). */
function hasUtility(command, versionArgs = ["--version"]) {
  const probe = spawnSync(command, versionArgs, { encoding: "utf8" });
  return probe.error === undefined;
}

/** Parse archive CLI args deterministically. No filesystem access. */
export function parseReleaseArchiveArgs(args) {
  let bundle;
  let bundleSeen = false;
  let output;
  let outputSeen = false;
  let apply = false;
  let force = false;
  let outputMode = "brief";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--bundle") {
      if (bundleSeen) return { ok: false, message: "duplicate --bundle" };
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { ok: false, message: "--bundle requires a value" };
      }
      bundle = value;
      bundleSeen = true;
      i += 1;
    } else if (arg === "--output") {
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
  if (!bundleSeen) return { ok: false, message: "--bundle is required" };
  if (!outputSeen) return { ok: false, message: "--output is required" };
  if (force && !apply) return { ok: false, message: "--force requires --apply" };
  return { ok: true, bundle, output, apply, force, outputMode };
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Build a deterministic archive plan. Performs no writes. */
export function resolveReleaseArchivePlan(options) {
  const bundleDirectory = isAbsolute(options.bundle) ? options.bundle : resolve(options.bundle);
  const outputRoot = isAbsolute(options.output) ? options.output : resolve(options.output);
  const apply = options.apply === true;
  const force = options.force === true;

  const tarPath = join(outputRoot, RELEASE_ARCHIVE_TAR_NAME);
  const zipPath = join(outputRoot, RELEASE_ARCHIVE_ZIP_NAME);
  const sumsPath = join(outputRoot, RELEASE_ARCHIVE_SUMS_NAME);

  const gnuTar = findGnuTar();
  const prerequisites = [
    { id: "bundle_directory", ok: isDirectory(bundleDirectory) },
    { id: "bundle_basename", ok: basename(bundleDirectory) === RELEASE_ARCHIVE_BUNDLE_NAME },
    { id: "release_json", ok: isRegularFile(join(bundleDirectory, "RELEASE.json")) },
    { id: "internal_sha256sums", ok: isRegularFile(join(bundleDirectory, "SHA256SUMS")) },
    { id: "cli_entrypoint", ok: isRegularFile(join(bundleDirectory, "bin", "oh-my-pm.mjs")) },
    { id: "mcp_entrypoint", ok: isRegularFile(join(bundleDirectory, "bin", "oh-my-pm-mcp.mjs")) },
    {
      id: "bundled_wasm",
      ok: isRegularFile(
        join(bundleDirectory, "node_modules", "@oh-my-pm", "kernel", "generated-node", "oh_my_pm_kernel_bg.wasm"),
      ),
    },
    { id: "gnu_tar", ok: gnuTar !== null },
    { id: "gzip", ok: hasUtility("gzip") },
    { id: "zip", ok: hasUtility("zip", ["-v"]) },
    { id: "unzip", ok: hasUtility("unzip", ["-v"]) },
  ];

  const reasons = [];
  let ok = true;
  for (const prerequisite of prerequisites) {
    if (!prerequisite.ok) {
      reasons.push(`release_archive_prerequisite_missing:${prerequisite.id}`);
      ok = false;
    }
  }

  const targets = [tarPath, zipPath, sumsPath];
  const anyExists = targets.some((path) => existsSync(path));
  let action;
  if (!ok) {
    action = "blocked";
  } else if (anyExists) {
    if (force) {
      action = "replace";
    } else {
      reasons.push("release_archive_exists");
      ok = false;
      action = "blocked";
    }
  } else {
    action = "create";
  }

  return {
    ok,
    version: RELEASE_ARCHIVE_VERSION,
    bundleName: RELEASE_ARCHIVE_BUNDLE_NAME,
    bundleDirectory,
    outputRoot,
    tarPath,
    zipPath,
    sumsPath,
    apply,
    force,
    action,
    prerequisites,
    reasons,
    gnuTar,
  };
}

/** Human-readable or JSON plan rendering. */
export function formatReleaseArchivePlan(plan, mode) {
  if (mode === "json") {
    // gnuTar is a resolved binary name, not part of the public plan shape.
    const { gnuTar, ...publicPlan } = plan;
    void gnuTar;
    return `${JSON.stringify(publicPlan, null, 2)}\n`;
  }
  const lines = [];
  if (plan.apply && plan.ok) {
    lines.push("OH MY PM release archives: applied");
    lines.push(`version: ${plan.version}`);
    lines.push(`- ${plan.tarPath}`);
    lines.push(`- ${plan.zipPath}`);
    lines.push(`- ${plan.sumsPath}`);
    lines.push("");
    return lines.join("\n");
  }
  lines.push("OH MY PM release archives: preview");
  lines.push(`version: ${plan.version}`);
  lines.push(`bundle: ${plan.bundleDirectory}`);
  lines.push(`output: ${plan.outputRoot}`);
  lines.push(`action: ${plan.action}`);
  lines.push(`- ${RELEASE_ARCHIVE_TAR_NAME}`);
  lines.push(`- ${RELEASE_ARCHIVE_ZIP_NAME}`);
  lines.push(`- ${RELEASE_ARCHIVE_SUMS_NAME}`);
  if (plan.reasons.length > 0) {
    for (const reason of plan.reasons) lines.push(`  reason: ${reason}`);
  }
  lines.push("apply required: yes");
  lines.push("");
  return lines.join("\n");
}

/** Enumerate entries under a root (dirs, files, symlinks), sorted by rel path. */
function enumerateEntries(root, current, out) {
  const entries = readdirSync(current, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const abs = join(current, entry.name);
    const rel = relative(root, abs).split(sep).join("/");
    if (entry.isSymbolicLink()) {
      out.push({ abs, rel, kind: "symlink" });
    } else if (entry.isDirectory()) {
      out.push({ abs, rel, kind: "dir" });
      enumerateEntries(root, abs, out);
    } else if (entry.isFile()) {
      out.push({ abs, rel, kind: "file" });
    }
  }
  return out;
}

/** Reject any symlink whose real target escapes the staging bundle root. */
function symlinkEscapes(bundleRoot, entries) {
  const realRoot = realpathSync(bundleRoot);
  for (const entry of entries) {
    if (entry.kind !== "symlink") continue;
    let target;
    try {
      target = realpathSync(entry.abs);
    } catch {
      return entry.rel;
    }
    if (target !== realRoot && !target.startsWith(realRoot + sep)) {
      return entry.rel;
    }
  }
  return null;
}

/** Normalize modes and mtimes of the staging tree (never touches contents). */
function normalizeStaging(bundleRoot) {
  const entries = enumerateEntries(bundleRoot, bundleRoot, []);
  // Normalize deepest-first so directory mtimes are not disturbed by children.
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.kind === "dir") {
      chmodSync(entry.abs, 0o755);
    } else if (entry.kind === "file") {
      const isBin =
        entry.rel === "bin/oh-my-pm.mjs" || entry.rel === "bin/oh-my-pm-mcp.mjs";
      chmodSync(entry.abs, isBin ? 0o755 : 0o644);
    }
    // Normalize timestamps for every entry, including symlinks (lutimes does
    // not follow the link), so tools that record per-entry mtimes (e.g. zip on
    // symlinks) produce byte-identical output across independent builds.
    try {
      if (entry.kind === "symlink") {
        lutimesSync(entry.abs, NORMALIZED_EPOCH_SECONDS, NORMALIZED_EPOCH_SECONDS);
      } else {
        utimesSync(entry.abs, NORMALIZED_EPOCH_SECONDS, NORMALIZED_EPOCH_SECONDS);
      }
    } catch {
      // best-effort
    }
  }
  chmodSync(bundleRoot, 0o755);
  try {
    utimesSync(bundleRoot, NORMALIZED_EPOCH_SECONDS, NORMALIZED_EPOCH_SECONDS);
  } catch {
    // best-effort
  }
}

function runOrThrow(command, args, options) {
  const result = spawnSync(command, args, { encoding: "buffer", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result;
}

/** Create a deterministic .tar.gz of the staging bundle at destination. */
function createTarGz(gnuTar, workspace, bundleName, destination) {
  const tar = spawnSync(
    gnuTar,
    [
      "--sort=name",
      "--format=pax",
      "--pax-option=delete=atime,delete=ctime",
      `--mtime=${TAR_MTIME_ARG}`,
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-cf",
      "-",
      bundleName,
    ],
    { cwd: workspace, encoding: "buffer", maxBuffer: 512 * 1024 * 1024 },
  );
  if (tar.error) throw tar.error;
  if (tar.status !== 0) throw new Error(`tar exited with status ${tar.status}`);

  const gzip = spawnSync("gzip", ["-n", "-9"], {
    input: tar.stdout,
    encoding: "buffer",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (gzip.error) throw gzip.error;
  if (gzip.status !== 0) throw new Error(`gzip exited with status ${gzip.status}`);
  writeFileSync(destination, gzip.stdout);
}

/** Create a deterministic .zip of the staging bundle at destination. */
function createZip(workspace, bundleName, destination) {
  // Sorted, newline-delimited relative paths (dirs then files, name-sorted) so
  // zip records entries in a stable order. Directory entries are included so
  // empty directories survive; -X strips extra fields, -y stores symlinks.
  const bundleRoot = join(workspace, bundleName);
  const entries = enumerateEntries(bundleRoot, bundleRoot, []);
  const relPaths = entries.map((entry) =>
    entry.kind === "dir" ? `${bundleName}/${entry.rel}/` : `${bundleName}/${entry.rel}`,
  );
  relPaths.sort();
  const input = Buffer.from(`${relPaths.join("\n")}\n`, "utf8");
  runOrThrow("zip", ["-X", "-y", "-q", destination, "-@"], {
    cwd: workspace,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Apply an archive plan: stage + normalize a copy of the bundle, verify it,
 * build deterministic tar.gz and zip, write checksums, then atomically move the
 * three assets into place. Returns a structured result; never mutates the
 * source bundle and never includes file contents in errors.
 */
export function applyReleaseArchivePlan(plan) {
  if (!plan.ok) return { ok: false, code: "plan_not_applicable", reasons: [...plan.reasons] };
  if (plan.apply !== true) {
    return { ok: false, code: "apply_not_requested", reasons: ["apply_not_requested"] };
  }
  const targets = [plan.tarPath, plan.zipPath, plan.sumsPath];
  if (targets.some((path) => existsSync(path)) && plan.force !== true) {
    return { ok: false, code: "archive_exists", reasons: ["release_archive_exists"] };
  }

  const workspace = join(plan.outputRoot, `.${RELEASE_ARCHIVE_BUNDLE_NAME}.archive.tmp-${process.pid}`);
  const tarTmp = `${plan.tarPath}.tmp-${process.pid}`;
  const zipTmp = `${plan.zipPath}.tmp-${process.pid}`;
  const sumsTmp = `${plan.sumsPath}.tmp-${process.pid}`;
  const cleanupTemps = () => {
    for (const path of [workspace, tarTmp, zipTmp, sumsTmp]) {
      if (existsSync(path) || (() => { try { return lstatSync(path) !== undefined; } catch { return false; } })()) {
        rmSync(path, { recursive: true, force: true });
      }
    }
  };

  try {
    mkdirSync(plan.outputRoot, { recursive: true });
  } catch {
    return { ok: false, code: "output_root_failed", reasons: ["output_root_failed"] };
  }

  try {
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
    mkdirSync(workspace, { recursive: true });

    const stagedBundle = join(workspace, RELEASE_ARCHIVE_BUNDLE_NAME);
    // Copy the bundle verbatim (symlinks preserved, never followed).
    cpSync(plan.bundleDirectory, stagedBundle, { recursive: true, verbatimSymlinks: true });

    const entries = enumerateEntries(stagedBundle, stagedBundle, []);
    const escaped = symlinkEscapes(stagedBundle, entries);
    if (escaped) {
      cleanupTemps();
      return { ok: false, code: "symlink_escape", reasons: [`symlink_escape:${escaped}`] };
    }

    normalizeStaging(stagedBundle);

    // Re-verify the normalized staging bundle with the existing verifier.
    const verify = spawnSync(process.execPath, [
      join(REPO_ROOT, "tools", "check-release-bundle.mjs"),
      "--bundle",
      stagedBundle,
    ]);
    if (verify.status !== 0) {
      cleanupTemps();
      return { ok: false, code: "normalized_bundle_invalid", reasons: ["normalized_bundle_invalid"] };
    }

    createTarGz(plan.gnuTar, workspace, RELEASE_ARCHIVE_BUNDLE_NAME, tarTmp);
    createZip(workspace, RELEASE_ARCHIVE_BUNDLE_NAME, zipTmp);

    const tarSum = sha256File(tarTmp);
    const zipSum = sha256File(zipTmp);
    const sumLines = formatReleaseArchiveChecksumLines([
      { filename: RELEASE_ARCHIVE_TAR_NAME, digest: tarSum },
      { filename: RELEASE_ARCHIVE_ZIP_NAME, digest: zipSum },
    ]);
    writeFileSync(sumsTmp, `${sumLines.join("\n")}\n`, "utf8");

    // Atomically move the three assets into their exact final paths.
    if (plan.force === true) {
      for (const path of targets) {
        if (existsSync(path)) rmSync(path, { force: true });
      }
    }
    renameSync(tarTmp, plan.tarPath);
    renameSync(zipTmp, plan.zipPath);
    renameSync(sumsTmp, plan.sumsPath);

    rmSync(workspace, { recursive: true, force: true });
  } catch {
    cleanupTemps();
    return { ok: false, code: "archive_failed", reasons: ["archive_failed"] };
  }

  return {
    ok: true,
    code: "archived",
    tarPath: plan.tarPath,
    zipPath: plan.zipPath,
    sumsPath: plan.sumsPath,
    reasons: [],
  };
}
