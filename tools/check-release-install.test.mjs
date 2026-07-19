import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInstalledCommandInvocation } from "./check-release-install.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const wrapper = join(repoRoot, "tools", "install-release-bundle.mjs");
const checker = join(repoRoot, "tools", "check-release-install.mjs");

const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;

const roots = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let prefix;

beforeAll(() => {
  const out = tempDir("omp-chk-build-");
  expect(run(buildBundle, ["--output", out, "--apply"]).status).toBe(0);
  const bundle = join(out, BUNDLE_NAME);
  prefix = join(tempDir("omp-chk-prefix-"), "prefix");
  expect(run(wrapper, ["--bundle", bundle, "--prefix", prefix, "--apply"]).status).toBe(0);
}, 240_000);

afterAll(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("check-release-install argument handling", () => {
  it("requires --prefix", () => {
    const r = run(checker, []);
    expect(r.status).toBe(2);
  });
  it("rejects unknown arguments", () => {
    const r = run(checker, ["--prefix", prefix, "--nope"]);
    expect(r.status).toBe(2);
  });
});

describe("check-release-install behavior", () => {
  it("passes for a good installation", () => {
    const r = run(checker, ["--prefix", prefix]);
    expect(r.stderr, r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`OH MY PM release installation check: OK (${CANONICAL_VERSION})\n`);
  }, 60_000);

  it("honors --expected-version", () => {
    expect(run(checker, ["--prefix", prefix, "--expected-version", CANONICAL_VERSION]).status).toBe(0);
    const wrong = run(checker, ["--prefix", prefix, "--expected-version", "9.9.9"]);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain("expected 9.9.9");
  }, 60_000);

  it("fails when the manifest is missing", () => {
    const empty = join(tempDir("omp-chk-empty-"), "prefix");
    const r = run(checker, ["--prefix", empty]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("failed");
  });

  it("fails when a managed shim drifts", () => {
    // Copy the good prefix, corrupt a shim, and confirm the checker rejects it.
    const copyParent = tempDir("omp-chk-drift-");
    const copy = join(copyParent, "prefix");
    cpSync(prefix, copy, { recursive: true, verbatimSymlinks: true });
    writeFileSync(join(copy, "bin", "oh-my-pm"), "corrupt\n");
    const r = run(checker, ["--prefix", copy]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("shim content mismatch");
  }, 60_000);
});

// The installed CLI and MCP server are launched as argument vectors, never
// through a shell. On Windows the shim is a .cmd, which Node refuses to spawn
// without a shell (CVE-2024-27980); rather than introduce a shell, the verifier
// launches the installed .mjs entrypoints directly with the Node executable.
// This behavior only manifests on Windows (where the smoke job runs but vitest
// does not), so the launch policy is unit-tested directly with injected inputs.
describe("createInstalledCommandInvocation", () => {
  const nodeExecutable = "/usr/bin/node";
  const cliShim = "/opt/app/bin/oh-my-pm.cmd";
  const cliEntry = "/opt/app/lib/oh-my-pm/versions/1.2.3/bin/oh-my-pm.mjs";
  const mcpShim = "/opt/app/bin/oh-my-pm-mcp.cmd";
  const mcpEntry = "/opt/app/lib/oh-my-pm/versions/1.2.3/bin/oh-my-pm-mcp.mjs";

  it("launches Node with the installed CLI .mjs on Windows, preserving args", () => {
    const inv = createInstalledCommandInvocation({
      platform: "win32",
      nodeExecutable,
      shimPath: cliShim,
      entrypoint: cliEntry,
      args: ["brief", "/some/project", "--json"],
    });
    expect(inv.command).toBe(nodeExecutable);
    expect(inv.args[0]).toBe(cliEntry);
    expect(inv.args.slice(1)).toEqual(["brief", "/some/project", "--json"]);
  });

  it("launches Node with the installed MCP .mjs on Windows", () => {
    const inv = createInstalledCommandInvocation({
      platform: "win32",
      nodeExecutable,
      shimPath: mcpShim,
      entrypoint: mcpEntry,
      args: [],
    });
    expect(inv.command).toBe(nodeExecutable);
    expect(inv.args).toEqual([mcpEntry]);
  });

  it("launches the installed POSIX shim directly on linux and darwin", () => {
    for (const platform of ["linux", "darwin"]) {
      const inv = createInstalledCommandInvocation({
        platform,
        nodeExecutable,
        shimPath: "/opt/app/bin/oh-my-pm",
        entrypoint: cliEntry,
        args: ["status"],
      });
      expect(inv.command, platform).toBe("/opt/app/bin/oh-my-pm");
      expect(inv.args, platform).toEqual(["status"]);
    }
  });

  it("passes paths with spaces as argument-array values, not a command string", () => {
    const inv = createInstalledCommandInvocation({
      platform: "win32",
      nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
      shimPath: cliShim,
      entrypoint: "C:\\Program Files\\oh my pm\\bin\\oh-my-pm.mjs",
      args: ["brief", "C:\\my projects\\demo", "--json"],
    });
    // Every element is a discrete array value; no element is a joined command.
    expect(inv.command).toBe("C:\\Program Files\\nodejs\\node.exe");
    expect(inv.args).toEqual([
      "C:\\Program Files\\oh my pm\\bin\\oh-my-pm.mjs",
      "brief",
      "C:\\my projects\\demo",
      "--json",
    ]);
    expect(inv.args.every((a) => typeof a === "string" && !a.includes(" node "))).toBe(true);
  });
});

describe("check-release-install launches without a shell", () => {
  const source = readFileSync(checker, "utf8");
  it("never spawns with a shell option", () => {
    expect(source).not.toMatch(/shell:\s*(true|isWindows)/);
  });
  it("never constructs a shell command string", () => {
    for (const marker of ["cmd.exe", "powershell", "/c "]) {
      expect(source, marker).not.toContain(marker);
    }
  });
  it("launches the installed CLI .mjs entrypoint from the version directory", () => {
    expect(source).toContain('join(versionDir, "bin", "oh-my-pm.mjs")');
    expect(source).toContain('join(versionDir, "bin", "oh-my-pm-mcp.mjs")');
  });
});
