import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const installCli = join(toolsDir, "install-local.mjs");
const prefixes = [];

function makePrefix() {
  const prefix = join(mkdtempSync(join(tmpdir(), "oh-my-pm-install-cli-")), "prefix");
  prefixes.push(prefix);
  return prefix;
}

function run(args) {
  const result = spawnSync(process.execPath, [installCli, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  for (const prefix of prefixes.splice(0)) {
    rmSync(dirname(prefix), { recursive: true, force: true });
  }
});

describe("install-local command", () => {
  it("previews without writing and exits 0", () => {
    const prefix = makePrefix();
    const result = run(["--prefix", prefix]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OH MY PM local install: preview");
    expect(existsSync(join(prefix, "bin"))).toBe(false);
  });

  it("applies and reports installed shims", () => {
    const prefix = makePrefix();
    const result = run(["--prefix", prefix, "--apply"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OH MY PM local install: applied");
    expect(readdirSync(join(prefix, "bin")).length).toBe(4);
  });

  it("emits one valid JSON object with a trailing newline", () => {
    const prefix = makePrefix();
    const result = run(["--prefix", prefix, "--json"]);
    expect(result.status).toBe(0);
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it("exits 2 for invalid arguments with a concise stderr message", () => {
    const result = run(["--apply"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("local install error:");
    expect(result.stderr).not.toContain("\n    at ");
  });

  it("exits 2 when a plan is blocked by an existing shim", () => {
    const prefix = makePrefix();
    run(["--prefix", prefix, "--apply"]);
    const preview = run(["--prefix", prefix]);
    expect(preview.status).toBe(2);
    expect(preview.stdout).toContain("blocked");
    const applyAgain = run(["--prefix", prefix, "--apply"]);
    expect(applyAgain.status).toBe(2);
  });

  it("replaces shims with --force --apply", () => {
    const prefix = makePrefix();
    run(["--prefix", prefix, "--apply"]);
    const forced = run(["--prefix", prefix, "--apply", "--force"]);
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain("OH MY PM local install: applied");
  });
});
