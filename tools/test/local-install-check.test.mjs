import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const installCli = join(toolsDir, "install-local.mjs");
const checkCli = join(toolsDir, "check-local-install.mjs");
const roots = [];

function makePrefix() {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-install-check-"));
  roots.push(root);
  const prefix = join(root, "prefix");
  return prefix;
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    // Delete the exact tool-owned mkdtemp root (never an inferred parent).
    rmSync(root, { recursive: true, force: true });
  }
});

describe("check-local-install command", () => {
  it("passes for a valid installation", () => {
    const prefix = makePrefix();
    expect(run(installCli, ["--prefix", prefix, "--apply"]).status).toBe(0);
    const result = run(checkCli, ["--prefix", prefix]);
    expect(result.stderr, result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("OH MY PM local install check: OK\n");
  });

  it("does not print MCP protocol traffic", () => {
    const prefix = makePrefix();
    run(installCli, ["--prefix", prefix, "--apply"]);
    const result = run(checkCli, ["--prefix", prefix]);
    expect(result.stdout).not.toContain("jsonrpc");
    expect(result.stdout).not.toContain("project_brief");
  });

  it("requires --prefix", () => {
    const result = run(checkCli, []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--prefix is required");
  });

  it("fails when a shim is missing", () => {
    const prefix = makePrefix();
    const result = run(checkCli, ["--prefix", prefix]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing shim");
  });

  it("fails when a shim target is broken", () => {
    const prefix = makePrefix();
    run(installCli, ["--prefix", prefix, "--apply"]);
    // Corrupt the extensionless CLI shim so the command import fails at runtime.
    writeFileSync(join(prefix, "bin", "oh-my-pm"), "#!/usr/bin/env node\nawait import('file:///no/such/file.mjs');\n", "utf8");
    const result = run(checkCli, ["--prefix", prefix]);
    expect(result.status).toBe(1);
  });
});
