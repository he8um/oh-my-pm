// Process-boundary GitHub token helper. It reads the GitHub token from an
// injected environment map only: it accepts the environment object as an
// argument and never reads a global environment, never persists, never logs,
// and never returns anything but the trimmed token.

export const GITHUB_TOKEN_ENV = "OH_MY_PM_GITHUB_TOKEN";

/**
 * Read the optional GitHub token from an injected environment map. Whitespace
 * is trimmed; an empty or whitespace-only value is treated as absent. Never
 * mutates the environment and never reads a global environment.
 */
export function readGitHubTokenFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const raw = env[GITHUB_TOKEN_ENV];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}
