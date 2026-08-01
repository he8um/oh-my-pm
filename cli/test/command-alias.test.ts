// Behavioral parity between the canonical `ohmypm` entrypoint and the deprecated
// `oh-my-pm` compatibility alias. Both entrypoints are executed as real
// processes so stdout/stderr separation, exit codes, and JSON validity are
// observed exactly as a user's shell would see them.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_CLI_COMMAND,
  LEGACY_CLI_COMMANDS,
  canonicalCommandForAlias,
  commandDeprecationWarning,
} from "@oh-my-pm/application";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pkgDir, "..");
const CANONICAL_BIN = join(pkgDir, "bin", "ohmypm.mjs");
const LEGACY_BIN = join(pkgDir, "bin", "oh-my-pm.mjs");

const LEGACY_CLI_NAME = "oh-my-pm";
const EXPECTED_WARNING = `${commandDeprecationWarning(LEGACY_CLI_NAME)}\n`;

function run(bin: string, args: readonly string[]) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("command surface constants", () => {
  it("declares ohmypm canonical and oh-my-pm legacy", () => {
    expect(CANONICAL_CLI_COMMAND).toBe("ohmypm");
    expect(LEGACY_CLI_COMMANDS).toEqual([LEGACY_CLI_NAME]);
    expect(canonicalCommandForAlias(LEGACY_CLI_NAME)).toBe("ohmypm");
  });

  it("refuses to produce a warning for the canonical command", () => {
    // Guards against a wrapper warning about the very name it forwards to.
    expect(() => commandDeprecationWarning(CANONICAL_CLI_COMMAND)).toThrow(/not a legacy alias/);
  });
});

describe("canonical ohmypm entrypoint", () => {
  it("prints canonical help with no deprecation warning", () => {
    const result = run(CANONICAL_BIN, ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${CANONICAL_CLI_COMMAND} <command>`);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("deprecated");
  });

  it("reports the version through status", () => {
    // This CLI has no `--version` flag; `status` is the version surface. v0.5 is
    // a command-name migration and deliberately adds no new option.
    const result = run(CANONICAL_BIN, ["status"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("version:");
    expect(result.stderr).toBe("");
  });

  it("rejects --version as an unsupported option, unchanged from v0.4", () => {
    const result = run(CANONICAL_BIN, ["--version"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unsupported option: --version");
  });

  it("runs status with clean stdout", () => {
    const result = run(CANONICAL_BIN, ["status"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("emits valid JSON for status --json", () => {
    const result = run(CANONICAL_BIN, ["status", "--json"]);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(JSON.parse(result.stdout).ok).toBe(true);
  });
});

describe("deprecated oh-my-pm compatibility alias", () => {
  it("still works and warns on stderr only", () => {
    const result = run(LEGACY_BIN, ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe(EXPECTED_WARNING);
    expect(result.stderr).toContain("deprecated compatibility alias");
    // The warning must never reach stdout.
    expect(result.stdout).not.toContain("deprecated");
    expect(result.stdout).not.toContain("Warning:");
  });

  it("shows the canonical command in its help output", () => {
    // The alias runs; the usage it prints still teaches the canonical name.
    const result = run(LEGACY_BIN, ["--help"]);
    expect(result.stdout).toContain(`${CANONICAL_CLI_COMMAND} <command>`);
    expect(result.stdout).not.toContain(`${LEGACY_CLI_NAME} <command>`);
  });

  it("names the canonical replacement in the warning", () => {
    const result = run(LEGACY_BIN, ["status"]);
    expect(result.stderr).toContain(`\`${LEGACY_CLI_NAME}\``);
    expect(result.stderr).toContain(`\`${CANONICAL_CLI_COMMAND}\``);
  });

  it("produces byte-identical stdout to the canonical command", () => {
    for (const args of [["--help"], ["--version"], ["status"], ["doctor"], ["status", "--json"]]) {
      const canonical = run(CANONICAL_BIN, args);
      const legacy = run(LEGACY_BIN, args);
      expect(legacy.stdout, `stdout parity for ${args.join(" ")}`).toBe(canonical.stdout);
      expect(legacy.status, `exit parity for ${args.join(" ")}`).toBe(canonical.status);
    }
  });

  it("keeps --json stdout parseable despite the warning", () => {
    const result = run(LEGACY_BIN, ["status", "--json"]);
    expect(result.status).toBe(0);
    // The decisive assertion: stdout is a complete JSON document on its own.
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect(result.stderr).toBe(EXPECTED_WARNING);
  });

  it("forwards a failing exit code unchanged", () => {
    const canonical = run(CANONICAL_BIN, ["definitely-not-a-command"]);
    const legacy = run(LEGACY_BIN, ["definitely-not-a-command"]);
    expect(canonical.status).toBe(2);
    expect(legacy.status).toBe(2);
    // The alias's stderr is the warning followed by the same runner diagnostics.
    expect(legacy.stderr.startsWith(EXPECTED_WARNING)).toBe(true);
    expect(legacy.stderr.slice(EXPECTED_WARNING.length)).toBe(canonical.stderr);
  });

  it("forwards arguments unchanged, including flags and values", () => {
    const canonical = run(CANONICAL_BIN, ["plan", "ship the release", "--json"]);
    const legacy = run(LEGACY_BIN, ["plan", "ship the release", "--json"]);
    expect(legacy.status).toBe(canonical.status);
    expect(legacy.stdout).toBe(canonical.stdout);
  });
});
