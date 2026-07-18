import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_PROVIDER_CONFIG_BYTES,
  loadProviderConfig,
  resolveProviderConfigLocation,
} from "../src/provider-config.js";
import type { ProviderConfigResolutionInput } from "../src/provider-config.js";

const tmpRoots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omp-provider-config-"));
  tmpRoots.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tmpRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeConfig(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, "utf8");
  return path;
}

const VALID = JSON.stringify({
  version: 1,
  providers: { github: { enabled: true, defaultRepository: "he8um/oh-my-pm", defaultLimit: 25 } },
});

function baseInput(overrides: Partial<ProviderConfigResolutionInput>): ProviderConfigResolutionInput {
  return {
    env: {},
    platform: "linux",
    cwd: "/tmp/cwd",
    ...overrides,
  };
}

describe("resolveProviderConfigLocation — precedence", () => {
  it("prefers the explicit path", () => {
    const loc = resolveProviderConfigLocation(
      baseInput({ explicitPath: "./providers.json", env: { OH_MY_PM_PROVIDER_CONFIG: "/env/p.json" } }),
    );
    expect(loc.source).toBe("explicit");
    expect(loc.displayPath).toBe("./providers.json");
    expect(loc.required).toBe(true);
  });

  it("uses the environment path when no explicit path is given", () => {
    const loc = resolveProviderConfigLocation(
      baseInput({ env: { OH_MY_PM_PROVIDER_CONFIG: "/env/p.json" } }),
    );
    expect(loc.source).toBe("environment");
    expect(loc.displayPath).toBe("$OH_MY_PM_PROVIDER_CONFIG");
  });

  it("uses XDG on POSIX", () => {
    const loc = resolveProviderConfigLocation(baseInput({ env: { XDG_CONFIG_HOME: "/xdg" } }));
    expect(loc.source).toBe("xdg");
    expect(loc.displayPath).toBe("$XDG_CONFIG_HOME/oh-my-pm/providers.json");
    expect(loc.required).toBe(false);
  });

  it("falls back to HOME on POSIX", () => {
    const loc = resolveProviderConfigLocation(baseInput({ env: { HOME: "/home/me" } }));
    expect(loc.source).toBe("home");
    expect(loc.displayPath).toBe("~/.config/oh-my-pm/providers.json");
  });

  it("uses APPDATA on Windows", () => {
    const loc = resolveProviderConfigLocation(
      baseInput({ platform: "win32", env: { APPDATA: "C:/Users/me/AppData/Roaming" } }),
    );
    expect(loc.source).toBe("appdata");
    expect(loc.displayPath).toBe("%APPDATA%\\oh-my-pm\\providers.json");
  });

  it("resolves to defaults when no base exists", () => {
    const loc = resolveProviderConfigLocation(baseInput({}));
    expect(loc.source).toBe("defaults");
    expect(loc.displayPath).toBe("defaults");
  });

  it("resolves a relative explicit path against the injected cwd", () => {
    const loc = resolveProviderConfigLocation(baseInput({ explicitPath: "rel/p.json", cwd: "/work" }));
    expect(loc.absolutePath).toBe("/work/rel/p.json");
  });

  it("never exposes an absolute home path in the display path", () => {
    const loc = resolveProviderConfigLocation(baseInput({ env: { HOME: "/home/secret-user" } }));
    expect(loc.displayPath).not.toContain("/home/secret-user");
  });
});

describe("loadProviderConfig — explicit/env", () => {
  it("loads a valid explicit config", () => {
    const dir = tempDir();
    const path = writeConfig(dir, "providers.json", VALID);
    const result = loadProviderConfig(baseInput({ explicitPath: path }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.exists).toBe(true);
      expect(result.config.providers.github.defaultRepository).toBe("he8um/oh-my-pm");
      expect(result.config.providers.github.defaultLimit).toBe(25);
    }
  });

  it("resolves an environment config path", () => {
    const dir = tempDir();
    const path = writeConfig(dir, "providers.json", VALID);
    const result = loadProviderConfig(baseInput({ env: { OH_MY_PM_PROVIDER_CONFIG: path } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toBe("environment");
  });

  it("errors on an empty explicit path", () => {
    const result = loadProviderConfig(baseInput({ explicitPath: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_empty_path");
  });

  it("errors when an explicit file is missing", () => {
    const dir = tempDir();
    const result = loadProviderConfig(baseInput({ explicitPath: join(dir, "nope.json") }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_missing");
  });
});

describe("loadProviderConfig — OS-standard and defaults", () => {
  it("returns defaults when no base exists", () => {
    const result = loadProviderConfig(baseInput({}));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("defaults");
      expect(result.exists).toBe(false);
      expect(result.config.providers.github.defaultLimit).toBe(50);
    }
  });

  it("returns defaults (not an error) when an XDG file is absent", () => {
    const dir = tempDir();
    const result = loadProviderConfig(baseInput({ env: { XDG_CONFIG_HOME: dir } }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("xdg");
      expect(result.exists).toBe(false);
    }
  });

  it("loads an XDG file when present", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "oh-my-pm"), { recursive: true });
    writeConfig(join(dir, "oh-my-pm"), "providers.json", VALID);
    const result = loadProviderConfig(baseInput({ env: { XDG_CONFIG_HOME: dir } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.exists).toBe(true);
  });
});

describe("loadProviderConfig — rejections", () => {
  it("rejects a symlinked config", () => {
    const dir = tempDir();
    const realPath = writeConfig(dir, "real.json", VALID);
    const linkPath = join(dir, "link.json");
    symlinkSync(realPath, linkPath);
    const result = loadProviderConfig(baseInput({ explicitPath: linkPath }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_not_file");
  });

  it("rejects a directory", () => {
    const dir = tempDir();
    const result = loadProviderConfig(baseInput({ explicitPath: dir }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_not_file");
  });

  it("rejects an oversized file", () => {
    const dir = tempDir();
    const big = `{"version":1,"_pad":"${"a".repeat(MAX_PROVIDER_CONFIG_BYTES + 10)}"}`;
    const path = writeConfig(dir, "big.json", big);
    const result = loadProviderConfig(baseInput({ explicitPath: path }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_too_large");
  });

  it("rejects invalid JSON", () => {
    const dir = tempDir();
    const path = writeConfig(dir, "bad.json", "{ not json");
    const result = loadProviderConfig(baseInput({ explicitPath: path }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_config_invalid_json");
  });

  it("rejects an invalid schema and never returns raw text", () => {
    const dir = tempDir();
    const path = writeConfig(dir, "schema.json", JSON.stringify({ version: 2 }));
    const result = loadProviderConfig(baseInput({ explicitPath: path }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("provider_config_invalid_version");
      expect(result.message).not.toContain("version\": 2");
    }
  });

  it("never surfaces the resolved absolute path in the public result", () => {
    const dir = tempDir();
    writeConfig(dir, "providers.json", VALID);
    // A relative explicit path resolved against cwd: the public result must
    // echo only the user-supplied relative token, never the resolved absolute
    // path or the internal absolutePath field.
    const result = loadProviderConfig(
      baseInput({ explicitPath: "providers.json", cwd: dir }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.displayPath).toBe("providers.json");
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(dir);
      expect(serialized).not.toContain("absolutePath");
    }
  });
});
