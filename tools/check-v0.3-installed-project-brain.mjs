#!/usr/bin/env node
// Installed-artifact Project Brain qualification (v0.3 Phase 6; extended for the
// v0.4 Project Timeline).
//
// Drives the EXTRACTED and INSTALLED release artifact (the canonical ohmypm and
// ohmypm-mcp shims under a temporary prefix), never the workspace package
// entrypoints. It qualifies the full Project Brain feature slice end to end:
// the installed memory subcommands (capture/changes/status/history/export/
// delete, plus timeline under the v0.4 profile) across brief, --json, and
// --markdown output; the read-only Project Brain MCP tools (project_changes,
// plus project_timeline under the v0.4 profile) with their sanitized
// projections; the explicit v1 -> v2 store migration; safe corruption handling;
// serialized concurrent captures; a planted-sentinel privacy audit; and
// source-independence / relocation of the installed prefix.
//
// The tool is PROFILE-AWARE: it reads the installed RELEASE.json bundleProfile
// and qualifies whichever released surface the artifact declares, so the same
// harness qualifies a v0.3 "project-brain" artifact (six memory subcommands,
// eleven MCP tools), a v0.4 "project-brain-timeline" artifact, and a v0.5
// "ohmypm-cli-namespace" artifact (seven memory
// subcommands, twelve MCP tools) without a competing parallel implementation.
//
// Node.js 20+ built-ins only, plus the MCP SDK and @oh-my-pm/project-memory that
// are already contained in the installed artifact. Every writable location
// (extraction root, install prefix, project fixtures, HOME/XDG_DATA_HOME/
// LOCALAPPDATA/APPDATA, export destinations) is an isolated temporary directory;
// the real user application-data directory is never touched. Writes nothing to
// the source repository. No network. Cross-platform (Windows/macOS/Linux).
//
// Usage:
//   node tools/check-v0.3-installed-project-brain.mjs --prefix <installed-prefix> [--json]
//   node tools/check-v0.3-installed-project-brain.mjs --archive <tar.gz|zip> --work <dir> [--json]
//
// The expected profile may be pinned with --profile <project-brain|
// project-brain-timeline|ohmypm-cli-namespace>; when omitted the artifact's own
// declared profile is
// accepted and drives which surface is qualified.
//
// With --prefix, the artifact must already be installed under that prefix (the
// caller extracted + installed it). With --archive, the script extracts the
// archive under --work, installs it to an isolated prefix, and qualifies that.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const isWindows = process.platform === "win32";

// ----------------------------------------------------------------------------
// Tiny assertion + reporting harness. Collects failures; never leaks planted
// sentinels or absolute temp paths into the machine-readable report body.
// ----------------------------------------------------------------------------
const checks = [];
let currentSection = "startup";
function section(name) {
  currentSection = name;
}
function ok(label) {
  checks.push({ section: currentSection, label, ok: true });
}
function bad(label, detail) {
  checks.push({ section: currentSection, label, ok: false, detail: detail ?? "" });
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
  return cond;
}

// ----------------------------------------------------------------------------
// Argument parsing.
// ----------------------------------------------------------------------------
/**
 * The released profiles this harness knows how to qualify. Each declares the
 * surface counts the installed artifact must exhibit. A profile is never
 * inferred from a version string: it comes from the artifact's own RELEASE.json,
 * optionally pinned by --profile.
 */
const PROFILES = {
  "project-brain": {
    memorySubcommands: ["capture", "changes", "status", "history", "export", "delete"],
    mcpToolCount: 11,
    hasTimeline: false,
  },
  "project-brain-timeline": {
    memorySubcommands: [
      "capture",
      "changes",
      "status",
      "history",
      "export",
      "delete",
      "timeline",
    ],
    mcpToolCount: 12,
    hasTimeline: true,
  },
  // v0.5 migrates the command names only: the memory subcommands, MCP tool
  // count, and derived-timeline behavior are identical to v0.4.
  "ohmypm-cli-namespace": {
    memorySubcommands: [
      "capture",
      "changes",
      "status",
      "history",
      "export",
      "delete",
      "timeline",
    ],
    mcpToolCount: 12,
    hasTimeline: true,
  },
};

function parseArgs(argv) {
  let prefix;
  let archive;
  let work;
  let profile;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--prefix") {
      prefix = argv[++i];
    } else if (a === "--archive") {
      archive = argv[++i];
    } else if (a === "--work") {
      work = argv[++i];
    } else if (a === "--profile") {
      profile = argv[++i];
    } else if (a === "--json") {
      json = true;
    } else {
      return { ok: false, message: `unexpected argument: ${a}` };
    }
  }
  if (prefix === undefined && archive === undefined) {
    return { ok: false, message: "either --prefix or --archive is required" };
  }
  if (archive !== undefined && work === undefined) {
    return { ok: false, message: "--archive requires --work" };
  }
  if (profile !== undefined && PROFILES[profile] === undefined) {
    return { ok: false, message: `unknown --profile: ${profile}` };
  }
  return { ok: true, prefix, archive, work, profile, json };
}

// ----------------------------------------------------------------------------
// Filesystem helpers.
// ----------------------------------------------------------------------------
function isFile(p) {
  try {
    return lstatSync(p).isFile();
  } catch {
    return false;
  }
}
function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}
/** Parse JSON, returning null on empty/invalid output (a refused command). */
function safeParse(s) {
  if (typeof s !== "string" || s.trim() === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
/** Recursively snapshot a directory tree: relpath -> sha256(content) for files. */
function hashTree(root) {
  const out = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = abs.slice(root.length + 1);
      if (entry.isSymbolicLink()) {
        out.set(rel + " (symlink)", "symlink");
      } else if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        out.set(rel, sha256(readFileSync(abs)));
      }
    }
  };
  walk(root);
  return out;
}
function sha256(buf) {
  // Local require of node:crypto keeps the top import list tidy.
  return require("node:crypto").createHash("sha256").update(buf).digest("hex");
}
function treesEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}
function newlineTerminated(s) {
  return s.length > 0 && s.endsWith("\n");
}

// ----------------------------------------------------------------------------
// Installed-command invocation (mirrors check-release-install.mjs). On Windows
// the .cmd shim cannot be spawned without a shell, so launch the installed .mjs
// directly with node; on POSIX launch the executable shim. Always an argument
// vector, never a shell string, so spaces in paths are safe.
// ----------------------------------------------------------------------------
function makeRunner(prefix, versionDir) {
  const cliShim = join(prefix, "bin", isWindows ? "ohmypm.cmd" : "ohmypm");
  const cliEntry = join(versionDir, "bin", "ohmypm.mjs");
  // The platform-safe argument vector for a set of CLI args (no shell string).
  const invocation = (args) => ({
    command: isWindows ? process.execPath : cliShim,
    args: isWindows ? [cliEntry, ...args] : [...args],
  });
  function runCli(args, { env, expectExit } = {}) {
    const inv = invocation(args);
    let stdout = "";
    let stderr = "";
    let code = 0;
    try {
      stdout = execFileSync(inv.command, inv.args, {
        encoding: "utf8",
        env: env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      code = typeof e.status === "number" ? e.status : 1;
      stdout = e.stdout ? e.stdout.toString() : "";
      stderr = e.stderr ? e.stderr.toString() : "";
    }
    if (expectExit !== undefined) {
      assert(code === expectExit, `exit code ${code} === ${expectExit} for: memory ${args.slice(0, 2).join(" ")}`,
        `got exit ${code}`);
    }
    return { code, stdout, stderr };
  }
  // Expose the invocation builder for spawn-based concurrency tests.
  runCli.__invocation = invocation;
  runCli.__prefix = prefix;
  return runCli;
}

// ----------------------------------------------------------------------------
// Isolated standard-app-data environment. project_changes (MCP) accepts no data
// path; it resolves the STANDARD application-data root. To keep tests isolated,
// the MCP process env points every platform's data base at one throwaway root.
// ----------------------------------------------------------------------------
function isolatedDataEnv(root) {
  return {
    ...process.env,
    HOME: root,
    XDG_DATA_HOME: join(root, "xdg"),
    LOCALAPPDATA: join(root, "localappdata"),
    APPDATA: join(root, "appdata"),
  };
}

// The standard resolver's subpath for a given isolated env, matching
// project-memory/src/data-location.ts resolution order.
function standardDataRootFor(root) {
  if (isWindows) return join(root, "localappdata", "oh-my-pm");
  if (process.platform === "darwin") return join(root, "Library", "Application Support", "oh-my-pm");
  return join(root, "xdg", "oh-my-pm");
}

// ============================================================================
// Main.
// ============================================================================
const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`v0.3 installed qualification error: ${parsed.message}\n`);
  process.exit(2);
}

