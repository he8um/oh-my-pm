// Data-minimization and privacy guard. Records handed to the store must already
// be minimized by the Phase 1 Kernel; this is a defense-in-depth check that
// rejects any payload whose OBJECT KEYS normalize to a forbidden secret- or
// raw-content-bearing name. It scans keys recursively, never normal title text,
// so allow-listed prose values pass while a `token`/`rawBody`/`absolutePath` key
// anywhere in the structure is refused before a single byte is written.

import { invalidInput } from "./errors.js";
import type { JsonValue } from "./types.js";

/** Normalized key forms that must never appear as object keys in a payload. */
export const FORBIDDEN_KEY_NORMALIZED = new Set<string>([
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "bearer",
  "password",
  "secret",
  "apikey",
  "privatekey",
  "cookie",
  "setcookie",
  "rawbody",
  "body",
  "diff",
  "diffhunk",
  "commithash",
  "commitsha",
  "absolutepath",
  "projectroot",
]);

/** Normalize a key for comparison: lowercase, strip non-alphanumerics. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Maximum recursion depth for the key scan (guards pathological structures). */
const MAX_DEPTH = 128;

/**
 * Assert that no object key anywhere in a payload normalizes to a forbidden
 * name. Throws a controlled invalid-input error naming the offending key form
 * only (never a value), so the message carries no secret.
 */
export function assertNoForbiddenKeys(payload: JsonValue, what: string): void {
  const walk = (node: JsonValue, depth: number): void => {
    if (depth > MAX_DEPTH) {
      throw invalidInput(`${what} exceeds the maximum nesting depth`);
    }
    if (Array.isArray(node)) {
      for (const element of node) walk(element, depth + 1);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node)) {
        if (FORBIDDEN_KEY_NORMALIZED.has(normalizeKey(key))) {
          throw invalidInput(
            `${what} contains a forbidden key that normalizes to "${normalizeKey(key)}"`,
            "records must be minimized; no secrets or raw content may be stored",
          );
        }
        walk((node as { readonly [k: string]: JsonValue })[key] as JsonValue, depth + 1);
      }
    }
  };
  walk(payload, 0);
}
