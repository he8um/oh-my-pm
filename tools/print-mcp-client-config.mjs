#!/usr/bin/env node
// Read-only generator for a generic stdio MCP client configuration. Prints a
// config object referencing the installed oh-my-pm-mcp command by absolute
// path. Never writes to disk, never edits a client application, never embeds a
// project root, env, cwd, network, or credentials.

import { lstatSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const SERVER_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
const isWindows = process.platform === "win32";

function parseArgs(args) {
  let prefix;
  let prefixSeen = false;
  let name = "oh-my-pm";
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
  if (!SERVER_NAME_RE.test(name)) return { ok: false, message: `invalid --name: ${name}` };
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
  const binDir = join(prefix, "bin");
  // On POSIX the extensionless command; on Windows the .cmd wrapper.
  const commandPath = join(binDir, isWindows ? "oh-my-pm-mcp.cmd" : "oh-my-pm-mcp");
  if (!isRegularFile(commandPath)) {
    process.stderr.write(`mcp client config error: installed command not found: ${commandPath}\n`);
    process.exitCode = 2;
  } else {
    const config = {
      mcpServers: {
        [parsed.name]: {
          command: commandPath,
          args: [],
        },
      },
    };
    const json = JSON.stringify(config, null, 2);
    if (parsed.markdown) {
      process.stdout.write(
        [
          "# OH MY PM MCP Client Configuration",
          "",
          "Add this stdio server entry to your MCP client's configuration:",
          "",
          "```json",
          json,
          "```",
          "",
          "The server exposes:",
          "",
          "- `project_brief`",
          "- `project_risks`",
          "- `project_next`",
          "- `project_handoff`",
          "",
        ].join("\n"),
      );
    } else {
      process.stdout.write(`${json}\n`);
    }
  }
}