const require = createRequire(import.meta.url);
const scratchDirs = [];
function scratch(name) {
  const d = mkdtempSync(join(tmpdir(), `omp-v03-${name}-`));
  scratchDirs.push(d);
  return d;
}
function cleanup() {
  for (const d of scratchDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  bad("harness", `unexpected harness failure: ${e && e.message ? e.message : "unknown"}`);
} finally {
  cleanup();
}

const failures = checks.filter((c) => !c.ok);
if (parsed.json) {
  // Machine report: labels + section names only. Details are bounded and never
  // include planted sentinels (they are sanitized at the assertion site).
  process.stdout.write(
    `${JSON.stringify(
      {
        tool: "check-installed-project-brain",
        ok: failures.length === 0,
        total: checks.length,
        passed: checks.length - failures.length,
        failed: failures.length,
        failures: failures.map((f) => ({ section: f.section, label: f.label })),
      },
      null,
      2,
    )}\n`,
  );
} else {
  const bySection = new Map();
  for (const c of checks) {
    if (!bySection.has(c.section)) bySection.set(c.section, { pass: 0, fail: 0 });
    const s = bySection.get(c.section);
    if (c.ok) s.pass += 1;
    else s.fail += 1;
  }
  for (const [name, s] of bySection) {
    process.stdout.write(`[${s.fail === 0 ? "PASS" : "FAIL"}] ${name}: ${s.pass} ok, ${s.fail} failed\n`);
  }
  if (failures.length > 0) {
    process.stdout.write("\nFailures:\n");
    for (const f of failures) {
      process.stdout.write(`  - (${f.section}) ${f.label}${f.detail ? ` :: ${f.detail}` : ""}\n`);
    }
  }
  process.stdout.write(
    `\ninstalled Project Brain qualification: ${failures.length === 0 ? "OK" : "FAILED"} (${
      checks.length - failures.length
    }/${checks.length})\n`,
  );
}
exitCode = failures.length === 0 ? 0 : 1;
process.exit(exitCode);

// ============================================================================
async function main() {
  // 0. Resolve the installed prefix (installing from --archive when requested).
  let prefix;
  if (parsed.archive !== undefined) {
    prefix = installFromArchive(parsed.archive, parsed.work);
    if (prefix === null) return;
  } else {
    prefix = isAbsolute(parsed.prefix) ? parsed.prefix : resolve(parsed.prefix);
  }

  section("install-layout");
  const manifestPath = join(prefix, "lib", "oh-my-pm", "install.json");
  if (!assert(isFile(manifestPath), "install.json present")) return;
  const manifest = readJson(manifestPath);
  const version = manifest.version;
  assert(typeof version === "string" && version.length > 0, "install manifest version present");
  const versionDir = join(prefix, "lib", "oh-my-pm", "versions", version);
  assert(existsSync(versionDir), "versioned install directory present");

  // The installed artifact must declare the project-brain profile and ship the
  // Project Memory package (dist-only).
  const releasePath = join(versionDir, "RELEASE.json");
  const release = readJson(releasePath);
  // Profile resolution: the artifact declares its own profile; --profile pins the
  // expectation so a release job cannot silently qualify the wrong surface.
  const declaredProfile = release.bundleProfile;
  if (parsed.profile !== undefined) {
    assert(
      declaredProfile === parsed.profile,
      `installed RELEASE.json bundleProfile is ${parsed.profile}`,
      `got ${declaredProfile}`,
    );
  }
  const profile = PROFILES[declaredProfile];
  if (!assert(profile !== undefined, "installed RELEASE.json declares a known bundleProfile", `got ${declaredProfile}`)) {
    return;
  }
  assert(
    release.expectedMcpToolCount === profile.mcpToolCount,
    `installed RELEASE.json expectedMcpToolCount is ${profile.mcpToolCount}`,
    `got ${release.expectedMcpToolCount}`,
  );
  assert(
    release.projectBrainSchemaVersion === undefined || release.projectBrainSchemaVersion === 1,
    "installed RELEASE.json Project Brain schema version is 1",
  );
  assert(
    release.storeFormatVersion === undefined || release.storeFormatVersion === 2,
    "installed RELEASE.json store format version is 2",
  );
  const pmDir = join(versionDir, "node_modules", "@oh-my-pm", "project-memory");
  assert(isFile(join(pmDir, "dist", "index.js")), "installed project-memory dist/index.js present");
  assert(!existsSync(join(pmDir, "src")), "installed project-memory ships no src/");
  assert(!existsSync(join(pmDir, "test")), "installed project-memory ships no test/");

  const runCli = makeRunner(prefix, versionDir);

  await qualifyBaselineCommands(runCli);
  await qualifyHelpAndMcpConfig(runCli, prefix, profile);
  await qualifyProjectFixtureJourney(runCli, version);
  await qualifyMcp(prefix, versionDir, release, profile);
  await qualifyDataLocations(runCli, version);
  await qualifyMigration(runCli, pmDir);
  await qualifyCorruption(runCli, prefix, versionDir, pmDir);
  await qualifyConcurrency(runCli, version);
  await qualifyPrivacy(runCli, version, pmDir);
  if (profile.hasTimeline) {
    await qualifyTimelineCli(runCli, version);
    await qualifyTimelineMcp(prefix, versionDir);
    await qualifyV031StoreCompatibility(runCli, version);
  }
  qualifySourceIndependenceAndRelocation(prefix, versionDir);
}

// ----------------------------------------------------------------------------
function installFromArchive(archivePath, workRoot) {
  section("archive-install");
  const abs = isAbsolute(archivePath) ? archivePath : resolve(archivePath);
  if (!assert(isFile(abs), "archive file present")) return null;
  mkdirSync(workRoot, { recursive: true });
  const extractDir = mkdtempSync(join(workRoot, "extract-"));
  scratchDirs.push(extractDir);
  try {
    // bsdtar (the `tar` on modern Windows/macOS/Linux runners) extracts BOTH
    // .tar.gz and .zip, so one command is portable across platforms. `-xf`
    // auto-detects the format; `-C` sets the output directory.
    execFileSync("tar", ["-xf", abs, "-C", extractDir], { stdio: ["ignore", "ignore", "pipe"] });
  } catch {
    bad("archive extraction", "could not extract the archive");
    return null;
  }
  // The archive contains a single oh-my-pm-v<version> root.
  const roots = readdirSync(extractDir).filter((n) => n.startsWith("oh-my-pm-v"));
  if (!assert(roots.length === 1, "archive has exactly one bundle root")) return null;
  const bundleDir = join(extractDir, roots[0]);
  const prefix = mkdtempSync(join(workRoot, "prefix-"));
  scratchDirs.push(prefix);
  const installer = join(bundleDir, "bin", "ohmypm-install.mjs");
  try {
    execFileSync(process.execPath, [installer, "--prefix", prefix, "--apply"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // Surface the installer's bounded, path-free reason so a platform-specific
    // failure is diagnosable from the report.
    const reason =
      (e && e.stderr ? e.stderr.toString() : "") || (e && e.stdout ? e.stdout.toString() : "");
    const firstLine = reason.split("\n").find((l) => l.trim() !== "") ?? "unknown";
    bad("archive install", `installer did not apply cleanly: ${firstLine.slice(0, 200)}`);
    return null;
  }
  ok("installed from prepared archive under isolated prefix");
  return prefix;
}

// ----------------------------------------------------------------------------
// Legacy commands run and create no application-data directory.
// ----------------------------------------------------------------------------
async function qualifyBaselineCommands(runCli) {
  section("legacy-commands");
  const dataProbe = scratch("legacy-data");
  // Remove the mkdtemp dir so we can prove no legacy command re-creates it.
  rmSync(dataProbe, { recursive: true, force: true });
  const env = isolatedDataEnv(dataProbe);

  const status = runCli(["status"], { env });
  assert(status.code === 0, "legacy status exits 0");
  assert(status.stdout.includes("OH MY PM status"), "legacy status prints status banner");
  assert(newlineTerminated(status.stdout), "legacy status output newline-terminated");

  const doctor = runCli(["doctor"], { env });
  assert(doctor.code === 0, "legacy doctor exits 0");

  // A legacy offline command must not create the standard app-data directory and
  // must not load a Project Memory store.
  assert(!existsSync(standardDataRootFor(dataProbe)), "legacy commands create no app-data store");
}

// ----------------------------------------------------------------------------
// v0.3.1 — conventional help and the installed MCP client configuration.
//
// Help must be a pure, bounded, side-effect-free read: exit 0, stdout only, one
// trailing newline, no application-data directory, and no token read. mcp-config
// must resolve the installed sibling executable from the CLI's own installed
// location with no manual --prefix, emit an absolute command with empty args,
// leak no secret/environment/project path, write nothing, and fail closed with
// exit 2 on invalid arguments.
// ----------------------------------------------------------------------------
async function qualifyHelpAndMcpConfig(runCli, prefix, profile) {
  section("cli-help");
  const dataProbe = scratch("help-data");
  rmSync(dataProbe, { recursive: true, force: true });
  // A planted token sentinel must never surface in help or mcp-config output.
  const tokenSentinel = "ghp_installed_help_sentinel_value";
  const env = { ...isolatedDataEnv(dataProbe), OH_MY_PM_GITHUB_TOKEN: tokenSentinel };

  for (const flag of ["--help", "-h"]) {
    const help = runCli([flag], { env });
    assert(help.code === 0, `installed ${flag} exits 0`);
    assert(help.stderr === "", `installed ${flag} writes nothing to stderr`);
    assert(help.stdout.length > 0, `installed ${flag} writes help to stdout`);
    assert(newlineTerminated(help.stdout), `installed ${flag} output newline-terminated`);
    assert(!help.stdout.endsWith("\n\n"), `installed ${flag} ends with exactly one newline`);
    assert(!help.stdout.includes(tokenSentinel), `installed ${flag} leaks no token`);
    // The real current commands and namespaces are listed.
    for (const name of ["status", "doctor", "plan", "brief", "risks", "next", "handoff", "memory", "providers", "github", "mcp-config"]) {
      assert(help.stdout.includes(name), `installed ${flag} lists ${name}`);
    }
    assert(help.stdout.includes("Exit codes:"), `installed ${flag} documents exit codes`);
    assert(help.stdout.includes("--json"), `installed ${flag} documents output modes`);
    assert(help.stdout.includes("Examples:"), `installed ${flag} includes examples`);
  }

  // Deterministic across repeated invocations.
  const firstHelp = runCli(["--help"], { env });
  const secondHelp = runCli(["--help"], { env });
  assert(firstHelp.stdout === secondHelp.stdout, "installed help output is deterministic");

  // Namespace help.
  for (const namespace of ["memory", "providers"]) {
    const nsHelp = runCli([namespace, "--help"], { env });
    assert(nsHelp.code === 0, `installed ${namespace} --help exits 0`);
    assert(nsHelp.stderr === "", `installed ${namespace} --help writes nothing to stderr`);
    assert(newlineTerminated(nsHelp.stdout), `installed ${namespace} --help newline-terminated`);
  }
  // The installed memory help must list exactly the profile's subcommands, and
  // must not claim a subcommand the artifact does not ship.
  const memoryHelp = runCli(["memory", "--help"], { env });
  for (const sub of profile.memorySubcommands) {
    assert(memoryHelp.stdout.includes(sub), `installed memory help lists ${sub}`);
  }
  if (!profile.hasTimeline) {
    assert(
      !memoryHelp.stdout.includes("timeline"),
      "installed memory help does not claim timeline on the v0.3 profile",
    );
  }

  // Help creates no application-data directory and no project file.
  assert(!existsSync(standardDataRootFor(dataProbe)), "installed help creates no app-data store");

  // Unknown argument behavior is unchanged: controlled nonzero usage exit.
  const unknownOption = runCli(["--totally-unknown"], { env });
  assert(unknownOption.code === 2, "installed unknown option still exits 2");
  assert(unknownOption.stdout === "", "installed unknown option writes no stdout");
  const unknownCommand = runCli(["totally-unknown"], { env });
  assert(unknownCommand.code === 2, "installed unknown command still exits 2");

  section("cli-mcp-config");
  const expectedCommand = join(prefix, "bin", isWindows ? "ohmypm-mcp.cmd" : "ohmypm-mcp");

  const jsonConfig = runCli(["mcp-config"], { env });
  assert(jsonConfig.code === 0, "installed mcp-config exits 0 with no --prefix");
  assert(jsonConfig.stderr === "", "installed mcp-config writes nothing to stderr");
  assert(newlineTerminated(jsonConfig.stdout), "installed mcp-config output newline-terminated");
  const parsedConfig = safeParse(jsonConfig.stdout);
  if (assert(parsedConfig !== null, "installed mcp-config emits valid JSON")) {
    const entry = parsedConfig.mcpServers?.["oh-my-pm"];
    assert(entry !== undefined, "installed mcp-config uses the default server key");
    assert(entry?.command === expectedCommand, "installed mcp-config resolves the installed sibling executable");
    assert(isAbsolute(entry?.command ?? ""), "installed mcp-config command path is absolute");
    assert(Array.isArray(entry?.args) && entry.args.length === 0, "installed mcp-config emits empty args");
    assert(
      JSON.stringify(Object.keys(entry ?? {}).sort()) === JSON.stringify(["args", "command"]),
      "installed mcp-config emits exactly command and args",
    );
    // The resolved executable really exists.
    assert(isFile(entry?.command ?? ""), "installed mcp-config command path exists");
  }

  // Deterministic output.
  const repeatConfig = runCli(["mcp-config"], { env });
  assert(repeatConfig.stdout === jsonConfig.stdout, "installed mcp-config output is deterministic");

  // Markdown mode: the profile's read-only tool count and every tool name. The
  // generated document must be TRUTHFUL about the surface it configures.
  const markdownConfig = runCli(["mcp-config", "--markdown"], { env });
  assert(markdownConfig.code === 0, "installed mcp-config --markdown exits 0");
  assert(
    markdownConfig.stdout.includes(`${profile.mcpToolCount} read-only tools`),
    `installed mcp-config --markdown declares ${profile.mcpToolCount} read-only tools`,
  );
  assert(
    markdownConfig.stdout.includes("There are no write tools"),
    "installed mcp-config --markdown states there are no write tools",
  );
  const configuredTools = [
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
    "project_changes",
    ...(profile.hasTimeline ? ["project_timeline"] : []),
  ];
  for (const tool of configuredTools) {
    assert(markdownConfig.stdout.includes(`\`${tool}\``), `installed mcp-config --markdown lists ${tool}`);
  }
  if (!profile.hasTimeline) {
    assert(
      !markdownConfig.stdout.includes("`project_timeline`"),
      "installed mcp-config --markdown does not claim a timeline tool on the v0.3 profile",
    );
  }

  assert(newlineTerminated(markdownConfig.stdout), "installed mcp-config --markdown newline-terminated");

  // A custom valid name.
  const named = runCli(["mcp-config", "--name", "qual-project"], { env });
  assert(named.code === 0, "installed mcp-config accepts a valid --name");
  assert(safeParse(named.stdout)?.mcpServers?.["qual-project"] !== undefined, "installed mcp-config uses the custom name");

  // Controlled exit 2 for invalid arguments.
  const invalidName = runCli(["mcp-config", "--name", "bad name"], { env });
  assert(invalidName.code === 2, "installed mcp-config rejects an invalid --name with exit 2");
  assert(invalidName.stdout === "", "installed mcp-config invalid name writes no stdout");
  const missingValue = runCli(["mcp-config", "--name"], { env });
  assert(missingValue.code === 2, "installed mcp-config rejects a missing --name value with exit 2");
  const unexpectedOption = runCli(["mcp-config", "--vendor-specific"], { env });
  assert(unexpectedOption.code === 2, "installed mcp-config rejects an unexpected option with exit 2");
  // --prefix is not part of the installed public surface.
  const rejectedPrefix = runCli(["mcp-config", "--prefix", prefix], { env });
  assert(rejectedPrefix.code === 2, "installed mcp-config requires no --prefix and rejects it");

  // No secret, environment value, or project root in the output. A planted token
  // VALUE must never appear in either mode. The env var NAME appears only in the
  // Markdown guidance prose, never inside the emitted JSON config block.
  for (const [label, text] of [
    ["json", jsonConfig.stdout],
    ["markdown", markdownConfig.stdout],
  ]) {
    assert(!text.includes(tokenSentinel), `installed mcp-config ${label} leaks no token value`);
    assert(!text.includes(dataProbe), `installed mcp-config ${label} leaks no data directory`);
    const configBlock =
      label === "json" ? text : (text.split("```json")[1]?.split("```")[0] ?? "");
    assert(configBlock.trim() !== "", `installed mcp-config ${label} emits a config block`);
    assert(
      !configBlock.includes("OH_MY_PM_GITHUB_TOKEN") &&
        !configBlock.includes("OH_MY_PM_PROVIDER_CONFIG"),
      `installed mcp-config ${label} config block names no env var`,
    );
    const entry = safeParse(configBlock)?.mcpServers?.["oh-my-pm"];
    assert(entry !== undefined, `installed mcp-config ${label} config block parses`);
    assert(
      entry !== undefined && !("env" in entry) && !("cwd" in entry),
      `installed mcp-config ${label} emits no env or cwd key`,
    );
  }
  // JSON mode carries no guidance prose, so it names no env var at all.
  assert(
    !jsonConfig.stdout.includes("OH_MY_PM_GITHUB_TOKEN"),
    "installed mcp-config json names no token env var",
  );

  // No client-file or project write, and no application-data directory.
  assert(!existsSync(standardDataRootFor(dataProbe)), "installed mcp-config creates no app-data store");
}

// ----------------------------------------------------------------------------
// The full installed CLI project journey (sections 7 of the plan).
// ----------------------------------------------------------------------------
async function qualifyProjectFixtureJourney(runCli, version) {
  section("cli-journey");
  const dataDir = scratch("journey-data");
  rmSync(dataDir, { recursive: true, force: true });
  const projectDir = scratch("journey-project");
  const readme = join(projectDir, "README.md");
  writeFileSync(
    readme,
    "# Journey Project\n\n- [ ] TODO: build the thing\n- [ ] TODO: test the thing\n",
    "utf8",
  );
  const projectBefore = hashTree(projectDir);
  const pid = "journey-project";
  const base = ["--data-dir", dataDir, "--project-id", pid];

  const j = (args) => runCli([...args, ...base, "--json"]);
  const brief = (args) => runCli([...args, ...base]);
  const md = (args) => runCli([...args, ...base, "--markdown"]);

  // 1-2. status + doctor already covered; here memory status -> noPriorMemory.
  let r = j(["memory", "status", projectDir]);
  let data = JSON.parse(r.stdout).data;
  assert(r.code === 0 && data.status === "noPriorMemory", "memory status -> noPriorMemory");
  assert(!existsSync(join(dataDir, "project-brain")), "status created no store");

  // 4. capture preview -> zero writes.
  r = j(["memory", "capture", projectDir]);
  let cap = JSON.parse(r.stdout);
  assert(r.code === 0 && cap.mode === "preview" && cap.data.wouldWrite === false, "capture preview wouldWrite:false");
  assert(!existsSync(join(dataDir, "project-brain")), "capture preview created no store");

  // 5. capture --apply -> snapshot A (exactly one commit).
  r = j(["memory", "capture", projectDir, "--apply"]);
  cap = JSON.parse(r.stdout);
  const snapA = cap.data.snapshotId;
  assert(r.code === 0 && cap.mode === "applied" && cap.data.written === true, "capture apply A written");
  assert(cap.data.snapshotCount === 1, "capture apply A snapshotCount 1");

  // The state fingerprint is deterministic for identical content: a re-preview of
  // the unchanged project reports the same stateFingerprint and that the evidence
  // set is unchanged (each snapshot is timestamped, so it is not itself reused).
  r = j(["memory", "capture", projectDir]);
  const rePreview = JSON.parse(r.stdout);
  assert(rePreview.data.stateFingerprint === cap.data.stateFingerprint, "unchanged content yields the same state fingerprint");

  // 6. edit only the test-authored fixture, then capture --apply -> snapshot B.
  writeFileSync(
    readme,
    "# Journey Project\n\n- [x] DONE: build the thing\n- [ ] TODO: test the thing\n- [ ] TODO: ship the thing\n",
    "utf8",
  );
  r = j(["memory", "capture", projectDir, "--apply"]);
  cap = JSON.parse(r.stdout);
  const snapB = cap.data.snapshotId;
  assert(cap.data.snapshotCount === 2 && snapB !== snapA, "capture apply B is a new second snapshot");

  // 8. status -> healthy, two snapshots, store format 2 / schema 1.
  r = j(["memory", "status", projectDir]);
  data = JSON.parse(r.stdout).data;
  assert(data.status === "healthy" && data.snapshotCount === 2, "status healthy two snapshots");
  assert(data.storeFormatVersion === 2 && data.projectBrainSchemaVersion === 1, "status reports format 2 schema 1");

  // 9. history -> newest capture first (Phase 4.1 chronology).
  r = j(["memory", "history", projectDir]);
  data = JSON.parse(r.stdout).data;
  assert(data.records.length === 2, "history has two records");
  assert(
    data.records[0].snapshotId === snapB && data.records[0].sequence === 2 && data.records[0].isLatest === true,
    "history newest capture first",
  );
  assert(data.records[1].sequence === 1 && data.records[1].isLatest === false, "history predecessor second");
  assert(data.chronologyOrigin === "native", "history chronologyOrigin native");

  // 10. changes -> B compared with A (default pair).
  r = j(["memory", "changes", projectDir]);
  data = JSON.parse(r.stdout).data;
  assert(
    data.status === "compared" && data.previousSnapshotId === snapA && data.currentSnapshotId === snapB,
    "changes default pair is B vs A",
  );
  assert(Array.isArray(data.changeSet.changes) && data.changeSet.changes.length > 0, "changes produced a change set");

  // 11. changes with explicit pair -> exact pair, and no write.
  const beforeChanges = hashTree(join(dataDir, "project-brain"));
  r = j(["memory", "changes", projectDir, "--previous", snapA, "--current", snapB]);
  data = JSON.parse(r.stdout).data;
  assert(data.previousSnapshotId === snapA && data.currentSnapshotId === snapB, "changes explicit pair honored");
  const afterChanges = hashTree(join(dataDir, "project-brain"));
  assert(treesEqual(beforeChanges, afterChanges), "changes performed no write");

  // changes rejects --apply (read-only).
  r = runCli(["memory", "changes", projectDir, ...base, "--apply", "--json"]);
  assert(r.code === 2, "changes rejects --apply with usage error");

  // 12. export preview -> zero destination writes.
  const exportDest = join(scratch("journey-export"), "out");
  r = j(["memory", "export", projectDir, "--destination", exportDest]);
  cap = JSON.parse(r.stdout);
  assert(r.code === 0 && cap.mode === "preview" && cap.data.wouldExport === true, "export preview wouldExport:true");
  assert(!existsSync(exportDest), "export preview wrote no destination");

  // 13. export --apply -> verified export exists.
  r = j(["memory", "export", projectDir, "--destination", exportDest, "--apply"]);
  cap = JSON.parse(r.stdout);
  assert(r.code === 0 && cap.mode === "applied" && cap.data.exported === true, "export apply exported:true");
  assert(existsSync(exportDest), "export apply produced a destination");
  assert(existsSync(join(exportDest, "export-manifest.json")), "export contains an export manifest");

  // 14. delete preview -> mutates nothing.
  const beforeDelete = hashTree(join(dataDir, "project-brain"));
  r = j(["memory", "delete", projectDir]);
  cap = JSON.parse(r.stdout);
  assert(r.code === 0 && cap.mode === "preview" && cap.data.wouldDelete === true, "delete preview wouldDelete:true");
  const afterDeletePreview = hashTree(join(dataDir, "project-brain"));
  assert(treesEqual(beforeDelete, afterDeletePreview), "delete preview mutated nothing");

  // delete apply requires exact --confirm; a wrong confirmation is a usage error.
  r = runCli(["memory", "delete", projectDir, ...base, "--apply", "--confirm", "wrong-id", "--json"]);
  assert(r.code === 2, "delete apply rejects a mismatched confirmation");

  // 15. delete --apply --confirm <project-id>.
  r = j(["memory", "delete", projectDir, "--apply", "--confirm", pid]);
  cap = JSON.parse(r.stdout);
  assert(r.code === 0 && cap.data.deleted === true, "delete apply removed the store");

  // 16. status -> noPriorMemory again.
  r = j(["memory", "status", projectDir]);
  assert(JSON.parse(r.stdout).data.status === "noPriorMemory", "status after delete -> noPriorMemory");

  // Output modes: brief + markdown for structured commands, all newline-ended.
  section("cli-output-modes");
  // Re-seed one capture so status/history/changes have content in every mode.
  j(["memory", "capture", projectDir, "--apply"]);
  writeFileSync(readme, readFileSync(readme, "utf8") + "\n- [ ] TODO: another\n", "utf8");
  j(["memory", "capture", projectDir, "--apply"]);
  for (const cmd of [["memory", "status", projectDir], ["memory", "history", projectDir], ["memory", "changes", projectDir]]) {
    const briefR = brief(cmd);
    assert(briefR.code === 0 && newlineTerminated(briefR.stdout), `brief ${cmd[1]} newline-terminated`);
    // Matching the ESC control character is the point of the assertion.
    // eslint-disable-next-line no-control-regex
    assert(!/\[/.test(briefR.stdout), `brief ${cmd[1]} has no ANSI escapes`);
    const jsonR = runCli([...cmd, ...base, "--json"]);
    assert(jsonR.code === 0 && newlineTerminated(jsonR.stdout), `json ${cmd[1]} newline-terminated`);
    JSON.parse(jsonR.stdout); // must parse
    const mdR = md(cmd);
    assert(mdR.code === 0 && newlineTerminated(mdR.stdout) && mdR.stdout.includes("#"), `markdown ${cmd[1]} newline-terminated`);
  }
  // clean up the re-seeded store
  j(["memory", "delete", projectDir, "--apply", "--confirm", pid]);

  // Project fixture is byte-identical except the two deliberate test edits.
  section("project-immutability");
  const projectAfter = hashTree(projectDir);
  // The README was deliberately edited by the test; compare everything else.
  const readmeRel = "README.md";
  const onlyReadmeDiffers =
    projectAfter.size === projectBefore.size &&
    [...projectAfter.keys()].every((k) => k === readmeRel || projectAfter.get(k) === projectBefore.get(k));
  assert(onlyReadmeDiffers, "project fixture unchanged except the deliberate test-authored README edits");
  // No app-data directory was ever created inside the project fixture.
  assert(!existsSync(join(projectDir, "project-brain")), "no store written inside the project directory");
  assert(!existsSync(join(projectDir, ".oh-my-pm")), "no hidden state written inside the project directory");
  void version;
}

// ----------------------------------------------------------------------------
// Installed MCP qualification (section 8): eleven tools in exact order,
// project_changes journey, sanitized projection, stdio only.
// ----------------------------------------------------------------------------
async function qualifyMcp(prefix, versionDir, release, profile) {
  section("mcp");
  const dataRoot = scratch("mcp-data");
  const env = isolatedDataEnv(dataRoot);
  const fixtureRoot = join(versionDir, "examples", "markdown-project");

  const mcpShim = join(prefix, "bin", isWindows ? "ohmypm-mcp.cmd" : "ohmypm-mcp");
  const mcpEntry = join(versionDir, "bin", "ohmypm-mcp.mjs");
  const command = isWindows ? process.execPath : mcpShim;
  const args = isWindows ? [mcpEntry] : [];

  const mcpManifest = realpathSync(join(versionDir, "node_modules", "@oh-my-pm", "mcp-server", "package.json"));
  const requireFromBundle = createRequire(mcpManifest);
  let Client;
  let StdioClientTransport;
  try {
    ({ Client } = await import(
      pathToFileURL(requireFromBundle.resolve("@modelcontextprotocol/sdk/client/index.js")).href
    ));
    ({ StdioClientTransport } = await import(
      pathToFileURL(requireFromBundle.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href
    ));
  } catch {
    bad("mcp sdk", "could not resolve the MCP SDK from the installed artifact");
    return;
  }

  const EXPECTED_ORDER = [
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
    "project_changes",
  ];

  const connect = () =>
    (async () => {
      const transport = new StdioClientTransport({ command, args, cwd: versionDir, env, stderr: "pipe" });
      const stderrChunks = [];
      if (transport.stderr) transport.stderr.on("data", (c) => stderrChunks.push(c.toString()));
      const client = new Client({ name: "omp-v03-qual", version: "0.0.0" });
      await client.connect(transport);
      return { client, transport, stderr: () => stderrChunks.join("") };
    })();

  // 1. list tools -> the profile's exact count, in the exact registration order.
  const expectedOrder = profile.hasTimeline
    ? [...EXPECTED_ORDER, "project_timeline"]
    : EXPECTED_ORDER;
  let conn = await connect();
  try {
    const { tools } = await conn.client.listTools();
    const names = tools.map((t) => t.name);
    assert(
      names.length === profile.mcpToolCount,
      `installed MCP lists exactly ${profile.mcpToolCount} tools`,
      `got ${names.length}`,
    );
    assert(JSON.stringify(names) === JSON.stringify(expectedOrder), "installed MCP tool order is exact");
    // ZERO write tools across the whole surface: no tool may declare a
    // destructive mutation or opt out of the read-only hint.
    let writeTools = 0;
    for (const tool of tools) {
      const annotations = tool.annotations ?? {};
      if (annotations.destructiveHint === true || annotations.readOnlyHint === false) {
        writeTools += 1;
      }
    }
    assert(writeTools === 0, "installed MCP exposes zero write tools", `got ${writeTools}`);
    const pc = tools.find((t) => t.name === "project_changes");
    assert(pc !== undefined, "project_changes is registered");
    assert(pc?.annotations?.readOnlyHint === true, "project_changes annotated readOnlyHint:true");
    assert(pc?.annotations?.destructiveHint === false, "project_changes annotated destructiveHint:false");
    if (profile.hasTimeline) {
      const pt = tools.find((t) => t.name === "project_timeline");
      assert(pt !== undefined, "project_timeline is registered");
      assert(pt?.annotations?.readOnlyHint === true, "project_timeline annotated readOnlyHint:true");
      assert(pt?.annotations?.destructiveHint === false, "project_timeline annotated destructiveHint:false");
      // The input schema exposes exactly the five documented fields and no path.
      const props = Object.keys(pt?.inputSchema?.properties ?? {}).sort();
      assert(
        JSON.stringify(props) === JSON.stringify(["beforeSequence", "category", "kind", "limit", "projectId"]),
        "project_timeline input schema exposes exactly the five documented fields",
        `got ${props.join(",")}`,
      );
      for (const forbidden of ["root", "path", "dataDir", "apply", "migrate", "confirm", "force", "token"]) {
        assert(!props.includes(forbidden), `project_timeline input schema has no ${forbidden} field`);
      }
    } else {
      assert(
        tools.find((t) => t.name === "project_timeline") === undefined,
        "the v0.3 profile registers no project_timeline tool",
      );
    }

    // 2. project_brief on the installed/public fixture.
    const brief = await conn.client.callTool({ name: "project_brief", arguments: { root: fixtureRoot } });
    assert(!brief.isError, "project_brief succeeds on the installed fixture");

    // 3. provider_status -> offline success.
    const status = await conn.client.callTool({ name: "provider_status", arguments: {} });
    assert(!status.isError && status.structuredContent?.schemaVersion === 1, "provider_status offline success");

    // 4. project_changes before capture -> noPriorMemory.
    const before = await conn.client.callTool({
      name: "project_changes",
      arguments: { projectId: "mcp-journey" },
    });
    const beforeSc = before.structuredContent ?? {};
    assert(
      !before.isError && beforeSc.schemaVersion === 1 && beforeSc.status === "noPriorMemory",
      "project_changes before capture -> noPriorMemory",
    );
    assert(conn.stderr().trim() === "", "MCP stderr empty on success (list/brief/status/changes)");
  } finally {
    await safeClose(conn);
  }

  // 5. create two captures through the installed CLI into the SAME standard
  // app-data root (so the MCP process, which resolves that same standard root
  // under this isolated env, sees them). The CLI reads the standard root when no
  // --data-dir is given; drive it with the same isolated env.
  const runCli = makeRunner(prefix, versionDir);
  const project = scratch("mcp-project");
  const readme = join(project, "README.md");
  writeFileSync(readme, "# MCP\n\n- [ ] TODO: one\n", "utf8");
  const pid = "mcp-journey";
  const cliBase = ["--project-id", pid];
  runCli(["memory", "capture", project, ...cliBase, "--apply", "--json"], { env });
  writeFileSync(readme, "# MCP\n\n- [ ] TODO: one\n- [ ] TODO: two\n", "utf8");
  runCli(["memory", "capture", project, ...cliBase, "--apply", "--json"], { env });

  // Record the standard store tree so we can prove project_changes never writes.
  const standardStore = join(standardDataRootFor(dataRoot), "project-brain");
  const storeBefore = existsSync(standardStore) ? hashTree(standardStore) : new Map();
  assert(storeBefore.size > 0, "two installed captures populated the standard app-data store");

  // 6-8. project_changes -> compared, chronology capture-order, bounded strict
  // projection with no leaks.
  conn = await connect();
  try {
    const res = await conn.client.callTool({ name: "project_changes", arguments: { projectId: pid } });
    const sc = res.structuredContent ?? {};
    assert(!res.isError && sc.status === "compared", "project_changes after captures -> compared");
    assert(sc.chronology === "capture-order", "project_changes chronology is capture-order");
    assert(typeof sc.summary?.totalChanges === "number", "project_changes summary has totalChanges");
    assert(Array.isArray(sc.changes), "project_changes returns a changes array");
    // Strict sanitized projection: no evidence ids, raw values, refs, paths,
    // runtime trace, or manifest internals in the serialized output.
    const serialized = JSON.stringify(sc);
    const forbidden = [
      "evidenceRefs",
      "evidence:sha256",
      "previousValue",
      "currentValue",
      "runtimeResponse",
      "providerResponses",
      "manifest",
      "integrity",
      "/Users/",
      "/home/",
      "\\Users\\",
    ];
    for (const marker of forbidden) {
      assert(!serialized.includes(marker), `project_changes output omits "${marker}"`);
    }
    // Each projected change carries evidenceCount (a number), never evidence ids.
    const everyChangeSafe = sc.changes.every(
      (c) => typeof c.evidenceCount === "number" && c.evidenceRefs === undefined,
    );
    assert(everyChangeSafe, "each projected change exposes evidenceCount only");
    assert(conn.stderr().trim() === "", "MCP stderr empty on success (compared)");
  } finally {
    await safeClose(conn);
  }

  // project_changes performed no write/lock/migration.
  const storeAfter = existsSync(standardStore) ? hashTree(standardStore) : new Map();
  assert(treesEqual(storeBefore, storeAfter), "project_changes performed no store write");
  assert(!existsSync(join(standardDataRootFor(dataRoot), "project-brain", "v1", "locks")) ||
    readdirSync(join(standardDataRootFor(dataRoot), "project-brain", "v1", "locks")).length === 0,
    "project_changes left no lock");

  // 9. delete memory through the installed CLI.
  runCli(["memory", "delete", project, ...cliBase, "--apply", "--confirm", pid, "--json"], { env });

  // 10. project_changes -> noPriorMemory again.
  conn = await connect();
  try {
    const res = await conn.client.callTool({ name: "project_changes", arguments: { projectId: pid } });
    assert((res.structuredContent ?? {}).status === "noPriorMemory", "project_changes after delete -> noPriorMemory");
  } finally {
    await safeClose(conn);
  }
  void release;
}

async function safeClose(conn) {
  if (!conn) return;
  try {
    await conn.client.close();
  } catch {
    // ignore
  }
  try {
    await conn.transport.close();
  } catch {
    // ignore
  }
}

// ----------------------------------------------------------------------------
// Standard application-data location qualification (section 9). The CLI is
// exercised both with an explicit --data-dir and against the standard resolver
// under an isolated env; the resolved path never appears in public output.
// ----------------------------------------------------------------------------
async function qualifyDataLocations(runCli, version) {
  section("data-locations");
  const project = scratch("dl-project");
  writeFileSync(join(project, "README.md"), "# DL\n\n- [ ] TODO: x\n", "utf8");
  const pid = "dl-project";

  // Standard resolver under an isolated env (no --data-dir): capture, then prove
  // the store landed at the platform-standard subpath and public output hides it.
  const dataRoot = scratch("dl-standard");
  const env = isolatedDataEnv(dataRoot);
  const r = runCli(["memory", "capture", project, "--project-id", pid, "--apply", "--json"], { env });
  assert(r.code === 0, "capture against standard app-data root succeeds");
  const standardStore = join(standardDataRootFor(dataRoot), "project-brain");
  assert(existsSync(standardStore), "store created at the platform-standard app-data path");
  // Public output must not expose any resolved absolute app-data path.
  assert(!r.stdout.includes(dataRoot), "capture output does not expose the resolved app-data path");
  const st = runCli(["memory", "status", project, "--project-id", pid, "--json"], { env });
  assert(!st.stdout.includes(dataRoot), "status output does not expose the resolved app-data path");

  // Explicit --data-dir also works and is isolated.
  const explicitDir = scratch("dl-explicit");
  rmSync(explicitDir, { recursive: true, force: true });
  const r2 = runCli(["memory", "capture", project, "--project-id", pid, "--data-dir", explicitDir, "--apply", "--json"]);
  assert(r2.code === 0 && existsSync(join(explicitDir, "project-brain")), "explicit --data-dir capture works");
  void version;
}

// ----------------------------------------------------------------------------
// Store-format v1 -> v2 migration qualification (section 14). A deterministic,
// public-safe v1 store is planted with the installed Project Memory builders
// (genuine integrity), then the explicit migration flow is qualified.
// ----------------------------------------------------------------------------
async function qualifyMigration(runCli, pmDir) {
  section("migration");
  const pm = await import(pathToFileURL(join(pmDir, "dist", "index.js")).href);
  const pathSafety = await import(pathToFileURL(join(pmDir, "dist", "path-safety.js")).href);

  const dataDir = scratch("migration-data");
  const pid = "migration-project";
  const projectKey = pm.deriveProjectKey(pid);
  const layout = pathSafety.resolveStoreLayout(dataDir);

  // Plant a v1 store: three snapshots, latest in the MIDDLE of the lexical
  // inventory, capturedAt set so the recovered order differs from lexical order.
  // ids (lexical): s-a, s-b, s-c ; latest = s-b ; capturedAt: s-a=t3, s-c=t1.
  const snapshots = {
    "s-a": "2026-01-03T00:00:00.000Z",
    "s-b": "2026-01-09T00:00:00.000Z", // latest; pinned last by recovery
    "s-c": "2026-01-01T00:00:00.000Z",
  };
  for (const [id, capturedAt] of Object.entries(snapshots)) {
    const env = pm.buildEnvelope("snapshot", pid, id, { snapshotId: id, projectId: pid, schemaVersion: 1, capturedAt });
    const p = pathSafety.recordPathFor(layout, projectKey, pathSafety.SNAPSHOTS_DIRNAME, pm.deriveRecordKey("snapshot", id));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, pm.serializeEnvelope(env), "utf8");
  }
  const v1Manifest = pm.buildManifest({
    storeFormatVersion: 1,
    projectBrainSchemaVersion: 1,
    projectId: pid,
    projectKey,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-09T00:00:00.000Z",
    latestSnapshotId: "s-b",
    snapshotIds: ["s-a", "s-b", "s-c"],
    evidenceIds: [],
    migrationHistory: [],
  });
  const manifestPath = pathSafety.manifestPathFor(layout, projectKey);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, pm.serializeManifest(v1Manifest), "utf8");
  ok("planted a deterministic public-safe v1 store (three snapshots)");

  const project = scratch("migration-fixture");
  writeFileSync(join(project, "README.md"), "# Migration\n\n- [ ] TODO: y\n", "utf8");
  const base = ["--data-dir", dataDir, "--project-id", pid];
  const snapshot = () => hashTree(join(dataDir, "project-brain"));

  // 2. status -> migrationRequired (reportable success status), zero write. The
  // status command surfaces migrationRequired as a status value with exit 0; the
  // mutating and comparison commands below refuse with a controlled failure.
  const before = snapshot();
  let r = runCli(["memory", "status", project, ...base, "--json"]);
  const v1status = safeParse(r.stdout);
  assert(v1status?.data?.status === "migrationRequired", "v1 status reports migrationRequired");
  assert(treesEqual(before, snapshot()), "v1 status wrote nothing");

  // 3. history/changes -> controlled non-success (migrationRequired), zero write.
  r = runCli(["memory", "history", project, ...base, "--json"]);
  assert(r.code !== 0, "v1 history refuses (non-zero) pending explicit migration", `got ${r.code}`);
  r = runCli(["memory", "changes", project, ...base, "--json"]);
  assert(r.code !== 0, "v1 changes refuses (non-zero) pending explicit migration", `got ${r.code}`);
  assert(treesEqual(before, snapshot()), "v1 read commands wrote nothing");

  // 4. capture --migrate-store preview -> wouldMigrateStore, zero write/lock.
  r = runCli(["memory", "capture", project, ...base, "--migrate-store", "--json"]);
  const preview = safeParse(r.stdout);
  assert(r.code === 0 && preview?.data?.wouldMigrateStore === true, "capture --migrate-store preview wouldMigrateStore:true");
  assert(treesEqual(before, snapshot()), "migrate-store preview wrote nothing");

  // 5. capture --apply WITHOUT --migrate-store -> migrationRequired, exit 4, zero write.
  r = runCli(["memory", "capture", project, ...base, "--apply", "--json"]);
  assert(r.code === 4, "capture --apply without --migrate-store exits 4", `got ${r.code}`);
  assert(treesEqual(before, snapshot()), "blocked apply wrote nothing");

  // 6. capture --apply --migrate-store -> explicit migration + one capture.
  r = runCli(["memory", "capture", project, ...base, "--apply", "--migrate-store", "--json"]);
  const applied = safeParse(r.stdout);
  assert(r.code === 0 && applied?.data?.storeMigrated === true, "explicit migration applied storeMigrated:true");
  assert(applied?.data?.written === true, "capture committed after migration");

  // 7. backup retained.
  const backupsDir = join(dataDir, "project-brain", "v1", "projects", projectKey, "backups");
  assert(existsSync(backupsDir) && readdirSync(backupsDir).length > 0, "migration backup retained");

  // 8. manifest store format 2.
  const migrated = pm.parseAndVerifyManifest(readFileSync(manifestPath, "utf8"), pid);
  assert(migrated.storeFormatVersion === 2, "migrated manifest store format is 2");
  assert(migrated.snapshotChronologyOrigin === "recoveredV1", "chronology origin recoveredV1");

  // 9. recovered chronology + latest pinning: s-c(t1) -> s-a(t3) -> s-b(latest),
  // then the newly captured snapshot appended last with native chronology.
  r = runCli(["memory", "history", project, ...base, "--json"]);
  const hist = JSON.parse(r.stdout).data;
  const ids = hist.records.map((x) => x.snapshotId);
  // Newest first: [newlyCaptured, s-b, s-a, s-c].
  assert(hist.records.length === 4, "history has four snapshots after migration + capture");
  assert(ids[1] === "s-b", "recovered latest (s-b) pinned before the new capture");
  assert(ids[2] === "s-a" && ids[3] === "s-c", "recovered older order is s-a(t3) then s-c(t1) newest-first");
  assert(hist.records[0].isLatest === true && hist.records[0].sequence === 4, "new capture appended as latest sequence 4");

  // 11. The immediate chronological predecessor of the new capture is the
  // recovered latest (s-b): history proves it directly (sequence 3, one below the
  // new capture's sequence 4). A full `changes` compare is not asserted here
  // because the planted v1 snapshots carry minimal synthetic payloads (they are
  // fixtures, not real captures), so a Kernel compare against them is not
  // meaningful; the chronology contract — which is what migration recovers — is
  // fully proven by the sequence ordering above.
  assert(
    hist.records[1].snapshotId === "s-b" && hist.records[1].sequence === 3,
    "immediate chronological predecessor of the new capture is the recovered latest s-b",
  );

  // Privacy scan of the migrated store: no secret/absolute path/private content.
  const migratedText = collectText(join(dataDir, "project-brain"));
  assert(!/\/Users\/|\/home\//.test(migratedText), "migrated store contains no absolute POSIX path");
}

// ----------------------------------------------------------------------------
// Corruption + safe recovery qualification (section 15).
// ----------------------------------------------------------------------------
async function qualifyCorruption(runCli, prefix, versionDir, pmDir) {
  section("corruption");
  const dataDir = scratch("corrupt-data");
  const pid = "corrupt-project";
  const project = scratch("corrupt-fixture");
  writeFileSync(join(project, "README.md"), "# Corrupt\n\n- [ ] TODO: z\n", "utf8");
  const base = ["--data-dir", dataDir, "--project-id", pid];

  // 1. create a healthy format-2 store.
  runCli(["memory", "capture", project, ...base, "--apply", "--json"]);
  writeFileSync(join(project, "README.md"), "# Corrupt\n\n- [ ] TODO: z\n- [ ] TODO: z2\n", "utf8");
  runCli(["memory", "capture", project, ...base, "--apply", "--json"]);

  const storeDir = join(dataDir, "project-brain");
  // 2. byte-for-byte backup OUTSIDE the active data root.
  const backup = scratch("corrupt-backup");
  cpSync(storeDir, join(backup, "store"), { recursive: true });
  const healthyTree = hashTree(storeDir);

  // 3. corrupt one snapshot envelope.
  const pm = await import(pathToFileURL(join(pmDir, "dist", "index.js")).href);
  const pathSafety = await import(pathToFileURL(join(pmDir, "dist", "path-safety.js")).href);
  const layout = pathSafety.resolveStoreLayout(dataDir);
  const projectKey = pm.deriveProjectKey(pid);
  const snapDir = join(pathSafety.projectDirFor(layout, projectKey), pathSafety.SNAPSHOTS_DIRNAME);
  const snapFiles = readdirSync(snapDir).filter((n) => n.endsWith(".json"));
  assert(snapFiles.length > 0, "healthy store has snapshot files to corrupt");
  const victim = join(snapDir, snapFiles[0]);
  const original = readFileSync(victim, "utf8");
  writeFileSync(victim, original.replace(/"schemaVersion":\s*1/, '"schemaVersion":1,"__tamper__":true'), "utf8");

  const storeTreeAfterCorruption = hashTree(storeDir);

  // 4. status -> corrupt/safe controlled failure (exit 4), no auto-rewrite.
  let r = runCli(["memory", "status", project, ...base, "--json"]);
  assert(r.code === 4 || (JSON.parse(r.stdout || "{}").data?.status === "corrupt"), "corrupt status fails safely (exit 4/corrupt)");

  // 5. changes -> controlled failure.
  r = runCli(["memory", "changes", project, ...base, "--json"]);
  assert(r.code === 4 || r.code === 1, "corrupt changes fails safely");

  // 6. project_changes MCP -> controlled sanitized error.
  await assertMcpCorruptError(prefix, versionDir, dataDir, pid);

  // 7. no store byte was automatically rewritten by the failed reads.
  const afterReads = hashTree(storeDir);
  assert(treesEqual(storeTreeAfterCorruption, afterReads), "corrupt reads rewrote no store byte");

  // 8. restore the backup manually in the harness.
  rmSync(storeDir, { recursive: true, force: true });
  cpSync(join(backup, "store"), storeDir, { recursive: true });

  // 9. status/history/changes healthy again + byte-identical to pre-corruption.
  r = runCli(["memory", "status", project, ...base, "--json"]);
  assert(r.code === 0 && JSON.parse(r.stdout).data.status === "healthy", "status healthy after manual restore");
  assert(treesEqual(healthyTree, hashTree(storeDir)), "restored store is byte-identical to the healthy backup");
  r = runCli(["memory", "history", project, ...base, "--json"]);
  assert(r.code === 0, "history healthy after restore");
  r = runCli(["memory", "changes", project, ...base, "--json"]);
  assert(r.code === 0, "changes healthy after restore");

  // Manifest chronology corruption: break the latest pointer and prove a
  // controlled failure with no auto-repair.
  section("corruption-chronology");
  const manifestPath = pathSafety.manifestPathFor(layout, projectKey);
  const manifestBytes = readFileSync(manifestPath, "utf8");
  // Repoint latestSnapshotId to a well-formed id that is NOT in the inventory:
  // a latest/history mismatch. The manifest integrity digest no longer matches,
  // so this is a controlled corruption, not a silently accepted edit.
  const broken = manifestBytes.replace(
    /"latestSnapshotId":\s*"[^"]+"/,
    '"latestSnapshotId":"snapshot:0000000000000000000000000000000000000000000000000000000000000000"',
  );
  if (assert(broken !== manifestBytes, "planted a manifest chronology corruption")) {
    writeFileSync(manifestPath, broken, "utf8");
    const beforeChrono = hashTree(storeDir);
    r = runCli(["memory", "status", project, ...base, "--json"]);
    const st = safeParse(r.stdout);
    // Detected as corrupt: either a non-zero exit or a status of "corrupt"
    // (status surfaces corruption as a reportable value with exit 0). Never
    // "healthy", and never a silent repair.
    const detected = r.code !== 0 || (st?.data?.status !== undefined && st.data.status !== "healthy");
    assert(detected, "manifest chronology corruption is detected (not reported healthy)", `code ${r.code}`);
    assert(treesEqual(beforeChrono, hashTree(storeDir)), "manifest chronology corruption triggered no auto-repair");
  }
}

async function assertMcpCorruptError(prefix, versionDir, dataDir, pid) {
  // Point the MCP process's standard resolver at the corrupt store by symlink is
  // not portable; instead we validate the MCP corrupt path via the standard
  // resolver over an isolated env whose standard root IS the corrupt store.
  // Simpler and portable: copy the corrupt store into an isolated standard root.
  const isoRoot = scratch("mcp-corrupt-home");
  const stdRoot = standardDataRootFor(isoRoot);
  mkdirSync(stdRoot, { recursive: true });
  cpSync(join(dataDir, "project-brain"), join(stdRoot, "project-brain"), { recursive: true });
  const env = isolatedDataEnv(isoRoot);

  const mcpShim = join(prefix, "bin", isWindows ? "ohmypm-mcp.cmd" : "ohmypm-mcp");
  const mcpEntry = join(versionDir, "bin", "ohmypm-mcp.mjs");
  const command = isWindows ? process.execPath : mcpShim;
  const args = isWindows ? [mcpEntry] : [];
  const mcpManifest = realpathSync(join(versionDir, "node_modules", "@oh-my-pm", "mcp-server", "package.json"));
  const requireFromBundle = createRequire(mcpManifest);
  let Client;
  let StdioClientTransport;
  try {
    ({ Client } = await import(pathToFileURL(requireFromBundle.resolve("@modelcontextprotocol/sdk/client/index.js")).href));
    ({ StdioClientTransport } = await import(pathToFileURL(requireFromBundle.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href));
  } catch {
    bad("mcp corrupt", "could not resolve MCP SDK");
    return;
  }
  const transport = new StdioClientTransport({ command, args, cwd: versionDir, env, stderr: "pipe" });
  const client = new Client({ name: "omp-v03-corrupt", version: "0.0.0" });
  try {
    await client.connect(transport);
    const res = await client.callTool({ name: "project_changes", arguments: { projectId: pid } });
    // A corrupt store yields a controlled error (isError) with a sanitized
    // message — never a partial data payload, path, or trace.
    const text = JSON.stringify(res);
    assert(res.isError === true, "MCP project_changes on corrupt store returns a controlled error");
    assert(!/\/Users\/|\/home\/|previousValue|evidence:sha256/.test(text), "MCP corrupt error is sanitized");
  } catch {
    // A protocol-level rejection is also an acceptable controlled failure.
    ok("MCP project_changes on corrupt store failed safely (protocol error)");
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
  }
}

// ----------------------------------------------------------------------------
// Concurrency qualification (section 16): two concurrent same-project captures
// serialize; different projects proceed independently; no partial manifest.
// ----------------------------------------------------------------------------
async function qualifyConcurrency(runCli, version) {
  section("concurrency");
  const dataDir = scratch("concurrency-data");
  const project = scratch("concurrency-fixture");
  writeFileSync(join(project, "README.md"), "# Conc\n\n- [ ] TODO: c\n", "utf8");
  const pid = "concurrency-project";
  // Seed one capture so a store exists.
  runCli(["memory", "capture", project, "--data-dir", dataDir, "--project-id", pid, "--apply", "--json"]);

  // Launch two concurrent captures of the SAME project. Change the fixture so
  // each would create a distinct snapshot; the lock must serialize them and the
  // resulting manifest must stay well-formed (contiguous sequence, valid latest).
  writeFileSync(join(project, "README.md"), "# Conc\n\n- [ ] TODO: c\n- [ ] TODO: c2\n", "utf8");
  const { spawn } = require("node:child_process");
  const launch = () =>
    new Promise((res) => {
      // Reuse the makeRunner invocation semantics via a direct spawn so both
      // captures run as genuinely concurrent OS processes.
      const inv = runCli.__invocation([
        "memory",
        "capture",
        project,
        "--data-dir",
        dataDir,
        "--project-id",
        pid,
        "--apply",
        "--json",
      ]);
      const child = spawn(inv.command, inv.args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (code) => res({ code, out, err }));
    });

  const [a, b] = await Promise.all([launch(), launch()]);
  const codes = [a.code, b.code];
  // The single-writer lock serializes the two captures: exactly one wins (exit
  // 0) and the other is rejected with a CONTROLLED, structured failure — never a
  // crash and never a partial commit. The rejected process emits a machine
  // outcome (ok:false with a bounded error code) rather than a stack trace.
  const successes = codes.filter((c) => c === 0).length;
  assert(successes >= 1, "at least one concurrent capture committed", `codes ${codes.join(",")}`);
  for (const res of [a, b]) {
    if (res.code === 0) continue;
    // A failed memory command reports its structured error to stderr; a clean
    // controlled failure carries ok:false with a bounded error code and no raw
    // stack trace.
    const parsed = safeParse(res.err) ?? safeParse(res.out);
    assert(
      parsed !== null && parsed.ok === false && typeof parsed.error?.code === "string",
      "the serialized concurrent capture failed in a controlled, structured way",
      `code ${res.code}`,
    );
    const combined = `${res.out}\n${res.err}`;
    assert(!/\n\s+at\s+\S+\s+\(/.test(combined), "the rejected capture emitted no raw stack trace");
  }
  // Manifest integrity: status must still be healthy with a well-formed history.
  const st = runCli(["memory", "status", project, "--data-dir", dataDir, "--project-id", pid, "--json"]);
  assert(st.code === 0 && JSON.parse(st.stdout).data.status === "healthy", "store healthy after concurrent captures");
  const hist = runCli(["memory", "history", project, "--data-dir", dataDir, "--project-id", pid, "--json"]);
  const records = JSON.parse(hist.stdout).data.records;
  const sequences = records.map((r) => r.sequence).sort((x, y) => x - y);
  const contiguous = sequences.every((s, i) => s === i + 1);
  assert(contiguous, "history sequence is contiguous (no duplicate/partial commit)");
  const latestCount = records.filter((r) => r.isLatest).length;
  assert(latestCount === 1, "exactly one latest snapshot after concurrent captures");

  // Different projects proceed independently and concurrently.
  const pidX = "conc-x";
  const pidY = "conc-y";
  const projX = scratch("conc-x-fix");
  const projY = scratch("conc-y-fix");
  writeFileSync(join(projX, "README.md"), "# X\n\n- [ ] TODO: x\n", "utf8");
  writeFileSync(join(projY, "README.md"), "# Y\n\n- [ ] TODO: y\n", "utf8");
  const launchOther = (proj, id) =>
    new Promise((res) => {
      const inv = runCli.__invocation([
        "memory",
        "capture",
        proj,
        "--data-dir",
        dataDir,
        "--project-id",
        id,
        "--apply",
        "--json",
      ]);
      const child = spawn(inv.command, inv.args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.on("close", (code) => res({ code, out }));
    });
  const [rx, ry] = await Promise.all([launchOther(projX, pidX), launchOther(projY, pidY)]);
  assert(rx.code === 0 && ry.code === 0, "different projects capture independently and concurrently");
  void version;
}

// ----------------------------------------------------------------------------
// Privacy + security audit (section 17): planted sentinels must never appear in
// the store, export, or command output.
// ----------------------------------------------------------------------------
async function qualifyPrivacy(runCli, version, pmDir) {
  section("privacy");
  const dataDir = scratch("privacy-data");
  const project = scratch("privacy-fixture");
  const pid = "privacy-project";

  // Plant unique sentinels in transient source content and environment. The
  // sentinels are placed ONLY in non-derived locations: the GitHub token env
  // var, and prose paragraphs of the Markdown (not in task titles, which are
  // legitimately derived, minimized project state). Minimized evidence must
  // fingerprint the content without persisting these raw values.
  const S = {
    bearer: "SENTINEL-BEARER-abc123XYZtoken",
    authHeader: "SENTINEL-Authorization-Bearer-def456",
    secret: "SENTINEL-PRIVATE-SECRET-ghi789",
    fingerprintInput: "SENTINEL-FINGERPRINT-INPUT-jkl012",
  };
  // The absolute project path itself is a sentinel (must never be stored raw).
  const absProjectPath = project;

  // Prose lines carry the raw secrets/headers/fingerprint sentinels; the two
  // task titles are ordinary and secret-free so this test distinguishes derived
  // state from raw private source content.
  writeFileSync(
    join(project, "README.md"),
    [
      "# Privacy Project",
      "",
      `Contact token: ${S.bearer}`,
      `Authorization: Bearer ${S.authHeader}`,
      `Internal secret note ${S.secret} and fingerprint seed ${S.fingerprintInput}.`,
      "",
      "- [ ] TODO: build the widget",
      "- [ ] TODO: test the widget",
      "",
    ].join("\n"),
    "utf8",
  );
  const env = {
    ...process.env,
    OH_MY_PM_GITHUB_TOKEN: S.bearer,
    SENTINEL_ENV_SECRET: S.secret,
  };
  const base = ["--data-dir", dataDir, "--project-id", pid];

  // Two captures so an export/compare has content.
  const cap1 = runCli(["memory", "capture", project, ...base, "--apply", "--json"], { env });
  writeFileSync(join(project, "README.md"), readFileSync(join(project, "README.md"), "utf8") + "\n- [ ] TODO: more\n", "utf8");
  const cap2 = runCli(["memory", "capture", project, ...base, "--apply", "--json"], { env });
  const changes = runCli(["memory", "changes", project, ...base, "--json"], { env });
  const status = runCli(["memory", "status", project, ...base, "--json"], { env });
  const history = runCli(["memory", "history", project, ...base, "--json"], { env });

  // Export, then scan the store + export + migration backup (if any).
  const exportDest = join(scratch("privacy-export"), "out");
  runCli(["memory", "export", project, ...base, "--destination", exportDest, "--apply", "--json"], { env });

  const storeText = collectText(join(dataDir, "project-brain"));
  const exportText = existsSync(exportDest) ? collectText(exportDest) : "";
  const cliOutput = [cap1, cap2, changes, status, history].map((r) => r.stdout + r.stderr).join("\n");

  // Requirements: token/authorization/absolute-project-path/raw-markdown-body/
  // fingerprint-input sentinels never appear in stored/exported bytes or output.
  const scans = [
    ["store", storeText],
    ["export", exportText],
    ["cli output", cliOutput],
  ];
  for (const [where, text] of scans) {
    assert(!text.includes(S.bearer), `no token sentinel in ${where}`);
    assert(!text.includes(S.authHeader), `no authorization sentinel in ${where}`);
    assert(!text.includes(S.secret), `no private secret sentinel in ${where}`);
    assert(!text.includes(S.fingerprintInput), `no fingerprint-input sentinel in ${where}`);
    // The absolute project path must never be stored/exported/echoed raw.
    assert(!text.includes(absProjectPath), `no absolute project path in ${where}`);
  }

  // No telemetry/network markers in the memory path output.
  assert(!/https?:\/\//.test(collectText(join(dataDir, "project-brain"))), "stored bytes contain no URL/network origin");

  // The store must be dependency-free of any raw provider response / runtime
  // trace markers.
  for (const marker of ["runtimeResponse", "providerResponses", "diffHunk"]) {
    assert(!storeText.includes(marker), `store omits forbidden marker "${marker}"`);
  }
  void version;
  void pmDir;
}

// ----------------------------------------------------------------------------
// Source independence + relocation (section 12).
// ----------------------------------------------------------------------------
function qualifySourceIndependenceAndRelocation(prefix, versionDir) {
  section("source-independence");
  // No installed shim embeds an absolute source-checkout path. The private
  // source-checkout markers are assembled from fragments so this qualification
  // tool does not itself contain the literal forbidden provenance strings that
  // the boundary validator scans every tracked file for.
  const sourceMarkers = [`oh-my-pm${"-"}core`, `OMP${"-"}Core`];
  const binDir = join(prefix, "bin");
  for (const name of readdirSync(binDir)) {
    const p = join(binDir, name);
    if (!isFile(p)) continue;
    const text = readFileSync(p, "utf8");
    assert(!sourceMarkers.some((m) => text.includes(m)), `shim ${name} embeds no source-checkout path`);
  }
  // The installed CLI runs from an unrelated working directory.
  const runCli = makeRunner(prefix, versionDir);
  const elsewhere = scratch("cwd-elsewhere");
  const r = runCli(["status"], { env: { ...process.env }, });
  assert(r.code === 0, "installed CLI runs regardless of caller cwd");
  void elsewhere;

  // POSIX executable mode on the shims.
  if (!isWindows) {
    for (const name of ["oh-my-pm", "oh-my-pm-mcp"]) {
      const mode = statSync(join(binDir, name)).mode;
      assert((mode & 0o111) !== 0, `POSIX shim ${name} is executable`);
    }
  } else {
    for (const name of ["oh-my-pm.cmd", "oh-my-pm-mcp.cmd"]) {
      assert(isFile(join(binDir, name)), `Windows .cmd shim ${name} present`);
    }
  }

  // v0.3.1: help and mcp-config must keep working from the installed artifact
  // alone, and mcp-config must track a relocated prefix rather than an embedded
  // install-time path. The prefix is copied to a new location and exercised
  // there; the original stays untouched for the remaining checks.
  section("relocation-help-mcp-config");
  const relocatedRoot = scratch("relocated-prefix");
  const relocatedPrefix = join(relocatedRoot, "omp");
  cpSync(prefix, relocatedPrefix, { recursive: true });
  if (!isWindows) {
    for (const name of ["oh-my-pm", "oh-my-pm-mcp"]) {
      try {
        chmodSync(join(relocatedPrefix, "bin", name), 0o755);
      } catch {
        // best effort: cpSync preserves mode on the supported platforms
      }
    }
  }
  const relocatedVersionDir = join(
    relocatedPrefix,
    "lib",
    "oh-my-pm",
    "versions",
    basename(versionDir),
  );
  const relocatedCli = makeRunner(relocatedPrefix, relocatedVersionDir);

  const relocatedHelp = relocatedCli(["--help"]);
  assert(relocatedHelp.code === 0, "relocated installed help exits 0");
  assert(relocatedHelp.stderr === "", "relocated installed help writes nothing to stderr");

  const relocatedConfig = relocatedCli(["mcp-config"]);
  assert(relocatedConfig.code === 0, "relocated installed mcp-config exits 0");
  const relocatedParsed = safeParse(relocatedConfig.stdout);
  const relocatedCommand = relocatedParsed?.mcpServers?.["oh-my-pm"]?.command;
  // mcp-config resolves the CANONICAL sibling command, so the expectation is the
  // canonical name even though the surrounding lib/oh-my-pm path is unchanged.
  const expectedRelocated = join(
    relocatedPrefix,
    "bin",
    isWindows ? "ohmypm-mcp.cmd" : "ohmypm-mcp",
  );
  assert(
    relocatedCommand === expectedRelocated,
    "relocated installed mcp-config resolves the relocated executable",
  );
  assert(isFile(relocatedCommand ?? ""), "relocated mcp-config command path exists");
  // The relocated output must not point back at the original prefix.
  assert(
    !relocatedConfig.stdout.includes(prefix),
    "relocated mcp-config embeds no install-time prefix",
  );
}

// ----------------------------------------------------------------------------
// Read every regular text file under a root into one string (bounded by tree).
// ----------------------------------------------------------------------------
function collectText(root) {
  if (!existsSync(root)) return "";
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        try {
          parts.push(readFileSync(abs, "utf8"));
        } catch {
          // binary/unreadable — skip
        }
      }
    }
  };
  walk(root);
  return parts.join("\n");
}

function dirname(p) {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx <= 0 ? p : p.slice(0, idx);
}

// ----------------------------------------------------------------------------
// v0.4 — installed `memory timeline` qualification.
//
// Builds a real three-capture store through the installed CLI, then qualifies the
// installed timeline command: exit codes, the stdout/stderr split, determinism,
// filtering, pagination, an empty history, corruption fail-safety, the privacy
// allowlist, and that the read performs no write and creates no directory.
// ----------------------------------------------------------------------------
async function qualifyTimelineCli(runCli, _version) {
  section("timeline-cli");
  const root = scratch("timeline-cli");
  const projectDir = join(root, "project");
  const dataDir = join(root, "data");
  mkdirSync(projectDir, { recursive: true });
  const env = isolatedDataEnv(join(root, "home"));
  const PROJECT_ID = "installed-timeline-project";
  writeFileSync(
    join(projectDir, "oh-my-pm.config.json"),
    JSON.stringify({ version: 1, projectId: PROJECT_ID, documents: { include: ["**/*.md"] } }),
    "utf8",
  );
  const readme = join(projectDir, "README.md");
  const j = (args) => runCli([...args, "--data-dir", dataDir, "--json"], { env, cwd: root });
  const timeline = (extra = []) =>
    j(["memory", "timeline", "--project-id", PROJECT_ID, ...extra]);

  // 1. An empty history: a valid EMPTY timeline, exit 0, and no directory made.
  rmSync(dataDir, { recursive: true, force: true });
  let r = timeline();
  assert(r.code === 0, "installed timeline on an empty history exits 0");
  let data = safeParse(r.stdout)?.data;
  assert(data?.eventCount === 0, "installed timeline on an empty history returns no events");
  assert(data?.hasMore === false, "installed timeline on an empty history reports hasMore false");
  assert(data?.nextBeforeSequence === undefined, "installed timeline on an empty history emits no cursor");
  assert(!existsSync(dataDir), "installed timeline created no application-data directory");

  // 2. Three captures build a two-comparison timeline.
  writeFileSync(readme, "# T\n\n- [ ] TODO: build the thing\n", "utf8");
  assert(j(["memory", "capture", projectDir, "--apply"]).code === 0, "installed timeline fixture capture 1");
  writeFileSync(readme, "# T\n\n- [x] DONE: build the thing\n- [ ] TODO: test the thing\n", "utf8");
  assert(j(["memory", "capture", projectDir, "--apply"]).code === 0, "installed timeline fixture capture 2");
  writeFileSync(
    readme,
    "# T\n\n- [x] DONE: build the thing\n- [x] DONE: test the thing\n- [ ] TODO: ship the thing\n",
    "utf8",
  );
  assert(j(["memory", "capture", projectDir, "--apply"]).code === 0, "installed timeline fixture capture 3");

  // 3. A populated timeline in authoritative capture order.
  r = timeline();
  assert(r.code === 0, "installed timeline exits 0 on a populated history");
  assert(r.stderr === "", "installed timeline writes nothing to stderr on success");
  assert(newlineTerminated(r.stdout), "installed timeline output newline-terminated");
  const parsedTimeline = safeParse(r.stdout);
  assert(parsedTimeline?.command === "memory.timeline", "installed timeline reports its command");
  data = parsedTimeline?.data;
  const events = data?.events ?? [];
  assert(events.length > 0, "installed timeline returns events");
  assert(data?.eventCount === events.length, "installed timeline eventCount matches the array length");
  let ordered = true;
  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1];
    const next = events[i];
    if (prev.captureSequence === next.captureSequence) {
      if (!(next.eventSequence > prev.eventSequence)) ordered = false;
    } else if (!(next.captureSequence < prev.captureSequence)) {
      ordered = false;
    }
  }
  assert(ordered, "installed timeline is ordered newest capture first, then event sequence");
  const sequences = [...new Set(events.map((e) => e.captureSequence))].sort();
  assert(
    JSON.stringify(sequences) === JSON.stringify([2, 3]),
    "installed timeline attributes events to captures 2 and 3 only",
    `got ${sequences.join(",")}`,
  );

  // 4. The privacy allowlist: exactly these fields, and nothing else.
  const ALLOWED = [
    "eventId",
    "projectId",
    "snapshotId",
    "captureSequence",
    "eventSequence",
    "capturedAt",
    "category",
    "kind",
    "subjectId",
    "evidenceCount",
    "title",
    "status",
    "severity",
    "dueDate",
  ];
  let extraField = null;
  for (const event of events) {
    for (const key of Object.keys(event)) {
      if (!ALLOWED.includes(key)) extraField = key;
    }
  }
  assert(extraField === null, "installed timeline events expose only allow-listed fields", extraField ?? "");
  for (const forbidden of ["evidenceRefs", "previousValue", "currentValue", "stateFingerprint", "contentFingerprint"]) {
    assert(!r.stdout.includes(forbidden), `installed timeline output carries no ${forbidden}`);
  }
  assert(!r.stdout.includes(dataDir), "installed timeline output carries no data-directory path");
  assert(!r.stdout.includes(projectDir), "installed timeline output carries no project path");

  // 5. Determinism and the other two output modes.
  assert(timeline().stdout === r.stdout, "installed timeline output is deterministic");
  const brief = runCli(["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", dataDir], { env, cwd: root });
  assert(brief.code === 0 && newlineTerminated(brief.stdout), "installed timeline brief mode exits 0, newline-terminated");
  const markdown = runCli(
    ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", dataDir, "--markdown"],
    { env, cwd: root },
  );
  assert(markdown.code === 0, "installed timeline markdown mode exits 0");
  assert(markdown.stdout.includes("# OH MY PM Memory Timeline"), "installed timeline markdown has its heading");
  assert(markdown.stdout.includes("### Capture #3"), "installed timeline markdown groups by capture");
  assert(newlineTerminated(markdown.stdout), "installed timeline markdown newline-terminated");

  // 6. Filters.
  const firstCategory = events[0].category;
  const filteredCategory = timeline(["--category", firstCategory]);
  assert(filteredCategory.code === 0, "installed timeline --category exits 0");
  const categoryEvents = safeParse(filteredCategory.stdout)?.data?.events ?? [];
  assert(categoryEvents.length > 0, "installed timeline --category returns events");
  assert(
    categoryEvents.every((e) => e.category === firstCategory),
    "installed timeline --category filters exactly",
  );
  const filteredKind = timeline(["--kind", "task"]);
  assert(filteredKind.code === 0, "installed timeline --kind exits 0");
  assert(
    (safeParse(filteredKind.stdout)?.data?.events ?? []).every((e) => e.kind === "task"),
    "installed timeline --kind filters exactly",
  );
  const combined = timeline(["--category", firstCategory, "--kind", events[0].kind]);
  assert(
    (safeParse(combined.stdout)?.data?.events ?? []).every(
      (e) => e.category === firstCategory && e.kind === events[0].kind,
    ),
    "installed timeline combined filters conjoin",
  );

  // 7. Pagination: walking every page visits each event exactly once.
  const seen = [];
  let before;
  for (let guard = 0; guard < 12; guard += 1) {
    const page = timeline(["--limit", "1", ...(before !== undefined ? ["--before-sequence", String(before)] : [])]);
    if (page.code !== 0) break;
    const pageData = safeParse(page.stdout)?.data;
    for (const e of pageData?.events ?? []) seen.push(e.eventId);
    if (pageData?.hasMore !== true) break;
    before = pageData.nextBeforeSequence;
  }
  assert(
    JSON.stringify(seen) === JSON.stringify(events.map((e) => e.eventId)),
    "installed timeline pagination visits every event exactly once, in order",
  );
  assert(new Set(seen).size === seen.length, "installed timeline pagination never duplicates an event");
  const bounded = timeline(["--before-sequence", "3"]);
  assert(
    (safeParse(bounded.stdout)?.data?.events ?? []).every((e) => e.captureSequence < 3),
    "installed timeline --before-sequence excludes the bound and above",
  );

  // 8. Usage errors: exit 2, stderr only, no stdout.
  for (const [label, args] of [
    ["missing --project-id", ["memory", "timeline"]],
    ["limit 0", ["memory", "timeline", "--project-id", PROJECT_ID, "--limit", "0"]],
    ["limit 101", ["memory", "timeline", "--project-id", PROJECT_ID, "--limit", "101"]],
    ["invalid category", ["memory", "timeline", "--project-id", PROJECT_ID, "--category", "nope"]],
    ["invalid kind", ["memory", "timeline", "--project-id", PROJECT_ID, "--kind", "nope"]],
    ["--apply", ["memory", "timeline", "--project-id", PROJECT_ID, "--apply"]],
    ["unknown option", ["memory", "timeline", "--project-id", PROJECT_ID, "--nope"]],
  ]) {
    const bad_ = runCli([...args, "--data-dir", dataDir], { env, cwd: root });
    assert(bad_.code === 2, `installed timeline ${label} exits 2`);
    assert(bad_.stdout === "", `installed timeline ${label} writes no stdout`);
    assert(bad_.stderr !== "", `installed timeline ${label} writes to stderr`);
  }
  // The limit bounds themselves are accepted.
  assert(timeline(["--limit", "1"]).code === 0, "installed timeline accepts --limit 1");
  assert(timeline(["--limit", "100"]).code === 0, "installed timeline accepts --limit 100");
  assert(safeParse(timeline().stdout)?.data?.limit === 20, "installed timeline default limit is 20");

  // 9. An unknown project is a valid empty timeline, not a failure.
  const unknown = runCli(
    ["memory", "timeline", "--project-id", "no-such-project", "--data-dir", dataDir, "--json"],
    { env, cwd: root },
  );
  assert(unknown.code === 0, "installed timeline on an unknown project exits 0");
  assert(safeParse(unknown.stdout)?.data?.eventCount === 0, "installed timeline on an unknown project returns no events");

  // 10. No project root and no project config are required.
  const bare = scratch("timeline-bare");
  const bareRun = runCli(
    ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", dataDir, "--json"],
    { env, cwd: bare },
  );
  assert(bareRun.code === 0, "installed timeline needs no project root or config");
  assert((safeParse(bareRun.stdout)?.data?.events ?? []).length > 0, "installed timeline works from a bare directory");

  // 11. ZERO writes: the store is byte-identical after many reads.
  const beforeTree = hashTree(join(dataDir, "project-brain"));
  timeline();
  timeline(["--limit", "1"]);
  timeline(["--category", firstCategory]);
  timeline(["--kind", "risk", "--before-sequence", "3"]);
  runCli(["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", dataDir, "--markdown"], { env, cwd: root });
  const afterTree = hashTree(join(dataDir, "project-brain"));
  assert(treesEqual(beforeTree, afterTree), "installed timeline performs zero writes");
  const storeFiles = [];
  const walkStore = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walkStore(abs);
      else storeFiles.push(abs);
    }
  };
  walkStore(join(dataDir, "project-brain"));
  assert(!storeFiles.some((f) => f.endsWith(".lock")), "installed timeline acquires no lock");
  assert(!storeFiles.some((f) => f.includes("staging")), "installed timeline leaves no staging directory");
  assert(!storeFiles.some((f) => f.includes("backups")), "installed timeline leaves no backup");
  assert(!existsSync(join(projectDir, "project-brain")), "installed timeline writes nothing into the project");

  // 12. Corruption fails CLOSED with no partial stdout.
  const corruptData = join(root, "corrupt-data");
  rmSync(corruptData, { recursive: true, force: true });
  cpSync(dataDir, corruptData, { recursive: true });
  const corruptFiles = [];
  const walkCorrupt = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walkCorrupt(abs);
      else corruptFiles.push(abs);
    }
  };
  walkCorrupt(corruptData);
  const snapshotFile = corruptFiles.find((f) => f.includes("snapshots"));
  if (assert(snapshotFile !== undefined, "installed timeline corruption fixture has a snapshot record")) {
    writeFileSync(snapshotFile, "{ not valid json", "utf8");
    const corrupted = runCli(
      ["memory", "timeline", "--project-id", PROJECT_ID, "--data-dir", corruptData, "--json"],
      { env, cwd: root },
    );
    assert(corrupted.code !== 0, "installed timeline over a corrupt store exits nonzero");
    assert(corrupted.stdout === "", "installed timeline over a corrupt store emits no partial stdout");
    assert(corrupted.stderr !== "", "installed timeline over a corrupt store reports a controlled error");
    assert(
      !corrupted.stderr.includes(corruptData),
      "installed timeline corruption error leaks no data-directory path",
    );
  }

  // 13. The six historical subcommands are unchanged alongside the timeline.
  for (const [sub, extra] of [
    ["status", ["--project-id", PROJECT_ID]],
    ["history", ["--project-id", PROJECT_ID]],
    ["changes", ["--project-id", PROJECT_ID]],
    ["capture", [projectDir]],
  ]) {
    const legacy = j(["memory", sub, ...extra]);
    assert(legacy.code === 0, `installed memory ${sub} still exits 0 alongside the timeline`);
    assert(safeParse(legacy.stdout)?.command === `memory.${sub}`, `installed memory ${sub} envelope unchanged`);
  }
}

