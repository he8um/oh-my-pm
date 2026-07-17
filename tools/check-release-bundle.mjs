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
  if (basename(bundle) !== expectedBundleName) {
    return fail(`bundle directory basename ${basename(bundle)} != ${expectedBundleName}`);
  }
  const expectedTools = ["project_brief", "project_risks", "project_next", "project_handoff"];
  if (JSON.stringify(release.mcpTools) !== JSON.stringify(expectedTools)) {
    return fail("RELEASE.json mcpTools list is unexpected");
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
  if (!isWindows) {
    for (const bin of [cliBin, mcpBin]) {
      if ((lstatSync(bin).mode & 0o111) === 0) return fail(`entrypoint not executable: ${bin}`);
    }
  }

  // Kernel WASM in the deployed dependency tree
  const kernelDir = join(bundle, "node_modules", "@oh-my-pm", "kernel", "generated-node");
  if (!isRegularFile(join(kernelDir, "oh_my_pm_kernel.js"))) return fail("bundled kernel WASM JS missing");
  if (!isRegularFile(join(kernelDir, "oh_my_pm_kernel_bg.wasm"))) {
    return fail("bundled kernel WASM binary missing");
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
