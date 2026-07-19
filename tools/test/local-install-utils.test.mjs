import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  LOCAL_COMMAND_NAMES,
  applyLocalInstallPlan,
  formatLocalInstallPlan,
  parseLocalInstallArgs,
  resolveLocalInstallPlan,
} from "../local-install-utils.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const roots = [];

function makePrefix() {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-install-"));
  roots.push(root);
  const prefix = join(root, "prefix");
  return prefix;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    // Delete the exact tool-owned mkdtemp root (never an inferred parent).
    rmSync(root, { recursive: true, force: true });
  }
});

describe("parseLocalInstallArgs", () => {
  it("requires --prefix", () => {
    expect(parseLocalInstallArgs([])).toMatchObject({ ok: false });
    expect(parseLocalInstallArgs(["--apply"])).toMatchObject({ ok: false });
  });

  it("rejects a missing prefix value", () => {
    expect(parseLocalInstallArgs(["--prefix"])).toMatchObject({ ok: false });
    expect(parseLocalInstallArgs(["--prefix", "--apply"])).toMatchObject({ ok: false });
  });

  it("rejects a duplicate --prefix", () => {
    expect(parseLocalInstallArgs(["--prefix", "a", "--prefix", "b"])).toMatchObject({ ok: false });
  });

  it("rejects unknown options and positionals", () => {
    expect(parseLocalInstallArgs(["--prefix", "a", "--bad"])).toMatchObject({ ok: false });
    expect(parseLocalInstallArgs(["--prefix", "a", "extra"])).toMatchObject({ ok: false });
  });

  it("rejects --force without --apply", () => {
    expect(parseLocalInstallArgs(["--prefix", "a", "--force"])).toMatchObject({ ok: false });
  });

  it("accepts apply, force, and json modes", () => {
    expect(parseLocalInstallArgs(["--prefix", "a"])).toEqual({
      ok: true,
      prefix: "a",
      apply: false,
      force: false,
      outputMode: "brief",
    });
    expect(parseLocalInstallArgs(["--prefix", "a", "--apply", "--force", "--json"])).toEqual({
      ok: true,
      prefix: "a",
      apply: true,
      force: true,
      outputMode: "json",
    });
  });
});

describe("resolveLocalInstallPlan", () => {
  it("resolves targets from the module repository root, not cwd", () => {
    const plan = resolveLocalInstallPlan({ prefix: makePrefix() });
    expect(plan.repositoryRoot).toBe(repoRoot);
    expect(plan.entries[0].target).toBe(join(repoRoot, "cli", "bin", "oh-my-pm.mjs"));
    expect(plan.entries[1].target).toBe(join(repoRoot, "mcp-server", "bin", "oh-my-pm-mcp.mjs"));
  });

  it("orders entries deterministically as cli then mcp", () => {
    const plan = resolveLocalInstallPlan({ prefix: makePrefix() });
    expect(plan.entries.map((e) => e.command)).toEqual(LOCAL_COMMAND_NAMES);
  });

  it("marks absent shims as create", () => {
    const plan = resolveLocalInstallPlan({ prefix: makePrefix() });
    expect(plan.ok).toBe(true);
    expect(plan.entries.map((e) => e.action)).toEqual(["create", "create"]);
    expect(plan.reasons).toEqual([]);
  });

  it("blocks existing shims without force and lists deterministic reasons", () => {
    const prefix = makePrefix();
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    const plan = resolveLocalInstallPlan({ prefix });
    expect(plan.ok).toBe(false);
    expect(plan.entries.map((e) => e.action)).toEqual(["blocked", "blocked"]);
    expect(plan.reasons).toEqual([
      "local_install_cli_shim_exists",
      "local_install_mcp_shim_exists",
    ]);
  });

  it("replaces existing shims with force", () => {
    const prefix = makePrefix();
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    const plan = resolveLocalInstallPlan({ prefix, apply: true, force: true });
    expect(plan.ok).toBe(true);
    expect(plan.entries.map((e) => e.action)).toEqual(["replace", "replace"]);
  });

  it("performs no writes during planning", () => {
    const prefix = makePrefix();
    resolveLocalInstallPlan({ prefix });
    expect(existsSync(join(prefix, "bin"))).toBe(false);
  });
});

