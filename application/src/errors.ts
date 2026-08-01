// Structured, sanitized application errors.
//
// Every application failure is a plain data value, never a thrown Error that
// escapes the package and never a raw provider/filesystem message. A failure
// may name a caller-supplied reference (a project root or a config display
// path exactly as the caller typed it) but never a resolved absolute path,
// document content, configuration text, environment value, or token.

/**
 * Reduce an unknown thrown value to a stable, sanitized code. Only a
 * `code`-bearing object contributes its code, and only when that code is a
 * short, conservative identifier. Everything else collapses to the fallback so
 * a provider or filesystem message can never leak through an error path.
 */
export function sanitizedErrorCode(err: unknown, fallback: string): string {
  if (typeof err !== "object" || err === null) {
    return fallback;
  }
  const code = (err as { code?: unknown }).code;
  if (typeof code !== "string" || code.length === 0 || code.length > 64) {
    return fallback;
  }
  // Conservative shape: an error-code identifier, never a sentence or a path.
  return /^[A-Za-z0-9_.:-]+$/.test(code) ? code : fallback;
}

/**
 * True when a value looks like a filesystem path that must never appear in a
 * sanitized message. Used by the application test suite to assert that no
 * result leaks a resolved absolute path.
 */
export function looksLikeAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}
