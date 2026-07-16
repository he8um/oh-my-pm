// Static purity check: CLI core sources must not perform I/O or reach for
// nondeterministic APIs. Reading source files here is allowed only for this
// static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// The Markdown project document loader is the one explicit Node read-only
// boundary in the CLI package: it may import node:fs and node:path to read,
// but it must never write, spawn, or reach the network.
const NODE_BOUNDARY_FILE = "node-project-documents.ts";

const FS_READ_IMPORTS = [
  'from "fs"',
  'from "node:fs"',
  'require("fs")',
  "fs.",
  "node:fs",
];

const WRITE_APIS = [
  "writeFile",
  "appendFile",
  "createWriteStream",
  "mkdir",
  "rmSync",
  "rmdir",
  "unlink",
  "rename",
  "copyFile",
  "chmod",
  "chown",
];

// Node filesystem usage is matched precisely because the installer preview
// legitimately uses adapter names containing the word "filesystem".
const FORBIDDEN = [
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
  "createWriteStream",
  "archiver",
  "zlib",
  "AdmZip",
  "JSZip",
  "node:crypto",
  "subtle",
  "generateKey",
  "sign(",
  "verify(",
  "privateKey",
  "publicKey",
  "BEGIN PRIVATE KEY",
  "BEGIN PUBLIC KEY",
  "BEGIN CERTIFICATE",
  "http://",
  "https://",
  "publish",
  "upload",
  "download",
  "cdn",
  "bucket",
  "registry",
  "executeInstall",
  "executeRollback",
];

describe("cli purity", () => {
  it("source files contain no I/O or nondeterministic APIs", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      const forbiddenForFile =
        file === NODE_BOUNDARY_FILE
          ? [...FORBIDDEN, ...WRITE_APIS]
          : [...FS_READ_IMPORTS, ...FORBIDDEN, ...WRITE_APIS];
      for (const forbidden of forbiddenForFile) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("keeps the node boundary file read-only and network-free", () => {
    const contents = readFileSync(join(srcDir, NODE_BOUNDARY_FILE), "utf8");
    for (const forbidden of ["node:http", "node:https", "node:net", "node:child_process"]) {
      expect(contents, `boundary must not contain "${forbidden}"`).not.toContain(forbidden);
    }
    expect(contents).toContain('from "node:fs"');
  });
});
