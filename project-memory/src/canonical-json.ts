// Dependency-free canonical JSON serializer for STORAGE INTEGRITY ONLY. It is
// used exclusively for manifest integrity, record integrity, and export
// inventory integrity. It is deliberately NOT a replacement for the Kernel's
// canonicalization; the finalized payloads are treated as opaque values whose
// keys are sorted here only to make the integrity hash deterministic.
//
// Rules: UTF-8; lexicographically sorted object keys; arrays preserve declared
// order; no insignificant whitespace; finite numbers only; no `undefined`;
// bounded output.

import { invalidInput } from "./errors.js";
import type { JsonValue } from "./types.js";

/** Maximum canonical output size. Guards against unbounded serialization. */
const MAX_CANONICAL_BYTES = 64 * 1024 * 1024;

/** Maximum nesting depth. Guards against pathological or cyclic structures. */
const MAX_DEPTH = 128;

/**
 * Serialize a JSON value to its canonical string form for integrity hashing.
 * Throws a controlled invalid-input error on any non-finite number, `undefined`,
 * function, symbol, bigint, excessive depth, or oversized output.
 */
export function canonicalStringify(value: JsonValue): string {
  const out: string[] = [];
  let byteBudget = MAX_CANONICAL_BYTES;

  const push = (chunk: string): void => {
    byteBudget -= chunk.length;
    if (byteBudget < 0) {
      throw invalidInput("canonical JSON exceeds the bounded output size", "reduce record size");
    }
    out.push(chunk);
  };

  const encode = (node: JsonValue, depth: number): void => {
    if (depth > MAX_DEPTH) {
      throw invalidInput("canonical JSON exceeds the maximum nesting depth", "flatten the payload");
    }
    if (node === null) {
      push("null");
      return;
    }
    const t = typeof node;
    if (t === "boolean") {
      push(node ? "true" : "false");
      return;
    }
    if (t === "number") {
      const n = node as number;
      if (!Number.isFinite(n)) {
        throw invalidInput("canonical JSON forbids non-finite numbers", "use finite numbers only");
      }
      // JSON.stringify yields the shortest round-trippable form for finite
      // numbers, which is stable across platforms.
      push(JSON.stringify(n));
      return;
    }
    if (t === "string") {
      push(JSON.stringify(node));
      return;
    }
    if (Array.isArray(node)) {
      push("[");
      for (let i = 0; i < node.length; i += 1) {
        if (i > 0) push(",");
        const element = node[i];
        if (element === undefined) {
          throw invalidInput("canonical JSON forbids undefined array elements");
        }
        encode(element, depth + 1);
      }
      push("]");
      return;
    }
    if (t === "object") {
      const obj = node as { readonly [key: string]: JsonValue };
      const keys = Object.keys(obj).sort();
      push("{");
      let first = true;
      for (const key of keys) {
        const child = obj[key];
        // Skip explicit-undefined properties rather than emitting invalid JSON;
        // canonical objects never contain `undefined` values.
        if (child === undefined) continue;
        if (!first) push(",");
        first = false;
        push(JSON.stringify(key));
        push(":");
        encode(child, depth + 1);
      }
      push("}");
      return;
    }
    // functions, symbols, bigints, undefined
    throw invalidInput(`canonical JSON forbids values of type ${t}`);
  };

  encode(value, 0);
  return out.join("");
}
