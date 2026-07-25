// Pre-commit privacy guard (v0.3 Phase 3).
//
// A defense-in-depth scan run over the finalized snapshot and every minimized
// evidence record BEFORE the single memory commit. It rejects any payload whose
// object keys normalize to a forbidden secret-, raw-content-, provider-response-,
// or path-bearing name — including the ephemeral `fingerprintInput`, which must
// never cross into persistence. It scans object keys, not display-text values,
// so allow-listed titles pass while a smuggled `token`/`rawBody`/`fingerprintInput`
// key anywhere in the structure is refused.

import { invalidInput } from "./errors.js";

/** Normalized key forms that must never appear as object keys in a payload. */
const FORBIDDEN_KEY_NORMALIZED = new Set<string>([
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
  // Runtime-specific: the ephemeral fingerprint input must never be persisted.
  "fingerprintinput",
  // Raw provider response objects must never be persisted.
  "providerresponse",
  "providerresponses",
  "runtimeresponse",
  "rawcontent",
  "data",
]);

/** Normalize a key: lowercase, strip non-alphanumerics. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const MAX_DEPTH = 128;

// Values that must never appear in a persisted evidence/provenance field. These
// scan the STEMS below (the allow-listed string-map values a record may carry —
// provenance and metadata). They provide belt-and-suspenders coverage against an
// absolute local path reaching a provenance/metadata value, complementing the
// key-based scan above. POSIX absolute (`/...`), Windows drive (`C:\...`), and
// Windows UNC (`\\host\...`) forms are all rejected.
const ABSOLUTE_PATH_VALUE = /(^\/[^/])|(^[A-Za-z]:[\\/])|(^\\\\)/;

/** String-map fields whose VALUES are additionally scanned for absolute paths. */
const VALUE_SCANNED_STEMS = new Set(["provenance", "metadata"]);

/**
 * Assert that no object key anywhere in a payload normalizes to a forbidden
 * name, and that no provenance/metadata VALUE is an absolute local path. Throws a
 * controlled invalid-input error naming only the offending key form (never a
 * value), so the message carries no secret.
 */
export function assertNoForbiddenEvidenceFields(payload: unknown, what: string): void {
  const walk = (node: unknown, depth: number, inValueScannedMap: boolean): void => {
    if (depth > MAX_DEPTH) {
      throw invalidInput(`${what} exceeds the maximum nesting depth`);
    }
    if (typeof node === "string") {
      if (inValueScannedMap && ABSOLUTE_PATH_VALUE.test(node)) {
        throw invalidInput(`${what} contains an absolute-path value in a provenance/metadata field`);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const element of node) walk(element, depth + 1, inValueScannedMap);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node)) {
        if (FORBIDDEN_KEY_NORMALIZED.has(normalizeKey(key))) {
          throw invalidInput(
            `${what} contains a forbidden key that normalizes to "${normalizeKey(key)}"`,
          );
        }
        // Descend; a provenance/metadata map turns on value scanning for its
        // direct string values.
        walk(
          (node as Record<string, unknown>)[key],
          depth + 1,
          inValueScannedMap || VALUE_SCANNED_STEMS.has(key),
        );
      }
    }
  };
  walk(payload, 0, false);
}
