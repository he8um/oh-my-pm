// Installed MCP client configuration. The generated configuration must be
// deterministic, secret-free, absolute-path-only, write-free, and derived from
// the CLI's own installed location so no manual --prefix is ever needed.

import { describe, expect, it } from "vitest";
import { runLocalCliProcess } from "../src/local-process.js";
import {
  MCP_CONFIG_READ_ONLY_TOOLS,
  buildMcpClientConfig,
  candidateInstalledBinDirectories,
  formatMcpClientConfig,
  installedMcpCommandFileName,
  isValidMcpServerName,
  parseMcpConfigArgs,
  resolveInstalledMcpCommand,
} from "../src/mcp-config.js";

// A POSIX and a Windows installed entry-script path, in the exact shape the
// release installer creates: <prefix>/lib/oh-my-pm/versions/<version>/bin/…
const POSIX_ENTRY = "/opt/omp/lib/oh-my-pm/versions/0.3.1/bin/ohmypm.mjs";
const POSIX_MCP = "/opt/omp/bin/ohmypm-mcp";
const WINDOWS_ENTRY = "C:\\Tools\\omp\\lib\\oh-my-pm\\versions\\0.3.1\\bin\\ohmypm.mjs";
const WINDOWS_MCP = "C:\\Tools\\omp\\bin\\ohmypm-mcp.cmd";

/** Run mcp-config against an injected installed layout. Never touches disk. */
async function run(
  args: readonly string[],
  overrides: {
    entryScriptPath?: string;
    platform?: string;
    exists?: readonly string[];
    probed?: string[];
  } = {},
) {
  const exists = new Set(overrides.exists ?? [POSIX_MCP, WINDOWS_MCP]);
  return runLocalCliProcess(["mcp-config", ...args], {
    entryScriptPath: overrides.entryScriptPath ?? POSIX_ENTRY,
    platform: (overrides.platform ?? "linux") as NodeJS.Platform,
    commandExists: (path) => {
      overrides.probed?.push(path);
      return exists.has(path);
    },
  });
}

describe("mcp-config argument parsing", () => {
  it("defaults to JSON output and the default server name", () => {
    const parsed = parseMcpConfigArgs([]);
    expect(parsed).toEqual({ ok: true, name: "oh-my-pm", outputMode: "json" });
  });

  it("accepts explicit --json and --markdown", () => {
    expect(parseMcpConfigArgs(["--json"])).toMatchObject({ ok: true, outputMode: "json" });
    expect(parseMcpConfigArgs(["--markdown"])).toMatchObject({ ok: true, outputMode: "markdown" });
  });

  it("accepts a valid custom name", () => {
    expect(parseMcpConfigArgs(["--name", "my-project_1.0"])).toMatchObject({
      ok: true,
      name: "my-project_1.0",
    });
  });

  it("rejects an invalid name with the existing bounded rule", () => {
    for (const bad of ["bad name", "", "a/b", "a:b", "x".repeat(65), "naïve"]) {
      expect(isValidMcpServerName(bad)).toBe(false);
      expect(parseMcpConfigArgs(["--name", bad])).toMatchObject({ ok: false });
    }
    expect(isValidMcpServerName("x".repeat(64))).toBe(true);
  });

  it("rejects a missing --name value", () => {
    expect(parseMcpConfigArgs(["--name"])).toEqual({
      ok: false,
      message: "--name requires a value",
    });
    expect(parseMcpConfigArgs(["--name", "--json"])).toEqual({
      ok: false,
      message: "--name requires a value",
    });
  });

  it("rejects a duplicate --name", () => {
    expect(parseMcpConfigArgs(["--name", "a", "--name", "b"])).toEqual({
      ok: false,
      message: "duplicate --name",
    });
  });

  it("rejects an unexpected option or argument", () => {
    expect(parseMcpConfigArgs(["--prefix", "/opt"])).toMatchObject({ ok: false });
    expect(parseMcpConfigArgs(["--vendor-claude"])).toMatchObject({ ok: false });
    expect(parseMcpConfigArgs(["extra"])).toEqual({
      ok: false,
      message: "unexpected argument: extra",
    });
  });
});