describe("shim content", () => {
  it("produces a POSIX shim with a shebang, file URL import, and one trailing newline", () => {
    const prefix = makePrefix();
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    const shim = readFileSync(join(prefix, "bin", "oh-my-pm"), "utf8");
    expect(shim.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(shim).toContain('await import("file://');
    expect(shim.endsWith("\n")).toBe(true);
    expect(shim.endsWith("\n\n")).toBe(false);
    expect(shim).not.toContain("console.");
  });

  it("produces a Windows shim that quotes the target and forwards args", () => {
    const prefix = makePrefix();
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    const shim = readFileSync(join(prefix, "bin", "oh-my-pm.cmd"), "utf8");
    expect(shim.startsWith("@echo off\n")).toBe(true);
    expect(shim).toContain('node "');
    expect(shim).toContain("%*");
    expect(shim.endsWith("\n")).toBe(true);
    expect(shim.endsWith("\n\n")).toBe(false);
  });
});

describe("applyLocalInstallPlan", () => {
  it("refuses when the plan is not applicable or apply is not requested", () => {
    const prefix = makePrefix();
    const preview = resolveLocalInstallPlan({ prefix });
    expect(applyLocalInstallPlan(preview)).toMatchObject({ ok: false, code: "apply_not_requested" });
    // Force a not-ok plan by pointing at an existing shim first.
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    const blocked = resolveLocalInstallPlan({ prefix, apply: true });
    expect(applyLocalInstallPlan(blocked)).toMatchObject({ ok: false, code: "plan_not_applicable" });
  });

  it("creates exactly four shims under <prefix>/bin", () => {
    const prefix = makePrefix();
    const result = applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    expect(result.ok).toBe(true);
    expect(readdirSync(join(prefix, "bin")).sort()).toEqual([
      "oh-my-pm",
      "oh-my-pm-mcp",
      "oh-my-pm-mcp.cmd",
      "oh-my-pm.cmd",
    ]);
  });

  it("makes extensionless shims executable on non-Windows platforms", () => {
    if (process.platform === "win32") return;
    const prefix = makePrefix();
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    for (const command of LOCAL_COMMAND_NAMES) {
      const mode = lstatSync(join(prefix, "bin", command)).mode;
      expect(mode & 0o111).not.toBe(0);
    }
  });

  it("blocks a second non-force apply and leaves the shim unchanged", () => {
    const prefix = makePrefix();
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    const before = readFileSync(join(prefix, "bin", "oh-my-pm"), "utf8");
    const second = applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    expect(second).toMatchObject({ ok: false, code: "plan_not_applicable" });
    expect(readFileSync(join(prefix, "bin", "oh-my-pm"), "utf8")).toBe(before);
  });

  it("does not modify target files and writes nothing outside the prefix", () => {
    const prefix = makePrefix();
    const cliTarget = join(repoRoot, "cli", "bin", "oh-my-pm.mjs");
    const before = readFileSync(cliTarget, "utf8");
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    expect(readFileSync(cliTarget, "utf8")).toBe(before);
  });

  it("leaves no temporary files behind", () => {
    const prefix = makePrefix();
    applyLocalInstallPlan(resolveLocalInstallPlan({ prefix, apply: true }));
    const leftover = readdirSync(join(prefix, "bin")).filter((name) => name.includes(".tmp-"));
    expect(leftover).toEqual([]);
  });
});

describe("formatLocalInstallPlan", () => {
  it("renders preview and applied brief output and valid JSON", () => {
    const prefix = makePrefix();
    const plan = resolveLocalInstallPlan({ prefix });
    const preview = formatLocalInstallPlan(plan, "brief");
    expect(preview).toContain("OH MY PM local install: preview");
    expect(preview).toContain("apply required: yes");
    const json = formatLocalInstallPlan(plan, "json");
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json.endsWith("\n")).toBe(true);

    const applied = resolveLocalInstallPlan({ prefix, apply: true });
    applyLocalInstallPlan(applied);
    const appliedPlan = resolveLocalInstallPlan({ prefix, apply: true, force: true });
    expect(formatLocalInstallPlan(appliedPlan, "brief")).toContain(
      "OH MY PM local install: applied",
    );
  });
});
