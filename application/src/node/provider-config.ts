// Explicit read-only Node CLI boundary for provider configuration. It may read
// node:fs and node:path but never writes, never follows a symlinked config,
// never searches parent directories, never auto-discovers a project config,
// never executes code, and never performs network access. It reads the token
// environment variable nowhere; the only environment it consults is the
// injected resolution input (never the ambient process env directly). The
// public result never carries raw file text or a resolved absolute path.

import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  defaultProviderConfig,
  validateProviderConfig,
} from "@oh-my-pm/providers";
import type {
  ProviderConfigErrorCode,
  ResolvedProviderConfig,
} from "@oh-my-pm/providers";

export const OH_MY_PM_PROVIDER_CONFIG_ENV = "OH_MY_PM_PROVIDER_CONFIG";
export const OH_MY_PM_PROVIDER_CONFIG_FILENAME = "providers.json";
export const MAX_PROVIDER_CONFIG_BYTES = 64 * 1024;

export type ProviderConfigSource =
  | "explicit"
  | "environment"
  | "xdg"
  | "home"
  | "appdata"
  | "defaults";

export type ProviderConfigResolutionInput = {
  explicitPath?: string;
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
  cwd: string;
};

export type ProviderConfigLoadErrorCode =
  | ProviderConfigErrorCode
  | "provider_config_missing"
  | "provider_config_not_file"
  | "provider_config_too_large"
  | "provider_config_read_failed"
  | "provider_config_invalid_json"
  | "provider_config_empty_path";

export type ProviderConfigLocation = {
  /** Where the location came from in the resolution precedence. */
  source: ProviderConfigSource;
  /**
   * Stable, public display path. Never a resolved absolute home/config path.
   * `"defaults"` when no file base exists.
   */
  displayPath: string;
  /**
   * True when this location is expected to exist (explicit/env). For the
   * OS-standard locations and defaults, absence falls back to defaults.
   */
  required: boolean;
  /**
   * Internal resolved absolute path used only inside this loader boundary; it
   * is never surfaced in the public load result.
   */
  absolutePath?: string;
};

export type ProviderConfigLoadResult =
  | {
      ok: true;
      source: ProviderConfigSource;
      displayPath: string;
      exists: boolean;
      config: ResolvedProviderConfig;
    }
  | {
      ok: false;
      source: ProviderConfigSource;
      displayPath: string;
      exists: boolean;
      code: ProviderConfigLoadErrorCode;
      message: string;
    };

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function joinPosix(base: string, ...parts: string[]): string {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return [normalizedBase, ...parts].join("/");
}

function joinWindows(base: string, ...parts: string[]): string {
  const normalizedBase = base.endsWith("\\") ? base.slice(0, -1) : base;
  return [normalizedBase, ...parts].join("\\");
}

/**
 * Resolve the provider configuration location using a fixed precedence:
 *   1. explicit CLI path
 *   2. OH_MY_PM_PROVIDER_CONFIG
 *   3. POSIX: $XDG_CONFIG_HOME/oh-my-pm/providers.json
 *   4. POSIX: $HOME/.config/oh-my-pm/providers.json
 *   5. Windows: %APPDATA%\oh-my-pm\providers.json
 *   6. resolved defaults with no file
 * A relative explicit/env path resolves against the injected cwd. The display
 * path is always a stable, non-absolute token.
 */