describe("installed prefix inference", () => {
  it("derives the POSIX bin directory from the installed entry script", () => {
    expect(candidateInstalledBinDirectories(POSIX_ENTRY)).toEqual(["/opt/omp/bin"]);
  });

  it("derives the Windows bin directory from the installed entry script", () => {
    expect(candidateInstalledBinDirectories(WINDOWS_ENTRY)).toEqual(["C:\\Tools\\omp\\bin"]);
  });

  it("derives nothing from a non-installed entry script", () => {
    for (const path of ["", "/repo/cli/bin/ohmypm.mjs", "/usr/local/bin/ohmypm", "ohmypm.mjs"]) {
      expect(candidateInstalledBinDirectories(path)).toEqual([]);
    }
  });

  it("selects the platform-correct command filename", () => {
    expect(installedMcpCommandFileName("linux")).toBe("ohmypm-mcp");
    expect(installedMcpCommandFileName("darwin")).toBe("ohmypm-mcp");
    expect(installedMcpCommandFileName("win32")).toBe("ohmypm-mcp.cmd");
  });

  it("resolves the POSIX command from the installed prefix", () => {
    const resolved = resolveInstalledMcpCommand({
      entryScriptPath: POSIX_ENTRY,
      platform: "linux",
      commandExists: (p) => p === POSIX_MCP,
    });
    expect(resolved).toEqual({ ok: true, commandPath: POSIX_MCP });
  });

  it("resolves the Windows .cmd shim from the installed prefix", () => {
    const resolved = resolveInstalledMcpCommand({
      entryScriptPath: WINDOWS_ENTRY,
      platform: "win32",
      commandExists: (p) => p === WINDOWS_MCP,
    });
    expect(resolved).toEqual({ ok: true, commandPath: WINDOWS_MCP });
  });

  it("fails closed when the installed executable is missing", () => {
    const resolved = resolveInstalledMcpCommand({
      entryScriptPath: POSIX_ENTRY,
      platform: "linux",
      commandExists: () => false,
    });
    expect(resolved.ok).toBe(false);
  });
});

describe("mcp-config rendering", () => {
  it("builds a generic stdio entry with an absolute command and empty args", () => {
    const config = buildMcpClientConfig("oh-my-pm", POSIX_MCP);
    expect(config).toEqual({
      mcpServers: { "oh-my-pm": { command: POSIX_MCP, args: [] } },
    });
  });

  it("declares exactly the twelve read-only tools in the server's fixed order", () => {
    expect(MCP_CONFIG_READ_ONLY_TOOLS.length).toBe(12);
    expect(MCP_CONFIG_READ_ONLY_TOOLS).toContain("project_changes");
    expect(MCP_CONFIG_READ_ONLY_TOOLS).toContain("project_timeline");
    // The ten historical tools keep their positions; project_changes is
    // eleventh and project_timeline is appended twelfth.
    expect(MCP_CONFIG_READ_ONLY_TOOLS[10]).toBe("project_changes");
    expect(MCP_CONFIG_READ_ONLY_TOOLS[11]).toBe("project_timeline");
    expect(MCP_CONFIG_READ_ONLY_TOOLS.slice(0, 10)).toEqual([
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
    ]);
  });

  it("names the optional env vars in Markdown prose but never in the config block", () => {
    const config = buildMcpClientConfig("oh-my-pm", POSIX_MCP);
    const markdown = formatMcpClientConfig(config, "markdown");
    // The prose names them so operators can add them themselves.
    expect(markdown).toContain("OH_MY_PM_GITHUB_TOKEN");
    expect(markdown).toContain("OH_MY_PM_PROVIDER_CONFIG");
    // The emitted JSON config block carries neither, and no env key at all.
    const jsonBlock = markdown.split("```json")[1]?.split("```")[0] ?? "";
    expect(jsonBlock).not.toBe("");
    expect(jsonBlock).not.toContain("OH_MY_PM_GITHUB_TOKEN");
    expect(jsonBlock).not.toContain("OH_MY_PM_PROVIDER_CONFIG");
    expect(jsonBlock).not.toContain("env");
    // JSON mode carries no prose at all, so neither name can appear.
    const json = formatMcpClientConfig(config, "json");
    expect(json).not.toContain("OH_MY_PM_GITHUB_TOKEN");
    expect(json).not.toContain("OH_MY_PM_PROVIDER_CONFIG");
    expect(JSON.parse(json).mcpServers["oh-my-pm"]).not.toHaveProperty("env");
  });

  it("renders newline-terminated deterministic output in both modes", () => {
    const config = buildMcpClientConfig("oh-my-pm", POSIX_MCP);
    for (const mode of ["json", "markdown"] as const) {
      const text = formatMcpClientConfig(config, mode);
      expect(text.endsWith("\n")).toBe(true);
      expect(text.endsWith("\n\n")).toBe(false);
      expect(text).toBe(formatMcpClientConfig(config, mode));
    }
  });
});

