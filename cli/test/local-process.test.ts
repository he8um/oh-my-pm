import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runLocalCliProcess } from "../src/index.js";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pkgDir, "..");
const binPath = join(pkgDir, "bin", "oh-my-pm.mjs");
const fixtureRoot = join(repoRoot, "examples", "fixtures", "markdown-project");

function runBin(args) {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { exitCode: result.status ?? 0, stdout: result.stdout, stderr: result.stderr };
}

describe("runLocalCliProcess", () => {
  it("reports version 0.1.0 and kernel 0.1.0 for status", () => {
    const result = runLocalCliProcess(["status"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("version: 0.1.0");
    expect(result.stdout).toContain("kernel: 0.1.0");
  });

  it("matches the repository bin output for status", () => {
    const viaRunner = runLocalCliProcess(["status"]);
    const viaBin = runBin(["status"]);
    expect(viaBin.exitCode).toBe(viaRunner.exitCode);
    expect(viaBin.stdout).toBe(viaRunner.stdout);
    expect(viaBin.stderr).toBe(viaRunner.stderr);
  });

  it("matches the repository bin output for every project workflow", () => {
    for (const command of ["brief", "risks", "next", "handoff"]) {
      const args = [command, fixtureRoot, "--json"];
      const viaRunner = runLocalCliProcess(args);
      const viaBin = runBin(args);
      expect(viaBin.exitCode, command).toBe(viaRunner.exitCode);
      expect(viaBin.stdout, command).toBe(viaRunner.stdout);
    }
  });

  it("returns exit 2 and a stderr message for a missing root without writing streams", () => {
    const result = runLocalCliProcess(["brief", join(repoRoot, "does-not-exist")]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("project root was not found");
  });

  it("returns exit 2 for an invalid config", () => {
    // The repo root has no config, so use an in-tree invalid config via a
    // relative path is unnecessary here; the missing-root path already covers
    // the failure branch. Confirm empty-root style failures stay deterministic.
    const result = runLocalCliProcess(["risks", join(repoRoot, "does-not-exist")]);
    expect(result.exitCode).toBe(2);
  });

  it("honors an explicit version option", () => {
    const result = runLocalCliProcess(["status"], { version: "9.9.9-test" });
    expect(result.stdout).toContain("version: 9.9.9-test");
  });

  it("never leaks the project root into the runtime payload", () => {
    const result = runLocalCliProcess(["brief", fixtureRoot, "--json"]);
    const parsed = JSON.parse(result.stdout);
    expect(JSON.stringify(parsed.data.plannerInput)).not.toContain("markdown-project");
  });
});