export function resolveProviderConfigLocation(
  input: ProviderConfigResolutionInput,
): ProviderConfigLocation {
  const explicit = nonEmpty(input.explicitPath);
  if (input.explicitPath !== undefined && explicit === undefined) {
    // An explicitly supplied but empty path is a controlled error signalled via
    // an empty-path location; the loader reports it rather than falling back.
    return { source: "explicit", displayPath: "", required: true };
  }
  if (explicit !== undefined) {
    return {
      source: "explicit",
      displayPath: explicit,
      required: true,
      absolutePath: isAbsolute(explicit) ? explicit : resolve(input.cwd, explicit),
    };
  }

  const envPath = nonEmpty(input.env[OH_MY_PM_PROVIDER_CONFIG_ENV]);
  if (envPath !== undefined) {
    return {
      source: "environment",
      displayPath: `$${OH_MY_PM_PROVIDER_CONFIG_ENV}`,
      required: true,
      absolutePath: isAbsolute(envPath) ? envPath : resolve(input.cwd, envPath),
    };
  }

  if (input.platform === "win32") {
    const appData = nonEmpty(input.env["APPDATA"]);
    if (appData !== undefined) {
      return {
        source: "appdata",
        displayPath: `%APPDATA%\\oh-my-pm\\${OH_MY_PM_PROVIDER_CONFIG_FILENAME}`,
        required: false,
        absolutePath: joinWindows(appData, "oh-my-pm", OH_MY_PM_PROVIDER_CONFIG_FILENAME),
      };
    }
    return { source: "defaults", displayPath: "defaults", required: false };
  }

  const xdg = nonEmpty(input.env["XDG_CONFIG_HOME"]);
  if (xdg !== undefined) {
    return {
      source: "xdg",
      displayPath: `$XDG_CONFIG_HOME/oh-my-pm/${OH_MY_PM_PROVIDER_CONFIG_FILENAME}`,
      required: false,
      absolutePath: joinPosix(xdg, "oh-my-pm", OH_MY_PM_PROVIDER_CONFIG_FILENAME),
    };
  }

  const home = nonEmpty(input.env["HOME"]);
  if (home !== undefined) {
    return {
      source: "home",
      displayPath: `~/.config/oh-my-pm/${OH_MY_PM_PROVIDER_CONFIG_FILENAME}`,
      required: false,
      absolutePath: joinPosix(home, ".config", "oh-my-pm", OH_MY_PM_PROVIDER_CONFIG_FILENAME),
    };
  }

  return { source: "defaults", displayPath: "defaults", required: false };
}

function loadFailure(
  location: ProviderConfigLocation,
  exists: boolean,
  code: ProviderConfigLoadErrorCode,
  message: string,
): ProviderConfigLoadResult {
  return { ok: false, source: location.source, displayPath: location.displayPath, exists, code, message };
}

/**
 * Resolve and load the provider configuration. Absent OS-standard/default files
 * resolve to defaults. An absent explicit/env file is a controlled error. The
 * loader rejects symlinked configs, non-regular files, oversized files, and
 * invalid JSON/schema. It never writes, never reaches the network, never reads
 * a token, and never returns raw file text or an absolute path.
 */
export function loadProviderConfig(
  input: ProviderConfigResolutionInput,
): ProviderConfigLoadResult {
  const location = resolveProviderConfigLocation(input);

  if (location.source === "explicit" && location.displayPath === "") {
    return {
      ok: false,
      source: "explicit",
      displayPath: "",
      exists: false,
      code: "provider_config_empty_path",
      message: "explicit --provider-config path must not be empty",
    };
  }

  if (location.source === "defaults" || location.absolutePath === undefined) {
    return {
      ok: true,
      source: "defaults",
      displayPath: location.displayPath,
      exists: false,
      config: defaultProviderConfig(),
    };
  }

  const absolutePath = location.absolutePath;

  let stat;
  try {
    // lstat (never stat): a symlinked config is detected and rejected, never
    // followed.
    stat = lstatSync(absolutePath);
  } catch {
    if (location.required) {
      return loadFailure(
        location,
        false,
        "provider_config_missing",
        "provider configuration file was not found",
      );
    }
    // Absence at an OS-standard location is normal: fall back to defaults but
    // keep the resolved source and display path for reporting.
    return {
      ok: true,
      source: location.source,
      displayPath: location.displayPath,
      exists: false,
      config: defaultProviderConfig(),
    };
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    return loadFailure(
      location,
      true,
      "provider_config_not_file",
      "provider configuration path must be a regular file (symlinks are not followed)",
    );
  }
  if (stat.size > MAX_PROVIDER_CONFIG_BYTES) {
    return loadFailure(
      location,
      true,
      "provider_config_too_large",
      `provider configuration exceeds the maximum size of ${MAX_PROVIDER_CONFIG_BYTES} bytes`,
    );
  }

  let text: string;
  try {
    text = readFileSync(absolutePath, "utf8");
  } catch {
    return loadFailure(
      location,
      true,
      "provider_config_read_failed",
      "provider configuration could not be read",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return loadFailure(
      location,
      true,
      "provider_config_invalid_json",
      "provider configuration is not valid JSON",
    );
  }

  const validation = validateProviderConfig(parsed);
  if (!validation.ok) {
    return loadFailure(location, true, validation.code, validation.message);
  }

  return {
    ok: true,
    source: location.source,
    displayPath: location.displayPath,
    exists: true,
    config: validation.config,
  };
}
