// Pure application-data location resolver. It takes platform, home directory,
// an environment map, and an explicit override, and returns the OH MY PM
// application-data root. It performs NO I/O and reads no ambient state; a thin
// Node wrapper (in node-adapter) supplies process.platform, process.env, and
// os.homedir(). It never reads provider tokens and the resolved absolute path is
// never persisted.

import { invalidInput } from "./errors.js";

/** Inputs for resolving the application-data root. All supplied by the caller. */
export interface DataLocationInputs {
  /** A NodeJS.Platform-like value (e.g. "win32", "darwin", "linux"). */
  readonly platform: string;
  /** The user's home directory, or undefined when unavailable. */
  readonly homedir?: string;
  /** A copy of the environment map. Only path-relevant keys are read. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** An explicit data-root override that wins over all platform rules. */
  readonly override?: string;
}

/** The application-data subdirectory name for OH MY PM. */
export const APP_DATA_DIRNAME = "oh-my-pm";

/** True when a value is a usable, non-empty absolute-looking base path. */
function usable(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Join a base and the app subdirectory with the platform's separator. */
function joinApp(base: string, platform: string): string {
  const sep = platform === "win32" ? "\\" : "/";
  const trimmed = base.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${APP_DATA_DIRNAME}`;
}

/**
 * Resolve the application-data root. Resolution order:
 *   1. explicit override
 *   2. Windows: LOCALAPPDATA/oh-my-pm
 *   3. macOS: HOME/Library/Application Support/oh-my-pm
 *   4. Linux/Unix: XDG_DATA_HOME/oh-my-pm
 *   5. Linux/Unix fallback: HOME/.local/share/oh-my-pm
 * Fails closed (throws a controlled invalid-input error) when no safe base
 * exists.
 */
export function resolveDataRoot(inputs: DataLocationInputs): string {
  const { platform, homedir, env, override } = inputs;

  if (usable(override)) {
    return override.replace(/[\\/]+$/, "");
  }

  if (platform === "win32") {
    const localAppData = env["LOCALAPPDATA"];
    if (usable(localAppData)) return joinApp(localAppData, platform);
    throw invalidInput(
      "no application-data base is available on this platform",
      "set LOCALAPPDATA or pass an explicit data-root override",
    );
  }

  if (platform === "darwin") {
    if (usable(homedir)) return joinApp(`${homedir.replace(/\/+$/, "")}/Library/Application Support`, platform);
    throw invalidInput(
      "no home directory is available to resolve the data root",
      "pass an explicit data-root override",
    );
  }

  // Linux / other Unix.
  const xdg = env["XDG_DATA_HOME"];
  if (usable(xdg)) return joinApp(xdg, platform);
  if (usable(homedir)) return joinApp(`${homedir.replace(/\/+$/, "")}/.local/share`, platform);
  throw invalidInput(
    "no XDG_DATA_HOME or home directory is available to resolve the data root",
    "set XDG_DATA_HOME or pass an explicit data-root override",
  );
}
