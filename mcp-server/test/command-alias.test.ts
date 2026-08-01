// MCP stdio protocol safety for the canonical `ohmypm-mcp` entrypoint and the
// deprecated `oh-my-pm-mcp` compatibility alias.
//
// The load-bearing property here is that the alias's deprecation warning cannot
// corrupt the protocol stream. stdout carries JSON-RPC framing; a single stray
// byte there desynchronizes the client handshake. These tests perform a real
// initialize/tools-list exchange over a spawned server and inspect stdout and
// stderr separately.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_BIN = join(pkgDir, "bin", "ohmypm-mcp.mjs");
const LEGACY_BIN = join(pkgDir, "bin", "oh-my-pm-mcp.mjs");

const EXPECTED_WARNING =
  "Warning: `oh-my-pm-mcp` is a deprecated compatibility alias.\nUse `ohmypm-mcp` instead.\n";

type Exchange = { stdout: string; stderr: string; exitCode: number | null };

/**
 * Drive one server process through an MCP initialize handshake plus a
 * tools/list call, then close stdin and collect the raw streams.
 */
async function exchange(bin: string): Promise<Exchange> {
  const child = spawn(process.execPath, [bin], {
    cwd: pkgDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const send = (message: unknown) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "alias-test", version: "0.0.0" },
    },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  // Give the server time to answer both requests, then close stdin so the
  // stdio transport ends and the process exits on its own.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  child.stdin.end();

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
    setTimeout(() => {
      child.kill();
      resolve(null);
    }, 4000);
  });

  return { stdout, stderr, exitCode };
}

/** Every non-empty stdout line must be a standalone JSON-RPC message. */
function parseProtocolLines(stdout: string): Record<string, unknown>[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("canonical ohmypm-mcp entrypoint", () => {
  it("completes an initialize handshake with protocol-only stdout", async () => {
    const result = await exchange(CANONICAL_BIN);
    const messages = parseProtocolLines(result.stdout);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    for (const message of messages) {
      expect(message.jsonrpc).toBe("2.0");
    }
    const initialize = messages.find((m) => m.id === 1);
    expect(initialize).toBeDefined();
    expect(initialize?.result).toBeDefined();
  }, 20000);

  it("writes no deprecation warning at all", async () => {
    const result = await exchange(CANONICAL_BIN);
    expect(result.stderr).not.toContain("deprecated");
  }, 20000);
});

describe("deprecated oh-my-pm-mcp compatibility alias", () => {
  it("keeps stdout strictly protocol-safe despite the warning", async () => {
    const result = await exchange(LEGACY_BIN);
    // The decisive assertion: every stdout line still parses as JSON-RPC. If the
    // warning had leaked to stdout, this would throw.
    const messages = parseProtocolLines(result.stdout);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    for (const message of messages) {
      expect(message.jsonrpc).toBe("2.0");
    }
    expect(result.stdout).not.toContain("deprecated");
    expect(result.stdout).not.toContain("Warning:");
  }, 20000);

  it("emits the deprecation warning on stderr", async () => {
    const result = await exchange(LEGACY_BIN);
    expect(result.stderr).toContain(EXPECTED_WARNING);
    expect(result.stderr).toContain("`ohmypm-mcp`");
  }, 20000);

  it("completes the same handshake as the canonical entrypoint", async () => {
    const legacy = await exchange(LEGACY_BIN);
    const canonical = await exchange(CANONICAL_BIN);
    const legacyInit = parseProtocolLines(legacy.stdout).find((m) => m.id === 1);
    const canonicalInit = parseProtocolLines(canonical.stdout).find((m) => m.id === 1);
    expect(legacyInit).toEqual(canonicalInit);
  }, 40000);

  it("exposes an identical tool inventory", async () => {
    const legacy = await exchange(LEGACY_BIN);
    const canonical = await exchange(CANONICAL_BIN);
    const toolsOf = (stdout: string) => {
      const listed = parseProtocolLines(stdout).find((m) => m.id === 2);
      const result = listed?.result as { tools?: { name: string }[] } | undefined;
      return (result?.tools ?? []).map((t) => t.name);
    };
    const legacyTools = toolsOf(legacy.stdout);
    expect(legacyTools.length).toBeGreaterThan(0);
    expect(legacyTools).toEqual(toolsOf(canonical.stdout));
  }, 40000);
});

describe("mcp bin wrapper sources", () => {
  const canonicalSource = readFileSync(CANONICAL_BIN, "utf8");
  const legacySource = readFileSync(LEGACY_BIN, "utf8");

  it("neither wrapper writes to stdout", () => {
    for (const [name, source] of [
      ["canonical", canonicalSource],
      ["legacy", legacySource],
    ] as const) {
      expect(source, `${name} wrapper must not write stdout`).not.toContain("process.stdout");
      expect(source, `${name} wrapper must not use console`).not.toContain("console.");
    }
  });

  it("the legacy wrapper warns before starting the transport", () => {
    // Ordering matters: warning first, then the server. This is what prevents the
    // warning from interleaving with protocol traffic.
    const warnIndex = legacySource.indexOf("process.stderr.write(`${commandDeprecationWarning(");
    const startIndex = legacySource.indexOf("startOhMyPmMcpStdioServer(");
    expect(warnIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(-1);
    expect(warnIndex).toBeLessThan(startIndex);
  });

  it("the legacy wrapper starts the same server, duplicating no logic", () => {
    expect(legacySource).toContain("startOhMyPmMcpStdioServer");
    expect(legacySource).toContain('from "../dist/index.js"');
    expect(legacySource).toContain("commandDeprecationWarning");
    // Derived from the shared helper, never restated inline.
    expect(legacySource).not.toContain("is a deprecated compatibility alias.");
  });

  it("the legacy wrapper does not invoke the canonical wrapper", () => {
    // Both wrappers import the built server directly, so an alias can never
    // re-enter itself through the canonical entrypoint.
    const importSpecifiers = [...legacySource.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(importSpecifiers).toEqual(["@oh-my-pm/application", "../dist/index.js"]);
    expect(legacySource).not.toContain('import("');
  });
});
