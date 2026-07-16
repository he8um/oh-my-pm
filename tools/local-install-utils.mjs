// Tool-only local installation planning and application helpers. This is the
// one module allowed to write files (only inside <prefix>/bin, only the four
// planned command shims). It never touches project documents, shell profiles,
// MCP client configs, the network, environment variables, or package source.

import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LOCAL_COMMAND_NAMES = ["oh-my-pm", "oh-my-pm-mcp"];

// The repository root is derived from this module's location (tools/), never
// from the current working directory, so plans are stable regardless of cwd.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const COMMAND_TARGETS = {
  "oh-my-pm": join(REPO_ROOT, "cli", "bin", "oh-my-pm.mjs"),
  "oh-my-pm-mcp": join(REPO_ROOT, "mcp-server", "bin", "oh-my-pm-mcp.mjs"),
};

const TARGET_MISSING_REASON = {
  "oh-my-pm": "local_install_cli_target_missing",
  "oh-my-pm-mcp": "local_install_mcp_target_missing",
};

const SHIM_EXISTS_REASON = {
  "oh-my-pm": "local_install_cli_shim_exists",
  "oh-my-pm-mcp": "local_install_mcp_shim_exists",
};

/** Parse install CLI args deterministically. No filesystem or env access. */
export function parseLocalInstallArgs(args) {
  let prefix;
  let prefixSeen = false;
  let apply = false;
  let force = false;
  let outputMode = "brief";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--prefix") {
      if (prefixSeen) {
        return { ok: false, message: "duplicate --prefix" };
      }
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { ok: false, message: "--prefix requires a value" };
      }
      prefix = value;
      prefixSeen = true;
      i += 1;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--json") {
      outputMode = "json";
      continue;
    }
    if (arg.startsWith("--")) {
      return { ok: false, message: `unknown option: ${arg}` };
    }
    return { ok: false, message: `unexpected argument: ${arg}` };
  }

  if (!prefixSeen) {
    return { ok: false, message: "--prefix is required" };
  }
  if (force && !apply) {
    return { ok: false, message: "--force requires --apply" };
  }
  return { ok: true, prefix, apply, force, outputMode };
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/** Build a deterministic install plan. Performs no writes. */
export function resolveLocalInstallPlan(options) {
  const prefix = isAbsolute(options.prefix) ? options.prefix : resolve(options.prefix);
  const binDirectory = join(prefix, "bin");
  const apply = options.apply === true;
  const force = options.force === true;

  const entries = [];
  const reasons = [];
  let ok = true;

  for (const command of LOCAL_COMMAND_NAMES) {
    const target = COMMAND_TARGETS[command];
    const shimPath = join(binDirectory, command);
    const windowsShimPath = join(binDirectory, `${command}.cmd`);
    const targetExists = isRegularFile(target);
    const shimExists = isRegularFile(shimPath);
    const windowsShimExists = isRegularFile(windowsShimPath);

    let action;
    if (!targetExists) {
      reasons.push(TARGET_MISSING_REASON[command]);
      ok = false;
      action = "blocked";
    } else if (shimExists || windowsShimExists) {
      if (force) {
        action = "replace";
      } else {
        reasons.push(SHIM_EXISTS_REASON[command]);
        ok = false;
        action = "blocked";
      }
    } else {
      action = "create";
    }

    entries.push({
      command,
      target,
      shimPath,
      windowsShimPath,
      targetExists,
      shimExists,
      windowsShimExists,
      action,
    });
  }

  return {
    ok,
    repositoryRoot: REPO_ROOT,
    prefix,
    binDirectory,
    apply,
    force,
    entries,
    reasons,
  };
}

/** POSIX extensionless Node ESM launcher for a target file. */
function posixShimContent(target) {
  const url = pathToFileURL(target).href;
  return `#!/usr/bin/env node\nawait import(${JSON.stringify(url)});\n`;
}

/** Windows .cmd wrapper for a target file. */
function windowsShimContent(target) {
  if (target.includes("\r") || target.includes("\n")) {
    throw new Error("target path contains a newline");
  }
  return `@echo off\nnode "${target}" %*\n`;
}

/** Human-readable or JSON plan rendering. */
export function formatLocalInstallPlan(plan, mode) {
  if (mode === "json") {
    return `${JSON.stringify(plan, null, 2)}\n`;
  }
  const lines = [];
  if (plan.apply && plan.ok) {
    lines.push("OH MY PM local install: applied");
    lines.push(`prefix: ${plan.prefix}`);
    for (const entry of plan.entries) {
      lines.push(`- installed: ${entry.shimPath}`);
    }
    lines.push("");
    return lines.join("\n");
  }
  lines.push("OH MY PM local install: preview");
  lines.push(`prefix: ${plan.prefix}`);
  lines.push(`bin: ${plan.binDirectory}`);
  for (const entry of plan.entries) {
    lines.push(`- ${entry.command}: ${entry.action}`);
  }
  lines.push("apply required: yes");
  lines.push("");
  return lines.join("\n");
}

function writeShimAtomically(shimPath, content, executable) {
  const tempPath = `${shimPath}.tmp-${process.pid}`;
  try {
    writeFileSync(tempPath, content, "utf8");
    if (executable) {
      chmodSync(tempPath, 0o755);
    }
    renameSync(tempPath, shimPath);
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        rmSync(tempPath, { force: true });
      }
    } catch {
      // best-effort cleanup only
    }
    throw error;
  }
}

/**
 * Apply a plan: create only <prefix>/bin and the four planned shim paths,
 * atomically. Refuses when the plan is not applicable. Returns a structured
 * result; never throws for normal validation/write failures and never includes
 * file contents.
 */
export function applyLocalInstallPlan(plan) {
  if (!plan.ok) {
    return { ok: false, code: "plan_not_applicable", installed: [], reasons: [...plan.reasons] };
  }
  if (plan.apply !== true) {
    return { ok: false, code: "apply_not_requested", installed: [], reasons: ["apply_not_requested"] };
  }

  // Re-check shim existence at apply time so a concurrently created shim is
  // never silently overwritten without --force.
  for (const entry of plan.entries) {
    const nowExists = isRegularFile(entry.shimPath) || isRegularFile(entry.windowsShimPath);
    if (nowExists && plan.force !== true) {
      return {
        ok: false,
        code: "shim_exists",
        installed: [],
        reasons: [SHIM_EXISTS_REASON[entry.command]],
      };
    }
  }

  try {
    mkdirSync(plan.binDirectory, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      code: "bin_directory_failed",
      installed: [],
      reasons: [error instanceof Error ? "bin_directory_failed" : "bin_directory_failed"],
    };
  }

  const installed = [];
  try {
    for (const entry of plan.entries) {
      writeShimAtomically(entry.shimPath, posixShimContent(entry.target), true);
      writeShimAtomically(entry.windowsShimPath, windowsShimContent(entry.target), false);
      installed.push(entry.shimPath, entry.windowsShimPath);
    }
  } catch {
    return { ok: false, code: "write_failed", installed, reasons: ["write_failed"] };
  }

  return { ok: true, code: "installed", installed, reasons: [] };
}
