import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runLocalCliProcess } from "../src/index.js";

const tmpRoots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omp-provider-e2e-"));
  tmpRoots.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

function write(dir: string, name: string, repo: string, limit: number): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    JSON.stringify({ version: 1, providers: { github: { enabled: true, defaultRepository: repo, defaultLimit: limit } } }),
    "utf8",
  );
  return path;
}

describe("provider config precedence (real files, injected env/platform/cwd)", () => {
  it("explicit --provider-config wins over environment", async () => {
    const dir = tempDir();
    const explicit = write(dir, "explicit.json", "explicit/repo", 11);
    const envPath = write(dir, "env.json", "env/repo", 22);
    const result = await runLocalCliProcess(
      ["providers", "status", "--provider-config", explicit, "--json"],
      { env: { OH_MY_PM_PROVIDER_CONFIG: envPath }, platform: "linux", cwd: dir },
    );
    const github = JSON.parse(result.stdout).providers.find((p: { id: string }) => p.id === "github");
    expect(github.defaultRepository).toBe("explicit/repo");
  });

  it("environment path is used when no explicit path is given", async () => {
    const dir = tempDir();
    const envPath = write(dir, "env.json", "env/repo", 22);
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      env: { OH_MY_PM_PROVIDER_CONFIG: envPath },
      platform: "linux",
      cwd: dir,
    });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.config.source).toBe("environment");
    expect(parsed.config.displayPath).toBe("$OH_MY_PM_PROVIDER_CONFIG");
  });

  it("XDG location is used on POSIX", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "oh-my-pm"), { recursive: true });
    write(join(dir, "oh-my-pm"), "providers.json", "xdg/repo", 33);
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      env: { XDG_CONFIG_HOME: dir },
      platform: "linux",
      cwd: dir,
    });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.config.source).toBe("xdg");
    const github = parsed.providers.find((p: { id: string }) => p.id === "github");
    expect(github.defaultRepository).toBe("xdg/repo");
  });

  it("HOME fallback is used on POSIX", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, ".config", "oh-my-pm"), { recursive: true });
    write(join(dir, ".config", "oh-my-pm"), "providers.json", "home/repo", 44);
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      env: { HOME: dir },
      platform: "linux",
      cwd: dir,
    });
    expect(JSON.parse(result.stdout).config.source).toBe("home");
  });

  it("APPDATA location is used on Windows", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "oh-my-pm"), { recursive: true });
    write(join(dir, "oh-my-pm"), "providers.json", "appdata/repo", 55);
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      env: { APPDATA: dir },
      platform: "win32",
      cwd: dir,
    });
    expect(JSON.parse(result.stdout).config.source).toBe("appdata");
  });

  it("defaults are used when no base exists", async () => {
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      env: {},
      platform: "linux",
      cwd: "/tmp",
    });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.config.source).toBe("defaults");
    expect(parsed.config.displayPath).toBe("defaults");
  });

  it("a missing explicit config file fails with exit 2", async () => {
    const dir = tempDir();
    const result = await runLocalCliProcess(
      ["providers", "status", "--provider-config", join(dir, "nope.json"), "--json"],
      { env: {}, platform: "linux", cwd: dir },
    );
    expect(result.exitCode).toBe(2);
  });

  it("an absent default file is normal (exit 0, defaults)", async () => {
    const dir = tempDir();
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      env: { XDG_CONFIG_HOME: dir },
      platform: "linux",
      cwd: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).config.exists).toBe(false);
  });

  it("never surfaces an absolute home/config path in output", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "oh-my-pm"), { recursive: true });
    write(join(dir, "oh-my-pm"), "providers.json", "xdg/repo", 33);
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      env: { XDG_CONFIG_HOME: dir },
      platform: "linux",
      cwd: dir,
    });
    expect(result.stdout).not.toContain(dir);
  });
});
