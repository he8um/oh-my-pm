#!/usr/bin/env node
// Read-only generator for a generic stdio MCP client configuration, for
// REPOSITORY tooling. It takes an explicit --prefix because a source checkout
// has no installed prefix to infer; the installed public CLI command
// (`ohmypm mcp-config`) infers its own prefix automatically.
//
// It duplicates no config-generation behavior: the name rule, the platform
// command filename, the config object, and both output renderings all come from
// the CLI package's shared mcp-config module. This tool only resolves the
// explicit prefix, probes the command, and writes the result.
//
// Never writes to disk, never edits a client application, never embeds a project
// root, env, cwd, network, or credentials.

import { lstatSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  MCP_CONFIG_DEFAULT_SERVER_NAME,
  buildMcpClientConfig,
  formatMcpClientConfig,
  installedMcpCommandFileName,
  isValidMcpServerName,
} from "../cli/dist/index.js";

function parseArgs(args) {
  let prefix;
  let prefixSeen = false;
  let name = MCP_CONFIG_DEFAULT_SERVER_NAME;
  let markdown = false;
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
    } else if (arg === "--name") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, message: "--name requires a value" };
      }
      name = value;
      i += 1;
    } else if (arg === "--json") {
      // explicit clarity flag; JSON is the default output
    } else if (arg === "--markdown") {
      markdown = true;
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (!prefixSeen) return { ok: false, message: "--prefix is required" };
  if (!isValidMcpServerName(name)) return { ok: false, message: `invalid --name: ${name}` };
  return { ok: true, prefix, name, markdown };
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`mcp client config error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  const prefix = isAbsolute(parsed.prefix) ? parsed.prefix : resolve(parsed.prefix);
  // On POSIX the extensionless command; on Windows the .cmd wrapper.
  const commandPath = join(prefix, "bin", installedMcpCommandFileName(process.platform));
  if (!isRegularFile(commandPath)) {
    process.stderr.write(`mcp client config error: installed command not found: ${commandPath}\n`);
    process.exitCode = 2;
  } else {
    const config = buildMcpClientConfig(parsed.name, commandPath);
    process.stdout.write(formatMcpClientConfig(config, parsed.markdown ? "markdown" : "json"));
  }
}
