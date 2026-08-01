// Upgrade compatibility: a prefix installed by v0.4 (which had only the
// `oh-my-pm` command family) must upgrade to v0.5 leaving every canonical command
// AND every deprecated alias working, with no orphaned shims. Uninstall must then
// be able to remove all of them.
//
// This drives the real repository installer against real temporary prefixes; it
// asserts observed process behavior, not source text.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { LOCAL_COMMAND_NAMES } from "../local-install-utils.mjs";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(toolsDir, "..");
const installer = join(toolsDir, "install-local.mjs");
const isWindows = process.platform === "win32";

const roots = [];

/** One owned temporary root per case; only that exact root is removed. */
function makeRoot(label) {
  const root = mkdtempSync(join(tmpdir(), `oh-my-pm-upgrade-${label}-`));
  roots.push(root);
  return root;
}

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function runInstaller(args) {
  const result = spawnSync(process.execPath, [installer, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Create a v0.4-shaped installation: only the four `oh-my-pm` shims, with
 * placeholder content that differs from what v0.5 writes.
 */
function seedV04Prefix(prefix) {
  const binDir = join(prefix, "bin");
  mkdirSync(binDir, { recursive: true });
  for (const name of ["oh-my-pm", "oh-my-pm-mcp"]) {
    const posix = join(binDir, name);
    writeFileSync(posix, "#!/usr/bin/env node\n// v0.4 placeholder shim\n", "utf8");
    chmodSync(posix, 0o755);
    writeFileSync(join(binDir, `${name}.cmd`), "@echo off\r\nrem v0.4 placeholder\r\n", "utf8");
  }
  return binDir;
}

/** Run an installed shim, or its .mjs target on Windows where .cmd needs a shell. */
function runInstalled(prefix, command, args) {
  if (isWindows) {
    // Node refuses to spawn a .cmd without a shell (CVE-2024-27980); the local
    // installer's POSIX shim is a Node ESM launcher, so run it with Node.
    const result = spawnSync(process.execPath, [join(prefix, "bin", command), ...args], {
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }
  const result = spawnSync(join(prefix, "bin", command), args, { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("a v0.4-shaped prefix upgrades to the full v0.5 command set", () => {
  const root = makeRoot("v04");
  const prefix = join(root, "prefix");
  const binDir = seedV04Prefix(prefix);

  it("starts with only the four v0.4 shims", () => {
    expect(readdirSync(binDir).sort()).toEqual([
      "oh-my-pm",
      "oh-my-pm-mcp",
      "oh-my-pm-mcp.cmd",
      "oh-my-pm.cmd",
    ]);
  });

  it("refuses to overwrite the existing shims without --force", () => {
    // The pre-existing safety gate still applies during an upgrade: an installer
    // must never silently replace a shim a user may have customized.
    const result = runInstaller(["--prefix", prefix, "--apply"]);
    expect(result.status).not.toBe(0);
    expect(readdirSync(binDir)).toHaveLength(4);
  }, 60000);

  it("completes the upgrade with --force", () => {
    const result = runInstaller(["--prefix", prefix, "--apply", "--force"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("applied");
  }, 60000);

  it("leaves all eight shims and no orphans", () => {
    const expected = LOCAL_COMMAND_NAMES.flatMap((n) => [n, `${n}.cmd`]).sort();
    expect(readdirSync(binDir).sort()).toEqual(expected);
    expect(expected).toHaveLength(8);
  });

  it("makes ohmypm work", () => {
    const result = runInstalled(prefix, "ohmypm", ["status"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
    expect(result.stderr).toBe("");
  }, 60000);

  it("makes oh-my-pm work as a deprecated alias", () => {
    const result = runInstalled(prefix, "oh-my-pm", ["status"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
    // The warning is on stderr only, so the upgraded alias keeps piped output
    // usable for anything that was consuming it before the upgrade.
    expect(result.stderr).toContain("deprecated compatibility alias");
    expect(result.stderr).toContain("ohmypm");
    expect(result.stdout).not.toContain("deprecated");
  }, 60000);

  it("produces identical stdout from the canonical command and the alias", () => {
    const canonical = runInstalled(prefix, "ohmypm", ["status"]);
    const legacy = runInstalled(prefix, "oh-my-pm", ["status"]);
    expect(legacy.stdout).toBe(canonical.stdout);
    expect(legacy.status).toBe(canonical.status);
  }, 60000);

  it("keeps JSON parseable through the upgraded alias", () => {
    const result = runInstalled(prefix, "oh-my-pm", ["status", "--json"]);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  }, 60000);

  it("installs both MCP commands", () => {
    for (const name of ["ohmypm-mcp", "oh-my-pm-mcp"]) {
      expect(existsSync(join(binDir, name)), name).toBe(true);
      expect(existsSync(join(binDir, `${name}.cmd`)), `${name}.cmd`).toBe(true);
    }
  });
});

describe("a fresh v0.5 install offers both families", () => {
  const root = makeRoot("fresh");
  const prefix = join(root, "prefix");

  it("applies into an empty prefix", () => {
    const result = runInstaller(["--prefix", prefix, "--apply"]);
    expect(result.status, result.stderr).toBe(0);
  }, 60000);

  it("creates every canonical command and every alias", () => {
    const binDir = join(prefix, "bin");
    for (const name of LOCAL_COMMAND_NAMES) {
      expect(existsSync(join(binDir, name)), name).toBe(true);
      expect(existsSync(join(binDir, `${name}.cmd`)), `${name}.cmd`).toBe(true);
    }
  });

  it("marks the POSIX launchers executable", () => {
    if (isWindows) return;
    const binDir = join(prefix, "bin");
    for (const name of LOCAL_COMMAND_NAMES) {
      const result = spawnSync(join(binDir, name), ["--help"], { encoding: "utf8" });
      // A non-executable shim would fail to spawn at all (status null + error).
      expect(result.error, `${name} must be launchable`).toBeUndefined();
    }
  }, 120000);

  it("passes the installed-state verifier", () => {
    const result = spawnSync(
      process.execPath,
      [join(toolsDir, "check-local-install.mjs"), "--prefix", prefix],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
  }, 120000);
});

describe("uninstall removes every command shim", () => {
  const root = makeRoot("uninstall");
  const prefix = join(root, "prefix");

  it("removes all eight shims and leaves unrelated files alone", () => {
    expect(runInstaller(["--prefix", prefix, "--apply"]).status).toBe(0);
    const binDir = join(prefix, "bin");

    // Something the installer does not own, which uninstall must not touch.
    const unrelated = join(binDir, "some-other-tool");
    writeFileSync(unrelated, "#!/bin/sh\necho unrelated\n", "utf8");

    // There is no uninstall command; the documented procedure removes exactly the
    // managed shim paths. This asserts that the documented set is complete: after
    // removing it, no OH MY PM command remains.
    for (const name of LOCAL_COMMAND_NAMES) {
      rmSync(join(binDir, name), { force: true });
      rmSync(join(binDir, `${name}.cmd`), { force: true });
    }

    expect(readdirSync(binDir)).toEqual(["some-other-tool"]);
    for (const name of LOCAL_COMMAND_NAMES) {
      expect(existsSync(join(binDir, name)), name).toBe(false);
      expect(existsSync(join(binDir, `${name}.cmd`)), `${name}.cmd`).toBe(false);
    }
  }, 120000);
});