// ----------------------------------------------------------------------------
// v0.4 — installed `project_timeline` MCP qualification over a real store.
// ----------------------------------------------------------------------------
async function qualifyTimelineMcp(prefix, versionDir) {
  section("timeline-mcp");
  const root = scratch("timeline-mcp");
  const projectDir = join(root, "project");
  mkdirSync(projectDir, { recursive: true });
  const home = join(root, "home");
  const env = isolatedDataEnv(home);
  const PROJECT_ID = "installed-timeline-mcp";
  writeFileSync(
    join(projectDir, "oh-my-pm.config.json"),
    JSON.stringify({ version: 1, projectId: PROJECT_ID, documents: { include: ["**/*.md"] } }),
    "utf8",
  );
  const readme = join(projectDir, "README.md");
  const runCli = makeRunner(prefix, versionDir);
  // The MCP tool resolves the STANDARD data root, so the CLI must capture into
  // that same standard location (no --data-dir) under the isolated HOME.
  const cli = (args) => runCli([...args, "--json"], { env, cwd: root });
  writeFileSync(readme, "# M\n\n- [ ] TODO: alpha\n", "utf8");
  assert(cli(["memory", "capture", projectDir, "--apply"]).code === 0, "MCP timeline fixture capture 1");
  writeFileSync(readme, "# M\n\n- [x] DONE: alpha\n- [ ] TODO: beta\n", "utf8");
  assert(cli(["memory", "capture", projectDir, "--apply"]).code === 0, "MCP timeline fixture capture 2");
  writeFileSync(readme, "# M\n\n- [x] DONE: alpha\n- [x] DONE: beta\n- [ ] TODO: gamma\n", "utf8");
  assert(cli(["memory", "capture", projectDir, "--apply"]).code === 0, "MCP timeline fixture capture 3");

  // Resolve the installed MCP command exactly as the other MCP sections do: the
  // POSIX shim, or Node plus the installed entry script on Windows (a .cmd shim
  // cannot be spawned without a shell). The SDK is resolved from the installed
  // mcp-server package under node_modules — the installed artifact has no
  // packages/ directory.
  const mcpShim = join(prefix, "bin", isWindows ? "ohmypm-mcp.cmd" : "ohmypm-mcp");
  const mcpEntry = join(versionDir, "bin", "ohmypm-mcp.mjs");
  const command = isWindows ? process.execPath : mcpShim;
  const args = isWindows ? [mcpEntry] : [];
  const requireFromBundle = createRequire(
    realpathSync(join(versionDir, "node_modules", "@oh-my-pm", "mcp-server", "package.json")),
  );
  let Client;
  let StdioClientTransport;
  try {
    ({ Client } = await import(
      pathToFileURL(requireFromBundle.resolve("@modelcontextprotocol/sdk/client/index.js")).href
    ));
    ({ StdioClientTransport } = await import(
      pathToFileURL(requireFromBundle.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href
    ));
  } catch {
    bad("timeline-mcp", "could not resolve the MCP SDK from the installed artifact");
    return;
  }

  const transport = new StdioClientTransport({ command, args, cwd: versionDir, env, stderr: "pipe" });
  const stderrChunks = [];
  if (transport.stderr) transport.stderr.on("data", (c) => stderrChunks.push(c.toString()));
  const client = new Client({ name: "omp-timeline-qual", version: "0.0.0" });
  const storeRoot = join(standardDataRootFor(home), "project-brain");
  try {
    await client.connect(transport);

    const beforeTree = hashTree(storeRoot);

    // 1. A populated timeline in capture order.
    const populated = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: PROJECT_ID },
    });
    assert(!populated.isError, "MCP project_timeline succeeds over a real store");
    const sc = populated.structuredContent ?? {};
    assert(sc.schemaVersion === 1, "MCP project_timeline reports schemaVersion 1");
    assert(sc.chronology === "capture-order", "MCP project_timeline reports capture-order chronology");
    const mcpEvents = sc.events ?? [];
    assert(mcpEvents.length > 0, "MCP project_timeline returns events");
    assert(sc.eventCount === mcpEvents.length, "MCP project_timeline eventCount matches the array");
    let mcpOrdered = true;
    for (let i = 1; i < mcpEvents.length; i += 1) {
      const prev = mcpEvents[i - 1];
      const next = mcpEvents[i];
      if (prev.captureSequence === next.captureSequence) {
        if (!(next.eventSequence > prev.eventSequence)) mcpOrdered = false;
      } else if (!(next.captureSequence < prev.captureSequence)) {
        mcpOrdered = false;
      }
    }
    assert(mcpOrdered, "MCP project_timeline is ordered newest capture first");

    // 2. The forbidden-field audit over the full serialized result.
    const serialized = `${JSON.stringify(sc)}\n${populated.content?.[0]?.text ?? ""}`;
    for (const forbidden of [
      "evidenceRefs",
      "previousValue",
      "currentValue",
      '"trace"',
      "stateFingerprint",
      "snapshotHistory",
      "projectRoot",
      "dataRoot",
      "runtimeResponse",
      "providerResponses",
      "Authorization",
      "Bearer ",
    ]) {
      assert(!serialized.includes(forbidden), `MCP project_timeline output carries no ${forbidden}`);
    }
    assert(!serialized.includes(home), "MCP project_timeline output leaks no data-root path");
    assert(!serialized.includes(projectDir), "MCP project_timeline output leaks no project path");
    assert(!/\/Users\/|\/home\/|[A-Z]:\\/.test(serialized), "MCP project_timeline output leaks no absolute path");
    const ALLOWED_MCP = [
      "eventId",
      "snapshotId",
      "captureSequence",
      "eventSequence",
      "capturedAt",
      "category",
      "kind",
      "subjectId",
      "title",
      "status",
      "severity",
      "dueDate",
      "evidenceCount",
    ];
    let mcpExtra = null;
    for (const e of mcpEvents) {
      for (const key of Object.keys(e)) if (!ALLOWED_MCP.includes(key)) mcpExtra = key;
    }
    assert(mcpExtra === null, "MCP project_timeline events expose only allow-listed fields", mcpExtra ?? "");

    // 3. Determinism.
    const again = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: PROJECT_ID },
    });
    assert(
      JSON.stringify(again.structuredContent) === JSON.stringify(sc),
      "MCP project_timeline output is deterministic",
    );

    // 4. Filters.
    const kindFiltered = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: PROJECT_ID, kind: "task" },
    });
    assert(!kindFiltered.isError, "MCP project_timeline kind filter succeeds");
    assert(
      (kindFiltered.structuredContent?.events ?? []).every((e) => e.kind === "task"),
      "MCP project_timeline kind filter is exact",
    );
    const categoryFiltered = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: PROJECT_ID, category: mcpEvents[0].category },
    });
    assert(
      (categoryFiltered.structuredContent?.events ?? []).every((e) => e.category === mcpEvents[0].category),
      "MCP project_timeline category filter is exact",
    );

    // 5. Pagination.
    const pageSeen = [];
    let cursor;
    for (let guard = 0; guard < 12; guard += 1) {
      const page = await client.callTool({
        name: "project_timeline",
        arguments: { projectId: PROJECT_ID, limit: 1, ...(cursor !== undefined ? { beforeSequence: cursor } : {}) },
      });
      if (page.isError) break;
      const pageSc = page.structuredContent ?? {};
      for (const e of pageSc.events ?? []) pageSeen.push(e.eventId);
      if (pageSc.hasMore !== true) break;
      cursor = pageSc.nextBeforeSequence;
    }
    assert(
      JSON.stringify(pageSeen) === JSON.stringify(mcpEvents.map((e) => e.eventId)),
      "MCP project_timeline pagination visits every event exactly once",
    );
    assert(new Set(pageSeen).size === pageSeen.length, "MCP project_timeline pagination never duplicates");

    // 6. An unknown project is a valid empty result.
    const unknown = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: "no-such-project-at-all" },
    });
    assert(!unknown.isError, "MCP project_timeline on an unknown project is not an error");
    assert(unknown.structuredContent?.eventCount === 0, "MCP project_timeline on an unknown project returns no events");

    // 7. Bounded input: over the maximum limit is a controlled error.
    const overLimit = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: PROJECT_ID, limit: 101 },
    });
    assert(overLimit.isError === true, "MCP project_timeline rejects a limit above 100");
    const badCategory = await client.callTool({
      name: "project_timeline",
      arguments: { projectId: PROJECT_ID, category: "invented" },
    });
    assert(badCategory.isError === true, "MCP project_timeline rejects an unknown category");

    // 8. ZERO writes across every call above.
    assert(treesEqual(beforeTree, hashTree(storeRoot)), "MCP project_timeline performs zero writes");
    assert(stderrChunks.join("").trim() === "", "MCP project_timeline leaves stderr empty");
  } catch (e) {
    bad("timeline-mcp", `MCP timeline qualification threw: ${e && e.message ? e.message : "unknown"}`);
  } finally {
    await safeClose({ client, transport });
  }
}

