#!/usr/bin/env node
// Read-only verifier for an installed release prefix produced by the portable
// installer. It validates the install manifest, the versioned bundle, the four
// command shims, then runs the installed CLI (status + four workflows) and the
// installed MCP server over stdio (four tools + project_brief). It performs no
// writes, no network access, no environment configuration, and no project
// mutation. It may spawn the explicitly installed commands and the installed
// bundle's own verifier.

import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const isWindows = process.platform === "win32";

// The historical ten installed MCP tools (four local + four GitHub + two
// provider diagnostics), compared sorted. The "project-brain" (v0.3) and
// "project-brain-timeline" (v0.4) profiles add
// exactly one read-only tool, project_changes; the profile is read from the
// installed RELEASE.json and the expected surface is resolved fail-closed below.
// This verifier calls only offline tools (project_brief, provider_status, and —
// on the project-brain profile — project_changes); it never invokes a GitHub
// tool and never touches the network or requires a token.
const TEN_MCP_TOOLS_SORTED = [
  "github_project_brief",
  "github_project_handoff",
  "github_project_next",
  "github_project_risks",
  "github_provider_diagnostics",
  "project_brief",
  "project_handoff",
  "project_next",
  "project_risks",
  "provider_status",
];
const ELEVEN_MCP_TOOLS_SORTED = [...TEN_MCP_TOOLS_SORTED, "project_changes"].sort();
const TWELVE_MCP_TOOLS_SORTED = [
  ...TEN_MCP_TOOLS_SORTED,
  "project_changes",
  "project_timeline",
].sort();

function isCanonicalSemver(value) {
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
  process.stderr.write(`release install check failed: ${message}\n`);
  process.exitCode = 1;
  return false;
}

function parseArgs(args) {
  let prefix;
  let prefixSeen = false;
  let expectedVersion;
  let expectedSeen = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--prefix") {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--") || prefixSeen) {
        return { ok: false, message: "--prefix requires a single value" };
      }
      prefix = value;
      prefixSeen = true;
      i += 1;
    } else if (arg === "--expected-version") {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--") || expectedSeen) {
        return { ok: false, message: "--expected-version requires a single value" };
      }
      expectedVersion = value;
      expectedSeen = true;
      i += 1;
    } else if (arg === "--json") {
      // accepted for symmetry; output is a single line either way
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (!prefixSeen) return { ok: false, message: "--prefix is required" };
  return { ok: true, prefix, expectedVersion };
}

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

function posixShimContent(relativeTarget) {
  return [
    "#!/bin/sh",
    "# OH MY PM installed command shim. Relative to this bin directory so the",
    "# whole prefix can be relocated as one tree.",
    'dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `exec node "$dir/${relativeTarget}" "$@"`,
    "",
  ].join("\n");
}

function windowsShimContent(relativeTarget) {
  const backslashed = relativeTarget.split("/").join("\\");
  return ["@echo off", `node "%~dp0${backslashed}" %*`, ""].join("\r\n");
}

/**
 * How to launch an installed command as an argument vector (never a shell
 * command string). On Windows the installed shim is a `.cmd`, which Node refuses
 * to spawn through execFile/spawn without a shell (CVE-2024-27980); rather than
 * introduce a shell, launch the installed `.mjs` entrypoint directly with the
 * Node executable. On POSIX the executable `#!/bin/sh` shim is launched as-is.
 * Either way the resulting command and args are passed to execFileSync with no
 * shell, so paths containing spaces are safe argument-array values.
 */
export function createInstalledCommandInvocation({ platform, nodeExecutable, shimPath, entrypoint, args }) {
  if (platform === "win32") {
    return { command: nodeExecutable, args: [entrypoint, ...args] };
  }
  return { command: shimPath, args: [...args] };
}

if (process.argv[1] && process.argv[1].endsWith("check-release-install.mjs")) {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`release install check error: ${parsed.message}\n`);
    process.exitCode = 2;
  } else {
    const prefix = isAbsolute(parsed.prefix) ? parsed.prefix : resolve(parsed.prefix);
    const version = await run(prefix, parsed.expectedVersion);
    if (version !== false) {
      process.stdout.write(`OH MY PM release installation check: OK (${version})\n`);
    }
  }
}

