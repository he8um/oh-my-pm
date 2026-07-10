// Static purity check: installer sources must not perform I/O or reach for
// nondeterministic APIs. The read-only Node filesystem adapter is scanned
// separately because it is the single file allowed to import Node
// filesystem, path, and crypto APIs. Reading source files here is allowed
// only for this static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const NODE_ADAPTER_FILE = "node-filesystem.ts";

// Node filesystem usage is matched precisely because installer type names
// legitimately contain the word "filesystem".
const CORE_FORBIDDEN = [
  'from "fs"',
  'from "node:fs"',
  'require("fs")',
  "fs.",
  "node:fs",
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

// The adapter may read through node:fs/node:path/node:crypto but must stay
// read-only and deterministic apart from filesystem reads.
const NODE_ADAPTER_FORBIDDEN = [
  "writeFile",
  "rmSync",
  "unlink",
  "mkdir",
  "rmdir",
  "rename",
  "appendFile",
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

describe("installer purity", () => {
  it("core source files contain no I/O or nondeterministic APIs", () => {
    const files = readdirSync(srcDir).filter(
      (f) => f.endsWith(".ts") && f !== NODE_ADAPTER_FILE,
    );
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of CORE_FORBIDDEN) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("node filesystem adapter is read-only and side-effect-free", () => {
    const contents = readFileSync(join(srcDir, NODE_ADAPTER_FILE), "utf8");
    for (const forbidden of NODE_ADAPTER_FORBIDDEN) {
      expect(contents, `${NODE_ADAPTER_FILE} must not contain "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  });
});
