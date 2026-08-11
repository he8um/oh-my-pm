// Process-boundary GitHub token helper. It reads the GitHub token from an
// injected environment map only: it accepts the environment object as an
// argument and never reads a global environment, never persists, never logs,
// and never returns anything but the trimmed token.

export const GITHUB_TOKEN_ENV = "OH_MY_PM_GITHUB_TOKEN";

/**
 * True when a string carries an ASCII control character (C0, or DEL).
 *
 * This is a charset assertion, not a token-format check. A CR or LF in a token
 * would otherwise flow into the transport's `Authorization` header template,
 * making header-injection rejection something delegated to Node's HTTP stack
 * rather than enforced locally. Deliberately no format allowlist: GitHub token
 * shapes change, and rejecting a valid future token would be the worse failure.
 */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Read the optional GitHub token from an injected environment map. Whitespace
 * is trimmed; an empty or whitespace-only value is treated as absent. A value
 * containing any ASCII control character is rejected as unavailable, so it
 * never reaches an HTTP header. Never mutates the environment and never reads a
 * global environment.
 */
export function readGitHubTokenFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const raw = env[GITHUB_TOKEN_ENV];
  if (typeof raw !== "string") {
    return undefined;
  }
  // Checked against the RAW value, before trimming: trim() strips CR, LF, and
  // TAB, so a surrounding control character would otherwise vanish and the
  // remainder be accepted as a valid token.
  if (hasControlCharacters(raw)) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}