async function run(prefix, expectedVersion) {
  if (!existsSync(prefix)) return fail(`prefix not found: ${prefix}`);

  const productDir = join(prefix, "lib", "oh-my-pm");
  const manifestPath = join(productDir, "install.json");
  if (!isRegularFile(manifestPath)) return fail("install.json is missing");

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return fail("install.json is not valid JSON");
  }

  // Exact schema.
  if (manifest.schemaVersion !== 1) return fail("install.json schemaVersion is not 1");
  if (manifest.product !== "oh-my-pm") return fail("install.json product is unexpected");
  if (!isCanonicalSemver(manifest.version)) return fail("install.json version is not canonical SemVer");
  const version = manifest.version;
  if (expectedVersion !== undefined && version !== expectedVersion) {
    return fail(`install.json version ${version} != expected ${expectedVersion}`);
  }
  if (manifest.bundle !== `oh-my-pm-v${version}`) return fail("install.json bundle is unexpected");
  if (manifest.activeVersion !== version) return fail("install.json activeVersion mismatch");
  if (manifest.versionRoot !== `lib/oh-my-pm/versions/${version}`) {
    return fail("install.json versionRoot is unexpected");
  }
  const expectedCommands = { "oh-my-pm": "bin/oh-my-pm", "oh-my-pm-mcp": "bin/oh-my-pm-mcp" };
  if (JSON.stringify(manifest.commands) !== JSON.stringify(expectedCommands)) {
    return fail("install.json commands are unexpected");
  }
  if (
    manifest.source === null ||
    typeof manifest.source !== "object" ||
    manifest.source.kind !== "release-bundle" ||
    manifest.source.verified !== true
  ) {
    return fail("install.json source is unexpected");
  }

  // Manifest paths are relative and prefix-confined.
  const relativePathValues = [
    manifest.versionRoot,
    manifest.commands["oh-my-pm"],
    manifest.commands["oh-my-pm-mcp"],
  ];
  for (const value of relativePathValues) {
    if (isAbsolute(value) || value.includes("..") || value.includes("\\")) {
      return fail(`install.json path value is not a safe relative path: ${value}`);
    }
  }

  // Forbidden internal fields must not leak into the manifest.
  const manifestText = readFileSync(manifestPath, "utf8");
  for (const forbidden of ["timestamp", "hostname", "username", "runtimeResponse", "providerResponses"]) {
    if (manifestText.includes(forbidden)) {
      return fail(`install.json leaks a forbidden field: ${forbidden}`);
    }
  }

  // Version directory exists and its basename equals the manifest version.
  const versionDir = join(prefix, "lib", "oh-my-pm", "versions", version);
  if (!existsSync(versionDir)) return fail("version directory is missing");
  if (basename(versionDir) !== version) return fail("version directory basename mismatch");

  // Installed RELEASE.json agrees with the manifest.
  const releasePath = join(versionDir, "RELEASE.json");
  if (!isRegularFile(releasePath)) return fail("installed RELEASE.json is missing");
  let release;
  try {
    release = JSON.parse(readFileSync(releasePath, "utf8"));
  } catch {
    return fail("installed RELEASE.json is not valid JSON");
  }
  if (release.version !== version) return fail("installed RELEASE.json version disagrees with manifest");
  if (release.bundle !== `oh-my-pm-v${version}`) return fail("installed RELEASE.json bundle disagrees");

  // Resolve the installed MCP surface from the bundle's own declared profile and
  // fail closed on any unknown profile. The project-brain (v0.3) profile expects
  // eleven tools; the project-brain-timeline (v0.4) profile expects twelve; both
  // require the bundled Project Memory package. The legacy profile (absent or
  // "source-v0.2") expects the historical ten.
  const installedProfile = release.bundleProfile ?? "source-v0.2";
  let expectedMcpToolsSorted;
  if (installedProfile === "project-brain") {
    expectedMcpToolsSorted = ELEVEN_MCP_TOOLS_SORTED;
  } else if (installedProfile === "project-brain-timeline") {
    expectedMcpToolsSorted = TWELVE_MCP_TOOLS_SORTED;
  } else if (installedProfile === "source-v0.2") {
    expectedMcpToolsSorted = TEN_MCP_TOOLS_SORTED;
  } else {
    return fail(`installed RELEASE.json bundleProfile is unknown: ${installedProfile}`);
  }
  const installedHasProjectBrain =
    installedProfile === "project-brain" || installedProfile === "project-brain-timeline";
  if (installedHasProjectBrain) {
    const pmEntry = join(
      versionDir,
      "node_modules",
      "@oh-my-pm",
      "project-memory",
      "dist",
      "index.js",
    );
    if (!isRegularFile(pmEntry)) return fail("installed @oh-my-pm/project-memory dist/index.js missing");
  }

  // Installed internal checksums and bundle verifier pass.
  const installedVerifier = join(versionDir, "libexec", "check-release-bundle.mjs");
  if (!isRegularFile(installedVerifier)) return fail("installed bundle verifier is missing");
  const verify = spawnSync(process.execPath, [installedVerifier, "--bundle", versionDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (verify.status !== 0) return fail("installed bundle verifier did not pass");

  // The installed version directory must retain the complete generated Kernel
  // binding (JS glue + WASM + CommonJS manifest); a WASM-only install is not
  // acceptable.
  const installedKernelDir = join(versionDir, "node_modules", "@oh-my-pm", "kernel", "generated-node");
  for (const asset of ["oh_my_pm_kernel.js", "oh_my_pm_kernel_bg.wasm", "package.json"]) {
    if (!isRegularFile(join(installedKernelDir, asset))) {
      return fail(`installed kernel generated asset missing: ${asset}`);
    }
  }

  // The four exact shims exist and match expected content for this version.
  const binDir = join(prefix, "bin");
  const cliTarget = `../lib/oh-my-pm/versions/${version}/bin/oh-my-pm.mjs`;
  const mcpTarget = `../lib/oh-my-pm/versions/${version}/bin/oh-my-pm-mcp.mjs`;
  const expectedShims = {
    "oh-my-pm": posixShimContent(cliTarget),
    "oh-my-pm.cmd": windowsShimContent(cliTarget),
    "oh-my-pm-mcp": posixShimContent(mcpTarget),
    "oh-my-pm-mcp.cmd": windowsShimContent(mcpTarget),
  };
  for (const [name, expected] of Object.entries(expectedShims)) {
    const shimPath = join(binDir, name);
    if (!isRegularFile(shimPath)) return fail(`shim is missing: ${shimPath}`);
    if (readFileSync(shimPath, "utf8") !== expected) return fail(`shim content mismatch: ${shimPath}`);
  }
  if (!isWindows) {
    for (const name of ["oh-my-pm", "oh-my-pm-mcp"]) {
      if (!isExecutable(join(binDir, name))) return fail(`shim is not executable: ${join(binDir, name)}`);
    }
  }

  const cliShim = join(binDir, isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
  const mcpShim = join(binDir, isWindows ? "oh-my-pm-mcp.cmd" : "oh-my-pm-mcp");
  const fixtureRoot = join(versionDir, "examples", "markdown-project");

  // The installed JavaScript entrypoints under the versioned prefix. On Windows
  // these are launched directly with Node (the .cmd shim cannot be spawned
  // without a shell); on POSIX the executable shim is launched instead. All
  // executed code comes from the installed version directory — never the source
  // repository and never a package-manager bin directory.
  const cliEntrypoint = join(versionDir, "bin", "oh-my-pm.mjs");
  const mcpEntrypoint = join(versionDir, "bin", "oh-my-pm-mcp.mjs");
  if (!isRegularFile(cliEntrypoint)) return fail(`installed CLI entrypoint missing: ${cliEntrypoint}`);
  if (!isRegularFile(mcpEntrypoint)) return fail(`installed MCP entrypoint missing: ${mcpEntrypoint}`);

  // Launch the installed CLI as an argument vector with no shell. On Windows
  // that is `node <installed cli .mjs> ...`; on POSIX it is the executable shim.
  const runInstalledCli = (args) => {
    const invocation = createInstalledCommandInvocation({
      platform: process.platform,
      nodeExecutable: process.execPath,
      shimPath: cliShim,
      entrypoint: cliEntrypoint,
      args,
    });
    return execFileSync(invocation.command, invocation.args, { encoding: "utf8" });
  };

  // Installed CLI status reports the manifest version and matching kernel.
  let statusOut;
  try {
    statusOut = runInstalledCli(["status"]);
  } catch {
    return fail("installed CLI status did not exit cleanly");
  }
  if (!statusOut.includes("OH MY PM status: healthy")) return fail("installed CLI status was not healthy");
  if (!statusOut.includes(`version: ${version}`)) return fail("installed CLI status version mismatch");
  if (!statusOut.includes(`kernel: ${version}`)) return fail("installed CLI kernel version mismatch");

  // All four project workflows run against the installed fixture.
  for (const workflow of ["brief", "risks", "next", "handoff"]) {
    let out;
    try {
      out = runInstalledCli([workflow, fixtureRoot, "--json"]);
    } catch {
      return fail(`installed CLI ${workflow} did not exit cleanly`);
    }
    let parsedOut;
    try {
      parsedOut = JSON.parse(out);
    } catch {
      return fail(`installed CLI ${workflow} did not emit valid JSON`);
    }
    if (parsedOut.ok !== true) return fail(`installed CLI ${workflow} was not successful`);
    if (out.includes("ARCHIVED-SENTINEL") || out.includes("SCRATCH-SENTINEL")) {
      return fail(`installed CLI ${workflow} leaked excluded document content`);
    }
  }

  // Installed MCP server over stdio using the installed bundle's own SDK.
  const mcpManifest = realpathSync(
    join(versionDir, "node_modules", "@oh-my-pm", "mcp-server", "package.json"),
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
    return fail("could not resolve the MCP SDK from the installed bundle");
  }

  // Launch the installed MCP server the same way: `node <installed mcp .mjs>`
  // on Windows, the executable shim on POSIX. Never hand the .cmd shim to the
  // MCP SDK, whose spawn would fail on Windows without a shell.
  const mcpInvocation = createInstalledCommandInvocation({
    platform: process.platform,
    nodeExecutable: process.execPath,
    shimPath: mcpShim,
    entrypoint: mcpEntrypoint,
    args: [],
  });
  // Isolate the installed MCP process's standard application-data resolution to
  // an empty, non-existent temporary root so a project-brain read
  // (project_changes) never touches the real user data directory and returns
  // noPriorMemory without any write. project_changes accepts no data path; the
  // resolver reads LOCALAPPDATA (Windows), HOME/Library/Application Support
  // (macOS), or XDG_DATA_HOME / HOME/.local/share (Linux) — all pointed here.
  // The StdioClientTransport merges the SDK's default inherited environment with
  // these overrides, so only the data-home variables are set (no ambient install
  // environment is read) and no directory is created or removed by this verifier.
  const isolatedDataHome = join(tmpdir(), `omp-install-check-${process.pid}-${basename(versionDir)}`);
  const mcpEnv = {
    HOME: isolatedDataHome,
    XDG_DATA_HOME: join(isolatedDataHome, "xdg"),
    LOCALAPPDATA: join(isolatedDataHome, "localappdata"),
    APPDATA: join(isolatedDataHome, "appdata"),
  };
  const transport = new StdioClientTransport({
    command: mcpInvocation.command,
    args: mcpInvocation.args,
    cwd: versionDir,
    env: mcpEnv,
    stderr: "pipe",
  });
  const client = new Client({ name: "oh-my-pm-release-install-check", version: "0.0.0" });
  let mcpOk = true;
  let mcpMessage = "";
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(expectedMcpToolsSorted)) {
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
        mcpMessage = "installed MCP project_brief returned an error";
      } else if (
        serialized.includes("runtimeResponse") ||
        serialized.includes("providerResponses") ||
        serialized.includes("ARCHIVED-SENTINEL")
      ) {
        mcpOk = false;
        mcpMessage = "installed MCP project_brief leaked a forbidden field";
      } else {
        // provider_status is offline and safe to call; github_provider_diagnostics
        // is never called with network confirmation from the verifier.
        const statusResult = await client.callTool({ name: "provider_status", arguments: {} });
        const statusSerialized = JSON.stringify(statusResult.structuredContent ?? {});
        if (statusResult.isError || statusResult.structuredContent?.schemaVersion !== 1) {
          mcpOk = false;
          mcpMessage = "installed MCP provider_status did not return a valid status report";
        } else if (
          statusSerialized.includes("Authorization") ||
          statusSerialized.includes("Bearer ") ||
          statusSerialized.includes("runtimeResponse")
        ) {
          mcpOk = false;
          mcpMessage = "installed MCP provider_status leaked a forbidden field";
        } else if (installedHasProjectBrain) {
          // The read-only project_changes tool must resolve the installed Project
          // Memory package and return a controlled noPriorMemory success against
          // this MCP process's isolated, empty application-data root. It accepts
          // no data path and must never write, lock, migrate, or reach a network.
          const changes = await client.callTool({
            name: "project_changes",
            arguments: { projectId: "oh-my-pm-install-check-fixture" },
          });
          const sc = changes.structuredContent ?? {};
          const changesSerialized = JSON.stringify(sc);
          if (changes.isError) {
            mcpOk = false;
            mcpMessage = "installed MCP project_changes returned an error";
          } else if (sc.schemaVersion !== 1 || sc.status !== "noPriorMemory") {
            mcpOk = false;
            mcpMessage = "installed MCP project_changes did not return noPriorMemory";
          } else if (
            changesSerialized.includes("evidenceRefs") ||
            changesSerialized.includes("runtimeResponse") ||
            changesSerialized.includes("/Users/") ||
            changesSerialized.includes("/home/")
          ) {
            mcpOk = false;
            mcpMessage = "installed MCP project_changes leaked a forbidden field";
          }
        }
      }
    }
  } catch {
    mcpOk = false;
    mcpMessage = "installed MCP command did not respond over stdio";
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

  return version;
}
