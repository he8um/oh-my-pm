import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const installCli = join(toolsDir, "install-local.mjs");
const configCli = join(toolsDir, "print-mcp-client-config.mjs");
const prefixes = [];

function makeInstalledPrefix() {
  const prefix = join(mkdtempSync(join(tmpdir(), "oh-my-pm-mcp-config-")), "prefix");
  prefixes.push(prefix);
  spawnSync(process.execPath, [installCli, "--prefix", prefix, "--apply"], { encoding: "utf8" });
  return prefix;
}

function run(args) {
  const result = spawnSync(process.execPath, [configCli, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  for (const prefix of prefixes.splice(0)) {
    rmSync(dirname(prefix), { recursive: true, force: true });
  }
});

describe("print-mcp-client-config command", () => {
  it("prints a generic stdio config with the default server name", () => {
    const prefix = makeInstalledPrefix();
    const result = run(["--prefix", prefix]);
    expect(result.status).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(Object.keys(config.mcpServers)).toEqual(["oh-my-pm"]);
    const entry = config.mcpServers["oh-my-pm"];
    expect(entry.command).toBe(join(prefix, "bin", "oh-my-pm-mcp"));
    expect(entry.args).toEqual([]);
    // No env/cwd/root/network fields.
    expect(Object.keys(entry).sort()).toEqual(["args", "command"]);
    expect(result.stdout.endsWith("\n")).toBe(true);
  });

  it("uses an absolute command path", () => {
    const prefix = makeInstalledPrefix();
    const result = run(["--prefix", prefix]);
    const entry = JSON.parse(result.stdout).mcpServers["oh-my-pm"];
    expect(entry.command.startsWith("/") || /^[A-Za-z]:\\/.test(entry.command)).toBe(true);
  });

  it("accepts a custom valid server name and rejects an invalid one", () => {
    const prefix = makeInstalledPrefix();
    const valid = run(["--prefix", prefix, "--name", "my-omp_1.0"]);
    expect(valid.status).toBe(0);
    expect(Object.keys(JSON.parse(valid.stdout).mcpServers)).toEqual(["my-omp_1.0"]);
    const invalid = run(["--prefix", prefix, "--name", "bad name"]);
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain("invalid --name");
  });

  it("is deterministic across runs", () => {
    const prefix = makeInstalledPrefix();
    expect(run(["--prefix", prefix]).stdout).toBe(run(["--prefix", prefix]).stdout);
  });

  it("renders deterministic Markdown output", () => {
    const prefix = makeInstalledPrefix();
    const result = run(["--prefix", prefix, "--markdown"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# OH MY PM MCP Client Configuration");
    expect(result.stdout).toContain("```json");
    expect(result.stdout).toContain("- `project_brief`");
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.endsWith("\n\n")).toBe(false);
  });

  it("emits no GitHub token or provider-config environment variable in the JSON config", () => {
    const prefix = makeInstalledPrefix();
    const result = run(["--prefix", prefix]);
    // The generated config object is secret-free and env-free by design.
    expect(result.stdout).not.toContain("OH_MY_PM_GITHUB_TOKEN");
    expect(result.stdout).not.toContain("OH_MY_PM_PROVIDER_CONFIG");
    const entry = JSON.parse(result.stdout).mcpServers["oh-my-pm"];
    expect(entry).not.toHaveProperty("env");
  });

  it("documents the optional env vars in Markdown without placing them in the config", () => {
    const prefix = makeInstalledPrefix();
    const result = run(["--prefix", prefix, "--markdown"]);
    // The prose names the optional variables so operators can add them
    // manually, but the emitted JSON config block carries neither.
    expect(result.stdout).toContain("OH_MY_PM_GITHUB_TOKEN");
    expect(result.stdout).toContain("OH_MY_PM_PROVIDER_CONFIG");
    const jsonBlock = result.stdout.split("```json")[1]?.split("```")[0] ?? "";
    expect(jsonBlock).not.toContain("OH_MY_PM_GITHUB_TOKEN");
    expect(jsonBlock).not.toContain("OH_MY_PM_PROVIDER_CONFIG");
    expect(jsonBlock).not.toContain("env");
  });

  it("requires --prefix and fails when the command is not installed", () => {
    expect(run([]).status).toBe(2);
    const emptyPrefix = join(mkdtempSync(join(tmpdir(), "oh-my-pm-mcp-config-empty-")), "prefix");
    prefixes.push(emptyPrefix);
    const result = run(["--prefix", emptyPrefix]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("installed command not found");
  });
});