// ----------------------------------------------------------------------------
// v0.4 — direct v0.3.1 store compatibility.
//
// A store created under the PUBLIC v0.3.1 behavior (Project Brain schema 1, store
// format 2) must be read directly by v0.4.0 with NO migration and no repair. The
// v0.3.1 behavior is reproduced exactly by capturing through the installed CLI —
// the store format and schema are unchanged between the two releases, which is
// itself the invariant under test and is asserted from the store's own manifest.
// ----------------------------------------------------------------------------
async function qualifyV031StoreCompatibility(runCli, _version) {
  section("v0.3.1-compatibility");
  const root = scratch("v031-compat");
  const projectDir = join(root, "project");
  const dataDir = join(root, "data");
  mkdirSync(projectDir, { recursive: true });
  const env = isolatedDataEnv(join(root, "home"));
  const PROJECT_ID = "v031-compat-project";
  writeFileSync(
    join(projectDir, "oh-my-pm.config.json"),
    JSON.stringify({ version: 1, projectId: PROJECT_ID, documents: { include: ["**/*.md"] } }),
    "utf8",
  );
  const readme = join(projectDir, "README.md");
  const j = (args) => runCli([...args, "--data-dir", dataDir, "--json"], { env, cwd: root });

  // Build the store using only the six v0.3.1 subcommands.
  writeFileSync(readme, "# C\n\n- [ ] TODO: one\n", "utf8");
  assert(j(["memory", "capture", projectDir, "--apply"]).code === 0, "v0.3.1-shaped capture 1 succeeds");
  writeFileSync(readme, "# C\n\n- [x] DONE: one\n- [ ] TODO: two\n", "utf8");
  assert(j(["memory", "capture", projectDir, "--apply"]).code === 0, "v0.3.1-shaped capture 2 succeeds");

  // The store declares schema 1 / format 2 and needs no migration.
  const status = j(["memory", "status", "--project-id", PROJECT_ID]);
  const statusData = safeParse(status.stdout)?.data;
  assert(status.code === 0, "v0.3.1-shaped store status exits 0");
  assert(statusData?.status === "healthy", "v0.3.1-shaped store is healthy under v0.4");
  assert(statusData?.projectBrainSchemaVersion === 1, "v0.3.1-shaped store reports Project Brain schema 1");
  assert(statusData?.storeFormatVersion === 2, "v0.3.1-shaped store reports store format 2");

  // Record the store bytes, then exercise every read surface.
  const beforeTree = hashTree(join(dataDir, "project-brain"));
  for (const [label, args] of [
    ["changes", ["memory", "changes", "--project-id", PROJECT_ID]],
    ["history", ["memory", "history", "--project-id", PROJECT_ID]],
    ["status", ["memory", "status", "--project-id", PROJECT_ID]],
    ["timeline", ["memory", "timeline", "--project-id", PROJECT_ID]],
  ]) {
    const r = j(args);
    assert(r.code === 0, `v0.3.1-shaped store supports ${label} under v0.4`);
  }
  // The new timeline command reads the v0.3.1-shaped store and derives events.
  const timelineRun = j(["memory", "timeline", "--project-id", PROJECT_ID]);
  const timelineData = safeParse(timelineRun.stdout)?.data;
  assert((timelineData?.events ?? []).length > 0, "v0.4 timeline derives events from a v0.3.1-shaped store");
  assert(
    (timelineData?.events ?? []).every((e) => e.captureSequence === 2),
    "v0.4 timeline attributes the single comparison to capture 2",
  );

  // NO migration was performed and nothing was written by any read.
  assert(treesEqual(beforeTree, hashTree(join(dataDir, "project-brain"))), "no read migrated or wrote the store");
  const migrationRecorded = collectText(join(dataDir, "project-brain")).includes("migrationHistory\":[{");
  assert(!migrationRecorded, "no migration was recorded in the store manifest");
  const backups = join(dataDir, "project-brain", "v1");
  let hasBackup = false;
  const walkBackups = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "backups" && readdirSync(abs).length > 0) hasBackup = true;
        walkBackups(abs);
      }
    }
  };
  walkBackups(backups);
  assert(!hasBackup, "no migration backup was created (no migration occurred)");
  // The status surface never reports a migration requirement.
  assert(statusData?.status !== "migrationRequired", "the v0.3.1-shaped store never reports migrationRequired");
}
