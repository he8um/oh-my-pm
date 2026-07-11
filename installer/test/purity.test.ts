// Static purity check: installer sources must not perform I/O or reach for
// nondeterministic APIs. The two Node adapters are scanned separately: the
// read-only adapter may read through node:fs but never write, and the write
// adapter may use an explicit allow-list of write APIs. Reading source files
// here is allowed only for this static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const NODE_READ_ADAPTER_FILE = "node-filesystem.ts";
const NODE_WRITE_ADAPTER_FILE = "node-write-filesystem.ts";

const NONDETERMINISM = [
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

// Node filesystem usage is matched precisely because installer type names
// legitimately contain the word "filesystem".
const CORE_FORBIDDEN = [
  'from "fs"',
  'from "node:fs"',
  'require("fs")',
  "fs.",
  "node:fs",
  ...NONDETERMINISM,
];

// The read-only adapter may read through node:fs/node:path/node:crypto but
// must never write or mutate.
const READ_ADAPTER_FORBIDDEN = [
  "writeFile",
  "rmSync",
  "unlink",
  "mkdir",
  "rmdir",
  "rename",
  "appendFile",
  "copyFile",
  ...NONDETERMINISM,
];

// The write adapter may use writeFileSync/mkdirSync/rmSync/copyFileSync but
// nothing beyond that allow-list, and no nondeterminism.
const WRITE_ADAPTER_FORBIDDEN = ["unlink", "rmdir", "rename", "appendFile", ...NONDETERMINISM];

describe("installer purity", () => {
  it("core source files contain no I/O or nondeterministic APIs", () => {
    const files = readdirSync(srcDir).filter(
      (f) =>
        f.endsWith(".ts") && f !== NODE_READ_ADAPTER_FILE && f !== NODE_WRITE_ADAPTER_FILE,
    );
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of CORE_FORBIDDEN) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("read-only node adapter stays read-only and side-effect-free", () => {
    const contents = readFileSync(join(srcDir, NODE_READ_ADAPTER_FILE), "utf8");
    for (const forbidden of READ_ADAPTER_FORBIDDEN) {
      expect(
        contents,
        `${NODE_READ_ADAPTER_FILE} must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });

  it("node write adapter uses only allow-listed write APIs", () => {
    const contents = readFileSync(join(srcDir, NODE_WRITE_ADAPTER_FILE), "utf8");
    for (const forbidden of WRITE_ADAPTER_FORBIDDEN) {
      expect(
        contents,
        `${NODE_WRITE_ADAPTER_FILE} must not contain "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });
});
