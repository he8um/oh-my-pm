// Static purity check for the Project Brain Runtime module (v0.3 Phase 3).
// These sources must perform no filesystem, network, environment, clock, or
// randomness access; every I/O effect flows through an injected port. Reading
// source files here is allowed only for this static test. The contract field
// name `evidenceRefs` legitimately contains the substring "fs", so this guard
// detects impurity precisely (imports and API calls) rather than by bare
// substring.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "projectbrain");

// Precise impurity markers: module imports and nondeterministic API calls.
const FORBIDDEN = [
  'from "fs"',
  'from "node:fs"',
  'from "node:path"',
  'from "node:os"',
  'from "node:crypto"',
  'from "node:child_process"',
  'from "node:http"',
  'from "node:https"',
  'from "node:net"',
  "process.env",
  "child_process",
  "fetch(",
  "XMLHttpRequest",
  "Date.now",
  "new Date",
  "Math.random",
  "crypto.randomUUID",
  "console.",
  // The Runtime must never construct the Node memory adapter or import the
  // project-memory package in production source.
  "@oh-my-pm/project-memory",
  "createNodeProjectMemoryStore",
];

describe("project brain runtime purity", () => {
  it("source files contain no I/O, adapter construction, or nondeterministic APIs", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of FORBIDDEN) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});
