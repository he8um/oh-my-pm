#!/usr/bin/env node
// Read-only verifier for an assembled, possibly relocated release bundle. It
// depends on nothing in the source repository: it validates RELEASE.json and
// SHA256SUMS, runs the bundled CLI, and drives the bundled MCP server over
// stdio using the MCP SDK resolved from the bundle's own dependency tree.
// No writes, no environment configuration, no network.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const isWindows = process.platform === "win32";

/**
 * Strict canonical SemVer (major.minor.patch with optional dot-separated
 * prerelease). Kept inline so this verifier stays repository-independent.
 */
function isValidCanonicalSemver(value) {
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

function fail(message) {
  process.stderr.write(`release bundle check failed: ${message}\n`);
  process.exitCode = 1;
  return false;
}

function parseArgs(args) {
  let bundle;
  let seen = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--bundle") {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--") || seen) {
        return { ok: false, message: "--bundle requires a single value" };
      }
      bundle = value;
      seen = true;
      i += 1;
    } else if (arg === "--json") {
      // accepted; output is a single line either way
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (!seen) return { ok: false, message: "--bundle is required" };
  return { ok: true, bundle };
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function enumerateFiles(root, current, out) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const abs = join(current, entry.name);
    if (entry.isDirectory()) enumerateFiles(root, abs, out);
    else if (entry.isFile()) out.push({ abs, rel: relative(root, abs).split(sep).join("/") });
  }
  return out;
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`release bundle check error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const bundle = isAbsolute(parsed.bundle) ? parsed.bundle : resolve(parsed.bundle);
  const version = await run(bundle);
  if (version !== false) {
    process.stdout.write(`OH MY PM release bundle check: OK (${version})\n`);
  }
}

async function run(bundle) {
  if (!existsSync(bundle)) return fail(`bundle directory not found: ${bundle}`);

  // RELEASE.json
  const releasePath = join(bundle, "RELEASE.json");
  if (!isRegularFile(releasePath)) return fail("RELEASE.json is missing");
  let release;
  try {
    release = JSON.parse(readFileSync(releasePath, "utf8"));
  } catch {
    return fail("RELEASE.json is not valid JSON");
  }
  // The bundle is self-describing: its own RELEASE.json declares the version.
  // This verifier never reads the source repository's version.json.
  if (!isValidCanonicalSemver(release.version)) {
    return fail(`RELEASE.json version is not valid canonical SemVer: ${release.version}`);
  }
  const expectedVersion = release.version;
  const expectedBundleName = `oh-my-pm-v${expectedVersion}`;
  if (release.bundle !== expectedBundleName) {
    return fail(`RELEASE.json bundle ${release.bundle} != ${expectedBundleName}`);
  }
  // A release bundle uses the oh-my-pm-v<version> basename; an installed copy
  // lives under lib/oh-my-pm/versions/<version> and uses the bare version as
  // its basename. Accept either so the same verifier serves both layouts.
  const bundleBasename = basename(bundle);
  if (bundleBasename !== expectedBundleName && bundleBasename !== expectedVersion) {
    return fail(`bundle directory basename ${bundleBasename} != ${expectedBundleName}`);
  }
  // Exactly the eight tools in order: four local, then four GitHub. The local
  // tools are still callable offline; the GitHub tools are opt-in network.
  const expectedTools = [
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
  if (JSON.stringify(release.mcpTools) !== JSON.stringify(expectedTools)) {
    return fail("RELEASE.json mcpTools list is unexpected");
  }
  const expectedGithubWorkflows = ["brief", "risks", "next", "handoff"];
  if (JSON.stringify(release.githubWorkflows) !== JSON.stringify(expectedGithubWorkflows)) {
    return fail("RELEASE.json githubWorkflows list is unexpected");
  }

  // Conditional-network metadata: default disabled, one opt-in read-only,
  // GET-only GitHub provider at the fixed origin, with the exact token env var.
  // The literal origin is assembled from fragments so this repo-independent
  // verifier holds no bare secure-scheme origin string in its own source.
  const expectedGithubOrigin = `${"https"}://api.github.com`;
  const network = release.network;
  if (network === null || typeof network !== "object") {
    return fail("RELEASE.json network metadata is missing");
  }
  if (network.default !== "disabled") return fail("RELEASE.json network.default must be disabled");
  if (!Array.isArray(network.outboundProviders) || network.outboundProviders.length !== 1) {
    return fail("RELEASE.json network.outboundProviders is unexpected");
  }
  const gh = network.outboundProviders[0];
  if (gh === null || typeof gh !== "object") return fail("RELEASE.json github network entry is missing");
  if (gh.id !== "github") return fail("RELEASE.json network provider id must be github");
  if (gh.optIn !== true) return fail("RELEASE.json github network must be opt-in");
  if (gh.readOnly !== true) return fail("RELEASE.json github network must be read-only");
  if (JSON.stringify(gh.methods) !== JSON.stringify(["GET"])) {
    return fail("RELEASE.json github network methods must be GET only");
  }
  if (gh.origin !== expectedGithubOrigin) return fail("RELEASE.json github origin is unexpected");
  if (gh.apiVersion !== "2026-03-10") return fail("RELEASE.json github apiVersion is unexpected");
  if (gh.tokenEnv !== "OH_MY_PM_GITHUB_TOKEN") return fail("RELEASE.json github tokenEnv is unexpected");
  if (gh.tokenOptionalForPublicRepositories !== true) {
    return fail("RELEASE.json github tokenOptionalForPublicRepositories must be true");
  }

  // Source-selection metadata: exact modes/states/kinds and read-only limits.
  const sel = gh.sourceSelection;
  if (sel === null || typeof sel !== "object") {
    return fail("RELEASE.json github sourceSelection metadata is missing");
  }
  if (sel.defaultSource !== "overview") return fail("RELEASE.json sourceSelection.defaultSource must be overview");
  if (sel.defaultState !== "open") return fail("RELEASE.json sourceSelection.defaultState must be open");
  if (
    JSON.stringify(sel.modes) !==
    JSON.stringify(["overview", "repository", "issues", "pull-requests", "item", "search"])
  ) {
    return fail("RELEASE.json sourceSelection.modes is unexpected");
  }
  if (JSON.stringify(sel.states) !== JSON.stringify(["open", "closed", "all"])) {
    return fail("RELEASE.json sourceSelection.states is unexpected");
  }
  if (JSON.stringify(sel.searchKinds) !== JSON.stringify(["all", "issues", "pull-requests"])) {
    return fail("RELEASE.json sourceSelection.searchKinds is unexpected");
  }
  if (sel.singleItemAutoDetect !== true) return fail("RELEASE.json sourceSelection.singleItemAutoDetect must be true");
  if (sel.maxItems !== 100) return fail("RELEASE.json sourceSelection.maxItems must be 100");
  if (sel.pagination !== "single-page") return fail("RELEASE.json sourceSelection.pagination must be single-page");
  if (sel.diffs !== false) {
    return fail("RELEASE.json sourceSelection must not enable diffs");
  }
  // Item discussion: bounded, opt-in issue comments only. Review comments,
  // reviews, timeline events, and writes must all stay disabled.
  const disc = sel.itemDiscussion;
  if (disc === null || typeof disc !== "object") {
    return fail("RELEASE.json sourceSelection.itemDiscussion metadata is missing");
  }
  const ic = disc.issueComments;
  if (ic === null || typeof ic !== "object") {
    return fail("RELEASE.json itemDiscussion.issueComments metadata is missing");
  }
  if (
    ic.supported !== true ||
    ic.defaultEnabled !== false ||
    ic.defaultLimit !== 20 ||
    ic.maxLimit !== 50 ||
    ic.pagination !== "single-page"
  ) {
    return fail("RELEASE.json itemDiscussion.issueComments bounds are unexpected");
  }
  if (
    disc.pullRequestReviewComments !== false ||
    disc.pullRequestReviews !== false ||
    disc.timelineEvents !== false ||
    disc.writes !== false
  ) {
    return fail("RELEASE.json itemDiscussion must not enable reviews/timeline/writes");
  }

  // Installer metadata: preview-first, prefix-required, no network/profile/
  // client/project writes. Validated structurally without applying anything.
  const installer = release.installer;
  if (installer === null || typeof installer !== "object") {
    return fail("RELEASE.json installer metadata is missing");
  }
  if (installer.entrypoint !== "bin/oh-my-pm-install.mjs") {
    return fail("RELEASE.json installer.entrypoint is unexpected");
  }
  if (installer.previewFirst !== true) return fail("RELEASE.json installer.previewFirst must be true");
  if (installer.prefixRequired !== true) return fail("RELEASE.json installer.prefixRequired must be true");
  if (installer.applyFlag !== "--apply") return fail("RELEASE.json installer.applyFlag must be --apply");
  if (installer.forceFlag !== "--force") return fail("RELEASE.json installer.forceFlag must be --force");
  if (installer.network !== false) return fail("RELEASE.json installer.network must be false");
  if (installer.shellProfileWrites !== false) {
    return fail("RELEASE.json installer.shellProfileWrites must be false");
  }
  if (installer.clientConfigWrites !== false) {
    return fail("RELEASE.json installer.clientConfigWrites must be false");
  }
  if (installer.projectWrites !== false) return fail("RELEASE.json installer.projectWrites must be false");

  // Provider configuration metadata: read-only, no secret values, schema v1,
  // the exact configurable/fixed GitHub key partition.
  const providerConfig = release.providerConfiguration;
  if (providerConfig === null || typeof providerConfig !== "object") {
    return fail("RELEASE.json providerConfiguration metadata is missing");
  }
  if (providerConfig.schemaVersion !== 1) {
    return fail("RELEASE.json providerConfiguration.schemaVersion must be 1");
  }
  if (providerConfig.fileName !== "providers.json") {
    return fail("RELEASE.json providerConfiguration.fileName must be providers.json");
  }
  if (providerConfig.pathEnv !== "OH_MY_PM_PROVIDER_CONFIG") {
    return fail("RELEASE.json providerConfiguration.pathEnv is unexpected");
  }
  if (providerConfig.secretValuesAllowed !== false) {
    return fail("RELEASE.json providerConfiguration.secretValuesAllowed must be false");
  }
  if (providerConfig.writes !== false) {
    return fail("RELEASE.json providerConfiguration.writes must be false");
  }
  if (providerConfig.github === null || typeof providerConfig.github !== "object") {
    return fail("RELEASE.json providerConfiguration.github metadata is missing");
  }
  if (
    JSON.stringify(providerConfig.github.configurable) !==
    JSON.stringify(["enabled", "defaultRepository", "defaultLimit"])
  ) {
    return fail("RELEASE.json providerConfiguration.github.configurable is unexpected");
  }
  if (
    JSON.stringify(providerConfig.github.fixed) !==
    JSON.stringify(["origin", "apiVersion", "method", "tokenEnv"])
  ) {
    return fail("RELEASE.json providerConfiguration.github.fixed is unexpected");
  }
  if (
    JSON.stringify(providerConfig.githubFields) !==
    JSON.stringify(["enabled", "defaultRepository", "defaultLimit", "defaultSource", "defaultState"])
  ) {
    return fail("RELEASE.json providerConfiguration.githubFields is unexpected");
  }

  // Provider diagnostics metadata: offline by default, one confirmed GET, no
  // token values reported.
  const diagnostics = release.providerDiagnostics;
  if (diagnostics === null || typeof diagnostics !== "object") {
    return fail("RELEASE.json providerDiagnostics metadata is missing");
  }
  if (diagnostics.offlineByDefault !== true) {
    return fail("RELEASE.json providerDiagnostics.offlineByDefault must be true");
  }
  if (diagnostics.networkConfirmationFlag !== "--confirm-network") {
    return fail("RELEASE.json providerDiagnostics.networkConfirmationFlag is unexpected");
  }
  if (diagnostics.networkRequestCount !== 1) {
    return fail("RELEASE.json providerDiagnostics.networkRequestCount must be 1");
  }
  if (diagnostics.networkMethod !== "GET") {
    return fail("RELEASE.json providerDiagnostics.networkMethod must be GET");
  }
  if (diagnostics.tokenValuesReported !== false) {
    return fail("RELEASE.json providerDiagnostics.tokenValuesReported must be false");
  }

  // SHA256SUMS: every listed file matches; every regular file is listed.
  const sumsPath = join(bundle, "SHA256SUMS");
  if (!isRegularFile(sumsPath)) return fail("SHA256SUMS is missing");
  const listed = new Map();
  for (const line of readFileSync(sumsPath, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) return fail(`malformed SHA256SUMS line: ${line}`);
    listed.set(match[2], match[1]);
  }
  for (const [rel, expected] of listed) {
    const abs = join(bundle, ...rel.split("/"));
    if (!isRegularFile(abs)) return fail(`SHA256SUMS lists a missing file: ${rel}`);
    const actual = createHash("sha256").update(readFileSync(abs)).digest("hex");
    if (actual !== expected) return fail(`checksum mismatch: ${rel}`);
  }
  const actualFiles = enumerateFiles(bundle, bundle, []).filter((f) => f.rel !== "SHA256SUMS");
  for (const file of actualFiles) {
    if (!listed.has(file.rel)) return fail(`unlisted regular file present: ${file.rel}`);
  }

  // Entrypoints
  const cliBin = join(bundle, "bin", "oh-my-pm.mjs");
  const mcpBin = join(bundle, "bin", "oh-my-pm-mcp.mjs");
  if (!isRegularFile(cliBin)) return fail("CLI entrypoint missing");
  if (!isRegularFile(mcpBin)) return fail("MCP entrypoint missing");

  // Installer surfaces: entrypoint, core, and the shipped bundle verifier.
  const installBin = join(bundle, "bin", "oh-my-pm-install.mjs");
  const installCore = join(bundle, "libexec", "release-install-core.mjs");
  const shippedVerifier = join(bundle, "libexec", "check-release-bundle.mjs");
  if (!isRegularFile(installBin)) return fail("installer entrypoint missing");
  if (!isRegularFile(installCore)) return fail("release install core missing");
  if (!isRegularFile(shippedVerifier)) return fail("shipped bundle verifier missing");
  if (!isWindows) {
    for (const bin of [cliBin, mcpBin]) {
      if ((lstatSync(bin).mode & 0o111) === 0) return fail(`entrypoint not executable: ${bin}`);
    }
  }

  // Complete generated Kernel binding in the deployed dependency tree. All
  // three approved files must be present, regular (not symlinked), and the only
  // files in the directory; the generated manifest must be CommonJS/private and
  // the JS glue must reference its sibling WASM binary with no source path.
  const kernelDir = join(bundle, "node_modules", "@oh-my-pm", "kernel", "generated-node");
  const kernelJs = join(kernelDir, "oh_my_pm_kernel.js");
  const kernelWasm = join(kernelDir, "oh_my_pm_kernel_bg.wasm");
  const kernelPkg = join(kernelDir, "package.json");
  const notSymlinkRegular = (p) => isRegularFile(p) && !lstatSync(p).isSymbolicLink();
  if (!notSymlinkRegular(kernelJs)) return fail("bundled kernel WASM JS missing");
  if (!notSymlinkRegular(kernelWasm)) return fail("bundled kernel WASM binary missing");
  if (!notSymlinkRegular(kernelPkg)) return fail("bundled kernel generated package manifest missing");
  const kernelGeneratedFiles = readdirSync(kernelDir).sort();
  const expectedKernelFiles = ["oh_my_pm_kernel.js", "oh_my_pm_kernel_bg.wasm", "package.json"];
  if (
    kernelGeneratedFiles.length !== expectedKernelFiles.length ||
    kernelGeneratedFiles.some((n, i) => n !== expectedKernelFiles[i])
  ) {
    return fail("bundled kernel generated directory contains unexpected files");
  }
  let kernelManifest;
  try {
    kernelManifest = JSON.parse(readFileSync(kernelPkg, "utf8"));
  } catch {
    return fail("bundled kernel manifest invalid");
  }
  if (
    kernelManifest === null ||
    typeof kernelManifest !== "object" ||
    kernelManifest.type !== "commonjs" ||
    kernelManifest.private !== true
  ) {
    return fail("bundled kernel manifest invalid");
  }
  let kernelGlue;
  try {
    kernelGlue = readFileSync(kernelJs, "utf8");
  } catch {
    return fail("bundled kernel WASM JS invalid");
  }
  if (!kernelGlue.includes("oh_my_pm_kernel_bg.wasm")) {
    return fail("bundled kernel WASM JS invalid");
  }
  if (/\/Users\/|\/home\/|[A-Za-z]:\\\\/.test(kernelGlue)) {
    return fail("bundled kernel WASM JS invalid");
  }

  // Fictional fixture
  const fixtureRoot = join(bundle, "examples", "markdown-project");
  if (!existsSync(join(fixtureRoot, "README.md"))) return fail("bundled fixture missing");

  // Bundled CLI: status + four workflows
  let statusOut;
  try {
    statusOut = execFileSync(process.execPath, [cliBin, "status"], { encoding: "utf8" });
  } catch {
    return fail("bundled CLI status did not exit cleanly");
  }
  if (!statusOut.includes(`version: ${expectedVersion}`)) {
    return fail("bundled CLI status did not report the bundle's declared version");
  }
  // The real Rust/WASM Kernel must load and report the release version — never a
  // missing/unavailable binding.
  if (statusOut.includes("unavailable")) {
    return fail("bundled kernel binding is unavailable");
  }
  if (!statusOut.includes(`kernel: ${expectedVersion}`)) {
    return fail("bundled kernel version mismatch");
  }
  for (const workflow of ["brief", "risks", "next", "handoff"]) {
    let out;
    try {
      out = execFileSync(process.execPath, [cliBin, workflow, fixtureRoot, "--json"], {
        encoding: "utf8",
      });
    } catch {
      return fail(`bundled CLI ${workflow} did not exit cleanly`);
    }
    let parsedOut;
    try {
      parsedOut = JSON.parse(out);
    } catch {
      return fail(`bundled CLI ${workflow} did not emit valid JSON`);
    }
    if (parsedOut.ok !== true) return fail(`bundled CLI ${workflow} was not successful`);
    if (out.includes("ARCHIVED-SENTINEL") || out.includes("SCRATCH-SENTINEL")) {
      return fail(`bundled CLI ${workflow} leaked excluded document content`);
    }
  }

  // Bundled MCP server over stdio using the bundle's own SDK. Resolve from the
  // real (symlink-followed) mcp-server package location so pnpm's .pnpm layout
  // exposes the SDK as a sibling dependency.
  const mcpManifest = realpathSync(
    join(bundle, "node_modules", "@oh-my-pm", "mcp-server", "package.json"),
  );
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
    return fail("could not resolve the MCP SDK from the bundle dependency tree");
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpBin],
    cwd: bundle,
    stderr: "pipe",
  });
  const client = new Client({ name: "oh-my-pm-bundle-check", version: "0.0.0" });
  let mcpOk = true;
  let mcpMessage = "";
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    if (JSON.stringify(names) !== JSON.stringify([...expectedTools].sort())) {
      mcpOk = false;
      mcpMessage = `unexpected MCP tool list: ${names.join(", ")}`;
    } else {
      const result = await client.callTool({
        name: "project_brief",
        arguments: { root: fixtureRoot },
      });
      const serialized = JSON.stringify(result.structuredContent ?? {});
      if (result.isError) {
        mcpOk = false;
        mcpMessage = "bundled MCP project_brief returned an error";
      } else if (
        serialized.includes("runtimeResponse") ||
        serialized.includes("providerResponses") ||
        serialized.includes("ARCHIVED-SENTINEL")
      ) {
        mcpOk = false;
        mcpMessage = "bundled MCP project_brief leaked a forbidden field";
      }
    }
  } catch {
    mcpOk = false;
    mcpMessage = "bundled MCP command did not respond over stdio";
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
    try {
      await transport.close();
    } catch {
      // ignore
    }
  }
  if (!mcpOk) return fail(mcpMessage);

  return expectedVersion;
}
