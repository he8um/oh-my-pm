// Static purity check: provider framework sources must not perform I/O or
// reach for nondeterministic APIs. Reading source files here is allowed only
// for this static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const FORBIDDEN = [
  "fs",
  "process.env",
  "process.exit",
  "child_process",
  "fetch(",
  "XMLHttpRequest",
  "Date.now",
  "new Date",
  "Math.random",
  "crypto.randomUUID",
  "console.",
];

// The GitHub transport is the single approved network boundary: only it may
// reference fetch, AbortController, and the api.github.com host. Every other
// GitHub source module stays pure. constants.ts holds the fixed origin string
// but performs no I/O.
const NETWORK_BOUNDARY = new Set(["github/transport.ts", "github/constants.ts"]);

function scan(files: Array<{ rel: string; contents: string }>): void {
  for (const { rel, contents } of files) {
    const forbidden = NETWORK_BOUNDARY.has(rel)
      ? FORBIDDEN.filter((f) => f !== "fetch(")
      : FORBIDDEN;
    for (const marker of forbidden) {
      expect(contents, `${rel} must not contain "${marker}"`).not.toContain(marker);
    }
    if (!NETWORK_BOUNDARY.has(rel)) {
      for (const marker of ["fetch(", "AbortController", "api.github.com"]) {
        expect(contents, `${rel} must not contain "${marker}"`).not.toContain(marker);
      }
    }
  }
}

describe("providers purity", () => {
  it("top-level source files contain no I/O or nondeterministic APIs", () => {
    const files = readdirSync(srcDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({ rel: f, contents: readFileSync(join(srcDir, f), "utf8") }));
    expect(files.length).toBeGreaterThanOrEqual(6);
    scan(files);
  });

  it("github modules keep network access inside the transport boundary", () => {
    const githubDir = join(srcDir, "github");
    const files = readdirSync(githubDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({ rel: `github/${f}`, contents: readFileSync(join(githubDir, f), "utf8") }));
    expect(files.length).toBeGreaterThanOrEqual(6);
    scan(files);
  });
});