describe("mcp-config through the process runner", () => {
  it("prints the default JSON shape and exits 0", async () => {
    const result = await run([]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      mcpServers: { "oh-my-pm": { command: POSIX_MCP, args: [] } },
    });
    expect(result.stdout.endsWith("\n")).toBe(true);
  });

  it("prints Markdown wrapping the same JSON with twelve read-only tools", async () => {
    const result = await run(["--markdown"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("```json");
    expect(result.stdout).toContain("12 read-only tools");
    expect(result.stdout).toContain("`project_changes`");
    expect(result.stdout).toContain("`project_timeline`");
    // Truthfulness: the document must not claim a write tool exists.
    expect(result.stdout).toContain("There are no write tools");
    for (const tool of MCP_CONFIG_READ_ONLY_TOOLS) {
      expect(result.stdout).toContain(`\`${tool}\``);
    }
    const json = result.stdout.split("```json\n")[1]?.split("\n```")[0] ?? "";
    expect(JSON.parse(json)).toEqual({
      mcpServers: { "oh-my-pm": { command: POSIX_MCP, args: [] } },
    });
  });

  it("uses a custom valid name as the server key", async () => {
    const result = await run(["--name", "my-project"]);
    expect(result.exitCode).toBe(0);
    expect(Object.keys(JSON.parse(result.stdout).mcpServers)).toEqual(["my-project"]);
  });

  it("uses controlled exit 2 for an invalid name", async () => {
    const result = await run(["--name", "bad name"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid --name");
    expect(result.stderr.endsWith("\n")).toBe(true);
  });

  it("uses controlled exit 2 for a missing value", async () => {
    const result = await run(["--name"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--name requires a value");
  });

  it("uses controlled exit 2 for an unexpected option", async () => {
    const result = await run(["--prefix", "/opt/omp"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unexpected argument");
  });

  it("resolves the Windows .cmd command", async () => {
    const result = await run([], { entryScriptPath: WINDOWS_ENTRY, platform: "win32" });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).mcpServers["oh-my-pm"].command).toBe(WINDOWS_MCP);
  });

  it("uses controlled exit 2 when the installed executable is missing", async () => {
    const result = await run([], { exists: [] });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("installed command not found");
    // The message names the command, never a probed absolute path.
    expect(result.stderr).not.toContain("/opt/omp");
  });

  it("probes only the derived installed bin directory", async () => {
    const probed: string[] = [];
    await run([], { probed });
    expect(probed).toEqual([POSIX_MCP]);
  });

  it("needs no --prefix: the prefix comes from the CLI's own location", async () => {
    const relocated = "/srv/other/lib/oh-my-pm/versions/0.3.1/bin/ohmypm.mjs";
    const relocatedMcp = "/srv/other/bin/ohmypm-mcp";
    const result = await run([], {
      entryScriptPath: relocated,
      exists: [relocatedMcp],
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).mcpServers["oh-my-pm"].command).toBe(relocatedMcp);
  });

  it("includes no token, credential, environment value, or project root", async () => {
    // Both output modes are checked: no planted value may leak in either. The
    // Markdown mode additionally names the optional env vars in prose only,
    // which is covered by the rendering test above.
    for (const mode of [[], ["--markdown"]]) {
      const result = await runLocalCliProcess(["mcp-config", ...mode], {
        entryScriptPath: POSIX_ENTRY,
        platform: "linux",
        commandExists: (p) => p === POSIX_MCP,
        githubToken: "ghp_forbidden_sentinel_value",
        env: {
          OH_MY_PM_GITHUB_TOKEN: "ghp_env_sentinel_value",
          HOME: "/home/forbidden-sentinel",
        },
        cwd: "/workspace/forbidden-project-root",
      });
      expect(result.exitCode).toBe(0);
      for (const sentinel of [
        "ghp_forbidden_sentinel_value",
        "ghp_env_sentinel_value",
        "forbidden-sentinel",
        "forbidden-project-root",
        "Bearer ",
      ]) {
        expect(result.stdout, `output must not include "${sentinel}"`).not.toContain(sentinel);
      }
      // No env or cwd key ever reaches the emitted server entry.
      const json = mode.length === 0
        ? result.stdout
        : (result.stdout.split("```json")[1]?.split("```")[0] ?? "");
      const entry = JSON.parse(json).mcpServers["oh-my-pm"];
      expect(entry).not.toHaveProperty("env");
      expect(entry).not.toHaveProperty("cwd");
    }
  });

  it("emits exactly the command and args keys for the server entry", async () => {
    const result = await run([]);
    const entry = JSON.parse(result.stdout).mcpServers["oh-my-pm"];
    expect(Object.keys(entry).sort()).toEqual(["args", "command"]);
    expect(entry.args).toEqual([]);
  });

  it("is byte-identical on repeated invocations", async () => {
    const first = await run([]);
    const second = await run([]);
    expect(first.stdout).toBe(second.stdout);
    const firstMd = await run(["--markdown"]);
    const secondMd = await run(["--markdown"]);
    expect(firstMd.stdout).toBe(secondMd.stdout);
  });

  it("reads no clock and performs no network access", async () => {
    let clockReads = 0;
    const result = await runLocalCliProcess(["mcp-config"], {
      entryScriptPath: POSIX_ENTRY,
      platform: "linux",
      commandExists: (p) => p === POSIX_MCP,
      clock: () => {
        clockReads += 1;
        throw new Error("mcp-config must not read the clock");
      },
      githubTransport: {
        request: () => {
          throw new Error("mcp-config must not perform network access");
        },
      } as never,
    });
    expect(result.exitCode).toBe(0);
    expect(clockReads).toBe(0);
  });
});
